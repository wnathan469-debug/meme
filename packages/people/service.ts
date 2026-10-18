import { randomUUID } from "node:crypto";
import type { Origin, XProvider, XUser } from "../connectors/x/contracts";
import { idSchema } from "../connectors/x/contracts";
import { ProviderError } from "../shared/errors";
import { systemClock, type Clock } from "../shared/runtime";
import {
  parsePerson,
  type Person,
  type PersonInput,
  type Category,
  normalizeUsername,
} from "./model";
export interface PeopleRepository {
  readonly origin: Origin;
  list(): Promise<Person[]>;
  save(
    input: PersonInput,
    user: XUser | null,
    validation: Person["validation"],
    id?: string,
  ): Promise<{ person: Person; duplicate: boolean }>;
  update(id: string, input: PersonInput): Promise<Person>;
  remove(id: string): Promise<void>;
  categories(): Promise<Category[]>;
  saveCategory(name: string, id?: string): Promise<Category>;
  removeCategory(id: string, replacement: string | null): Promise<void>;
}
export type PreparedPerson =
  | { state: "confirmation_required"; ticket: string; profile: XUser }
  | {
      state: "unvalidated" | "not_found" | "unavailable";
      ticket: string;
      profile: null;
    };
/** One instance per authenticated owner/origin. Tickets never include private notes in public results. */
export class PeopleService {
  private inFlight = 0;
  private tickets = new Map<
    string,
    {
      input: PersonInput;
      user: XUser | null;
      validation: Person["validation"];
      expires: number;
      id?: string;
    }
  >();
  constructor(
    readonly repository: PeopleRepository,
    private provider: XProvider | null,
    private clock: Clock = systemClock,
  ) {
    if (provider && provider.dataOrigin !== repository.origin)
      throw new ProviderError("INVALID_INPUT");
  }
  async prepare(input: unknown, id?: string): Promise<PreparedPerson> {
    for (const [key, value] of this.tickets)
      if (value.expires <= this.clock.now()) this.tickets.delete(key);
    if (this.tickets.size + this.inFlight >= 1000)
      throw new ProviderError("RATE_LIMITED");
    this.inFlight++;
    try {
      return await this.prepareOne(input, id);
    } finally {
      this.inFlight--;
    }
  }
  private async prepareOne(
    input: unknown,
    id?: string,
  ): Promise<PreparedPerson> {
    const parsed = parsePerson(input, this.repository.origin);
    if (id) {
      const old = (await this.repository.list()).find((p) => p.id === id);
      if (!old) throw new ProviderError("NOT_FOUND");
      // Stable identity must never be silently replaced when revalidating a renamed account.
      if (old.xUserId) throw new ProviderError("INVALID_INPUT");
    }
    let user: XUser | null = null,
      state: PreparedPerson["state"] = "unvalidated",
      validation: Person["validation"] = "unvalidated";
    if (this.provider) {
      try {
        user = await this.provider.getUserByUsername(parsed.username);
        if (user) {
          if (
            user.dataOrigin !== this.repository.origin ||
            !idSchema(this.repository.origin).safeParse(user.id).success ||
            normalizeUsername(user.username, user.dataOrigin) !==
              parsed.username
          )
            throw new ProviderError("INVALID_RESPONSE");
          state = "confirmation_required";
          validation = "validated_via_api";
        } else {
          state = "not_found";
          validation = "not_found";
        }
      } catch (error) {
        if (
          !(error instanceof ProviderError) ||
          ![
            "ACCESS_DENIED",
            "NOT_CONFIGURED",
            "NETWORK_DISABLED",
            "RATE_LIMITED",
            "BUDGET_EXCEEDED",
            "PRICING_UNKNOWN",
            "CIRCUIT_OPEN",
            "PROVIDER_UNAVAILABLE",
            "NETWORK_ERROR",
            "TIMEOUT",
          ].includes(error.code)
        )
          throw error;
        state = "unavailable";
      }
    }
    const ticket = randomUUID();
    this.tickets.set(ticket, {
      input: parsed,
      user: user ? structuredClone(user) : null,
      validation,
      expires: this.clock.now() + 300000,
      id,
    });
    return user
      ? {
          state: "confirmation_required",
          ticket,
          profile: structuredClone(user),
        }
      : {
          state: state as "unvalidated" | "not_found" | "unavailable",
          ticket,
          profile: null,
        };
  }
  /** Explicit operator batch: resolves queued identities, but never activates them without confirmation. */
  async preparePending(limit = 10) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new ProviderError("INVALID_INPUT");
    const pending = (await this.repository.list())
      .filter((p) => !p.xUserId)
      .slice(0, limit);
    const cards: { personId: string; prepared: PreparedPerson }[] = [];
    for (const person of pending) {
      const prepared = await this.prepare(person, person.id);
      cards.push({ personId: person.id, prepared });
      if (prepared.state === "unavailable") break;
    }
    return cards;
  }
  async confirm(ticket: string) {
    const pending = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!pending || pending.expires <= this.clock.now())
      throw new ProviderError("INVALID_INPUT");
    const input = { ...pending.input };
    if (!pending.user || pending.user.protected !== false)
      input.status = "paused";
    return this.repository.save(
      input,
      pending.user,
      pending.validation,
      pending.id,
    );
  }
  async update(id: string, input: unknown) {
    return this.repository.update(
      id,
      parsePerson(input, this.repository.origin),
    );
  }
}
