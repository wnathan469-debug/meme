import { inspect } from "node:util";
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}
export const systemClock: Clock = {
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
export class Secret {
  #value: string;
  constructor(value: string) {
    if (!value || value.length > 4096 || /[\r\n\0]/.test(value))
      throw new Error("Secret non valide.");
    this.#value = value;
  }
  reveal(): string {
    return this.#value;
  }
  toJSON(): string {
    return "[MASQUÉ]";
  }
  toString(): string {
    return "[MASQUÉ]";
  }
  [inspect.custom](): string {
    return "Secret([MASQUÉ])";
  }
}
export interface AuditEvent {
  event: "request" | "retry" | "budget_warning" | "capability";
  endpoint: string;
  code?: string;
  status?: number;
  attempt?: number;
  requestId?: string;
}
export type AuditSink = (event: AuditEvent) => void;
export function structuredAudit(write: (line: string) => void): AuditSink {
  return (event) => {
    const { event: name, endpoint, code, status, attempt, requestId } = event;
    write(
      JSON.stringify({
        event: name,
        endpoint,
        code,
        status,
        attempt,
        requestId,
      }),
    );
  };
}
