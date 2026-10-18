import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withUserContext } from "./client";
import { ProviderError } from "../shared/errors";
import type { Origin, XPost } from "../connectors/x/contracts";
import { CHAINS, type Chain } from "../social/identity";
import {
  extractCandidates,
  resolveMentions,
  summarizeSocial,
  type Mention,
  type SocialToken,
} from "../social/model";
import { socialVisibility } from "./social-visibility";
const version = "social-extraction@1.0.0";
const uuid = z.uuid();
const postDTO = (p: any): XPost => ({
  id: p.x_post_id,
  text: p.text ?? "",
  authorId: p.author_x_user_id ?? p.unresolved_author_x_user_id,
  publishedAt: p.published_at?.toISOString() ?? null,
  collectedAt: p.collected_at.toISOString(),
  type: p.post_type,
  entities: {
    hashtags: [],
    cashtags: [],
    mentions: [],
    urls: [],
    ...p.entities,
  },
  conversationId: p.conversation_id,
  references: [],
  language: p.lang,
  metrics: { likes: null, replies: null, reposts: null, quotes: null },
  dataOrigin: p.data_origin,
  knowledge: "OBSERVED",
});
const tokenDTO = (t: any): SocialToken => ({
  id: t.id,
  chain: t.slug,
  address: t.contract_address,
  name: t.name,
  symbol: t.symbol,
  createdAt: t.created_at_onchain?.toISOString() ?? null,
});
export class PgSocialRepository {
  constructor(
    private pool: Pool,
    readonly ownerId: string,
    readonly origin: Origin,
  ) {
    if (!uuid.safeParse(ownerId).success)
      throw new ProviderError("INVALID_INPUT");
  }
  private tx<T>(fn: (c: PoolClient) => Promise<T>) {
    return withUserContext(this.pool, this.ownerId, this.origin, fn);
  }
  /** Offline registry matching. Chain context must come from explicit operator configuration, never a symbol. */
  async rebuild(raw: unknown = {}) {
    const parsed = z
      .object({
        ruleId: z.uuid().optional(),
        contextChain: z.enum(CHAINS).optional(),
      })
      .strict()
      .safeParse(raw);
    if (!parsed.success || (parsed.data.contextChain && !parsed.data.ruleId))
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `social:${this.origin}:${this.ownerId}`,
      ]);
      if (
        parsed.data.ruleId &&
        !(
          await c.query(
            "SELECT 1 FROM memeradar.x_rules WHERE id=$1 AND owner_user_id=$2 AND data_origin=$3",
            [parsed.data.ruleId, this.ownerId, this.origin],
          )
        ).rowCount
      )
        throw new ProviderError("NOT_FOUND");
      const posts = (
        await c.query(
          `SELECT p.* FROM memeradar.x_posts p WHERE p.data_origin=$1 AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules r ON r.id=pr.rule_id AND r.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND r.owner_user_id=$2 AND ($3::uuid IS NULL OR r.id=$3)) ORDER BY p.id LIMIT 10001`,
          [this.origin, this.ownerId, parsed.data.ruleId ?? null],
        )
      ).rows;
      const registry = (
        await c.query(
          "SELECT t.*,ch.slug FROM memeradar.tokens t JOIN memeradar.chains ch ON ch.id=t.chain_id AND ch.data_origin=t.data_origin WHERE t.data_origin=$1 ORDER BY t.id LIMIT 1001",
          [this.origin],
        )
      ).rows.map(tokenDTO);
      if (posts.length > 10000 || registry.length > 1000)
        throw new ProviderError("INVALID_INPUT");
      let resolved = 0,
        unresolved = 0;
      for (const row of posts) {
        const p = postDTO(row),
          candidates =
            row.availability_status === "available"
              ? extractCandidates(p, this.origin, parsed.data.contextChain)
              : [];
        const mentions = resolveMentions(
          p,
          candidates,
          row.availability_status === "available" ? registry : [],
          this.origin,
        );
        const evidence = {
          text_fingerprint: row.text_fingerprint,
          entities: row.entities,
          post_type: row.post_type,
          author_id: p.authorId,
          contextChain: parsed.data.contextChain ?? null,
        };
        await c.query(
          "DELETE FROM memeradar.post_token_mentions WHERE owner_user_id=$1 AND data_origin=$2 AND post_id=$3 AND algorithm_version=$4",
          [this.ownerId, this.origin, row.id, version],
        );
        await c.query(
          "DELETE FROM memeradar.social_token_candidates WHERE owner_user_id=$1 AND data_origin=$2 AND post_id=$3",
          [this.ownerId, this.origin, row.id],
        );
        if (row.availability_status !== "available") continue;
        const unique = [
          ...new Map(
            mentions.map((m) => [m.tokenId + ":" + m.method, m]),
          ).values(),
        ];
        for (const m of unique)
          await c.query(
            "INSERT INTO memeradar.post_token_mentions(data_origin,knowledge_kind,owner_user_id,post_id,token_id,detection_method,confidence,algorithm_version,evidence) VALUES($1,'OBSERVED',$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(data_origin,owner_user_id,post_id,token_id,detection_method) DO UPDATE SET confidence=EXCLUDED.confidence,algorithm_version=EXCLUDED.algorithm_version,evidence=EXCLUDED.evidence",
            [
              this.origin,
              this.ownerId,
              row.id,
              m.tokenId,
              m.method,
              m.method === "exact_address"
                ? "0.9"
                : m.method === "token_page_url"
                  ? "0.8"
                  : "0.2",
              version,
              JSON.stringify({
                ...evidence,
                candidate: {
                  method: m.method,
                  chain: m.chain,
                  address: m.address,
                  value: m.value,
                  context: m.context,
                },
              }),
            ],
          );
        await c.query(
          "INSERT INTO memeradar.social_token_candidates(data_origin,owner_user_id,post_id,candidates,algorithm_version,evidence) VALUES($1,$2,$3,$4,$5,$6)",
          [
            this.origin,
            this.ownerId,
            row.id,
            JSON.stringify(candidates),
            version,
            JSON.stringify(evidence),
          ],
        );
        resolved += unique.length;
        unresolved += candidates.filter(
          (x) =>
            x.address &&
            !mentions.some(
              (m) =>
                m.method === x.method &&
                m.address === x.address &&
                m.chain === x.chain,
            ),
        ).length;
      }
      return {
        examined: posts.length,
        mentions: resolved,
        unresolved,
        algorithm_version: version,
        networkCalls: 0,
      };
    });
  }
  async forEvent(eventId: string, asOf = new Date().toISOString()) {
    if (
      !uuid.safeParse(eventId).success ||
      !z.iso.datetime().safeParse(asOf).success
    )
      throw new ProviderError("INVALID_INPUT");
    const ids = await this.tx(async (c) => {
      if (
        !(
          await c.query(
            "SELECT 1 FROM memeradar.event_watches WHERE event_id=$1 AND owner_user_id=$2 AND data_origin=$3",
            [eventId, this.ownerId, this.origin],
          )
        ).rowCount
      )
        throw new ProviderError("NOT_FOUND");
      const rows = (
        await c.query(
          `SELECT DISTINCT m.token_id FROM memeradar.post_token_mentions m JOIN memeradar.x_posts p ON p.id=m.post_id AND p.data_origin=m.data_origin JOIN memeradar.post_event_links l ON l.post_id=p.id AND l.data_origin=p.data_origin JOIN memeradar.event_watches w ON w.id=l.watch_id AND w.data_origin=l.data_origin AND w.owner_user_id=l.owner_user_id AND w.revision=l.watch_revision WHERE m.owner_user_id=$1 AND m.data_origin=$2 AND l.owner_user_id=$1 AND l.event_id=$3 AND m.algorithm_version=$4 AND m.detection_method IN ('exact_address','token_page_url') AND ${socialVisibility("m", "p", "$1")} AND p.availability_status='available' AND p.collected_at<=$5 AND (p.published_at IS NULL OR p.published_at<=$5) AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules r ON r.id=pr.rule_id AND r.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND r.owner_user_id=$1) ORDER BY m.token_id LIMIT 101`,
          [this.ownerId, this.origin, eventId, version, asOf],
        )
      ).rows;
      if (rows.length > 100) throw new ProviderError("INVALID_INPUT");
      return rows.map((r) => r.token_id as string);
    });
    const result = [];
    for (const id of ids) result.push(await this.read(id, eventId, asOf));
    return result;
  }
  async read(
    tokenId: string,
    eventId: string,
    asOf = new Date().toISOString(),
  ) {
    if (
      !uuid.safeParse(tokenId).success ||
      !uuid.safeParse(eventId).success ||
      !z.iso.datetime().safeParse(asOf).success
    )
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (c) => {
      const token = (
        await c.query(
          "SELECT t.*,ch.slug FROM memeradar.tokens t JOIN memeradar.chains ch ON ch.id=t.chain_id AND ch.data_origin=t.data_origin WHERE t.id=$1 AND t.data_origin=$2",
          [tokenId, this.origin],
        )
      ).rows[0];
      const watch = (
        await c.query(
          "SELECT w.*,e.first_published_at FROM memeradar.event_watches w JOIN memeradar.events e ON e.id=w.event_id AND e.data_origin=w.data_origin WHERE w.event_id=$1 AND w.owner_user_id=$2 AND w.data_origin=$3",
          [eventId, this.ownerId, this.origin],
        )
      ).rows[0];
      if (!token || !watch) throw new ProviderError("NOT_FOUND");
      const rows = (
        await c.query(
          `SELECT m.detection_method,m.evidence,p.*,EXISTS(SELECT 1 FROM memeradar.post_event_links l WHERE l.post_id=p.id AND l.data_origin=p.data_origin AND l.event_id=$4 AND l.owner_user_id=$2 AND l.watch_id=$5 AND l.watch_revision=$6) AS event_linked FROM memeradar.post_token_mentions m JOIN memeradar.x_posts p ON p.id=m.post_id AND p.data_origin=m.data_origin WHERE m.token_id=$1 AND m.owner_user_id=$2 AND m.data_origin=$3 AND m.algorithm_version=$7 AND ${socialVisibility("m", "p", "$2")} AND p.availability_status='available' AND p.collected_at<=$8 AND (p.published_at IS NULL OR p.published_at<=$8) AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules r ON r.id=pr.rule_id AND r.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND r.owner_user_id=$2) ORDER BY p.published_at NULLS LAST,p.id LIMIT 10001`,
          [
            tokenId,
            this.ownerId,
            this.origin,
            eventId,
            watch.id,
            watch.revision,
            version,
            asOf,
          ],
        )
      ).rows;
      if (rows.length > 10000) throw new ProviderError("INVALID_INPUT");
      const mentions: Mention[] = rows.map((r) => ({
        ...r.evidence.candidate,
        method: r.detection_method,
        tokenId,
        postId: r.x_post_id,
        publishedAt: r.published_at?.toISOString() ?? null,
        collectedAt: r.collected_at.toISOString(),
        authorId: r.author_x_user_id ?? r.unresolved_author_x_user_id,
        eventLinked: r.event_linked,
      }));
      const attestations = (
        await c.query(
          "SELECT a.*,p.x_post_id FROM memeradar.social_contract_attestations a JOIN memeradar.x_posts p ON p.id=a.post_id AND p.data_origin=a.data_origin WHERE a.owner_user_id=$1 AND a.data_origin=$2 AND a.event_id=$3 AND a.token_id=$4 AND a.watch_id=$5 AND a.watch_revision=$6 AND a.reviewed_at<=$7 AND a.created_at<=$7 AND a.evidence->>'text_fingerprint' IS NOT DISTINCT FROM p.text_fingerprint AND a.evidence->'entities'=p.entities AND a.evidence->>'post_type'=p.post_type",
          [
            this.ownerId,
            this.origin,
            eventId,
            tokenId,
            watch.id,
            watch.revision,
            asOf,
          ],
        )
      ).rows;
      const officialPostIds = attestations
        .filter(
          (a) =>
            watch.official_accounts.some(
              (u: any) =>
                u.userId === a.author_x_user_id &&
                Date.parse(u.reviewedAt) <= Date.parse(asOf),
            ) &&
            mentions.some(
              (m) =>
                m.postId === a.x_post_id &&
                m.authorId === a.author_x_user_id &&
                m.eventLinked &&
                m.method === "exact_address",
            ),
        )
        .map((a) => a.x_post_id);
      return {
        token: tokenDTO(token),
        ...summarizeSocial(tokenDTO(token), mentions, {
          asOf,
          signalAt: watch.first_published_at.toISOString(),
          officialPostIds,
          officialClaim: /\boffic(?:ial|iel)/iu.test(token.name ?? ""),
        }),
        attestations: attestations
          .filter((a) => officialPostIds.includes(a.x_post_id))
          .map((a) => ({
            postId: a.x_post_id,
            evidenceUrl: a.evidence_url,
            id: a.id,
            reviewedAt: a.reviewed_at.toISOString(),
            purpose: a.purpose,
          })),
        unknownAccountAge: true,
        scopeNotice:
          "Règles du propriétaire ; registre de tokens déjà connus. Aucune découverte de contrat ni vérification automatique d’un mint.",
      };
    });
  }
  /** Trusted operator explicitly reviews the publication's purpose. An identity badge alone is insufficient. */
  async attestOfficialPublication(raw: unknown) {
    const parsed = z
      .object({
        eventId: z.uuid(),
        tokenId: z.uuid(),
        postId: z.string().min(1).max(100),
        purpose: z.literal("contract_publication"),
        reviewedAt: z.iso.datetime(),
      })
      .strict()
      .safeParse(raw);
    if (!parsed.success || Date.parse(parsed.data.reviewedAt) > Date.now())
      throw new ProviderError("INVALID_INPUT");
    const v = parsed.data;
    return this.tx(async (c) => {
      const w = (
        await c.query(
          "SELECT * FROM memeradar.event_watches WHERE event_id=$1 AND owner_user_id=$2 AND data_origin=$3 FOR UPDATE",
          [v.eventId, this.ownerId, this.origin],
        )
      ).rows[0];
      if (!w) throw new ProviderError("NOT_FOUND");
      const p = (
        await c.query(
          `SELECT p.* FROM memeradar.x_posts p JOIN memeradar.post_token_mentions m ON m.post_id=p.id AND m.data_origin=p.data_origin WHERE p.x_post_id=$1 AND p.data_origin=$2 AND m.owner_user_id=$3 AND m.token_id=$4 AND m.algorithm_version=$5 AND m.detection_method='exact_address' AND ${socialVisibility("m", "p", "$3")} AND p.availability_status='available' AND EXISTS(SELECT 1 FROM memeradar.post_event_links l WHERE l.post_id=p.id AND l.data_origin=p.data_origin AND l.watch_id=$6 AND l.watch_revision=$7 AND l.owner_user_id=$3) AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules r ON r.id=pr.rule_id AND r.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND r.owner_user_id=$3)`,
          [
            v.postId,
            this.origin,
            this.ownerId,
            v.tokenId,
            version,
            w.id,
            w.revision,
          ],
        )
      ).rows[0];
      const author = p?.author_x_user_id ?? p?.unresolved_author_x_user_id;
      if (
        !p ||
        !p.published_at ||
        p.collected_at > new Date(v.reviewedAt) ||
        p.published_at > new Date(v.reviewedAt) ||
        !w.official_accounts.some(
          (a: any) =>
            a.userId === author &&
            Date.parse(a.reviewedAt) <= Date.parse(v.reviewedAt),
        )
      )
        throw new ProviderError("INVALID_INPUT");
      const url =
        this.origin === "DEMO"
          ? `https://demo.memeradar.invalid/post/${p.x_post_id}`
          : `https://x.com/i/status/${p.x_post_id}`;
      await c.query(
        "INSERT INTO memeradar.social_contract_attestations(data_origin,owner_user_id,watch_id,watch_revision,event_id,token_id,post_id,author_x_user_id,evidence_url,reviewed_at,purpose,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(data_origin,owner_user_id,event_id,token_id,post_id) DO UPDATE SET watch_id=EXCLUDED.watch_id,watch_revision=EXCLUDED.watch_revision,author_x_user_id=EXCLUDED.author_x_user_id,reviewed_at=EXCLUDED.reviewed_at,evidence=EXCLUDED.evidence",
        [
          this.origin,
          this.ownerId,
          w.id,
          w.revision,
          v.eventId,
          v.tokenId,
          p.id,
          author,
          url,
          v.reviewedAt,
          v.purpose,
          JSON.stringify({
            text_fingerprint: p.text_fingerprint,
            entities: p.entities,
            post_type: p.post_type,
          }),
        ],
      );
      return { postId: v.postId, purpose: v.purpose, knowledge: "OBSERVED" };
    });
  }
  async revokeOfficialPublication(id: string) {
    if (!uuid.safeParse(id).success) throw new ProviderError("INVALID_INPUT");
    return this.tx(
      async (c) =>
        (
          await c.query(
            "DELETE FROM memeradar.social_contract_attestations WHERE id=$1 AND owner_user_id=$2 AND data_origin=$3",
            [id, this.ownerId, this.origin],
          )
        ).rowCount,
    );
  }
}
