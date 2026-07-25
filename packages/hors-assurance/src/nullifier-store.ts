import { InMemoryReplayStore, type ReplayStore } from "hors-core";

export class NullifierStore {
  private store: ReplayStore;

  constructor(store?: ReplayStore, ttlMs = 86_400_000) {
    this.store = store ?? new InMemoryReplayStore(ttlMs);
  }

  consume(action: string, nullifier: string): boolean | Promise<boolean> {
    return this.store.consume(`${action}::${nullifier}`);
  }
}
