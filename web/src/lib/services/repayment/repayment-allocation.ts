
export interface AllocationInvestmentInput {
  investmentId: string;
  contributionSatang: bigint;
}

export interface AllocationInput {
  principalSatang: bigint;
  interestSatang: bigint;
  investments: AllocationInvestmentInput[];
}

export interface AllocationResult {
  investmentId: string;
  principalSatang: bigint;
  interestSatang: bigint;
  recoverySatang: bigint;
}

interface ComponentAllocation {
  investmentId: string;
  amountSatang: bigint;
  remainder: bigint;
}

/**
 * Compares IDs using deterministic code-point ordering.
 * Avoids locale-dependent ordering for financial tie-breaks.
 */
function compareInvestmentIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function validateInput(input: AllocationInput): void {
  if (typeof input.principalSatang !== "bigint") {
    throw new Error("Principal amount must be a bigint.");
  }

  if (typeof input.interestSatang !== "bigint") {
    throw new Error("Interest amount must be a bigint.");
  }

  if (input.principalSatang < 0n) {
    throw new Error("Principal amount cannot be negative.");
  }

  if (input.interestSatang < 0n) {
    throw new Error("Interest amount cannot be negative.");
  }

  if (!Array.isArray(input.investments) || input.investments.length === 0) {
    throw new Error("At least one eligible investment is required.");
  }

 const seenInvestmentIds = new Set<string>();

 for (const investment of input.investments) {
   if (
     typeof investment !== "object" ||
     investment === null ||
     Array.isArray(investment)
  ) {
    throw new Error("Each investment must be a valid object.");
  }

  if (
    typeof investment.investmentId !== "string" ||
    investment.investmentId.trim().length === 0
  ) {
    throw new Error("Investment ID must be a non-empty string.");
  }

  if (investment.investmentId !== investment.investmentId.trim()) {
    throw new Error("Investment ID cannot contain surrounding whitespace.");
  }

  if (seenInvestmentIds.has(investment.investmentId)) {
    throw new Error(
      `Duplicate investment ID: ${investment.investmentId}`,
    );
  }

  seenInvestmentIds.add(investment.investmentId);

  if (typeof investment.contributionSatang !== "bigint") {
    throw new Error("Contribution amount must be a bigint.");
  }

  if (investment.contributionSatang <= 0n) {
    throw new Error("Contribution amount must be positive.");
  }
 }
}

/**
 * Allocates one repayment component proportionally.
 *
 * Uses the largest-remainder method:
 * 1. Calculate each investment's integer quotient.
 * 2. Retain each fractional remainder.
 * 3. Distribute remaining satang by descending remainder.
 * 4. Resolve equal remainders by ascending investmentId.
 */
function allocateComponent(
  amountSatang: bigint,
  investments: AllocationInvestmentInput[],
): Map<string, bigint> {
  const allocations = new Map<string, bigint>();

  if (amountSatang === 0n) {
    for (const investment of investments) {
      allocations.set(investment.investmentId, 0n);
    }

    return allocations;
  }

  const totalContributions = investments.reduce(
    (total, investment) => total + investment.contributionSatang,
    0n,
  );

  if (totalContributions <= 0n) {
    throw new Error("Total investment contributions must be positive.");
  }

  const componentAllocations: ComponentAllocation[] = investments.map(
    (investment) => {
      const numerator =
        amountSatang * investment.contributionSatang;

      return {
        investmentId: investment.investmentId,
        amountSatang: numerator / totalContributions,
        remainder: numerator % totalContributions,
      };
    },
  );

  const allocatedTotal = componentAllocations.reduce(
    (total, allocation) => total + allocation.amountSatang,
    0n,
  );

  let remainingSatang = amountSatang - allocatedTotal;

  // Largest remainder first; investment ID resolves exact ties.
  const rankedAllocations = [...componentAllocations].sort((a, b) => {
    if (a.remainder > b.remainder) return -1;
    if (a.remainder < b.remainder) return 1;

    return compareInvestmentIds(a.investmentId, b.investmentId);
  });

  // The leftover is always less than the number of investments.
  for (const allocation of rankedAllocations) {
    if (remainingSatang === 0n) break;

    allocation.amountSatang += 1n;
    remainingSatang -= 1n;
  }

  if (remainingSatang !== 0n) {
    throw new Error("Unable to reconcile component allocation.");
  }

  for (const allocation of componentAllocations) {
    allocations.set(
      allocation.investmentId,
      allocation.amountSatang,
    );
  }

  const reconciledTotal = [...allocations.values()].reduce(
    (total, amount) => total + amount,
    0n,
  );

  if (reconciledTotal !== amountSatang) {
    throw new Error("Component allocations do not reconcile.");
  }

  return allocations;
}

/**
 * Allocates repayment principal and interest independently
 * according to each investment's total contribution weight.
 *
 * This function performs no database operations.
 */
export function allocateRepaymentProportionally(
  input: AllocationInput,
): AllocationResult[] {
  validateInput(input);

  const investments = [...input.investments].sort((a, b) =>
    compareInvestmentIds(a.investmentId, b.investmentId),
  );

  const principalAllocations = allocateComponent(
    input.principalSatang,
    investments,
  );

  const interestAllocations = allocateComponent(
    input.interestSatang,
    investments,
  );

  const results: AllocationResult[] = investments.map((investment) => ({
    investmentId: investment.investmentId,
    principalSatang:
      principalAllocations.get(investment.investmentId)!,
    interestSatang:
      interestAllocations.get(investment.investmentId)!,
    recoverySatang: 0n,
  }));

  const allocatedPrincipal = results.reduce(
    (total, allocation) => total + allocation.principalSatang,
    0n,
  );

  const allocatedInterest = results.reduce(
    (total, allocation) => total + allocation.interestSatang,
    0n,
  );

  if (allocatedPrincipal !== input.principalSatang) {
    throw new Error("Principal allocations do not reconcile.");
  }

  if (allocatedInterest !== input.interestSatang) {
    throw new Error("Interest allocations do not reconcile.");
  }

  return results;
}
