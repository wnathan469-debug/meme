import { DemoXProvider } from "./demo";
import {
  conversationDemoPosts,
  conversationDemoUsers,
  demoConversationId,
} from "../../conversations/demo-data";
import {
  normalizePost,
  normalizeUser,
  type PageOptions,
  type XPage,
  type XPost,
} from "./contracts";
import { systemClock, type Clock } from "../../shared/runtime";
import { ProviderError } from "../../shared/errors";
/** Adds the 35/120 scenario without changing the baseline three-post fixtures. */
export class DemoConversationProvider extends DemoXProvider {
  constructor(private conversationClock: Clock = systemClock) {
    super(conversationClock);
  }
  private async conversationPage(
    ids: string[],
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    await super.getPostsByIds([]); // Preserve the shared one-shot 429/denial/budget/disconnection simulations.
    const size = options.maxResults ?? 100;
    if (
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 1000 ||
      (options.nextToken &&
        !/^DEMO_CONVERSATION_PAGE_\d+$/.test(options.nextToken))
    )
      throw new ProviderError("INVALID_INPUT");
    const all = conversationDemoPosts.filter((p) => ids.includes(p.id));
    let selected = all;
    if (options.sinceId) {
      const index = all.findIndex((p) => p.id === options.sinceId);
      if (index < 0) throw new ProviderError("INVALID_INPUT");
      selected = all.slice(index + 1);
    }
    const start = options.nextToken
      ? Number(options.nextToken.slice("DEMO_CONVERSATION_PAGE_".length))
      : 0;
    const at = new Date(this.conversationClock.now()).toISOString(),
      data = selected.slice(start, start + size);
    return {
      data: data.map((p) => normalizePost(p, "DEMO", at)),
      users: conversationDemoUsers
        .filter((u) => data.some((p) => p.author_id === u.id))
        .map((u) => normalizeUser(u, "DEMO", at)),
      nextToken:
        start + size < selected.length
          ? `DEMO_CONVERSATION_PAGE_${start + size}`
          : null,
      problems: [],
      quota: null,
      partial: true,
      collectedAt: at,
      dataOrigin: "DEMO",
    };
  }
  override getPostsByIds(ids: string[]) {
    return ids.some((id) => conversationDemoPosts.some((p) => p.id === id))
      ? this.conversationPage(ids)
      : super.getPostsByIds(ids);
  }
  override getConversation(id: string, options: PageOptions = {}) {
    return id === demoConversationId
      ? this.conversationPage(
          conversationDemoPosts
            .filter((p) => p.conversation_id === id)
            .map((p) => p.id),
          options,
        )
      : super.getConversation(id, options);
  }
  override getQuotePosts(id: string, options: PageOptions = {}) {
    return id === demoConversationId
      ? this.conversationPage(
          conversationDemoPosts
            .filter((p) =>
              p.referenced_tweets?.some(
                (r) => r.type === "quoted" && r.id === id,
              ),
            )
            .map((p) => p.id),
          options,
        )
      : super.getQuotePosts(id, options);
  }
}
