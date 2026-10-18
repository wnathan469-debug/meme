import type { Pool, PoolClient } from "pg";
import { withUserContext } from "./client";
import { ProviderError } from "../shared/errors";
import { idSchema, type Origin, type XPost } from "../connectors/x/contracts";
import {
  watchInput,
  alertInput,
  matchEvent,
  attentionSeries,
  eventChronology,
  authorCategory,
  type CoverageWindow,
  type EventWatchInput,
} from "../events/model";
import { z } from "zod";
const uuid = z.uuid();
export class PgEventRepository {
  constructor(
    private pool: Pool,
    readonly ownerId: string,
    readonly origin: Origin,
  ) {
    if (!uuid.safeParse(ownerId).success)
      throw new ProviderError("INVALID_INPUT");
  }
  private tx<T>(work: (c: PoolClient) => Promise<T>) {
    return withUserContext(this.pool, this.ownerId, this.origin, work);
  }
  private async event(c: PoolClient, id: string) {
    if (!uuid.safeParse(id).success) throw new ProviderError("INVALID_INPUT");
    const e = (
      await c.query(
        "SELECT * FROM memeradar.events WHERE id=$1 AND data_origin=$2",
        [id, this.origin],
      )
    ).rows[0];
    if (!e) throw new ProviderError("NOT_FOUND");
    return e;
  }
  private async watch(c: PoolClient, id: string, lock = false) {
    await this.event(c, id);
    const w = (
      await c.query(
        "SELECT * FROM memeradar.event_watches WHERE owner_user_id=$1 AND data_origin=$2 AND event_id=$3" +
          (lock ? " FOR UPDATE" : ""),
        [this.ownerId, this.origin, id],
      )
    ).rows[0];
    if (!w) throw new ProviderError("NOT_FOUND");
    return w;
  }
  async configure(id: string, raw: unknown) {
    const parsed = watchInput.safeParse(raw);
    if (!parsed.success) throw new ProviderError("INVALID_INPUT");
    const input = parsed.data;
    input.ruleIds = [...new Set(input.ruleIds)];
    for (const a of input.officialAccounts) {
      const url = new URL(a.evidenceUrl);
      if (
        !idSchema(this.origin).safeParse(a.userId).success ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        Date.parse(a.reviewedAt) > Date.now() ||
        (this.origin === "DEMO" && url.hostname !== "demo.memeradar.invalid")
      )
        throw new ProviderError("INVALID_INPUT");
    }
    return this.tx(async (c) => {
      await this.event(c, id);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `event:${this.origin}:${this.ownerId}:${id}`,
      ]);
      const rules = await c.query(
        "SELECT id,query FROM memeradar.x_rules WHERE id=ANY($1::uuid[]) AND owner_user_id=$2 AND data_origin=$3",
        [input.ruleIds, this.ownerId, this.origin],
      );
      if (rules.rowCount !== input.ruleIds.length)
        throw new ProviderError("NOT_FOUND");
      const w = (
        await c.query(
          "INSERT INTO memeradar.event_watches(data_origin,owner_user_id,event_id,terms,official_accounts,baseline_buckets,after_buckets) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(data_origin,owner_user_id,event_id) DO UPDATE SET terms=EXCLUDED.terms,official_accounts=EXCLUDED.official_accounts,baseline_buckets=EXCLUDED.baseline_buckets,after_buckets=EXCLUDED.after_buckets,revision=event_watches.revision+1 RETURNING *",
          [
            this.origin,
            this.ownerId,
            id,
            JSON.stringify(input.terms),
            JSON.stringify(input.officialAccounts),
            input.baselineBuckets,
            input.afterBuckets,
          ],
        )
      ).rows[0];
      for (const ruleId of input.ruleIds)
        await c.query(
          "INSERT INTO memeradar.event_watch_rules(data_origin,owner_user_id,watch_id,rule_id,revision,rule_query) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(watch_id,rule_id,data_origin,owner_user_id) DO UPDATE SET revision=EXCLUDED.revision,rule_query=EXCLUDED.rule_query",
          [
            this.origin,
            this.ownerId,
            w.id,
            ruleId,
            w.revision,
            rules.rows.find((r) => r.id === ruleId)!.query,
          ],
        );
      return { id: w.id, revision: w.revision, eventId: id };
    });
  }
  async recordCoverage(id: string, raw: unknown) {
    const shape = z.object({
      ruleId: z.uuid(),
      revision: z.number().int().positive(),
      start: z.iso.datetime(),
      end: z.iso.datetime(),
      status: z.enum(["observed", "partial", "gap"]),
      reason: z.string().trim().min(1).max(500),
      method: z.enum(["operator_verified", "demo_fixture"]),
    });
    const p = shape.safeParse(raw);
    if (
      !p.success ||
      Date.parse(p.data.end) <= Date.parse(p.data.start) ||
      Date.parse(p.data.end) > Date.now() ||
      (this.origin === "REAL" && p.data.method === "demo_fixture")
    )
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (c) => {
      const w = await this.watch(c, id, true),
        v = p.data;
      if (v.revision !== w.revision) throw new ProviderError("INVALID_INPUT");
      if (
        !(
          await c.query(
            "SELECT 1 FROM memeradar.event_watch_rules wr JOIN memeradar.x_rules r ON r.id=wr.rule_id AND r.data_origin=wr.data_origin AND r.owner_user_id=wr.owner_user_id WHERE wr.watch_id=$1 AND wr.rule_id=$2 AND wr.revision=$3 AND wr.data_origin=$4 AND wr.owner_user_id=$5 AND wr.rule_query=r.query",
            [w.id, v.ruleId, w.revision, this.origin, this.ownerId],
          )
        ).rowCount
      )
        throw new ProviderError("NOT_FOUND");
      return (
        await c.query(
          "INSERT INTO memeradar.event_coverage_windows(data_origin,owner_user_id,watch_id,rule_id,revision,starts_at,ends_at,status,reason,method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
          [
            this.origin,
            this.ownerId,
            w.id,
            v.ruleId,
            w.revision,
            v.start,
            v.end,
            v.status,
            v.reason,
            v.method,
          ],
        )
      ).rows[0];
    });
  }
  async rebuild(id: string) {
    return this.tx(async (c) => {
      const w = await this.watch(c, id, true);
      const rows = (
        await c.query(
          `SELECT DISTINCT p.* FROM memeradar.x_posts p JOIN memeradar.x_post_rules l ON l.post_id=p.id AND l.data_origin=p.data_origin JOIN memeradar.event_watch_rules wr ON wr.rule_id=l.rule_id AND wr.data_origin=l.data_origin WHERE wr.watch_id=$1 AND wr.owner_user_id=$2 AND wr.data_origin=$3 AND wr.revision=$4 AND p.availability_status='available' ORDER BY p.id LIMIT 10001`,
          [w.id, this.ownerId, this.origin, w.revision],
        )
      ).rows;
      if (rows.length > 10000) throw new ProviderError("INVALID_INPUT");
      await c.query(
        "DELETE FROM memeradar.post_event_links WHERE owner_user_id=$1 AND data_origin=$2 AND watch_id=$3 AND method='event-text-v1'",
        [this.ownerId, this.origin, w.id],
      );
      let linked = 0;
      for (const p of rows) {
        const link = matchEvent(
          {
            text: p.text,
            type: p.post_type,
            entities: {
              hashtags: [],
              cashtags: [],
              mentions: [],
              urls: [],
              ...p.entities,
            },
          },
          w.terms,
        );
        if (!link) continue;
        await c.query(
          "INSERT INTO memeradar.post_event_links(data_origin,knowledge_kind,owner_user_id,watch_id,watch_revision,post_id,event_id,score,method,evidence) VALUES($1,'INTERPRETED',$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            this.origin,
            this.ownerId,
            w.id,
            w.revision,
            p.id,
            id,
            link.score,
            link.method,
            JSON.stringify(link.evidence),
          ],
        );
        linked++;
      }
      return {
        examined: rows.length,
        linked,
        method: "event-text-v1",
        knowledge: "INTERPRETED",
      };
    });
  }
  async createAlert(id: string, raw: unknown) {
    const p = alertInput.safeParse(raw);
    if (!p.success) throw new ProviderError("INVALID_INPUT");
    return this.tx(async (c) => {
      await this.watch(c, id);
      const conditions = {
        created_by: "event-phase6",
        event_id: id,
        ...p.data,
      };
      const row = (
        await c.query(
          "INSERT INTO memeradar.alert_rules(data_origin,user_id,type,conditions,channels,cooldown_seconds,min_confidence,min_data_quality,enabled) VALUES($1,$2,'news',$3,ARRAY['in_app'],300,'WEAK',0.5,false) RETURNING id,enabled,conditions",
          [this.origin, this.ownerId, JSON.stringify(conditions)],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO memeradar.alert_subject_states(data_origin,rule_id,event_id) VALUES($1,$2,$3)",
        [this.origin, row.id, id],
      );
      return row;
    });
  }
  async read(id: string, asOf = new Date().toISOString()) {
    if (!z.iso.datetime().safeParse(asOf).success)
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (c) => {
      const e = await this.event(c, id),
        w = await this.watch(c, id);
      const scope = (
        await c.query(
          "SELECT wr.rule_id,wr.rule_query,r.query FROM memeradar.event_watch_rules wr JOIN memeradar.x_rules r ON r.id=wr.rule_id AND r.data_origin=wr.data_origin AND r.owner_user_id=wr.owner_user_id WHERE wr.watch_id=$1 AND wr.revision=$2 AND wr.owner_user_id=$3 AND wr.data_origin=$4 ORDER BY wr.rule_id",
          [w.id, w.revision, this.ownerId, this.origin],
        )
      ).rows;
      const ruleIds = scope.map((r) => r.rule_id),
        scopeChanged = scope.some((r) => r.rule_query !== r.query);
      const rows = (
        await c.query(
          `SELECT p.*,l.score,l.method,l.evidence,coalesce(u.username,ca.username) AS username,coalesce(u.display_name,ca.display_name) AS display_name,
 EXISTS(SELECT 1 FROM memeradar.tracked_people t WHERE t.owner_user_id=$2 AND t.data_origin=p.data_origin AND t.x_user_id=coalesce(p.author_x_user_id,p.unresolved_author_x_user_id)) AS followed
 FROM memeradar.post_event_links l JOIN memeradar.x_posts p ON p.id=l.post_id AND p.data_origin=l.data_origin LEFT JOIN memeradar.x_users u ON u.x_user_id=coalesce(p.author_x_user_id,p.unresolved_author_x_user_id) AND u.data_origin=p.data_origin
 LEFT JOIN LATERAL(SELECT a.username,a.display_name FROM memeradar.conversation_authors a JOIN memeradar.conversation_views cv ON cv.id=a.view_id AND cv.data_origin=a.data_origin AND cv.owner_user_id=a.owner_user_id WHERE a.owner_user_id=$2 AND a.data_origin=p.data_origin AND a.x_user_id=coalesce(p.author_x_user_id,p.unresolved_author_x_user_id) AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND pr.rule_id=cv.rule_id) ORDER BY a.observed_at DESC LIMIT 1) ca ON true
 WHERE l.watch_id=$1 AND l.owner_user_id=$2 AND l.data_origin=$3 AND l.watch_revision=$4 AND p.availability_status='available' AND p.collected_at<=$5 AND (p.published_at IS NULL OR p.published_at<=$5)
 AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.event_watch_rules wr ON wr.rule_id=pr.rule_id AND wr.data_origin=pr.data_origin WHERE pr.post_id=p.id AND wr.watch_id=$1 AND wr.revision=$4 AND wr.owner_user_id=$2)
 ORDER BY coalesce(p.published_at,p.collected_at),p.id LIMIT 10001`,
          [w.id, this.ownerId, this.origin, w.revision, asOf],
        )
      ).rows;
      if (rows.length > 10000) throw new ProviderError("INVALID_INPUT");
      const posts = rows.map((p) => ({
        id: p.x_post_id,
        internalId: p.id,
        text: p.text,
        publishedAt: p.published_at?.toISOString() ?? null,
        collectedAt: p.collected_at.toISOString(),
        type: p.post_type as XPost["type"],
        authorId: p.author_x_user_id ?? p.unresolved_author_x_user_id,
        username: p.username ?? null,
        name: p.display_name ?? null,
        followed: p.followed,
        score: p.score,
        method: p.method,
        evidence: p.evidence,
        knowledge: "INTERPRETED" as const,
        category: authorCategory(
          p.author_x_user_id ?? p.unresolved_author_x_user_id,
          p.followed,
          w.official_accounts,
        ),
      }));
      const windows: CoverageWindow[] = (
        await c.query(
          'SELECT rule_id AS "ruleId",starts_at,ends_at,status,reason,created_at FROM memeradar.event_coverage_windows WHERE watch_id=$1 AND revision=$2 AND owner_user_id=$3 AND data_origin=$4 ORDER BY starts_at',
          [w.id, w.revision, this.ownerId, this.origin],
        )
      ).rows.map((r) => ({
        ruleId: r.ruleId,
        start: r.starts_at.toISOString(),
        end: r.ends_at.toISOString(),
        status: r.status,
        reason: r.reason,
        knownAt: r.created_at.toISOString(),
      }));
      const source =
        (
          await c.query(
            "SELECT s.name,r.url,r.published_at FROM memeradar.event_items i JOIN memeradar.raw_items r ON r.id=i.raw_item_id AND r.data_origin=i.data_origin JOIN memeradar.sources s ON s.id=r.source_id AND s.data_origin=r.data_origin WHERE i.event_id=$1 AND i.data_origin=$2 AND i.is_origin_candidate ORDER BY r.published_at,r.id LIMIT 1",
            [id, this.origin],
          )
        ).rows[0] ?? null;
      const tokens = (
        await c.query(
          `SELECT DISTINCT t.id,t.created_at_onchain,
 (SELECT min(p.published_at) FROM memeradar.post_token_mentions m JOIN memeradar.x_posts p ON p.id=m.post_id AND p.data_origin=m.data_origin WHERE m.token_id=t.id AND m.data_origin=t.data_origin AND m.detection_method IN ('exact_address','token_page_url') AND p.availability_status='available' AND p.collected_at<=$3 AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules xr ON xr.id=pr.rule_id AND xr.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND xr.owner_user_id=$4)) AS first_mention_at
 FROM memeradar.token_event_links l JOIN memeradar.tokens t ON t.id=l.token_id AND t.data_origin=l.data_origin WHERE l.event_id=$1 AND l.data_origin=$2`,
          [id, this.origin, asOf, this.ownerId],
        )
      ).rows.map((t) => ({
        id: t.id,
        createdAt: t.created_at_onchain?.toISOString() ?? null,
        firstMentionAt: t.first_mention_at?.toISOString() ?? null,
      }));
      const interruptions = (
        await c.query(
          "SELECT mode,status,started_at,ended_at,error_code,gap_started_at,gap_ended_at FROM memeradar.x_collection_runs WHERE rule_id=ANY($1::uuid[]) AND data_origin=$2 AND (status IN ('failed','interrupted') OR partial) AND started_at<=$3 ORDER BY started_at DESC LIMIT 100",
          [ruleIds, this.origin, asOf],
        )
      ).rows;
      const alerts = (
        await c.query(
          "SELECT id,conditions,enabled FROM memeradar.alert_rules WHERE user_id=$1 AND data_origin=$2 AND conditions->>'created_by'='event-phase6' AND conditions->>'event_id'=$3 ORDER BY created_at,id",
          [this.ownerId, this.origin, id],
        )
      ).rows;
      return {
        scopeChanged,
        event: {
          id,
          title: e.title,
          signalAt: e.first_published_at.toISOString(),
          detectedAt: e.first_detected_at.toISOString(),
          reliability: e.source_reliability_level,
          popularity: e.popularity_level,
        },
        revision: w.revision,
        posts,
        officialAccounts: w.official_accounts,
        source,
        windows,
        interruptions,
        alerts,
        attention: attentionSeries({
          signalAt: e.first_published_at.toISOString(),
          asOf,
          ruleIds,
          windows: scopeChanged ? [] : windows,
          posts,
          baselineBuckets: w.baseline_buckets,
          afterBuckets: w.after_buckets,
          bucketSeconds: 300,
        }),
        timeline: eventChronology({
          signalAt: e.first_published_at.toISOString(),
          detectedAt: e.first_detected_at.toISOString(),
          source: source?.name ?? null,
          posts,
          tokens,
          asOf,
        }),
        unknownPublicationDates: posts.filter((p) => !p.publishedAt).length,
        scopeNotice:
          "Mentions collectées dans les règles du propriétaire ; aucun total exhaustif de X. Les interruptions de collecte sont distinctes de la couverture par date de publication.",
      };
    });
  }
}
