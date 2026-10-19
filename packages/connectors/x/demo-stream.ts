import type { XProvider } from "./contracts";
import type { XStreamProvider, RuleSyncResult } from "./stream-contracts";
import type { Clock } from "../../shared/runtime";
import { ProviderError } from "../../shared/errors";
export function demoStream(
  provider: XProvider,
  clock: Clock,
  check = () => {},
): XStreamProvider {
  let rules: { localId: string; query: string }[] = [];
  return {
    async setRules(next) {
      rules = next;
      return {
        rules: next.map((r, i) => ({
          remoteId: "DEMO_RULE_" + i,
          localIds: [r.localId],
          query: r.query,
        })),
      };
    },
    connect(onPage, options = {}) {
      let stopped = false;
      const done = (async () => {
        options.onConnected?.();
        let posts = 0;
        for (const rule of rules) {
          const page = await provider.searchRecent(rule.query);
          for (const post of page.data) {
            if (stopped || options.signal?.aborted)
              return { reason: "stopped" as const, posts };
            check();
            await clock.sleep(1);
            await onPage({ ...page, data: [post] }, [rule.localId]);
            posts++;
          }
        }
        return { reason: "rotated" as const, posts };
      })();
      return {
        done,
        stop() {
          stopped = true;
        },
      };
    },
  };
}
