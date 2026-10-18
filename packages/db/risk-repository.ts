import type { Pool, PoolClient } from "pg";
import { createHash } from "node:crypto";
import { z } from "zod";
import { withUserContext } from "./client";
import { ProviderError } from "../shared/errors";
import { normalizeAddress } from "../social/identity";
import {
  batchSchema,
  riskReport,
  validateIdentity,
  type RiskBatch,
  type RiskIdentity,
} from "../risks/model";
import type { Origin } from "../connectors/x/contracts";
/** Public chain/provider evidence only. Private notes/social data never enter this repository. */
export class PgRiskRepository {
  constructor(
    private pool: Pool,
    readonly ownerId: string,
    readonly origin: Origin,
  ) {
    if (!z.uuid().safeParse(ownerId).success)
      throw new ProviderError("INVALID_INPUT");
  }
  private async token(c: PoolClient, id: RiskIdentity) {
    validateIdentity(id);
    if (id.origin !== this.origin) throw new ProviderError("INVALID_INPUT");
    const a = normalizeAddress(id.chain, id.address, id.origin)!;
    const r = await c.query(
      "SELECT t.id FROM memeradar.tokens t JOIN memeradar.chains ch ON ch.id=t.chain_id AND ch.data_origin=t.data_origin WHERE t.data_origin=$1 AND ch.slug=$2 AND t.address_identity=$3",
      [id.origin, id.chain, id.chain === "solana" ? a : a.toLowerCase()],
    );
    if (!r.rowCount) throw new ProviderError("NOT_FOUND");
    return r.rows[0].id;
  }
  async store(raw: RiskBatch) {
    const b = batchSchema.parse(raw);
    // Validation includes identity and origin-specific provenance, before opening a transaction.
    riskReport(b, [b], new Date().toISOString());
    return withUserContext(this.pool, this.ownerId, this.origin, async (c) => {
      const token = await this.token(c, b);
      for (const o of b.observations) {
        const version =
          "phase9-v1-" + createHash("sha256").update(o.source).digest("hex");
        const inserted = await c.query(
          "INSERT INTO memeradar.risk_findings(data_origin,token_id,check_type,status,severity,evidence,limitations,checked_at,checker_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(data_origin,token_id,check_type,checked_at,checker_version) DO UPDATE SET evidence=risk_findings.evidence WHERE risk_findings.evidence=EXCLUDED.evidence RETURNING id",
          [
            b.origin,
            token,
            o.check,
            o.result === "signal"
              ? "signal_detected"
              : o.result === "clear" && o.complete
                ? "no_signal_detected"
                : o.result === "error"
                  ? "check_failed"
                  : "insufficient_data",
            o.result === "signal" ? "medium" : "info",
            { phase9: o },
            o.limitations,
            o.fetchedAt,
            version,
          ],
        );
        if (!inserted.rowCount) throw new ProviderError("STORE_UNAVAILABLE");
      }
    });
  }
  async read(id: RiskIdentity, asOf: string) {
    z.iso.datetime().parse(asOf);
    return withUserContext(this.pool, this.ownerId, this.origin, async (c) => {
      const token = await this.token(c, id);
      const rows = await c.query(
        "SELECT DISTINCT ON(check_type,checker_version) evidence FROM memeradar.risk_findings WHERE data_origin=$1 AND token_id=$2 AND checker_version LIKE 'phase9-v1-%' AND checked_at<=$3 ORDER BY check_type,checker_version,checked_at DESC LIMIT 101",
        [this.origin, token, asOf],
      );
      if (rows.rowCount! > 100) throw new ProviderError("STORE_UNAVAILABLE");
      const b = batchSchema.parse({
        ...id,
        observations: rows.rows.map((r) => r.evidence.phase9),
      });
      return riskReport(id, [b], asOf);
    });
  }
}
