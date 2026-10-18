import { createHash, randomUUID } from "node:crypto";
import type { XProvider } from "../connectors/x/contracts";
import type { XConfig } from "../connectors/x/config";
import { validateQuery } from "../connectors/x/client";
import { ProviderError } from "../shared/errors";
import { systemClock, type Clock } from "../shared/runtime";
import type { PgConversationRepository } from "../db/conversation-repository";
import { idSchema } from "../connectors/x/contracts";
export class ConversationService {
  private tickets = new Map<
    string,
    {
      conversationId: string;
      pages: number;
      quotes: boolean;
      rootLookup: boolean;
      window: number | null;
      cost: string;
      expires: number;
      pricing: string;
    }
  >();
  private pending = 0;
  constructor(
    private provider: XProvider,
    readonly repository: PgConversationRepository,
    private config: XConfig,
    private clock: Clock = systemClock,
  ) {
    if (provider.dataOrigin !== repository.origin)
      throw new ProviderError("INVALID_INPUT");
  }
  private pricingHash() {
    return createHash("sha256")
      .update(
        JSON.stringify({
          pricing: this.config.pricing,
          maxResults: this.config.maxResults,
          maxRetries: this.config.maxRetries,
        }),
      )
      .digest("hex");
  }
  local(id: string) {
    return this.repository.read(id);
  }
  async quote(id: string, pages = 1, includeQuotes = true) {
    if (
      !idSchema(this.repository.origin).safeParse(id).success ||
      !Number.isSafeInteger(pages) ||
      pages < 1 ||
      pages > 10
    )
      throw new ProviderError("INVALID_INPUT");
    validateQuery(`conversation_id:${id}`, this.config);
    for (const [key, ticket] of this.tickets)
      if (ticket.expires <= this.clock.now()) this.tickets.delete(key);
    if (this.tickets.size + this.pending >= 1000)
      throw new ProviderError("RATE_LIMITED");
    this.pending++;
    try {
      const caps = await this.provider.capabilities();
      if (caps.conversation.state === "unavailable")
        throw new ProviderError("ACCESS_DENIED");
      const rootLookup = caps.posts.state !== "unavailable";
      const quotes =
        includeQuotes &&
        !!this.provider.getQuotePosts &&
        caps.quotes.state !== "unavailable";
      const price = this.config.pricing;
      if (this.repository.origin === "REAL" && (!price || !this.config.budget))
        throw new ProviderError("PRICING_UNKNOWN");
      const maxRequests =
          ((rootLookup ? 1 : 0) + pages * (quotes ? 2 : 1)) *
          (this.config.maxRetries + 1),
        maxPosts =
          ((rootLookup ? 1 : 0) +
            pages * this.config.maxResults * (quotes ? 2 : 1)) *
          (this.config.maxRetries + 1);
      const cost =
        this.repository.origin === "DEMO"
          ? "0"
          : (
              BigInt(maxRequests) * BigInt(price!.request) +
              BigInt(maxPosts) * (BigInt(price!.post) + BigInt(price!.user))
            ).toString();
      const ticket = randomUUID(),
        expires = this.clock.now() + 300000;
      this.tickets.set(ticket, {
        conversationId: id,
        pages,
        quotes,
        rootLookup,
        window: caps.conversation.windowSeconds,
        cost,
        expires,
        pricing: this.pricingHash(),
      });
      return {
        id: ticket,
        conversationId: id,
        dataOrigin: this.repository.origin,
        rootLookupAvailable: rootLookup,
        maxRequests,
        maxPosts,
        maxCostMicros: cost,
        estimated: true,
        confirmationRequired: true,
        windowSeconds: caps.conversation.windowSeconds,
        quotes: quotes
          ? "included"
          : includeQuotes
            ? "unavailable"
            : "not_requested",
        expiresAt: new Date(expires).toISOString(),
      };
    } finally {
      this.pending--;
    }
  }
  async execute(ticketId: string, acceptedMaxCostMicros: string) {
    const ticket = this.tickets.get(ticketId);
    if (
      !ticket ||
      ticket.expires <= this.clock.now() ||
      ticket.cost !== acceptedMaxCostMicros ||
      ticket.pricing !== this.pricingHash()
    )
      throw new ProviderError("INVALID_INPUT");
    this.tickets.delete(ticketId);
    let result:
      Awaited<ReturnType<PgConversationRepository["read"]>> | undefined;
    const held = await this.repository.collection.withStreamLock(
      `conversation:${this.repository.ownerId}:${ticket.conversationId}`,
      async () => {
        const rule = await this.repository.ensure(
          ticket.conversationId,
          ticket.window,
          ticket.quotes,
        );
        const collection = this.repository.collection,
          leaseMs = this.config.collection.leaseMs;
        let current: Awaited<ReturnType<typeof collection.claim>> = null;
        try {
          // Only a retrieved root supplies its declared count; never infer it from the search page size.
          if (ticket.rootLookup) {
            current = await collection.claim(
              rule,
              "lookup",
              this.clock.now(),
              leaseMs,
              true,
              true,
            );
            if (!current) throw new ProviderError("COLLECTION_LEASE_LOST");
            try {
              const root = await this.provider.getPostsByIds(
                [ticket.conversationId],
                { feature: "conversations" },
              );
              await this.repository.persist(
                current,
                root,
                "lookup",
                this.clock.now(),
                leaseMs,
              );
              if (!root.data.some((p) => p.id === ticket.conversationId))
                await collection.hideUnavailable(
                  [ticket.conversationId],
                  this.clock.now(),
                );
              await collection.finish(current, {
                now: this.clock.now(),
                nextDueAt: this.clock.now(),
                status: "completed",
              });
            } catch (error) {
              if (
                !(error instanceof ProviderError) ||
                !["ACCESS_DENIED", "NOT_FOUND"].includes(error.code)
              )
                throw error;
              await collection.finish(current, {
                now: this.clock.now(),
                nextDueAt: this.clock.now(),
                status: "failed",
                errorCode: error.code,
              });
              if (error.code === "NOT_FOUND")
                await collection.hideUnavailable(
                  [ticket.conversationId],
                  this.clock.now(),
                );
            }
            current = null;
          }

          for (const mode of [
            "conversation",
            ...(ticket.quotes ? ["quotes" as const] : []),
          ] as const) {
            current = await collection.claim(
              rule,
              mode,
              this.clock.now(),
              leaseMs,
              true,
              true,
            );
            if (!current) throw new ProviderError("COLLECTION_LEASE_LOST");
            let next = current.checkpoint.nextToken;
            for (let i = 0; i < ticket.pages; i++) {
              const options = {
                maxResults: this.config.maxResults,
                nextToken: next ?? undefined,
                feature: "conversations" as const,
                ...(mode === "conversation"
                  ? { sinceId: current.checkpoint.sinceId ?? undefined }
                  : {}),
              };
              const page =
                mode === "quotes"
                  ? await this.provider.getQuotePosts!(
                      ticket.conversationId,
                      options,
                    )
                  : await this.provider.getConversation(
                      ticket.conversationId,
                      options,
                    );
              await this.repository.persist(
                current,
                page,
                mode,
                this.clock.now(),
                leaseMs,
              );
              next = page.nextToken;
              if (!next) break;
            }
            await collection.finish(current, {
              now: this.clock.now(),
              nextDueAt: this.clock.now(),
              status: "completed",
            });
            current = null;
          }
        } catch (error) {
          const failure =
            error instanceof ProviderError
              ? error
              : new ProviderError("NETWORK_ERROR");
          if (current)
            try {
              await collection.finish(current, {
                now: this.clock.now(),
                nextDueAt: this.clock.now() + failure.retryAfterMs,
                status: "failed",
                errorCode: failure.code,
                retryAfterMs: failure.retryAfterMs,
              });
            } catch {
              /* stale leases cannot overwrite a successor */
            }
          await this.repository.error(ticket.conversationId, failure.code);
          throw failure;
        }
        result = await this.repository.read(ticket.conversationId);
      },
    );
    if (!held || !result) throw new ProviderError("COLLECTION_LEASE_LOST");
    return result;
  }
}
