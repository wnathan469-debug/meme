import { Agent, request } from "undici";
import {
  isPublicAddress,
  pinnedLookup,
  resolvePublicDns,
  validateDestination,
  type Resolver,
} from "./http";
import { ProviderError } from "./errors";
export interface StreamResponse {
  status: number;
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array>;
  close(): Promise<void>;
}
export interface StreamTransport {
  open(
    url: URL,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<StreamResponse>;
}
export class SafeStreamTransport implements StreamTransport {
  constructor(
    private readonly options: {
      mode: "demo" | "live";
      allowedHosts: string[];
      resolve?: Resolver;
      connectTimeoutMs?: number;
    },
  ) {}
  async open(
    url: URL,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<StreamResponse> {
    if (this.options.mode === "demo")
      throw new ProviderError("NETWORK_DISABLED");
    validateDestination(url, this.options.allowedHosts);
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, this.options.connectTimeoutMs ?? 10000);
    if (signal.aborted) abort();
    let agent: Agent | undefined;
    try {
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", true);
      const addresses = await Promise.race([
        (this.options.resolve ?? resolvePublicDns)(url.hostname),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener(
            "abort",
            () => reject(new ProviderError("TIMEOUT", true)),
            { once: true },
          ),
        ),
      ]);
      if (!addresses.length || !addresses.every(isPublicAddress))
        throw new ProviderError("UNSAFE_URL");
      agent = new Agent({
        connect: { lookup: pinnedLookup(url.hostname, addresses) as any },
      });
      const response = await request(url, {
        dispatcher: agent,
        method: "GET",
        headers: {
          ...headers,
          accept: "application/json",
          "accept-encoding": "identity",
        },
        signal: controller.signal,
        headersTimeout: this.options.connectTimeoutMs ?? 10000,
        bodyTimeout: 0,
      });
      clearTimeout(timeout);
      const output: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers))
        if (value !== undefined)
          output[key.toLowerCase()] = Array.isArray(value)
            ? value.join(",")
            : String(value);
      if (
        output["content-encoding"] &&
        output["content-encoding"] !== "identity"
      )
        throw new ProviderError("INVALID_RESPONSE", false, 0, true);
      if (response.statusCode >= 300 && response.statusCode < 400)
        throw new ProviderError("UNSAFE_URL", false, 0, true);
      return {
        status: response.statusCode,
        headers: output,
        body: response.body,
        close: async () => {
          clearTimeout(timeout);
          signal.removeEventListener("abort", abort);
          controller.abort();
          await agent!.destroy();
        },
      };
    } catch (error) {
      const timedOut = controller.signal.aborted;
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      controller.abort();
      await agent?.destroy();
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        true,
        0,
        true,
      );
    }
  }
}
/** Blank lines count as activity. Every pending read has a bounded idle timeout. */
export async function* ndjson(
  body: AsyncIterable<Uint8Array>,
  options: { signal: AbortSignal; idleMs: number; maxLineBytes: number },
): AsyncGenerator<unknown> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  const iterator = body[Symbol.asyncIterator]();
  try {
    while (!options.signal.aborted) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let aborted: () => void = () => {};
      let item: IteratorResult<Uint8Array>;
      try {
        item = await Promise.race([
          iterator.next(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new ProviderError("TIMEOUT", true, 0, true)),
              options.idleMs,
            );
            aborted = () =>
              reject(new ProviderError("NETWORK_DISABLED", false, 0, true));
            options.signal.addEventListener("abort", aborted, { once: true });
            if (options.signal.aborted) aborted();
          }),
        ]);
      } finally {
        clearTimeout(timer);
        options.signal.removeEventListener("abort", aborted);
      }
      if (item.done) {
        buffer += decoder.decode();
        if (buffer.trim())
          throw new ProviderError("INVALID_RESPONSE", false, 0, true);
        return;
      }
      buffer += decoder.decode(item.value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (Buffer.byteLength(line) > options.maxLineBytes)
          throw new ProviderError("INVALID_RESPONSE", false, 0, true);
        if (!line) continue;
        try {
          yield JSON.parse(line);
        } catch (error) {
          if (error instanceof ProviderError) throw error;
          throw new ProviderError("INVALID_RESPONSE", false, 0, true);
        }
      }
      if (Buffer.byteLength(buffer) > options.maxLineBytes)
        throw new ProviderError("INVALID_RESPONSE", false, 0, true);
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("INVALID_RESPONSE", false, 0, true);
  }
  // The owner closes the socket; awaiting iterator.return here can deadlock an idle socket.
}
