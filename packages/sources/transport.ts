import { randomUUID } from "node:crypto";
import type { JsonTransport } from "../shared/http";
import { ProviderError } from "../shared/errors";
import { quotaFromHeaders, retryAfter } from "../connectors/x/control";
import type { ProviderDiagnostic } from "./model";
/** No raw URL, headers, body or exception message crosses the observer boundary. */
export class ObservedPublicTransport implements JsonTransport {
  constructor(
    private transport: JsonTransport,
    private observe: (d: ProviderDiagnostic) => Promise<void>,
    private now = () => Date.now(),
    private validate?: (body: unknown) => boolean,
  ) {}
  async get(url: URL, headers: Record<string, string>) {
    const endpoint = url.pathname.endsWith("/networks")
      ? "networks"
      : url.pathname.endsWith("/supported_chains")
        ? "supported_chains"
        : url.pathname.includes("/token_security/")
          ? "token_security"
          : url.pathname.includes("/ohlcv/")
            ? "history"
            : url.pathname.endsWith("/trades")
              ? "trades"
              : "pools";
    let result: Awaited<ReturnType<JsonTransport["get"]>> | undefined,
      code: ProviderDiagnostic["code"] = null;
    try {
      result = await this.transport.get(url, headers);
      code =
        result.status === 429
          ? "RATE_LIMITED"
          : [401, 403].includes(result.status)
            ? "ACCESS_DENIED"
            : result.status === 404
              ? "NOT_FOUND"
              : result.status !== 200
                ? "PROVIDER_UNAVAILABLE"
                : null;
      if (!code) {
        try {
          if (result.body.length > 2000000) throw new Error();
          const body: unknown = JSON.parse(result.body);
          if (this.validate && !this.validate(body)) throw new Error();
        } catch {
          code = "INVALID_RESPONSE";
        }
      }
    } catch (e) {
      code = e instanceof ProviderError ? e.code : "NETWORK_ERROR";
    }
    const n = this.now(),
      q = result ? quotaFromHeaders(result.headers, n) : null,
      delay = result ? retryAfter(result.headers, n) : 0;
    await this.observe({
      id: randomUUID(),
      endpoint,
      at: new Date(n).toISOString(),
      code,
      status: result?.status ?? null,
      quota: q
        ? {
            limit: q.limit,
            remaining: q.remaining,
            resetAt:
              q.resetAt !== null ? new Date(q.resetAt).toISOString() : null,
          }
        : null,
      retryAt: delay > 0 ? new Date(n + delay).toISOString() : null,
    });
    if (code === "INVALID_RESPONSE") throw new ProviderError(code);
    if (!result) throw new ProviderError(code ?? "NETWORK_ERROR");
    return result;
  }
}
