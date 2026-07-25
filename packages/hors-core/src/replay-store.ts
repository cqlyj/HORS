export interface ReplayStore {
  consume(key: string): boolean | Promise<boolean>;
}

export class InMemoryReplayStore implements ReplayStore {
  private seen = new Map<string, number>();

  constructor(private readonly ttlMs: number) {}

  consume(key: string): boolean {
    this.cleanup();
    const now = Date.now();
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.set(key, now + this.ttlMs);
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, expiry] of this.seen) {
      if (expiry <= now) {
        this.seen.delete(key);
      }
    }
  }
}
