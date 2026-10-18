import type { Clock } from "../../shared/runtime";
import { systemClock } from "../../shared/runtime";
import { ProviderError } from "../../shared/errors";
import {
  endpointNames,
  providerSchemas,
  normalizeUser,
  normalizePost,
  type XProvider,
  type XPage,
  type XPost,
  type XUser,
  type XCapabilities,
  type PageOptions,
} from "./contracts";
const at = "2026-01-15T14:00:00.000Z";
const rawUsers = [
  {
    id: "DEMO_USER_A",
    name: "[DÉMO] Julie Cosmique",
    username: "demo_analyste_julie",
    protected: false,
  },
  {
    id: "DEMO_USER_B",
    name: "[DÉMO] Marc Boréal",
    username: "demo_fondateur_marc",
    protected: false,
  },
];
const rawPosts = [
  {
    id: "DEMO_POST_ROOT",
    text: "[DÉMO] Une annonce entièrement fictive sur Nébula Mobile.",
    author_id: "DEMO_USER_A",
    created_at: at,
    conversation_id: "DEMO_POST_ROOT",
    referenced_tweets: [],
    public_metrics: {
      like_count: 8,
      reply_count: 120,
      retweet_count: 2,
      quote_count: 1,
    },
    lang: "fr",
  },
  {
    id: "DEMO_POST_REPLY",
    text: "[DÉMO] Réponse fictive, aucune publication X réelle.",
    author_id: "DEMO_USER_B",
    created_at: "2026-01-15T14:05:00.000Z",
    conversation_id: "DEMO_POST_ROOT",
    referenced_tweets: [{ id: "DEMO_POST_ROOT", type: "replied_to" as const }],
    lang: "fr",
  },
  {
    id: "DEMO_POST_QUOTE",
    text: "[DÉMO] Citation fictive de cette annonce.",
    author_id: "DEMO_USER_A",
    created_at: "2026-01-15T14:10:00.000Z",
    conversation_id: "DEMO_POST_QUOTE",
    referenced_tweets: [{ id: "DEMO_POST_ROOT", type: "quoted" as const }],
    lang: "fr",
  },
];
export type DemoFault =
  "none" | "rate_limit" | "denied" | "disconnected" | "budget_exhausted";
export class DemoXProvider implements XProvider {
  readonly dataOrigin = "DEMO" as const;
  private fault: DemoFault = "none";
  constructor(private readonly clock: Clock = systemClock) {}
  simulate(fault: DemoFault): void {
    this.fault = fault;
  }
  private check(): void {
    const fault = this.fault;
    this.fault = "none";
    if (fault === "rate_limit")
      throw new ProviderError("RATE_LIMITED", true, 60000, false, 429);
    if (fault === "denied")
      throw new ProviderError("ACCESS_DENIED", false, 0, false, 403);
    if (fault === "disconnected")
      throw new ProviderError("PROVIDER_UNAVAILABLE", true);
    if (fault === "budget_exhausted")
      throw new ProviderError("BUDGET_EXCEEDED");
  }
  async capabilities(): Promise<XCapabilities> {
    return Object.fromEntries(
      [...endpointNames, "metrics"].map((endpoint) => [
        endpoint,
        {
          state:
            endpoint === "conversation" || endpoint === "metrics"
              ? "limited"
              : endpoint === "stream"
                ? "untested"
                : "available",
          reason: "demo",
          observedAt: new Date(this.clock.now()).toISOString(),
          windowSeconds: null,
        },
      ]),
    ) as XCapabilities;
  }
  private page(ids: string[], options: PageOptions = {}): XPage<XPost> {
    this.check();
    const schemas = providerSchemas("DEMO"),
      now = new Date(this.clock.now()).toISOString();
    const size = options.maxResults ?? 100;
    if (!Number.isSafeInteger(size) || size < 1 || size > 1000)
      throw new ProviderError("INVALID_INPUT");
    if (options.nextToken && !/^DEMO_PAGE_\d+$/.test(options.nextToken))
      throw new ProviderError("INVALID_INPUT");
    const start = options.nextToken ? Number(options.nextToken.slice(10)) : 0;
    const selected = rawPosts.filter((post) => ids.includes(post.id));
    return {
      data: selected
        .slice(start, start + size)
        .map((post) => normalizePost(schemas.post.parse(post), "DEMO", now)),
      users: rawUsers.map((user) =>
        normalizeUser(schemas.user.parse(user), "DEMO", now),
      ),
      nextToken:
        start + size < selected.length ? `DEMO_PAGE_${start + size}` : null,
      problems: [],
      quota: null,
      partial: true,
      collectedAt: now,
      dataOrigin: "DEMO",
    };
  }
  async searchRecent(
    query: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    if (!query.trim()) throw new ProviderError("INVALID_INPUT");
    return this.page(
      rawPosts
        .filter((post) =>
          post.text
            .toLocaleLowerCase("fr")
            .includes(query.toLocaleLowerCase("fr")),
        )
        .map((post) => post.id),
      options,
    );
  }
  async searchFullArchive(
    query: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    return this.searchRecent(query, options);
  }
  async getPostsByIds(ids: string[]): Promise<XPage<XPost>> {
    return this.page(ids);
  }
  async getUserByUsername(username: string): Promise<XUser | null> {
    this.check();
    const user = rawUsers.find(
      (user) => user.username === username.replace(/^@/, ""),
    );
    return user
      ? normalizeUser(
          providerSchemas("DEMO").user.parse(user),
          "DEMO",
          new Date(this.clock.now()).toISOString(),
        )
      : null;
  }
  async getUsersByIds(ids: string[]): Promise<XUser[]> {
    this.check();
    return rawUsers
      .filter((user) => ids.includes(user.id))
      .map((user) =>
        normalizeUser(
          providerSchemas("DEMO").user.parse(user),
          "DEMO",
          new Date(this.clock.now()).toISOString(),
        ),
      );
  }
  async getUserPosts(
    userId: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    return this.page(
      rawPosts
        .filter((post) => post.author_id === userId)
        .map((post) => post.id),
      options,
    );
  }
  async getConversation(
    conversationId: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    return this.page(
      rawPosts
        .filter((post) => post.conversation_id === conversationId)
        .map((post) => post.id),
      options,
    );
  }
  async getQuotePosts(
    postId: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    return this.page(
      rawPosts
        .filter((post) =>
          post.referenced_tweets.some(
            (ref) => ref.id === postId && ref.type === "quoted",
          ),
        )
        .map((post) => post.id),
      options,
    );
  }
}
