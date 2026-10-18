import { z } from "zod";
import type { CapabilityObservation, Quota, Feature } from "./control";
export const endpointNames = [
  "recent",
  "archive",
  "posts",
  "username",
  "users",
  "timeline",
  "conversation",
  "quotes",
  "stream",
] as const;
export type Endpoint = (typeof endpointNames)[number];
export type Origin = "REAL" | "DEMO";
export type XCapabilities = Record<Endpoint | "metrics", CapabilityObservation>;
export interface XUser {
  id: string;
  username: string;
  name: string;
  protected: boolean | null;
  verifiedType: string | null;
  followers: number | null;
  observedAt: string;
  dataOrigin: Origin;
}
export interface XPost {
  id: string;
  text: string;
  authorId: string | null;
  publishedAt: string | null;
  collectedAt: string;
  conversationId: string | null;
  references: { id: string; type: "replied_to" | "quoted" | "retweeted" }[];
  type: "original" | "reply" | "quote" | "repost" | "unknown";
  language: string | null;
  metrics: {
    likes: number | null;
    replies: number | null;
    reposts: number | null;
    quotes: number | null;
  };
  entities: {
    hashtags: string[];
    cashtags: string[];
    mentions: string[];
    urls: string[];
  };
  dataOrigin: Origin;
  knowledge: "OBSERVED";
}
export interface XPage<T> {
  data: T[];
  users: XUser[];
  nextToken: string | null;
  problems: { resourceId: string | null; code: "PROVIDER_ITEM_ERROR" }[];
  quota: Quota | null;
  partial: boolean;
  collectedAt: string;
  dataOrigin: Origin;
}
export interface PageOptions {
  maxResults?: number;
  nextToken?: string;
  sinceId?: string;
  feature?: Feature;
}
export interface XProvider {
  readonly stream?: import("./stream-contracts").XStreamProvider;
  readonly dataOrigin: Origin;
  capabilities(): Promise<XCapabilities>;
  searchRecent(query: string, options?: PageOptions): Promise<XPage<XPost>>;
  searchFullArchive?(
    query: string,
    options?: PageOptions,
  ): Promise<XPage<XPost>>;
  getPostsByIds(
    ids: string[],
    options?: Pick<PageOptions, "feature">,
  ): Promise<XPage<XPost>>;
  getUserByUsername(username: string): Promise<XUser | null>;
  getUsersByIds(ids: string[]): Promise<XUser[]>;
  getUserPosts(userId: string, options?: PageOptions): Promise<XPage<XPost>>;
  getConversation(
    conversationId: string,
    options?: PageOptions,
  ): Promise<XPage<XPost>>;
  getQuotePosts?(postId: string, options?: PageOptions): Promise<XPage<XPost>>;
}
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.string().datetime({ offset: true });
export function idSchema(origin: Origin) {
  return origin === "REAL"
    ? z.string().regex(/^[1-9][0-9]{0,31}$/)
    : z.string().regex(/^DEMO_[a-zA-Z0-9_]{1,80}$/);
}
export function providerSchemas(origin: Origin) {
  const id = idSchema(origin);
  const metrics = z.object({
    like_count: count.optional(),
    reply_count: count.optional(),
    retweet_count: count.optional(),
    quote_count: count.optional(),
  });
  const user = z.object({
    id,
    username: z.string().min(1).max(80),
    name: z.string().max(200),
    protected: z.boolean().optional(),
    verified_type: z.string().max(40).optional(),
    public_metrics: z.object({ followers_count: count.optional() }).optional(),
  });
  const post = z.object({
    id,
    text: z.string().max(100000),
    author_id: id.optional(),
    created_at: timestamp.optional(),
    conversation_id: id.optional(),
    lang: z.string().max(20).optional(),
    public_metrics: metrics.optional(),
    referenced_tweets: z
      .array(
        z.object({ id, type: z.enum(["replied_to", "quoted", "retweeted"]) }),
      )
      .max(20)
      .optional(),
    entities: z
      .object({
        hashtags: z
          .array(z.object({ tag: z.string().max(200) }))
          .max(100)
          .optional(),
        cashtags: z
          .array(z.object({ tag: z.string().max(100) }))
          .max(100)
          .optional(),
        mentions: z
          .array(z.object({ username: z.string().max(80) }))
          .max(100)
          .optional(),
        urls: z
          .array(
            z.object({
              url: z.string().max(4096),
              expanded_url: z.string().max(4096).optional(),
            }),
          )
          .max(100)
          .optional(),
      })
      .optional(),
  });
  const error = z.object({ resource_id: z.string().max(100).optional() });
  const base = {
    errors: z.array(error).max(1000).optional(),
    includes: z
      .object({ users: z.array(user).max(1000).optional() })
      .optional(),
    meta: z
      .object({
        result_count: count.optional(),
        next_token: z.string().max(4096).optional(),
      })
      .optional(),
  };
  const postPage = z
    .object({ ...base, data: z.array(post).max(1000).optional() })
    .refine(
      (value) =>
        value.data !== undefined ||
        value.errors !== undefined ||
        value.meta?.result_count === 0,
      "Response envelope required",
    );
  const users = z
    .object({ ...base, data: z.array(user).max(1000).optional() })
    .refine(
      (value) => value.data !== undefined || value.errors !== undefined,
      "Response envelope required",
    );
  const singleUser = z
    .object({ ...base, data: user.optional() })
    .refine(
      (value) => value.data !== undefined || value.errors !== undefined,
      "Response envelope required",
    );
  return { postPage, users, singleUser, user, post };
}
export type RawUser = z.infer<ReturnType<typeof providerSchemas>["user"]>;
export type RawPost = z.infer<ReturnType<typeof providerSchemas>["post"]>;
export function normalizeUser(
  user: RawUser,
  origin: Origin,
  at: string,
): XUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    protected: user.protected ?? null,
    verifiedType: user.verified_type ?? null,
    followers: user.public_metrics?.followers_count ?? null,
    observedAt: at,
    dataOrigin: origin,
  };
}
export function normalizePost(
  post: RawPost,
  origin: Origin,
  at: string,
): XPost {
  const refs = post.referenced_tweets ?? [];
  const type = refs.some((r) => r.type === "replied_to")
    ? "reply"
    : refs.some((r) => r.type === "quoted")
      ? "quote"
      : refs.some((r) => r.type === "retweeted")
        ? "repost"
        : post.referenced_tweets
          ? "original"
          : "unknown";
  return {
    id: post.id,
    text: post.text,
    authorId: post.author_id ?? null,
    publishedAt: post.created_at ?? null,
    collectedAt: at,
    conversationId: post.conversation_id ?? null,
    references: refs,
    type,
    language: post.lang ?? null,
    metrics: {
      likes: post.public_metrics?.like_count ?? null,
      replies: post.public_metrics?.reply_count ?? null,
      reposts: post.public_metrics?.retweet_count ?? null,
      quotes: post.public_metrics?.quote_count ?? null,
    },
    entities: {
      hashtags: post.entities?.hashtags?.map((x) => x.tag) ?? [],
      cashtags: post.entities?.cashtags?.map((x) => x.tag) ?? [],
      mentions: post.entities?.mentions?.map((x) => x.username) ?? [],
      urls: post.entities?.urls?.map((x) => x.expanded_url ?? x.url) ?? [],
    },
    dataOrigin: origin,
    knowledge: "OBSERVED",
  };
}
