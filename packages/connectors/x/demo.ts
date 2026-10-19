import { demoStream } from "./demo-stream";
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
  type RawPost,
  type RawUser,
} from "./contracts";
import { demoUsers as rawUsers, demoPosts as rawPosts } from "./demo-data";
export type DemoFault =
  "none" | "rate_limit" | "denied" | "disconnected" | "budget_exhausted";
export interface DemoDataset {
  posts: RawPost[];
  users: RawUser[];
  availableAt?: Record<string, string>;
}
export class DemoXProvider implements XProvider {
  readonly dataOrigin = "DEMO" as const;
  private fault: DemoFault = "none";
  readonly stream: import("./stream-contracts").XStreamProvider;
  constructor(
    private readonly clock: Clock = systemClock,
    private readonly dataset: DemoDataset = {
      posts: rawPosts,
      users: rawUsers,
    },
  ) {
    this.stream = demoStream(this, clock, () => this.check());
  }
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
              : endpoint === "stream" && !this.dataset.availableAt
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
    const selected = this.dataset.posts.filter(
      (post) =>
        ids.includes(post.id) &&
        (!this.dataset.availableAt?.[post.id] ||
          Date.parse(this.dataset.availableAt[post.id]) <= this.clock.now()),
    );
    return {
      data: selected
        .slice(start, start + size)
        .map((post) =>
          normalizePost(
            schemas.post.parse(post),
            "DEMO",
            this.dataset.availableAt?.[post.id] ?? now,
          ),
        ),
      users: this.dataset.users
        .filter(
          (user) =>
            !this.dataset.availableAt ||
            selected
              .slice(start, start + size)
              .some((p) => p.author_id === user.id),
        )
        .map((user) => normalizeUser(schemas.user.parse(user), "DEMO", now)),
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
    const since = options.sinceId
      ? this.dataset.posts.findIndex((p) => p.id === options.sinceId)
      : -1;
    if (options.sinceId && since < 0) throw new ProviderError("INVALID_INPUT");
    return this.page(
      this.dataset.posts
        .filter(
          (post, index) =>
            index > since &&
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
    const user = this.dataset.users.find(
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
    return this.dataset.users
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
      this.dataset.posts
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
      this.dataset.posts
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
      this.dataset.posts
        .filter((post) =>
          (post.referenced_tweets ?? []).some(
            (ref) => ref.id === postId && ref.type === "quoted",
          ),
        )
        .map((post) => post.id),
      options,
    );
  }
}
