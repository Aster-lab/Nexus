
import { describe, expect, it } from "vitest";

import {
  allocateRepaymentProportionally,
} from "../../src/lib/services/repayment/repayment-allocation";

type AllocationInput = Parameters<
  typeof allocateRepaymentProportionally
>[0];

function allocate(
  principalSatang: bigint,
  interestSatang: bigint,
  investments: AllocationInput["investments"],
) {
  return allocateRepaymentProportionally({
    principalSatang,
    interestSatang,
    investments,
  });
}

function expectAllocation(
  result: ReturnType<typeof allocate>,
  expected: Array<{
    investmentId: string;
    principalSatang: bigint;
    interestSatang: bigint;
    recoverySatang: bigint;
  }>,
) {
  expect(result).toEqual(expected);

  expect(
    result.reduce((sum, item) => sum + item.principalSatang, 0n),
  ).toBe(expected.reduce((sum, item) => sum + item.principalSatang, 0n));

  expect(
    result.reduce((sum, item) => sum + item.interestSatang, 0n),
  ).toBe(expected.reduce((sum, item) => sum + item.interestSatang, 0n));

  expect(result.every((item) => item.recoverySatang === 0n)).toBe(true);
}

describe("Repayment proportional allocation", () => { 
  describe("RAC-01: one investment", () => {
    it("allocates the full principal and interest to one investment", () => {
      const result = allocate(10_000n, 1_000n, [
        { investmentId: "investment-a", contributionSatang: 10_000n },
      ]);

      expectAllocation(result, [
        {
          investmentId: "investment-a",
          principalSatang: 10_000n,
          interestSatang: 1_000n,
          recoverySatang: 0n,
        },
      ]);
    });
  });

  describe("RAC-02: equal contributions", () => {
    it("distributes principal and interest proportionally between equal investments", () => {
      const result = allocate(100n, 50n, [
        { investmentId: "investment-a", contributionSatang: 100n },
        { investmentId: "investment-b", contributionSatang: 100n },
      ]);

      expectAllocation(result, [
        {
          investmentId: "investment-a",
          principalSatang: 50n,
          interestSatang: 25n,
          recoverySatang: 0n,
        },
        {
          investmentId: "investment-b",
          principalSatang: 50n,
          interestSatang: 25n,
          recoverySatang: 0n,
        },
      ]);
    });
  });

  describe("RAC-03: unequal contributions", () => {
    it("allocates according to contribution weights", () => {
      const result = allocate(100n, 50n, [
        { investmentId: "investment-a", contributionSatang: 100n },
        { investmentId: "investment-b", contributionSatang: 200n },
      ]);

      expectAllocation(result, [
        {
          investmentId: "investment-a",
          principalSatang: 33n,
          interestSatang: 17n,
          recoverySatang: 0n,
        },
        {
          investmentId: "investment-b",
          principalSatang: 67n,
          interestSatang: 33n,
          recoverySatang: 0n,
        },
      ]);
    });
  });

  describe("RAC-04: separate component allocation", () => {
    it("allocates principal and interest independently", () => {
      const result = allocate(10n, 5n, [
        { investmentId: "investment-a", contributionSatang: 1n },
        { investmentId: "investment-b", contributionSatang: 2n },
      ]);

      expectAllocation(result, [
        {
          investmentId: "investment-a",
          principalSatang: 3n,
          interestSatang: 2n,
          recoverySatang: 0n,
        },
        {
          investmentId: "investment-b",
          principalSatang: 7n,
          interestSatang: 3n,
          recoverySatang: 0n,
        },
      ]);
    });
  });

  describe("RAC-05: largest-remainder rounding", () => {
    it("distributes every remaining satang using largest remainders", () => {
      const result = allocate(10n, 0n, [
        { investmentId: "investment-a", contributionSatang: 1n },
        { investmentId: "investment-b", contributionSatang: 1n },
        { investmentId: "investment-c", contributionSatang: 1n },
      ]);

      expectAllocation(result, [
        {
          investmentId: "investment-a",
          principalSatang: 4n,
          interestSatang: 0n,
          recoverySatang: 0n,
        },
        {
          investmentId: "investment-b",
          principalSatang: 3n,
          interestSatang: 0n,
          recoverySatang: 0n,
        },
        {
          investmentId: "investment-c",
          principalSatang: 3n,
          interestSatang: 0n,
          recoverySatang: 0n,
        },
      ]);
    });
  });

  describe("RAC-06: deterministic tie-breaking", () => {
    it("awards equal remainders by ascending investmentId", () => {
      const result = allocate(2n, 0n, [
        { investmentId: "investment-c", contributionSatang: 1n },
        { investmentId: "investment-a", contributionSatang: 1n },
        { investmentId: "investment-b", contributionSatang: 1n },
      ]);

      expectAllocation(result, [
        {
          investmentId: "investment-a",
          principalSatang: 1n,
          interestSatang: 0n,
          recoverySatang: 0n,
        },
        {
          investmentId: "investment-b",
          principalSatang: 1n,
          interestSatang: 0n,
          recoverySatang: 0n,
        },
        {
          investmentId: "investment-c",
          principalSatang: 0n,
          interestSatang: 0n,
          recoverySatang: 0n,
        },
      ]);
    });
  });

  describe("RAC-07: input-order independence", () => {
    it("returns identical allocations when investment input order changes", () => {
      const investments = [
        { investmentId: "investment-c", contributionSatang: 3n },
        { investmentId: "investment-a", contributionSatang: 2n },
        { investmentId: "investment-b", contributionSatang: 5n },
      ];

      const first = allocate(101n, 37n, investments);
      const second = allocate(101n, 37n, [...investments].reverse());

      expect(second).toEqual(first);
    });
  });

  describe("RAC-08: zero principal", () => {
    it("allocates interest while keeping principal allocations at zero", () => {
      const result = allocate(0n, 10n, [
        { investmentId: "investment-a", contributionSatang: 1n },
        { investmentId: "investment-b", contributionSatang: 1n },
      ]);

      expectAllocation(result, [
        {
          investmentId: "investment-a",
          principalSatang: 0n,
          interestSatang: 5n,
          recoverySatang: 0n,
        },
        {
          investmentId: "investment-b",
          principalSatang: 0n,
          interestSatang: 5n,
          recoverySatang: 0n,
        },
      ]);
    });
  });

  describe("RAC-09: zero interest", () => {
    it("allocates principal while keeping interest allocations at zero", () => {
      const result = allocate(10n, 0n, [
        { investmentId: "investment-a", contributionSatang: 1n },
        { investmentId: "investment-b", contributionSatang: 1n },
      ]);

      expectAllocation(result, [
        {
          investmentId: "investment-a",
          principalSatang: 5n,
          interestSatang: 0n,
          recoverySatang: 0n,
        },
        {
          investmentId: "investment-b",
          principalSatang: 5n,
          interestSatang: 0n,
          recoverySatang: 0n,
        },
      ]);
    });
  });

  describe("RAC-10: no eligible investments", () => {
    it("rejects an empty investment list", () => {
      expect(() => allocate(100n, 10n, [])).toThrow();
    });
  });

  describe("RAC-11: invalid contribution weights", () => {
    it.each([0n, -1n])(
      "rejects a contribution weight of %s",
      (contributionSatang) => {
        expect(() =>
          allocate(100n, 10n, [
            {
              investmentId: "investment-a",
              contributionSatang,
            },
          ]),
        ).toThrow();
      },
    );
  });

  describe("RAC-12: negative component amounts", () => {
    it("rejects negative principal", () => {
      expect(() =>
        allocate(-1n, 10n, [
          { investmentId: "investment-a", contributionSatang: 100n },
        ]),
      ).toThrow();
    });

    it("rejects negative interest", () => {
      expect(() =>
        allocate(100n, -1n, [
          { investmentId: "investment-a", contributionSatang: 100n },
        ]),
      ).toThrow();
    });
  });

  describe("RAC-13: duplicate investment IDs", () => {
    it("rejects duplicate investment identifiers", () => {
      expect(() =>
        allocate(100n, 10n, [
          { investmentId: "investment-a", contributionSatang: 100n },
          { investmentId: "investment-a", contributionSatang: 200n },
        ]),
      ).toThrow();
    });
  });

  describe("RAC-14: large BigInt values", () => {
    it("allocates large amounts exactly without floating-point precision loss", () => {
      const amount = 9_007_199_254_740_993n;

      const result = allocate(amount, amount, [
        { investmentId: "investment-a", contributionSatang: 1n },
        { investmentId: "investment-b", contributionSatang: 1n },
      ]);

      expectAllocation(result, [
        {
          investmentId: "investment-a",
          principalSatang: 4_503_599_627_370_497n,
          interestSatang: 4_503_599_627_370_497n,
          recoverySatang: 0n,
        },
        {
          investmentId: "investment-b",
          principalSatang: 4_503_599_627_370_496n,
          interestSatang: 4_503_599_627_370_496n,
          recoverySatang: 0n,
        },
      ]);
    });
    it("rejects malformed investment entries", () => {
        expect(() =>
            allocate(100n, 10n, [null as never]),
        ).toThrow("Each investment must be a valid object.");
        });

    it("rejects investment IDs with surrounding whitespace", () => {
        expect(() =>
            allocate(100n, 10n, [
            {
                investmentId: " investment-a ",
                contributionSatang: 100n,
            },
            ]),
        ).toThrow("Investment ID cannot contain surrounding whitespace.");
        });
  });
  
});
