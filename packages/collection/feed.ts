import type { Origin } from "../connectors/x/contracts";
export interface FeedUpdate {
  postId: string;
  origin: Origin;
  at: string;
}
export class FeedSession {
  private paused = false;
  private readonly pending = new Map<string, FeedUpdate>();
  private overflow = false;
  constructor(
    private readonly deliver: (update: FeedUpdate) => void,
    private readonly capacity = 1000,
  ) {}
  pause() {
    this.paused = true;
  }
  receive(update: FeedUpdate) {
    if (!this.paused) {
      this.deliver(update);
      return;
    }
    if (
      this.pending.size >= this.capacity &&
      !this.pending.has(update.postId)
    ) {
      this.overflow = true;
      return;
    }
    this.pending.set(update.postId, update);
  }
  status() {
    return {
      paused: this.paused,
      pending: this.pending.size,
      refreshRequired: this.overflow,
    };
  }
  resume() {
    const status = this.status();
    this.paused = false;
    for (const update of this.pending.values()) this.deliver(update);
    this.pending.clear();
    this.overflow = false;
    return status;
  }
}
export class FeedHub {
  private readonly listeners = new Map<string, Set<FeedSession>>();
  subscribe(
    ownerId: string,
    origin: Origin,
    deliver: (update: FeedUpdate) => void,
  ) {
    const key = ownerId + ":" + origin,
      session = new FeedSession(deliver);
    let list = this.listeners.get(key);
    if (!list) {
      list = new Set();
      this.listeners.set(key, list);
    }
    list.add(session);
    return {
      session,
      close: () => {
        list!.delete(session);
        if (!list!.size) this.listeners.delete(key);
      },
    };
  }
  publish(ownerId: string, update: FeedUpdate) {
    for (const session of this.listeners.get(ownerId + ":" + update.origin) ??
      [])
      try {
        session.receive(update);
      } catch {
        /* A consumer cannot undo a committed collection. */
      }
  }
}
