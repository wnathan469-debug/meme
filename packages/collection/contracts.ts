import type { Origin, XPage, XPost } from "../connectors/x/contracts";
export type CollectionMode =
  "stream" | "search" | "user_timeline" | "conversation" | "lookup" | "quotes";
export interface CollectionRule {
  id: string;
  ownerId: string;
  origin: Origin;
  query: string;
  priority: "low" | "normal" | "high" | "critical";
  intervalSeconds: number;
  status: "active" | "paused";
}
export interface Checkpoint {
  sinceId: string | null;
  nextToken: string | null;
  pendingSinceId: string | null;
  queryHash: string | null;
  nextDueAt: string;
}
export interface Lease {
  rule: CollectionRule;
  token: string;
  runId: string;
  checkpoint: Checkpoint;
}
export interface IngestResult {
  newPosts: number;
  duplicates: number;
  originals: number;
  unknown: number;
  reposts: number;
  highestId: string | null;
}
export interface CollectionRepository {
  readonly origin: Origin;
  readonly ownerId: string;
  withStreamLock?(key: string, work: () => Promise<void>): Promise<boolean>;
  rules(): Promise<CollectionRule[]>;
  claim(
    rule: CollectionRule,
    mode: CollectionMode,
    now: number,
    leaseMs: number,
    force?: boolean,
    allowPaused?: boolean,
  ): Promise<Lease | null>;
  ingest(
    lease: Lease,
    page: XPage<XPost>,
    mode: CollectionMode,
    now: number,
    leaseMs: number,
  ): Promise<IngestResult>;
  finish(
    lease: Lease,
    options: {
      now: number;
      nextDueAt: number;
      status: "completed" | "failed" | "interrupted";
      errorCode?: string;
      retryAfterMs?: number;
    },
  ): Promise<void>;
}
export function highestId(
  ids: (string | null | undefined)[],
  origin: Origin,
): string | null {
  const values = ids.filter((id): id is string => !!id);
  if (!values.length) return null;
  return origin === "REAL"
    ? values.reduce((a, b) => (BigInt(a) > BigInt(b) ? a : b))
    : values.at(-1)!;
}
