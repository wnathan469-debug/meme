import { ProviderError } from "../shared/errors";
import type { PgSourceRepository } from "../db/source-repository";
import type { XCapabilities } from "../connectors/x/contracts";
import {
  connectionState,
  type SourceBinding,
  type ProviderId,
  type ProviderSettings,
} from "./model";
type Repository = Pick<
  PgSourceRepository,
  | "initialize"
  | "save"
  | "read"
  | "quote"
  | "consume"
  | "rules"
  | "setInterval"
  | "applyPriority"
>;
export interface Probe {
  ready?: boolean;
  run(): Promise<void>;
  capabilities?: () => Promise<XCapabilities>;
}
export class SourcesService {
  constructor(
    private repo: Repository,
    private bindings: SourceBinding[],
    private probes: Partial<Record<ProviderId, Probe>>,
  ) {}
  private binding(p: ProviderId) {
    const b = this.bindings.find((b) => b.provider === p);
    if (!b) throw new ProviderError("NOT_CONFIGURED");
    return b;
  }
  async initialize() {
    for (const b of this.bindings)
      await this.repo.initialize(b.provider, b.namespace, b.settings);
  }
  async read(p: ProviderId) {
    const b = this.binding(p),
      s = await this.repo.read(p, b.namespace);
    return {
      ...s,
      ...connectionState({
        ...b,
        settings: s.settings,
        last: s.diagnostics[0] ?? null,
        asOf: s.asOf,
        blockedUntil: s.blockedUntil,
      }),
      configured: b.configured,
      hostAllowed: b.hostAllowed,
      pricing: b.pricing,
      collectionMode: b.collectionMode,
      minimumIntervalSeconds: b.minimumIntervalSeconds,
      capabilities:
        p === "x" ? ((await this.probes.x?.capabilities?.()) ?? null) : null,
    };
  }
  async save(p: ProviderId, settings: ProviderSettings, revision: number) {
    const b = this.binding(p);
    if (
      p !== "x" &&
      (settings.budget.daily !== "0" ||
        settings.budget.monthly !== "0" ||
        Object.keys(settings.budget.features).length)
    )
      throw new ProviderError("INVALID_INPUT");
    if (settings.enabled && (!b.configured || !b.hostAllowed))
      throw new ProviderError("NOT_CONFIGURED");
    await this.repo.save(p, b.namespace, settings, revision);
    return this.read(p);
  }
  private ceiling(p: ProviderId) {
    const b = this.binding(p);
    if (
      !b.configured ||
      !b.hostAllowed ||
      !this.probes[p] ||
      this.probes[p]?.ready === false
    )
      throw new ProviderError("NOT_CONFIGURED");
    if (p !== "x") return "0";
    if (!b.pricing) throw new ProviderError("PRICING_UNKNOWN");
    return (BigInt(b.pricing.request) + BigInt(b.pricing.user)).toString();
  }
  async prepareProbe(p: ProviderId) {
    const b = this.binding(p);
    return {
      ...(await this.repo.quote(p, b.namespace, this.ceiling(p))),
      provider: p,
      requests: 1,
      posts: 0,
      users: p === "x" ? 1 : 0,
    };
  }
  async confirmProbe(p: ProviderId, id: string) {
    const b = this.binding(p),
      ceiling = this.ceiling(p);
    await this.repo.consume(p, b.namespace, id, ceiling);
    await this.probes[p]!.run();
    return this.read(p);
  }
  rules() {
    return this.repo.rules();
  }
  setInterval(id: string, seconds: number) {
    return this.repo.setInterval(id, seconds);
  }
  applyPriority(
    priority: "critical" | "high" | "normal" | "low",
    seconds: number,
  ) {
    return this.repo.applyPriority(priority, seconds);
  }
}
