import type { XPage, XPost } from "./contracts";
export interface XStreamRule {
  localId: string;
  query: string;
}
export interface RuleSyncResult {
  rules: { remoteId: string; localIds: string[]; query: string }[];
}
export interface StreamOutcome {
  reason: "rotated" | "stopped" | "disconnected";
  posts: number;
}
export interface StreamHandle {
  done: Promise<StreamOutcome>;
  stop(): void;
}
export interface XStreamProvider {
  setRules(rules: XStreamRule[]): Promise<RuleSyncResult>;
  connect(
    onPage: (page: XPage<XPost>, matchedLocalIds: string[]) => Promise<void>,
    options?: { signal?: AbortSignal; onConnected?: () => void },
  ): StreamHandle;
}
