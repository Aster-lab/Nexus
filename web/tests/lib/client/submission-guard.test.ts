import { describe, expect, it, vi } from "vitest";
import { SubmissionGuard } from "../../../src/lib/client/submission-guard";

describe("WP9 financial submission guard", () => {
  it("shares an in-flight result instead of starting a second request", async () => {
    const guard = new SubmissionGuard();
    let resolveAction!: (value: { transactionId: string }) => void;
    const action = vi.fn(() => new Promise<{ transactionId: string }>((resolve) => { resolveAction = resolve; }));

    const first = guard.run(action);
    const second = guard.run(action);
    expect(second).toBe(first);
    expect(guard.isPending).toBe(true);
    await Promise.resolve();
    expect(action).toHaveBeenCalledTimes(1);

    resolveAction({ transactionId: "txn-1" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { transactionId: "txn-1" },
      { transactionId: "txn-1" },
    ]);
    expect(guard.isPending).toBe(false);
  });

  it("allows a new explicit attempt after a failed request settles", async () => {
    const guard = new SubmissionGuard();
    const action = vi.fn()
      .mockRejectedValueOnce(new Error("conflict"))
      .mockResolvedValueOnce("confirmed");

    await expect(guard.run(action)).rejects.toThrow("conflict");
    await expect(guard.run(action)).resolves.toBe("confirmed");
    expect(action).toHaveBeenCalledTimes(2);
  });
});
