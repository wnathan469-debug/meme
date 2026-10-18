import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";
import { ProviderError } from "./errors";

export interface HttpReply {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface WireRequest {
  url: URL;
  headers: Record<string, string>;
  addresses: string[];
  signal: AbortSignal;
  maxBytes: number;
}
export type Wire = (request: WireRequest) => Promise<HttpReply>;
export type Resolver = (hostname: string) => Promise<string[]>;
export interface JsonTransport {
  get(url: URL, headers: Record<string, string>): Promise<HttpReply>;
}
export const resolvePublicDns: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map(
    (item) => item.address,
  );
export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
export function validateDestination(
  url: URL,
  allowedHosts: readonly string[],
): void {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !allowedHosts.includes(url.hostname.toLowerCase())
  )
    throw new ProviderError("UNSAFE_URL");
}
export function pinnedLookup(hostname: string, addresses: readonly string[]) {
  if (!addresses.length || !addresses.every(isPublicAddress))
    throw new ProviderError("UNSAFE_URL");
  return (
    name: string,
    options: { all?: boolean; family?: number | string },
    callback: (error: Error | null, address?: unknown, family?: number) => void,
  ): void => {
    if (name !== hostname) {
      callback(new ProviderError("UNSAFE_URL"));
      return;
    }
    const choices = addresses.filter(
      (address) =>
        !options.family ||
        options.family === 0 ||
        isIP(address) === Number(options.family),
    );
    if (!choices.length) {
      callback(new ProviderError("UNSAFE_URL"));
      return;
    }
    const all = choices.map((address) => ({ address, family: isIP(address) }));
    if (options.all) callback(null, all);
    else callback(null, all[0].address, all[0].family);
  };
}
export const pinnedWire: Wire = async ({
  url,
  headers,
  addresses,
  signal,
  maxBytes,
}) => {
  const agent = new Agent({
    connect: {
      lookup: pinnedLookup(url.hostname, addresses) as NonNullable<
        import("node:net").TcpNetConnectOpts["lookup"]
      >,
    },
  });
  let sent = false;
  try {
    sent = true;
    const response = await request(url, {
      method: "GET",
      dispatcher: agent,
      headers,
      signal,
    });
    const outputHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers))
      if (value !== undefined)
        outputHeaders[key.toLowerCase()] = Array.isArray(value)
          ? value.join(",")
          : String(value);
    if (
      outputHeaders["content-encoding"] &&
      outputHeaders["content-encoding"] !== "identity"
    ) {
      response.body.destroy();
      throw new ProviderError("INVALID_RESPONSE", false, 0, true);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      const value = Buffer.from(chunk);
      size += value.length;
      if (size > maxBytes) {
        response.body.destroy();
        throw new ProviderError("INVALID_RESPONSE", false, 0, true);
      }
      chunks.push(value);
    }
    return {
      status: response.statusCode,
      headers: outputHeaders,
      body: new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks),
      ),
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
      true,
      0,
      sent,
    );
  } finally {
    await agent.destroy();
  }
};
export class SafeHttpTransport implements JsonTransport {
  constructor(
    private readonly options: {
      mode: "demo" | "live";
      allowedHosts: readonly string[];
      timeoutMs?: number;
      maxBytes?: number;
      maxRedirects?: number;
      resolve?: Resolver;
      wire?: Wire;
    },
  ) {}
  async get(
    initialUrl: URL,
    initialHeaders: Record<string, string>,
  ): Promise<HttpReply> {
    if (this.options.mode === "demo")
      throw new ProviderError("NETWORK_DISABLED");
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 10000);
    let url = new URL(initialUrl);
    const originalOrigin = url.origin;
    for (let hop = 0; hop <= (this.options.maxRedirects ?? 3); hop++) {
      validateDestination(url, this.options.allowedHosts);
      if (url.origin !== originalOrigin) throw new ProviderError("UNSAFE_URL");
      let addresses: string[];
      try {
        const resolver = this.options.resolve ?? resolvePublicDns;
        addresses = await new Promise<string[]>((resolve, reject) => {
          const abort = () => reject(new ProviderError("TIMEOUT", true));
          signal.addEventListener("abort", abort, { once: true });
          resolver(url.hostname)
            .then(resolve, () =>
              reject(new ProviderError("NETWORK_ERROR", true)),
            )
            .finally(() => signal.removeEventListener("abort", abort));
          if (signal.aborted) abort();
        });
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError("NETWORK_ERROR", true);
      }
      if (!addresses.length || !addresses.every(isPublicAddress))
        throw new ProviderError("UNSAFE_URL");
      if (signal.aborted) throw new ProviderError("TIMEOUT", true);
      const reply = await (this.options.wire ?? pinnedWire)({
        url,
        headers: {
          ...initialHeaders,
          accept: "application/json",
          "accept-encoding": "identity",
        },
        addresses,
        signal,
        maxBytes: this.options.maxBytes ?? 2_000_000,
      });
      if (
        Buffer.byteLength(reply.body, "utf8") >
        (this.options.maxBytes ?? 2_000_000)
      )
        throw new ProviderError("INVALID_RESPONSE", false, 0, true);
      if ([301, 302, 303, 307, 308].includes(reply.status)) {
        if (!reply.headers.location || hop === (this.options.maxRedirects ?? 3))
          throw new ProviderError("UNSAFE_URL", false, 0, true);
        try {
          url = new URL(reply.headers.location, url);
        } catch {
          throw new ProviderError("UNSAFE_URL", false, 0, true);
        }
        continue;
      }
      return reply;
    }
    throw new ProviderError("UNSAFE_URL");
  }
}
