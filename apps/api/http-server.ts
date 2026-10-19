import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import { PgAuth, credentialsSchema } from "./auth";
import {
  PgServerControls,
  type ServerOrigin,
} from "../../packages/db/server-controls";
import { PgPeopleRepository } from "../../packages/db/people-repository";
import { PgXCollectionRepository } from "../../packages/db/x-collection-repository";
import { PgSourceRepository } from "../../packages/db/source-repository";
import { filtersFromUrl } from "../../packages/collection/query";
import { ProviderError } from "../../packages/shared/errors";
interface Options {
  origin: ServerOrigin;
  tls?: https.ServerOptions;
  allowLocalHttp?: boolean;
  publicOrigin?: string;
  log?: (entry: {
    requestId: string;
    route: string;
    status: number;
    code: string;
    origin: ServerOrigin;
  }) => void;
}
const routes = new Set([
  "/health",
  "/v1/auth/login",
  "/v1/auth/renew",
  "/v1/auth/logout",
  "/v1/me",
  "/v1/people",
  "/v1/posts",
  "/v1/sources",
  "/v1/collection",
  "/v1/collection/stop",
]);
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
async function jsonBody(req: IncomingMessage) {
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json")
    throw new HttpError(415, "JSON_REQUIRED");
  return new Promise<unknown>((resolve, reject) => {
    let size = 0,
      done = false;
    const chunks: Buffer[] = [];
    req.on("data", (raw: Buffer) => {
      if (done) return;
      size += raw.length;
      if (size > 8192) {
        done = true;
        reject(new HttpError(413, "BODY_TOO_LARGE"));
        return;
      }
      chunks.push(raw);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "INVALID_JSON"));
      }
    });
    req.on("aborted", () => {
      if (!done) {
        done = true;
        reject(new HttpError(400, "REQUEST_ABORTED"));
      }
    });
    req.on("error", () => {
      if (!done) {
        done = true;
        reject(new HttpError(400, "REQUEST_ABORTED"));
      }
    });
  });
}
export function createApiServer(pool: Pool, options: Options) {
  if (!options.tls && !options.allowLocalHttp) throw new Error("TLS required");
  if (
    options.tls &&
    (!options.publicOrigin ||
      new URL(options.publicOrigin).protocol !== "https:" ||
      new URL(options.publicOrigin).origin !== options.publicOrigin)
  )
    throw new Error("Canonical HTTPS origin required");
  const auth = new PgAuth(pool, options.origin),
    controls = new PgServerControls(pool, options.origin);
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const requestId = randomUUID();
    let route = "unknown",
      status = 500,
      code = "SERVER_UNAVAILABLE";
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Request-Id", requestId);
    if (options.tls)
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    const send = (s: number, body: unknown) => {
      status = s;
      res.statusCode = s;
      res.end(JSON.stringify(body));
    };
    try {
      if (
        !options.tls &&
        (!options.allowLocalHttp ||
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress ?? "",
          ))
      )
        throw new HttpError(403, "HTTPS_REQUIRED");
      const expected = options.tls
        ? new URL(options.publicOrigin!).host
        : `127.0.0.1:${req.socket.localPort}`;
      if (req.headers.host !== expected)
        throw new HttpError(400, "HOST_REFUSED");
      const expectedOrigin = options.publicOrigin ?? "http://" + expected;
      if (req.headers.origin && req.headers.origin !== expectedOrigin)
        throw new HttpError(403, "ORIGIN_REFUSED");
      if ((req.url?.length ?? 0) > 4096)
        throw new HttpError(414, "URL_TOO_LONG");
      const url = new URL(req.url ?? "/", "https://api.invalid");
      route = routes.has(url.pathname) ? url.pathname : "unknown";
      await auth.rate("api:global", 600, 60);
      await auth.rate(
        "api:ip:" + (req.socket.remoteAddress ?? "unknown"),
        120,
        60,
      );
      if (url.pathname === "/health" && req.method === "GET") {
        code = "OK";
        return send(200, {
          service: "MemeRadar",
          origin: options.origin,
          status: "server_only",
        });
      }
      if (url.pathname !== "/v1/posts" && url.search)
        throw new HttpError(400, "QUERY_REFUSED");
      if (req.method === "POST" && url.pathname === "/v1/auth/login") {
        await auth.rate(
          "login:ip:" + (req.socket.remoteAddress ?? "unknown"),
          5,
          60,
        );
        const input = credentialsSchema.parse(await jsonBody(req));
        await auth.rate("login:email:" + input.email, 5, 900);
        const result = await auth.login(input);
        code = "OK";
        return send(200, result);
      }
      const header = req.headers.authorization;
      if (!header || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header))
        throw new HttpError(401, "UNAUTHORIZED");
      const token = header.slice(7),
        identity = await auth.authenticate(token);
      if (
        req.method === "POST" &&
        ["/v1/auth/renew", "/v1/auth/logout", "/v1/collection/stop"].includes(
          url.pathname,
        )
      ) {
        z.object({})
          .strict()
          .parse(await jsonBody(req));
        code = "OK";
        if (url.pathname === "/v1/auth/renew")
          return send(200, await auth.renew(token));
        if (url.pathname === "/v1/auth/logout") {
          await auth.logout(token);
          return send(200, { loggedOut: true });
        }
        return send(200, await controls.stop());
      }
      if (req.method === "GET") {
        code = "OK";
        if (url.pathname === "/v1/me") return send(200, identity);
        if (url.pathname === "/v1/collection")
          return send(200, await controls.read());
        if (url.pathname === "/v1/people")
          return send(200, {
            origin: options.origin,
            data: await new PgPeopleRepository(
              pool,
              identity.userId,
              options.origin,
            ).list(),
          });
        if (url.pathname === "/v1/posts")
          return send(200, {
            origin: options.origin,
            ...(await new PgXCollectionRepository(
              pool,
              identity.userId,
              options.origin,
            ).localSearch(filtersFromUrl(url.search))),
          });
        if (url.pathname === "/v1/sources") {
          const repo = new PgSourceRepository(
            pool,
            identity.userId,
            options.origin,
          );
          const data = await Promise.all(
            (["x", "gecko", "goplus"] as const).map(async (provider) => {
              try {
                return {
                  status: "stored_configuration",
                  ...(await repo.read(provider, "default")),
                };
              } catch (e) {
                if (e instanceof ProviderError && e.code === "NOT_FOUND")
                  return {
                    provider,
                    status: "not_configured",
                    lastCollectionAt: null,
                  };
                throw e;
              }
            }),
          );
          return send(200, { origin: options.origin, data });
        }
      }
      throw new HttpError(404, "NOT_FOUND");
    } catch (e) {
      if (e instanceof HttpError) {
        code = e.code;
        send(e.status, { code, requestId });
      } else if (e instanceof z.ZodError) {
        code = "INVALID_INPUT";
        send(400, { code, requestId });
      } else if (e instanceof ProviderError) {
        code = e.code;
        send(
          code === "ACCESS_DENIED"
            ? 401
            : code === "RATE_LIMITED"
              ? 429
              : code === "INVALID_INPUT"
                ? 400
                : 503,
          { code, requestId },
        );
      } else {
        code = "SERVER_UNAVAILABLE";
        send(503, { code, requestId });
      }
    } finally {
      try {
        options.log?.({
          requestId,
          route,
          status,
          code,
          origin: options.origin,
        });
      } catch {
        /* Logging must not expose requests or fail a response. */
      }
    }
  };
  const server = options.tls
    ? https.createServer(options.tls, handler)
    : http.createServer(handler);
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 30;
  server.maxConnections = 100;
  return server;
}
