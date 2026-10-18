import { socialVisibility } from "./social-visibility";
import type { Pool, PoolClient } from "pg";
import { withUserContext } from "./client";
import { ProviderError } from "../shared/errors";
import {
  idSchema,
  type Origin,
  type XPage,
  type XPost,
} from "../connectors/x/contracts";
import type { CollectionRule, Lease } from "../collection/contracts";
import { PgXCollectionRepository } from "./x-collection-repository";
import {
  coverage,
  role,
  commenterSummary,
  type ConversationPost,
} from "../conversations/model";
export class PgConversationRepository {
  constructor(
    private pool: Pool,
    readonly ownerId: string,
    readonly origin: Origin,
    readonly collection: PgXCollectionRepository,
  ) {
    if (collection.ownerId !== ownerId || collection.origin !== origin)
      throw new ProviderError("INVALID_INPUT");
  }
  private tx<T>(work: (c: PoolClient) => Promise<T>) {
    return withUserContext(this.pool, this.ownerId, this.origin, work);
  }
  private check(id: string) {
    if (!idSchema(this.origin).safeParse(id).success)
      throw new ProviderError("INVALID_INPUT");
  }
  async ensure(
    id: string,
    windowSeconds: number | null,
    quotesAvailable: boolean,
  ): Promise<CollectionRule> {
    this.check(id);
    return this.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `conversation:${this.origin}:${this.ownerId}:${id}`,
      ]);
      await c.query(
        "INSERT INTO memeradar.conversations(data_origin,conversation_id) VALUES($1,$2) ON CONFLICT(data_origin,conversation_id) DO NOTHING",
        [this.origin, id],
      );
      let view = (
        await c.query(
          "SELECT * FROM memeradar.conversation_views WHERE data_origin=$1 AND owner_user_id=$2 AND conversation_id=$3",
          [this.origin, this.ownerId, id],
        )
      ).rows[0];
      if (!view) {
        const rule = (
          await c.query(
            "INSERT INTO memeradar.x_rules(data_origin,owner_user_id,name,expression,query,status) VALUES($1,$2,'Conversation X',$3,$4,'paused') RETURNING id",
            [
              this.origin,
              this.ownerId,
              JSON.stringify({ kind: "conversation", conversationId: id }),
              `conversation_id:${id}`,
            ],
          )
        ).rows[0];
        view = (
          await c.query(
            "INSERT INTO memeradar.conversation_views(data_origin,owner_user_id,conversation_id,rule_id,window_seconds,quotes_available) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              this.origin,
              this.ownerId,
              id,
              rule.id,
              windowSeconds,
              quotesAvailable,
            ],
          )
        ).rows[0];
      } else
        await c.query(
          "UPDATE memeradar.conversation_views SET window_seconds=$1,quotes_available=$2 WHERE id=$3 AND owner_user_id=$4 AND data_origin=$5",
          [windowSeconds, quotesAvailable, view.id, this.ownerId, this.origin],
        );
      return {
        id: view.rule_id,
        ownerId: this.ownerId,
        origin: this.origin,
        query: `conversation_id:${id}`,
        status: "paused",
        priority: "normal",
        intervalSeconds: 300,
      };
    });
  }
  async persist(
    lease: Lease,
    page: XPage<XPost>,
    mode: "lookup" | "conversation" | "quotes",
    now: number,
    leaseMs: number,
  ) {
    const id = lease.rule.query.replace(/^conversation_id:/, "");
    this.check(id);
    if (
      lease.rule.ownerId !== this.ownerId ||
      lease.rule.origin !== this.origin ||
      page.dataOrigin !== this.origin
    )
      throw new ProviderError("INVALID_INPUT");
    const relevant = page.data.filter((p) => {
      const kind = role(p, id);
      return mode === "lookup"
        ? kind === "root"
        : mode === "quotes"
          ? kind === "quote"
          : kind === "root" || kind === "reply";
    });
    // Do not put ordinary commenters in the global user/profile/history tables.
    const minimized = { ...page, data: relevant, users: [] };
    return this.collection.ingest(
      lease,
      minimized,
      mode,
      now,
      leaseMs,
      async (c) => {
        const view = (
          await c.query(
            "SELECT id,window_seconds FROM memeradar.conversation_views WHERE owner_user_id=$1 AND data_origin=$2 AND conversation_id=$3 AND rule_id=$4 FOR UPDATE",
            [this.ownerId, this.origin, id, lease.rule.id],
          )
        ).rows[0];
        if (!view) throw new ProviderError("NOT_FOUND");
        const ids = new Set(relevant.map((p) => p.authorId));
        for (const user of page.users.filter((u) => ids.has(u.id))) {
          if (user.dataOrigin !== this.origin)
            throw new ProviderError("INVALID_RESPONSE");
          await c.query(
            "INSERT INTO memeradar.conversation_authors(data_origin,owner_user_id,view_id,x_user_id,username,display_name,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(data_origin,view_id,x_user_id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,observed_at=EXCLUDED.observed_at WHERE conversation_authors.observed_at<=EXCLUDED.observed_at",
            [
              this.origin,
              this.ownerId,
              view.id,
              user.id,
              user.username,
              user.name,
              user.observedAt,
            ],
          );
        }
        const root = relevant.find((p) => p.id === id);
        const old =
          root?.publishedAt && view.window_seconds
            ? Date.parse(root.publishedAt) < now - view.window_seconds * 1000
            : null;
        await c.query(
          "UPDATE memeradar.conversation_views SET last_fetched_at=$1,last_error=NULL,reported_reply_count=CASE WHEN $2::numeric IS NOT NULL AND (reported_at IS NULL OR reported_at<=$7) THEN $2 ELSE reported_reply_count END,reported_at=CASE WHEN $2::numeric IS NOT NULL AND (reported_at IS NULL OR reported_at<=$7) THEN $7 ELSE reported_at END,outside_window=COALESCE($3,outside_window) WHERE id=$4 AND data_origin=$5 AND owner_user_id=$6",
          [
            new Date(now),
            root?.metrics.replies ?? null,
            old,
            view.id,
            this.origin,
            this.ownerId,
            root ? new Date(root.collectedAt) : null,
          ],
        );
      },
    );
  }
  async error(id: string, code: string) {
    this.check(id);
    if (!/^[A-Z_]{1,80}$/.test(code)) throw new ProviderError("INVALID_INPUT");
    await this.tx((c) =>
      c.query(
        "UPDATE memeradar.conversation_views SET last_error=$1 WHERE owner_user_id=$2 AND data_origin=$3 AND conversation_id=$4",
        [code, this.ownerId, this.origin, id],
      ),
    );
  }
  async read(id: string) {
    this.check(id);
    return this.tx(async (c) => {
      const view = (
        await c.query(
          "SELECT * FROM memeradar.conversation_views WHERE owner_user_id=$1 AND data_origin=$2 AND conversation_id=$3",
          [this.ownerId, this.origin, id],
        )
      ).rows[0];
      if (!view) throw new ProviderError("NOT_FOUND");
      const rows = (
        await c.query(
          `SELECT p.*,a.x_user_id AS display_author_id,a.username,a.display_name,
   ARRAY(SELECT DISTINCT t.token_id::text FROM memeradar.post_token_mentions t WHERE t.data_origin=p.data_origin AND t.post_id=p.id AND ${socialVisibility("t", "p", "$2")}) AS tokens,
   ARRAY(SELECT DISTINCT e.event_id::text FROM memeradar.post_event_links e WHERE e.data_origin=p.data_origin AND e.post_id=p.id AND (e.owner_user_id IS NULL OR e.owner_user_id=$2) AND (e.watch_id IS NULL OR EXISTS(SELECT 1 FROM memeradar.event_watches ew WHERE ew.id=e.watch_id AND ew.data_origin=e.data_origin AND ew.owner_user_id=e.owner_user_id AND ew.revision=e.watch_revision))) AS events,
   EXISTS(SELECT 1 FROM memeradar.tracked_people t WHERE t.data_origin=p.data_origin AND t.owner_user_id=$2 AND t.x_user_id=coalesce(p.author_x_user_id,p.unresolved_author_x_user_id)) AS followed
   FROM memeradar.x_posts p JOIN memeradar.x_post_rules link ON link.post_id=p.id AND link.data_origin=p.data_origin AND link.rule_id=$4
   LEFT JOIN memeradar.conversation_authors a ON a.data_origin=p.data_origin AND a.owner_user_id=$2 AND a.view_id=$5 AND a.x_user_id=coalesce(p.author_x_user_id,p.unresolved_author_x_user_id)
   WHERE p.data_origin=$1 AND p.availability_status='available' AND (p.x_post_id=$3 OR p.conversation_id=$3 OR EXISTS(SELECT 1 FROM memeradar.x_post_references ref WHERE ref.post_id=p.id AND ref.data_origin=p.data_origin AND ref.reference_type='quoted' AND ref.referenced_x_post_id=$3)) ORDER BY coalesce(p.published_at,p.collected_at),p.id LIMIT 1001`,
          [this.origin, this.ownerId, id, view.rule_id, view.id],
        )
      ).rows;
      // Counts use all owned linked available replies, not just the bounded display sample.
      const total = (
        await c.query(
          `SELECT count(DISTINCT p.id)::text AS n FROM memeradar.x_posts p JOIN memeradar.x_post_rules link ON link.post_id=p.id AND link.data_origin=p.data_origin WHERE link.rule_id=$1 AND p.data_origin=$2 AND p.availability_status='available' AND p.x_post_id<>$3 AND p.conversation_id=$3 AND p.in_reply_to_post_id IS NOT NULL AND p.post_type<>'repost'`,
          [view.rule_id, this.origin, id],
        )
      ).rows[0].n;
      const posts: ConversationPost[] = rows.slice(0, 1000).map((p) => ({
        id: p.x_post_id,
        text: p.text,
        authorId: p.author_x_user_id ?? p.unresolved_author_x_user_id,
        publishedAt: p.published_at?.toISOString() ?? null,
        collectedAt: p.collected_at.toISOString(),
        conversationId: p.conversation_id,
        references: p.referenced_post_ids,
        type: p.post_type,
        language: p.lang,
        metrics: {
          likes: null,
          replies: null,
          reposts: null,
          quotes: null,
          ...p.public_metrics,
        },
        entities: {
          hashtags: [],
          cashtags: [],
          mentions: [],
          urls: [],
          ...p.entities,
        },
        dataOrigin: this.origin,
        knowledge: "OBSERVED",
        author: p.display_author_id
          ? {
              id: p.display_author_id,
              username: p.username,
              name: p.display_name,
            }
          : null,
        tokenIds: p.tokens,
        eventIds: p.events,
        followed: p.followed,
      }));
      const runs = (
        await c.query(
          "SELECT mode,status,partial,error_code,started_at,ended_at,gap_started_at,gap_ended_at FROM memeradar.x_collection_runs WHERE rule_id=$1 AND data_origin=$2 ORDER BY started_at DESC,id DESC LIMIT 100",
          [view.rule_id, this.origin],
        )
      ).rows;
      return {
        conversationId: id,
        dataOrigin: this.origin,
        posts,
        truncated: rows.length > 1000,
        coverage: coverage(
          Number(total),
          view.reported_reply_count,
          view.outside_window,
        ),
        summary: commenterSummary(posts, id),
        summaryIsSample: rows.length > 1000,
        windowSeconds: view.window_seconds,
        quotesAvailable: view.quotes_available,
        lastFetchedAt: view.last_fetched_at?.toISOString() ?? null,
        lastError: view.last_error,
        reportedAt: view.reported_at?.toISOString() ?? null,
        runs,
      };
    });
  }
}
