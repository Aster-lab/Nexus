/** Coalesces duplicate in-flight UI submits; backend idempotency remains authoritative. */
export class SubmissionGuard {
  private active: Promise<unknown> | null = null;

  get isPending(): boolean {
    return this.active !== null;
  }

  run<T>(action: () => T | Promise<T>): Promise<T> {
    if (this.active) return this.active as Promise<T>;

    const attempt = Promise.resolve().then(action);
    const shared = attempt.finally(() => {
      if (this.active === shared) this.active = null;
    });
    this.active = shared;
    return shared;
  }
}
