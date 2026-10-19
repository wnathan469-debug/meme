import { argon2, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  serverTransaction,
  type ServerOrigin,
} from "../../packages/db/server-controls";
import { ProviderError } from "../../packages/shared/errors";
export const credentialsSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();
const encoded =
  /^\$argon2id\$v=19\$m=65536,t=3,p=4\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/;
export const digest = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    argon2(
      "argon2id",
      {
        message: password,
        nonce: salt,
        parallelism: 4,
        tagLength: 32,
        memory: 65536,
        passes: 3,
      },
      (e, v) => (e ? reject(e) : resolve(v)),
    ),
  );
}
export async function hashPassword(password: string) {
  if (password.length < 14 || password.length > 256)
    throw new ProviderError("INVALID_INPUT");
  const salt = randomBytes(16),
    key = await derive(password, salt);
  return (
    "$argon2id$v=19$m=65536,t=3,p=4$" +
    salt.toString("base64").replace(/=+$/, "") +
    "$" +
    key.toString("base64").replace(/=+$/, "")
  );
}
export async function verifyPassword(password: string, hash: string) {
  const match = encoded.exec(hash);
  if (!match || password.length > 256) return false;
  const key = await derive(password, Buffer.from(match[1], "base64"));
  return timingSafeEqual(key, Buffer.from(match[2], "base64"));
}
export interface Identity {
  userId: string;
  origin: ServerOrigin;
  expiresAt: string;
}
export class PgAuth {
  private dummy: Promise<string> | undefined;
  private hashing = 0;
  constructor(
    private pool: Pool,
    readonly origin: ServerOrigin,
    private now = () => Date.now(),
  ) {}
  async createAdmin(input: unknown) {
    const v = credentialsSchema.parse(input),
      hash = await hashPassword(v.password);
    const r = await this.pool.query(
      "INSERT INTO memeradar.users(data_origin,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(data_origin,email) DO NOTHING RETURNING id",
      [this.origin, v.email, hash],
    );
    if (!r.rowCount) throw new ProviderError("ACCESS_DENIED");
  }
  async rate(key: string, limit: number, seconds: number) {
    return serverTransaction(this.pool, this.origin, async (c) => {
      const at = new Date(
        Math.floor(this.now() / (seconds * 1000)) * seconds * 1000,
      );
      const r = await c.query(
        "INSERT INTO memeradar.server_request_limits(data_origin,key_hash,window_start,requests) VALUES($1,$2,$3,1) ON CONFLICT(data_origin,key_hash,window_start) DO UPDATE SET requests=server_request_limits.requests+1 RETURNING requests",
        [this.origin, digest(key), at],
      );
      if (r.rows[0].requests > limit) throw new ProviderError("RATE_LIMITED");
    });
  }
  async login(input: unknown) {
    const v = credentialsSchema.parse(input);
    if (this.hashing >= 2) throw new ProviderError("RATE_LIMITED");
    this.hashing++;
    try {
      const user = (
        await this.pool.query(
          "SELECT id,password_hash,disabled FROM memeradar.users WHERE data_origin=$1 AND email=$2",
          [this.origin, v.email],
        )
      ).rows[0];
      const dummy = await (this.dummy ??= hashPassword(
        randomBytes(32).toString("base64url"),
      ));
      const candidate =
        user && !user.disabled && encoded.test(user.password_hash)
          ? user.password_hash
          : dummy;
      const ok = await verifyPassword(v.password, candidate);
      if (!ok || !user || user.disabled)
        throw new ProviderError("ACCESS_DENIED");
      const token = randomBytes(32).toString("base64url"),
        expiresAt = new Date(this.now() + 30 * 60 * 1000).toISOString();
      const r = await this.pool.query(
        "INSERT INTO memeradar.sessions(data_origin,user_id,token_hash,csrf_hash,created_at,expires_at) SELECT $1,id,$3,$4,$5,$6 FROM memeradar.users WHERE data_origin=$1 AND id=$2 AND NOT disabled RETURNING id",
        [
          this.origin,
          user.id,
          digest(token),
          digest(randomBytes(32)),
          new Date(this.now()),
          expiresAt,
        ],
      );
      if (!r.rowCount) throw new ProviderError("ACCESS_DENIED");
      return { token, expiresAt, origin: this.origin };
    } finally {
      this.hashing--;
    }
  }
  async authenticate(token: string): Promise<Identity> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new ProviderError("ACCESS_DENIED");
    const r = await this.pool.query(
      "SELECT s.user_id,s.expires_at FROM memeradar.sessions s JOIN memeradar.users u ON u.id=s.user_id AND u.data_origin=s.data_origin WHERE s.data_origin=$1 AND s.token_hash=$2 AND s.revoked_at IS NULL AND s.expires_at>$3 AND s.created_at>$4 AND NOT u.disabled",
      [
        this.origin,
        digest(token),
        new Date(this.now()),
        new Date(this.now() - 12 * 3600000),
      ],
    );
    if (!r.rowCount) throw new ProviderError("ACCESS_DENIED");
    return {
      userId: r.rows[0].user_id,
      origin: this.origin,
      expiresAt: r.rows[0].expires_at.toISOString(),
    };
  }
  async renew(token: string) {
    await this.authenticate(token);
    const replacement = randomBytes(32).toString("base64url");
    const r = await this.pool.query(
      "UPDATE memeradar.sessions s SET token_hash=$3,expires_at=least($4::timestamptz,created_at+interval '12 hours') WHERE data_origin=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>$5 AND created_at>$6 AND EXISTS(SELECT 1 FROM memeradar.users u WHERE u.id=s.user_id AND u.data_origin=s.data_origin AND NOT u.disabled) RETURNING expires_at",
      [
        this.origin,
        digest(token),
        digest(replacement),
        new Date(this.now() + 30 * 60000),
        new Date(this.now()),
        new Date(this.now() - 12 * 3600000),
      ],
    );
    if (!r.rowCount) throw new ProviderError("ACCESS_DENIED");
    return {
      token: replacement,
      expiresAt: r.rows[0].expires_at.toISOString(),
      origin: this.origin,
    };
  }
  async logout(token: string) {
    await this.pool.query(
      "UPDATE memeradar.sessions SET revoked_at=$3 WHERE data_origin=$1 AND token_hash=$2 AND revoked_at IS NULL",
      [this.origin, digest(token), new Date(this.now())],
    );
  }
}
