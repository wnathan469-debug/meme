import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withUserContext } from "./client";
import { ProviderError } from "../shared/errors";
import {
  ruleSchema,
  parseCandidate,
  type AlertRule,
  type AlertCandidate,
  type AlertKind,
} from "../alerts/model";
import {
  advance,
  emptyState,
  parseState,
  feedback,
  type AlertState,
} from "../alerts/engine";
import type { Origin } from "../connectors/x/contracts";
const types: Record<AlertKind, string> = {
  person_post: "tracked_person_post",
  keyword: "x_keyword",
  mentions: "attention_acceleration",
  event: "news",
  token: "token_link",
  liquidity: "liquidity_change",
  transactions: "transaction_activity",
  risk: "risk_signal",
  quota: "source_degradation",
  budget: "provider_budget",
  disconnect: "provider_disconnect",
  provider_error: "source_degradation",
};
export class PgAlertRepository {
  constructor(
    private pool: Pool,
    readonly ownerId: string,
    readonly origin: Origin,
  ) {
    z.uuid().parse(ownerId);
  }
  private tx<T>(fn: (c: PoolClient) => Promise<T>) {
    return withUserContext(this.pool, this.ownerId, this.origin, fn);
  }
  private async owned(c: PoolClient, id: string, lock = false) {
    z.uuid().parse(id);
    const r = await c.query(
      "SELECT * FROM memeradar.alert_rules WHERE id=$1 AND data_origin=$2 AND user_id=$3 AND conditions->>'engine'='phase10'" +
        (lock ? " FOR UPDATE" : ""),
      [id, this.origin, this.ownerId],
    );
    if (!r.rowCount) throw new ProviderError("NOT_FOUND");
    return ruleSchema.parse({
      ...r.rows[0].conditions.rule,
      enabled: r.rows[0].enabled,
    });
  }
  private async person(c: PoolClient, r: AlertRule) {
    if (r.kind !== "person_post") return {};
    const p = await c.query(
      "SELECT status,x_user_id,validation_status FROM memeradar.tracked_people WHERE id=$1 AND data_origin=$2 AND owner_user_id=$3 FOR SHARE",
      [r.personId, this.origin, this.ownerId],
    );
    return {
      personPaused:
        !p.rowCount ||
        p.rows[0].status !== "active" ||
        p.rows[0].validation_status !== "validated_via_api",
      authorId: p.rows[0]?.x_user_id ?? null,
    };
  }
  async save(raw: AlertRule) {
    const r = ruleSchema.parse(raw);
    return this.tx(async (c) => {
      if (r.kind === "person_post") {
        const p = await c.query(
          "SELECT 1 FROM memeradar.tracked_people WHERE id=$1 AND owner_user_id=$2 AND data_origin=$3",
          [r.personId, this.ownerId, this.origin],
        );
        if (!p.rowCount) throw new ProviderError("NOT_FOUND");
      }
      const old = await c.query(
        "SELECT user_id,conditions FROM memeradar.alert_rules WHERE id=$1 AND data_origin=$2 FOR UPDATE",
        [r.id, this.origin],
      );
      if (
        old.rowCount &&
        (old.rows[0].user_id !== this.ownerId ||
          old.rows[0].conditions.engine !== "phase10" ||
          old.rows[0].conditions.rule.kind !== r.kind ||
          old.rows[0].conditions.rule.personId !== r.personId)
      )
        throw new ProviderError("ACCESS_DENIED");
      const saved = await c.query(
        "INSERT INTO memeradar.alert_rules(id,data_origin,user_id,type,conditions,channels,cooldown_seconds,min_confidence,min_data_quality,quiet_hours,enabled,delivery_mode,digest_interval_seconds,max_per_hour) VALUES($1,$2,$3,$4,$5,ARRAY['in_app'],$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET conditions=EXCLUDED.conditions,cooldown_seconds=EXCLUDED.cooldown_seconds,min_confidence=EXCLUDED.min_confidence,min_data_quality=EXCLUDED.min_data_quality,quiet_hours=EXCLUDED.quiet_hours,enabled=EXCLUDED.enabled,delivery_mode=EXCLUDED.delivery_mode,digest_interval_seconds=EXCLUDED.digest_interval_seconds,max_per_hour=EXCLUDED.max_per_hour WHERE alert_rules.user_id=EXCLUDED.user_id AND alert_rules.data_origin=EXCLUDED.data_origin RETURNING id",
        [
          r.id,
          this.origin,
          this.ownerId,
          types[r.kind],
          { engine: "phase10", rule: r },
          r.cooldownSeconds,
          r.minAssociation,
          String(r.minQuality / 100),
          r.quiet,
          r.enabled,
          r.delivery === "immediate" ? "immediate" : "digest",
          r.delivery === "immediate"
            ? null
            : r.delivery === "daily"
              ? 86400
              : r.intervalMinutes * 60,
          r.maxPerHour,
        ],
      );
      if (saved.rowCount !== 1) throw new ProviderError("ACCESS_DENIED");
      return r;
    });
  }
  async list() {
    return this.tx(async (c) => {
      const r = await c.query(
        "SELECT conditions,enabled FROM memeradar.alert_rules WHERE user_id=$1 AND data_origin=$2 AND conditions->>'engine'='phase10' ORDER BY created_at,id LIMIT 101",
        [this.ownerId, this.origin],
      );
      if (r.rows.length > 100) throw new ProviderError("STORE_UNAVAILABLE");
      return r.rows.map((a) =>
        ruleSchema.parse({ ...a.conditions.rule, enabled: a.enabled }),
      );
    });
  }
  async read(id: string) {
    return this.tx(async (c) => {
      await this.owned(c, id);
      const r = await c.query(
        "SELECT state FROM memeradar.alert_runtime_states WHERE rule_id=$1 AND data_origin=$2 AND user_id=$3",
        [id, this.origin, this.ownerId],
      );
      return r.rowCount ? parseState(r.rows[0].state) : emptyState();
    });
  }
  private async persist(c: PoolClient, rule: AlertRule, s: AlertState) {
    const ids = new Map<string, string>();
    for (const e of s.entries) {
      const a = e.candidate;
      const status =
        e.status === "notified"
          ? "sent"
          : e.status === "false_positive"
            ? "dismissed_false_positive"
            : e.status;
      const result = await c.query(
        "INSERT INTO memeradar.alerts(data_origin,rule_id,event_id,token_id,source_id,triggered_at,reason,observed_data,sources,fingerprint,status,suppression_reason,feedback_at,delivery_mode,digest_interval_seconds,max_per_hour) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(data_origin,fingerprint) DO UPDATE SET status=EXCLUDED.status,suppression_reason=EXCLUDED.suppression_reason,feedback_at=EXCLUDED.feedback_at RETURNING id",
        [
          this.origin,
          rule.id,
          a.subject.type === "event" ? a.subject.id : null,
          a.subject.type === "token" ? a.subject.id : null,
          a.subject.type === "source" ? a.subject.id : null,
          e.at,
          e.reason,
          { phase10: { candidate: a, dueAt: e.dueAt, group: e.group } },
          JSON.stringify([
            {
              name: a.source,
              url: a.sourceUrl,
              at: a.at,
              collectedAt: a.collectedAt,
            },
          ]),
          e.id,
          status,
          e.suppression,
          e.feedbackAt,
          rule.delivery === "immediate" ? "immediate" : "digest",
          rule.delivery === "immediate"
            ? null
            : rule.delivery === "daily"
              ? 86400
              : rule.intervalMinutes * 60,
          rule.maxPerHour,
        ],
      );
      ids.set(e.id, result.rows[0].id);
    }
    for (const n of s.notifications)
      for (const entry of n.entryIds) {
        await c.query(
          "INSERT INTO memeradar.notification_deliveries(data_origin,alert_id,channel,destination_ref,status,idempotency_key,attempts,sent_at) VALUES($1,$2,'in_app',$3,'sent',$4,1,$5) ON CONFLICT(data_origin,idempotency_key) DO NOTHING",
          [this.origin, ids.get(entry), this.ownerId, entry, n.at],
        );
      }
    await c.query(
      "INSERT INTO memeradar.alert_runtime_states(data_origin,rule_id,user_id,state) VALUES($1,$2,$3,$4) ON CONFLICT(rule_id,data_origin) DO UPDATE SET state=EXCLUDED.state",
      [this.origin, rule.id, this.ownerId, s],
    );
  }
  async process(
    id: string,
    raw: AlertCandidate[],
    now = new Date().toISOString(),
  ) {
    if (raw.length > 100) throw new ProviderError("INVALID_INPUT");
    let candidates: AlertCandidate[];
    try {
      candidates = raw.map(parseCandidate);
    } catch {
      throw new ProviderError("INVALID_INPUT");
    }
    if (candidates.some((c) => c.origin !== this.origin))
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (c) => {
      const r = await this.owned(c, id, true),
        state = await c.query(
          "SELECT state FROM memeradar.alert_runtime_states WHERE rule_id=$1 AND data_origin=$2 AND user_id=$3",
          [id, this.origin, this.ownerId],
        );
      // Token identity must match the subject UUID, not just a symbol or unrelated address.
      for (const a of candidates)
        if (a.token) {
          const t = await c.query(
            "SELECT 1 FROM memeradar.tokens t JOIN memeradar.chains ch ON ch.id=t.chain_id AND ch.data_origin=t.data_origin WHERE t.id=$1 AND t.data_origin=$2 AND ch.slug=$3 AND t.address_identity=$4",
            [
              a.subject.id,
              this.origin,
              a.token.chain,
              a.token.chain === "solana"
                ? a.token.address
                : a.token.address.toLowerCase(),
            ],
          );
          if (!t.rowCount) throw new ProviderError("INVALID_INPUT");
        }
      const next = advance(
        r,
        state.rowCount ? parseState(state.rows[0].state) : emptyState(),
        candidates,
        now,
        await this.person(c, r),
      );
      await this.persist(c, r, next);
      return next;
    });
  }
  async feedback(
    id: string,
    entry: string,
    kind: "false_positive" | "read",
    now = new Date().toISOString(),
  ) {
    return this.tx(async (c) => {
      const r = await this.owned(c, id, true),
        old = await c.query(
          "SELECT state FROM memeradar.alert_runtime_states WHERE rule_id=$1 AND data_origin=$2 AND user_id=$3",
          [id, this.origin, this.ownerId],
        );
      if (!old.rowCount) throw new ProviderError("NOT_FOUND");
      const next = feedback(parseState(old.rows[0].state), entry, kind, now);
      await this.persist(c, r, next);
      return next;
    });
  }
}
