import { ProviderError } from "./errors";
import type { Clock, AuditSink } from "./runtime";
export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxWaitMs: number;
}
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  clock: Clock,
  random: () => number,
  audit: AuditSink,
  endpoint: string,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (
        !(error instanceof ProviderError) ||
        !error.retryable ||
        attempt >= policy.maxRetries
      )
        throw error;
      const wait = Math.max(
        error.retryAfterMs,
        policy.baseDelayMs *
          2 ** attempt *
          (0.5 + 0.5 * Math.max(0, Math.min(1, random()))),
      );
      if (wait > policy.maxWaitMs) throw error;
      audit({
        event: "retry",
        endpoint,
        attempt: attempt + 1,
        code: error.code,
      });
      await clock.sleep(Math.ceil(wait));
    }
  }
}
