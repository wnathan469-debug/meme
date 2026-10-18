import type { Pool, PoolClient } from "pg";
import { withUserContext } from "./client";
import { ProviderError } from "../shared/errors";
import type { Origin, XUser } from "../connectors/x/contracts";
import type { PeopleRepository } from "../people/service";
import {
  parsePerson,
  intervals,
  normalizeUsername,
  type Person,
  type PersonInput,
  type Category,
} from "../people/model";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const select = `SELECT p.*, to_jsonb(u) AS profile FROM memeradar.tracked_people p LEFT JOIN memeradar.x_users u ON u.x_user_id=p.x_user_id AND u.data_origin=p.data_origin WHERE p.owner_user_id=$1 AND p.data_origin=$2`;
function mapped(row: Record<string, any>): Person {
  const u = row.profile;
  return {
    id: row.id,
    xUserId: row.x_user_id,
    username: row.requested_username,
    name: row.display_name_override ?? "",
    categoryId: row.category_id,
    keywords: row.keywords,
    privateNote: row.private_note ?? "",
    priority: row.priority,
    status: row.status,
    validation: row.validation_status,
    profile: u
      ? {
          id: u.x_user_id,
          username: u.username,
          name: u.display_name,
          protected: u.protected,
          verifiedType: u.verified_type,
          followers:
            u.followers_count === null ? null : Number(u.followers_count),
          observedAt: u.last_refreshed_at,
          dataOrigin: u.data_origin,
        }
      : null,
  };
}
export class PgPeopleRepository implements PeopleRepository {
  constructor(
    private pool: Pool,
    readonly ownerId: string,
    readonly origin: Origin,
  ) {
    if (!uuid.test(ownerId)) throw new ProviderError("INVALID_INPUT");
  }
  private tx<T>(work: (client: PoolClient) => Promise<T>) {
    return withUserContext(this.pool, this.ownerId, this.origin, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `people:${this.origin}:${this.ownerId}`,
      ]);
      return work(c);
    });
  }
  private async get(c: PoolClient, id: string) {
    if (!uuid.test(id)) throw new ProviderError("INVALID_INPUT");
    const row = (
      await c.query(select + " AND p.id=$3", [this.ownerId, this.origin, id])
    ).rows[0];
    if (!row) throw new ProviderError("NOT_FOUND");
    return mapped(row);
  }
  private async category(c: PoolClient, id: string | null) {
    if (
      id &&
      !(
        await c.query(
          "SELECT 1 FROM memeradar.person_categories WHERE id=$1 AND owner_user_id=$2 AND data_origin=$3",
          [id, this.ownerId, this.origin],
        )
      ).rowCount
    )
      throw new ProviderError("NOT_FOUND");
  }
  async list() {
    return this.tx(async (c) =>
      (
        await c.query(select + " ORDER BY p.added_at,p.id", [
          this.ownerId,
          this.origin,
        ])
      ).rows.map(mapped),
    );
  }
  private async rule(c: PoolClient, p: Person) {
    const existing = (
      await c.query(
        "SELECT id FROM memeradar.x_rules WHERE owner_user_id=$1 AND data_origin=$2 AND expression->>'personId'=$3",
        [this.ownerId, this.origin, p.id],
      )
    ).rows[0];
    const status =
      p.validation === "validated_via_api" && p.profile?.protected === false
        ? p.status
        : "paused";
    if (existing)
      await c.query(
        "UPDATE memeradar.x_rules SET status=$1,priority=$2,poll_interval_seconds=$3 WHERE id=$4 AND data_origin=$5 AND owner_user_id=$6",
        [
          status,
          p.priority,
          intervals[p.priority],
          existing.id,
          this.origin,
          this.ownerId,
        ],
      );
    else if (p.xUserId)
      await c.query(
        "INSERT INTO memeradar.x_rules(data_origin,owner_user_id,name,expression,query,priority,poll_interval_seconds,status) VALUES($1,$2,'Suivi de personne',$3,$4,$5,$6,$7)",
        [
          this.origin,
          this.ownerId,
          JSON.stringify({ kind: "people", personId: p.id }),
          `user:${p.xUserId}`,
          p.priority,
          intervals[p.priority],
          status,
        ],
      );
  }
  async save(
    input: PersonInput,
    user: XUser | null,
    validation: Person["validation"],
    id?: string,
  ) {
    input = parsePerson(input, this.origin);
    return this.tx(async (c) => {
      if (id) {
        const old = await this.get(c, id);
        if (
          old.xUserId ||
          normalizeUsername(old.username, this.origin) !== input.username
        )
          throw new ProviderError("INVALID_INPUT");
      }
      await this.category(c, input.categoryId);
      const duplicate = (
        await c.query(
          select +
            " AND (($3::text IS NOT NULL AND p.x_user_id=$3) OR (p.x_user_id IS NULL AND lower(p.requested_username)=lower($4))) AND ($5::uuid IS NULL OR p.id<>$5)",
          [
            this.ownerId,
            this.origin,
            user?.id ?? null,
            input.username,
            id ?? null,
          ],
        )
      ).rows[0];
      if (user) {
        if (user.dataOrigin !== this.origin)
          throw new ProviderError("INVALID_INPUT");
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          this.origin + ":user:" + user.id,
        ]);
        await c.query(
          "INSERT INTO memeradar.x_username_history(data_origin,x_user_id,username,observed_at) SELECT data_origin,x_user_id,username,$3 FROM memeradar.x_users WHERE data_origin=$1 AND x_user_id=$2 AND username<>$4 AND (last_refreshed_at IS NULL OR last_refreshed_at<=$3) ON CONFLICT DO NOTHING",
          [this.origin, user.id, user.observedAt, user.username],
        );
        await c.query(
          `INSERT INTO memeradar.x_users(data_origin,x_user_id,username,display_name,protected,verified_type,followers_count,last_refreshed_at,metrics_observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) ON CONFLICT(data_origin,x_user_id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,protected=EXCLUDED.protected,verified_type=EXCLUDED.verified_type,followers_count=EXCLUDED.followers_count,last_refreshed_at=EXCLUDED.last_refreshed_at,metrics_observed_at=EXCLUDED.metrics_observed_at WHERE x_users.last_refreshed_at IS NULL OR x_users.last_refreshed_at<=EXCLUDED.last_refreshed_at`,
          [
            this.origin,
            user.id,
            user.username,
            user.name,
            user.protected,
            user.verifiedType,
            user.followers,
            user.observedAt,
          ],
        );
      }
      if (duplicate)
        return { person: await this.get(c, duplicate.id), duplicate: true };
      const values = [
        this.origin,
        this.ownerId,
        input.username,
        input.name,
        input.categoryId,
        input.keywords,
        input.privateNote,
        input.priority,
        user?.protected === false ? input.status : "paused",
        validation,
        user?.id ?? null,
        user?.observedAt ?? null,
      ];
      const result = id
        ? await c.query(
            "UPDATE memeradar.tracked_people SET requested_username=$3,display_name_override=$4,category_id=$5,keywords=$6,private_note=$7,priority=$8,status=$9,validation_status=$10,x_user_id=$11,validated_at=$12 WHERE data_origin=$1 AND owner_user_id=$2 AND id=$13 RETURNING id",
            [...values, id],
          )
        : await c.query(
            "INSERT INTO memeradar.tracked_people(data_origin,owner_user_id,requested_username,display_name_override,category_id,keywords,private_note,priority,status,validation_status,x_user_id,validated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
            values,
          );
      const person = await this.get(c, result.rows[0].id);
      await this.rule(c, person);
      return { person, duplicate: false };
    });
  }
  async update(id: string, input: PersonInput) {
    input = parsePerson(input, this.origin);
    return this.tx(async (c) => {
      const old = await this.get(c, id);
      if (input.username !== normalizeUsername(old.username, this.origin))
        throw new ProviderError("INVALID_INPUT");
      await this.category(c, input.categoryId);
      if (
        input.status === "active" &&
        (old.validation !== "validated_via_api" ||
          old.profile?.protected !== false)
      )
        throw new ProviderError("PROTECTED_ACCOUNT");
      await c.query(
        "UPDATE memeradar.tracked_people SET display_name_override=$1,category_id=$2,keywords=$3,private_note=$4,priority=$5,status=$6 WHERE id=$7 AND owner_user_id=$8 AND data_origin=$9",
        [
          input.name,
          input.categoryId,
          input.keywords,
          input.privateNote,
          input.priority,
          input.status,
          id,
          this.ownerId,
          this.origin,
        ],
      );
      const p = await this.get(c, id);
      await this.rule(c, p);
      return p;
    });
  }
  async remove(id: string) {
    return this.tx(async (c) => {
      await this.get(c, id);
      await c.query(
        "UPDATE memeradar.x_rules SET status='paused',expression=jsonb_build_object('kind','people','deleted',true) WHERE owner_user_id=$1 AND data_origin=$2 AND expression->>'personId'=$3",
        [this.ownerId, this.origin, id],
      );
      await c.query(
        "DELETE FROM memeradar.tracked_people WHERE id=$1 AND owner_user_id=$2 AND data_origin=$3",
        [id, this.ownerId, this.origin],
      );
    });
  }
  async detail(id: string) {
    return this.tx(async (c) => {
      const person = await this.get(c, id);
      const observed = (
        await c.query(
          `SELECT p.id,p.x_post_id,p.text,p.public_metrics,coalesce(p.published_at,p.collected_at) AS occurred_at,p.post_type FROM memeradar.x_posts p WHERE p.data_origin=$1 AND p.author_x_user_id=$3 AND p.availability_status='available' AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules r ON r.id=pr.rule_id AND r.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND r.owner_user_id=$2) ORDER BY coalesce(p.published_at,p.collected_at) DESC,p.id DESC LIMIT 1001`,
          [this.origin, this.ownerId, person.xUserId],
        )
      ).rows;
      const posts = observed.slice(0, 1000),
        ids = posts.map((p) => p.id);
      const activity = new Map<string, number>(),
        hours = Array.from({ length: 24 }, () => 0);
      const keywordCounts = person.keywords.map((keyword) => ({
        keyword,
        publications: posts.filter((p) =>
          p.text.toLowerCase().includes(keyword.toLowerCase()),
        ).length,
        method:
          "Sous-chaîne insensible à la casse sur les publications collectées, sans interprétation.",
      }));
      for (const post of posts) {
        const at = new Date(post.occurred_at);
        const day = at.toISOString().slice(0, 10);
        activity.set(day, (activity.get(day) ?? 0) + 1);
        hours[at.getUTCHours()]++;
      }
      const tokens = (
        await c.query(
          `SELECT token_id,detection_method,count(DISTINCT post_id)::text AS publications FROM memeradar.post_token_mentions WHERE data_origin=$1 AND post_id=ANY($2::uuid[]) GROUP BY token_id,detection_method ORDER BY publications DESC,token_id,detection_method LIMIT 100`,
          [this.origin, ids],
        )
      ).rows;
      const events = (
        await c.query(
          `SELECT event_id,method,count(DISTINCT post_id)::text AS publications FROM memeradar.post_event_links WHERE data_origin=$1 AND post_id=ANY($2::uuid[]) GROUP BY event_id,method ORDER BY publications DESC,event_id,method LIMIT 100`,
          [this.origin, ids],
        )
      ).rows;
      const runs = (
        await c.query(
          `SELECT run.mode,run.status,run.started_at,run.ended_at,run.partial,run.error_code,run.gap_started_at,run.gap_ended_at FROM memeradar.x_collection_runs run JOIN memeradar.x_rules r ON r.id=run.rule_id AND r.data_origin=run.data_origin WHERE r.owner_user_id=$1 AND r.data_origin=$2 AND r.expression->>'personId'=$3 ORDER BY run.started_at DESC,run.id DESC LIMIT 100`,
          [this.ownerId, this.origin, id],
        )
      ).rows;
      return {
        person,
        posts,
        activityByDay: [...activity].map(([day, publications]) => ({
          day,
          publications,
        })),
        activityByHour: hours,
        timezone: "UTC",
        keywordCounts,
        tokens,
        events,
        runs,
        truncated: observed.length > 1000,
        coverage: "partial",
        missedPosts: null,
        alerts: { state: "not_implemented" },
        method:
          "Au plus 1000 publications disponibles les plus récentes et visibles par le propriétaire ; interactions brutes observées par publication. Liens limités à 100 groupes, exécutions aux 100 dernières. Aucune extrapolation à toute l’activité du compte.",
        mentionLabel:
          "Mention observée — aucun soutien ou caractère promotionnel déduit.",
      };
    });
  }
  async collectionRules(): Promise<
    import("../collection/contracts").CollectionRule[]
  > {
    return this.tx(async (c) =>
      (
        await c.query(
          `SELECT r.* FROM memeradar.x_rules r JOIN memeradar.tracked_people p ON r.expression->>'personId'=p.id::text AND r.owner_user_id=p.owner_user_id AND r.data_origin=p.data_origin JOIN memeradar.x_users u ON u.x_user_id=p.x_user_id AND u.data_origin=p.data_origin WHERE r.owner_user_id=$1 AND r.data_origin=$2 AND r.expression->>'kind'='people' AND p.status='active' AND p.validation_status='validated_via_api' AND u.protected=false AND r.status='active'`,
          [this.ownerId, this.origin],
        )
      ).rows.map((r) => ({
        id: r.id,
        ownerId: r.owner_user_id,
        origin: r.data_origin,
        query: r.query,
        priority: r.priority,
        intervalSeconds: r.poll_interval_seconds,
        status: r.status,
      })),
    );
  }
  async categories(): Promise<Category[]> {
    return this.tx(
      async (c) =>
        (
          await c.query(
            "SELECT id,name FROM memeradar.person_categories WHERE owner_user_id=$1 AND data_origin=$2 ORDER BY name,id",
            [this.ownerId, this.origin],
          )
        ).rows,
    );
  }
  async saveCategory(name: string, id?: string): Promise<Category> {
    name = name.trim();
    if (!name || name.length > 100 || (id && !uuid.test(id)))
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (c) => {
      const duplicate = (
        await c.query(
          "SELECT id,name FROM memeradar.person_categories WHERE owner_user_id=$1 AND data_origin=$2 AND lower(name)=lower($3)",
          [this.ownerId, this.origin, name],
        )
      ).rows[0];
      if (duplicate && (!id || duplicate.id === id)) return duplicate;
      if (duplicate) throw new ProviderError("INVALID_INPUT");
      if (id) await this.category(c, id);
      return (
        id
          ? await c.query(
              "UPDATE memeradar.person_categories SET name=$1 WHERE id=$2 AND owner_user_id=$3 AND data_origin=$4 RETURNING id,name",
              [name, id, this.ownerId, this.origin],
            )
          : await c.query(
              "INSERT INTO memeradar.person_categories(data_origin,owner_user_id,name) VALUES($1,$2,$3) RETURNING id,name",
              [this.origin, this.ownerId, name],
            )
      ).rows[0];
    });
  }
  async removeCategory(id: string, replacement: string | null) {
    if (
      !uuid.test(id) ||
      (replacement && !uuid.test(replacement)) ||
      id === replacement
    )
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (c) => {
      await this.category(c, id);
      await this.category(c, replacement);
      await c.query(
        "UPDATE memeradar.tracked_people SET category_id=$1 WHERE category_id=$2 AND owner_user_id=$3 AND data_origin=$4",
        [replacement, id, this.ownerId, this.origin],
      );
      await c.query(
        "DELETE FROM memeradar.person_categories WHERE id=$1 AND owner_user_id=$2 AND data_origin=$3",
        [id, this.ownerId, this.origin],
      );
    });
  }
}
