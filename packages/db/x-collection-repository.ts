import type { Pool, PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { withUserContext } from "./client";
import { ProviderError } from "../shared/errors";
import type {
  CollectionMode,
  CollectionRule,
  CollectionRepository,
  Lease,
  IngestResult,
} from "../collection/contracts";
import { highestId } from "../collection/contracts";
import type { Origin, XPage, XPost } from "../connectors/x/contracts";
import { idSchema } from "../connectors/x/contracts";
import { localFiltersSchema, type LocalFilters } from "../collection/query";
import type { FeedHub } from "../collection/feed";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const normalizeText = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export class PgXCollectionRepository implements CollectionRepository {
  constructor(
    private readonly pool: Pool,
    readonly ownerId: string,
    readonly origin: Origin,
    private readonly hub?: FeedHub,
  ) {
    if (!uuid.test(ownerId)) throw new ProviderError("INVALID_INPUT");
  }
  private tx<T>(work: (client: PoolClient) => Promise<T>) {
    return withUserContext(this.pool, this.ownerId, this.origin, work);
  }
  async withStreamLock(
    key: string,
    work: () => Promise<void>,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    let held = false,
      discard = false;
    const lock = "memeradar:stream:" + this.origin + ":" + key;
    try {
      held = (
        await client.query(
          "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS held",
          [lock],
        )
      ).rows[0].held;
      if (!held) return false;
      await work();
      return true;
    } finally {
      if (held)
        try {
          await client.query(
            "SELECT pg_advisory_unlock(hashtextextended($1,0))",
            [lock],
          );
        } catch {
          discard = true;
        }
      client.release(discard);
    }
  }
  async createRule(input: {
    query: string;
    priority?: CollectionRule["priority"];
    intervalSeconds?: number;
    status?: CollectionRule["status"];
    name?: string;
  }): Promise<CollectionRule> {
    if (
      !input.query.trim() ||
      input.query.length > 10000 ||
      !Number.isSafeInteger(input.intervalSeconds ?? 300) ||
      (input.intervalSeconds ?? 300) < 1 ||
      (input.intervalSeconds ?? 300) > 86400
    )
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (client) => {
      const row = (
        await client.query(
          "INSERT INTO memeradar.x_rules(data_origin,owner_user_id,name,expression,query,priority,poll_interval_seconds,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            this.origin,
            this.ownerId,
            input.name ?? "Veille X",
            JSON.stringify({ query: input.query }),
            input.query,
            input.priority ?? "normal",
            input.intervalSeconds ?? 300,
            input.status ?? "paused",
          ],
        )
      ).rows[0];
      return this.rule(row);
    });
  }
  private rule(row: Record<string, any>): CollectionRule {
    return {
      id: row.id,
      ownerId: row.owner_user_id,
      origin: row.data_origin,
      query: row.query,
      priority: row.priority,
      intervalSeconds: row.poll_interval_seconds,
      status: row.status,
    };
  }
  async rules(): Promise<CollectionRule[]> {
    return this.tx(async (client) =>
      (
        await client.query(
          "SELECT * FROM memeradar.x_rules WHERE data_origin=$1 AND owner_user_id=$2 ORDER BY created_at,id",
          [this.origin, this.ownerId],
        )
      ).rows.map((row) => this.rule(row)),
    );
  }
  async claim(
    rule: CollectionRule,
    mode: CollectionMode,
    now: number,
    leaseMs: number,
    force = false,
    allowPaused = false,
  ): Promise<Lease | null> {
    if (
      rule.ownerId !== this.ownerId ||
      rule.origin !== this.origin ||
      !Number.isFinite(now) ||
      leaseMs < 1 ||
      leaseMs > 3600000
    )
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (client) => {
      const live = (
        await client.query(
          "SELECT * FROM memeradar.x_rules WHERE id=$1 AND data_origin=$2 AND owner_user_id=$3 FOR UPDATE",
          [rule.id, this.origin, this.ownerId],
        )
      ).rows[0];
      if (!live || (!allowPaused && live.status !== "active")) return null;
      const actual = this.rule(live),
        queryHash = hash(actual.query.trim());
      await client.query(
        "INSERT INTO memeradar.x_collection_checkpoints(data_origin,rule_id,mode,next_due_at) VALUES($1,$2,$3,$4) ON CONFLICT(data_origin,rule_id,mode) DO NOTHING",
        [this.origin, rule.id, mode, new Date(now)],
      );
      const checkpoint = (
        await client.query(
          "SELECT * FROM memeradar.x_collection_checkpoints WHERE data_origin=$1 AND rule_id=$2 AND mode=$3 FOR UPDATE",
          [this.origin, rule.id, mode],
        )
      ).rows[0];
      if (checkpoint.lease_until && checkpoint.lease_until.getTime() > now)
        return null;
      if (!force && checkpoint.next_due_at.getTime() > now) return null;
      const changed = checkpoint.query_hash !== queryHash,
        token = randomUUID();
      if (
        force &&
        mode === "search" &&
        !checkpoint.next_token &&
        !checkpoint.since_id
      ) {
        const stream = (
          await client.query(
            "SELECT since_id FROM memeradar.x_collection_checkpoints WHERE rule_id=$1 AND data_origin=$2 AND mode='stream' AND query_hash=$3",
            [rule.id, this.origin, queryHash],
          )
        ).rows[0];
        if (stream?.since_id) {
          checkpoint.since_id = stream.since_id;
          checkpoint.query_hash = queryHash;
        }
      }
      const reset = checkpoint.query_hash !== queryHash;
      await client.query(
        "UPDATE memeradar.x_collection_checkpoints SET lease_id=$1,lease_until=$2,query_hash=$3,since_id=$4,next_token=$5,pending_since_id=$6 WHERE id=$7",
        [
          token,
          new Date(now + leaseMs),
          queryHash,
          reset ? null : checkpoint.since_id,
          reset ? null : checkpoint.next_token,
          reset ? null : checkpoint.pending_since_id,
          checkpoint.id,
        ],
      );
      await client.query(
        "UPDATE memeradar.x_collection_runs SET status='interrupted',ended_at=$1,error_code='LEASE_EXPIRED',gap_started_at=COALESCE(ended_at,started_at) WHERE rule_id=$2 AND data_origin=$3 AND mode=$4 AND status='running'",
        [new Date(now), rule.id, this.origin, mode],
      );
      const run = (
        await client.query(
          "INSERT INTO memeradar.x_collection_runs(data_origin,rule_id,mode,started_at) VALUES($1,$2,$3,$4) RETURNING id",
          [this.origin, rule.id, mode, new Date(now)],
        )
      ).rows[0];
      return {
        rule: actual,
        token,
        runId: run.id,
        checkpoint: {
          sinceId: reset ? null : checkpoint.since_id,
          nextToken: reset ? null : checkpoint.next_token,
          pendingSinceId: reset ? null : checkpoint.pending_since_id,
          queryHash,
          nextDueAt: checkpoint.next_due_at.toISOString(),
        },
      };
    });
  }
  private async fence(client: PoolClient, lease: Lease, now: number) {
    const row = (
      await client.query(
        "SELECT c.* FROM memeradar.x_collection_checkpoints c JOIN memeradar.x_collection_runs r ON r.rule_id=c.rule_id AND r.mode=c.mode AND r.data_origin=c.data_origin JOIN memeradar.x_rules q ON q.id=c.rule_id AND q.data_origin=c.data_origin WHERE c.rule_id=$1 AND c.data_origin=$2 AND c.lease_id=$3 AND c.lease_until>$4 AND r.id=$5 AND q.owner_user_id=$6 FOR UPDATE OF c",
        [
          lease.rule.id,
          this.origin,
          lease.token,
          new Date(now),
          lease.runId,
          this.ownerId,
        ],
      )
    ).rows[0];
    if (!row) throw new ProviderError("COLLECTION_LEASE_LOST");
    return row;
  }
  async ingest(
    lease: Lease,
    page: XPage<XPost>,
    mode: CollectionMode,
    now: number,
    leaseMs: number,
  ): Promise<IngestResult> {
    if (
      page.dataOrigin !== this.origin ||
      page.data.some(
        (p) =>
          p.dataOrigin !== this.origin ||
          !idSchema(this.origin).safeParse(p.id).success,
      ) ||
      page.users.some((u) => u.dataOrigin !== this.origin)
    )
      throw new ProviderError("INVALID_RESPONSE");
    const notifications: string[] = [];
    const result = await this.tx(async (client) => {
      const cp = await this.fence(client, lease, now);
      const currentRule = (
        await client.query(
          "SELECT status FROM memeradar.x_rules WHERE id=$1 AND data_origin=$2",
          [lease.rule.id, this.origin],
        )
      ).rows[0];
      if (lease.rule.status === "active" && currentRule.status !== "active")
        throw new ProviderError("NETWORK_DISABLED");
      if (cp.mode !== mode) throw new ProviderError("INVALID_INPUT");
      let newPosts = 0,
        duplicates = 0,
        originals = 0,
        unknown = 0,
        reposts = 0;
      for (const user of [...page.users].sort((a, b) =>
        a.id.localeCompare(b.id),
      )) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [this.origin + ":user:" + user.id],
        );
        const old = (
          await client.query(
            "SELECT username,last_refreshed_at FROM memeradar.x_users WHERE data_origin=$1 AND x_user_id=$2",
            [this.origin, user.id],
          )
        ).rows[0];
        if (
          old?.last_refreshed_at &&
          old.last_refreshed_at.getTime() > Date.parse(user.observedAt)
        )
          continue;
        if (old && old.username !== user.username)
          await client.query(
            "INSERT INTO memeradar.x_username_history(data_origin,x_user_id,username,observed_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [this.origin, user.id, old.username, user.observedAt],
          );
        await client.query(
          `INSERT INTO memeradar.x_users(data_origin,x_user_id,username,display_name,protected,verified_type,followers_count,metrics_observed_at,last_refreshed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) ON CONFLICT(data_origin,x_user_id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,protected=EXCLUDED.protected,verified_type=EXCLUDED.verified_type,followers_count=EXCLUDED.followers_count,metrics_observed_at=EXCLUDED.metrics_observed_at,last_refreshed_at=EXCLUDED.last_refreshed_at`,
          [
            this.origin,
            user.id,
            user.username,
            user.name,
            user.protected,
            user.verifiedType,
            user.followers === null ? null : String(user.followers),
            user.observedAt,
          ],
        );
      }
      // Stable order prevents two overlapping pages from locking posts in opposite order.
      for (const post of [...page.data].sort((a, b) =>
        a.id.localeCompare(b.id),
      )) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [this.origin + ":post:" + post.id],
        );
        const author =
          post.authorId &&
          (
            await client.query(
              "SELECT 1 FROM memeradar.x_users WHERE data_origin=$1 AND x_user_id=$2",
              [this.origin, post.authorId],
            )
          ).rowCount
            ? post.authorId
            : null;
        const metricsKnown = Object.values(post.metrics).some(
          (v) => v !== null,
        );
        const candidates = addressCandidates(post.text, this.origin);
        const values = [
          this.origin,
          post.id,
          author,
          post.text,
          post.language,
          post.publishedAt,
          post.collectedAt,
          mode,
          post.conversationId,
          post.references.find((r) => r.type === "replied_to")?.id ?? null,
          post.type,
          JSON.stringify(post.references),
          JSON.stringify(post.metrics),
          metricsKnown ? post.collectedAt : null,
          JSON.stringify(post.entities),
          JSON.stringify(candidates),
          hash(normalizeText(post.text)),
          author ? null : post.authorId,
        ];
        const inserted = await client.query(
          `INSERT INTO memeradar.x_posts(data_origin,x_post_id,author_x_user_id,text,lang,published_at,collected_at,collection_mode,conversation_id,in_reply_to_post_id,post_type,referenced_post_ids,public_metrics,metrics_observed_at,entities,detected_contract_addresses,text_fingerprint,unresolved_author_x_user_id,availability_status,availability_checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'available',$7) ON CONFLICT(data_origin,x_post_id) DO NOTHING RETURNING id`,
          values,
        );
        let id: string;
        if (inserted.rowCount) {
          id = inserted.rows[0].id;
          newPosts++;
          notifications.push(id);
        } else {
          duplicates++;
          id = (
            await client.query(
              "SELECT id FROM memeradar.x_posts WHERE data_origin=$1 AND x_post_id=$2",
              [this.origin, post.id],
            )
          ).rows[0].id;
          await client.query(
            `UPDATE memeradar.x_posts SET author_x_user_id=COALESCE($3,author_x_user_id),text=$4,lang=COALESCE($5,lang),published_at=COALESCE($6,published_at),collected_at=$7,collection_mode=$8,conversation_id=COALESCE($9,conversation_id),in_reply_to_post_id=COALESCE($10,in_reply_to_post_id),post_type=CASE WHEN $11='unknown' THEN post_type ELSE $11 END,referenced_post_ids=CASE WHEN $12::jsonb='[]' THEN referenced_post_ids ELSE $12::jsonb END,public_metrics=CASE WHEN $14::timestamptz IS NOT NULL AND (metrics_observed_at IS NULL OR $14::timestamptz>=metrics_observed_at) THEN $13::jsonb ELSE public_metrics END,metrics_observed_at=COALESCE($14::timestamptz,metrics_observed_at),entities=$15,detected_contract_addresses=$16,text_fingerprint=$17,unresolved_author_x_user_id=$18,availability_status='available',availability_checked_at=$7 WHERE data_origin=$1 AND x_post_id=$2 AND collected_at<=$7::timestamptz AND (availability_checked_at IS NULL OR availability_checked_at<=$7::timestamptz)`,
            values,
          );
        }
        if (post.type === "repost") reposts++;
        else if (post.type === "unknown") unknown++;
        else originals++;
        if (metricsKnown)
          await client.query(
            "INSERT INTO memeradar.x_post_metrics_history(data_origin,post_id,observed_at,likes,replies,reposts,quotes) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(data_origin,post_id,observed_at) DO NOTHING",
            [
              this.origin,
              id,
              post.collectedAt,
              ...Object.values(post.metrics).map((v) =>
                v === null ? null : String(v),
              ),
            ],
          );
        for (const reference of post.references)
          await client.query(
            "INSERT INTO memeradar.x_post_references(data_origin,post_id,referenced_x_post_id,reference_type) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [this.origin, id, reference.id, reference.type],
          );
        await client.query(
          "INSERT INTO memeradar.x_post_rules(data_origin,post_id,rule_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [this.origin, id, lease.rule.id],
        );
        await client.query(
          "INSERT INTO memeradar.x_post_collections(data_origin,post_id,run_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [this.origin, id, lease.runId],
        );
      }
      const pending = highestId(
        [cp.pending_since_id, cp.since_id, ...page.data.map((p) => p.id)],
        this.origin,
      );
      await client.query(
        "UPDATE memeradar.x_collection_checkpoints SET since_id=$1,pending_since_id=$2,next_token=$3,last_success_at=$4,lease_until=$5 WHERE id=$6",
        [
          page.nextToken ? cp.since_id : pending,
          page.nextToken ? pending : null,
          page.nextToken,
          new Date(now),
          new Date(now + leaseMs),
          cp.id,
        ],
      );
      await client.query(
        "UPDATE memeradar.x_collection_runs SET retrieved_count=retrieved_count+$1,new_count=new_count+$2,duplicate_count=duplicate_count+$3,partial=partial OR $6,error_count=error_count+$7 WHERE id=$4 AND data_origin=$5",
        [
          page.data.length,
          newPosts,
          duplicates,
          lease.runId,
          this.origin,
          page.partial,
          page.problems.length,
        ],
      );
      return {
        newPosts,
        duplicates,
        originals,
        unknown,
        reposts,
        highestId: pending,
      };
    });
    for (const id of notifications)
      this.hub?.publish(this.ownerId, {
        postId: id,
        origin: this.origin,
        at: new Date(now).toISOString(),
      });
    return result;
  }
  async finish(
    lease: Lease,
    options: {
      now: number;
      nextDueAt: number;
      status: "completed" | "failed" | "interrupted";
      errorCode?: string;
      retryAfterMs?: number;
    },
  ): Promise<void> {
    return this.tx(async (client) => {
      const cp = await this.fence(client, lease, options.now);
      if (options.errorCode === "INVALID_INPUT") {
        if (cp.next_token)
          await client.query(
            "UPDATE memeradar.x_collection_checkpoints SET next_token=NULL,pending_since_id=NULL WHERE id=$1",
            [cp.id],
          );
        else
          await client.query(
            "UPDATE memeradar.x_rules SET status='paused' WHERE id=$1 AND data_origin=$2 AND owner_user_id=$3",
            [lease.rule.id, this.origin, this.ownerId],
          );
      }
      await client.query(
        "UPDATE memeradar.x_collection_checkpoints SET lease_id=NULL,lease_until=NULL,next_due_at=$1 WHERE id=$2",
        [
          new Date(
            Math.max(
              options.nextDueAt,
              options.now + (options.retryAfterMs ?? 0),
            ),
          ),
          cp.id,
        ],
      );
      await client.query(
        "UPDATE memeradar.x_collection_runs SET status=$1,ended_at=$2,error_code=$3,partial=partial OR $6,error_count=CASE WHEN $3::text IS NULL THEN error_count ELSE error_count+1 END,gap_started_at=CASE WHEN $1='interrupted' THEN $2 ELSE gap_started_at END WHERE id=$4 AND data_origin=$5",
        [
          options.status,
          new Date(options.now),
          options.errorCode ?? null,
          lease.runId,
          this.origin,
          cp.next_token !== null,
        ],
      );
    });
  }
  async localSearch(input: unknown): Promise<{
    posts: Record<string, any>[];
    nextCursor: string | null;
    costMicros: "0";
    source: "local";
  }> {
    const parsed = localFiltersSchema.safeParse(input);
    if (!parsed.success) throw new ProviderError("INVALID_INPUT");
    const f = parsed.data;
    return this.tx(async (client) => {
      const { where, values } = this.searchWhere(f);
      const limit = values.push(f.limit + 1);
      const rows = (
        await client.query(
          `SELECT p.*, (SELECT jsonb_agg(DISTINCT r.mode) FROM memeradar.x_post_collections c JOIN memeradar.x_collection_runs r ON r.id=c.run_id AND r.data_origin=c.data_origin JOIN memeradar.x_rules own_rule ON own_rule.id=r.rule_id AND own_rule.data_origin=r.data_origin WHERE c.post_id=p.id AND c.data_origin=p.data_origin AND own_rule.owner_user_id=$2) AS collection_modes FROM memeradar.x_posts p WHERE ${where.join(" AND ")} ORDER BY coalesce(p.published_at,p.collected_at) DESC,p.id DESC LIMIT $${limit}`,
          values,
        )
      ).rows;
      const more = rows.length > f.limit,
        selected = rows.slice(0, f.limit),
        last = selected.at(-1);
      return {
        posts: selected,
        nextCursor:
          more && last
            ? Buffer.from(
                JSON.stringify({
                  at: (last.published_at ?? last.collected_at).toISOString(),
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
        costMicros: "0",
        source: "local",
      };
    });
  }
  private searchWhere(f: LocalFilters) {
    const values: unknown[] = [this.origin, this.ownerId];
    const where = [
      `p.data_origin=$1`,
      `p.availability_status='available'`,
      `EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules r ON r.id=pr.rule_id AND r.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND r.owner_user_id=$2)`,
    ];
    const bind = (value: unknown) => "$" + values.push(value);
    if (f.text)
      where.push(
        `to_tsvector('simple',coalesce(p.text,'')) @@ plainto_tsquery('simple',${bind(f.text)})`,
      );
    if (f.keyword)
      where.push(`position(lower(${bind(f.keyword)}) in lower(p.text))>0`);
    if (f.hashtag)
      where.push(
        `EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(p.entities->'hashtags','[]')) h WHERE lower(h)=lower(${bind(f.hashtag)}))`,
      );
    if (f.authorId)
      where.push(
        `coalesce(p.author_x_user_id,p.unresolved_author_x_user_id)=${bind(f.authorId)}`,
      );
    if (f.type) where.push(`p.post_type=${bind(f.type)}`);
    if (f.language) where.push(`p.lang=${bind(f.language)}`);
    if (f.since)
      where.push(
        `coalesce(p.published_at,p.collected_at)>=${bind(f.since)}::timestamptz`,
      );
    if (f.until)
      where.push(
        `coalesce(p.published_at,p.collected_at)<=${bind(f.until)}::timestamptz`,
      );
    if (f.hasAddress !== undefined)
      where.push(
        `(jsonb_array_length(p.detected_contract_addresses)>0)=${bind(f.hasAddress)}`,
      );
    if (f.minInteractions)
      where.push(
        `(SELECT sum(v::numeric) FROM jsonb_each_text(p.public_metrics) m(k,v) WHERE k IN ('likes','replies','reposts','quotes') AND v IS NOT NULL)>=${bind(f.minInteractions)}::numeric`,
      );
    if (f.personId || f.categoryId) {
      const person = f.personId ? ` AND t.id=${bind(f.personId)}` : "",
        category = f.categoryId
          ? ` AND t.category_id=${bind(f.categoryId)}`
          : "";
      where.push(
        `EXISTS(SELECT 1 FROM memeradar.tracked_people t WHERE t.x_user_id=p.author_x_user_id AND t.data_origin=p.data_origin AND t.owner_user_id=$2${person}${category})`,
      );
    }
    if (f.eventId)
      where.push(
        `EXISTS(SELECT 1 FROM memeradar.post_event_links e WHERE e.post_id=p.id AND e.data_origin=p.data_origin AND e.event_id=${bind(f.eventId)})`,
      );
    if (f.tokenId)
      where.push(
        `EXISTS(SELECT 1 FROM memeradar.post_token_mentions t WHERE t.post_id=p.id AND t.data_origin=p.data_origin AND t.token_id=${bind(f.tokenId)})`,
      );
    if (f.ruleId)
      where.push(
        `EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules r ON r.id=pr.rule_id AND r.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND r.owner_user_id=$2 AND pr.rule_id=${bind(f.ruleId)})`,
      );
    if (f.cursor) {
      let cursor: { at: string; id: string };
      try {
        cursor = JSON.parse(Buffer.from(f.cursor, "base64url").toString());
        if (!uuid.test(cursor.id) || !Number.isFinite(Date.parse(cursor.at)))
          throw new Error();
      } catch {
        throw new ProviderError("INVALID_INPUT");
      }
      where.push(
        `(coalesce(p.published_at,p.collected_at),p.id)<(${bind(cursor.at)}::timestamptz,${bind(cursor.id)}::uuid)`,
      );
    }
    return { where, values };
  }
  async duplicateSignals(input: unknown) {
    const f = localFiltersSchema.safeParse(input);
    if (!f.success) throw new ProviderError("INVALID_INPUT");
    return this.tx(async (client) => {
      const { where, values } = this.searchWhere(f.data);
      return (
        await client.query(
          `SELECT p.text_fingerprint,count(*)::text AS publications,count(DISTINCT p.author_x_user_id)::text AS authors,count(*) FILTER(WHERE p.post_type='repost')::text AS reposts FROM memeradar.x_posts p WHERE ${where.join(" AND ")} AND p.text_fingerprint IS NOT NULL GROUP BY p.text_fingerprint HAVING count(DISTINCT p.author_x_user_id)>1 ORDER BY count(*) DESC LIMIT 50`,
          values,
        )
      ).rows.map((row) => ({
        ...row,
        knowledge: "INTERPRETED",
        label:
          "Textes proches ou identiques — coordination possible, non prouvée",
      }));
    });
  }
  async hideUnavailable(ids: string[], at: number) {
    if (
      ids.length > 1000 ||
      ids.some((id) => !idSchema(this.origin).safeParse(id).success)
    )
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (client) => {
      await client.query(
        "UPDATE memeradar.x_posts p SET text=NULL,entities='{}',public_metrics='{}',detected_contract_addresses='[]',text_fingerprint=NULL,availability_status='unknown',availability_checked_at=$1 WHERE p.data_origin=$2 AND p.x_post_id=ANY($3::text[]) AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules r ON r.id=pr.rule_id AND r.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND r.owner_user_id=$4)",
        [new Date(at), this.origin, ids, this.ownerId],
      );
    });
  }
}
export function addressCandidates(
  text: string,
  origin: Origin,
): {
  address: string;
  chain: "evm" | "unknown";
  validity: "unverified" | "demo";
}[] {
  const pattern =
    origin === "DEMO"
      ? /\b(?:0xDEMO[0-9]{36}|DEMo[1-9A-HJ-NP-Za-km-z]{28,40})\b/g
      : /\b(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;
  return [...new Set(text.match(pattern) ?? [])]
    .slice(0, 100)
    .map((address) => ({
      address,
      chain: address.startsWith("0x") ? "evm" : "unknown",
      validity: origin === "DEMO" ? "demo" : "unverified",
    }));
}
