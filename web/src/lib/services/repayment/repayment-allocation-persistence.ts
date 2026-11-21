import { Prisma } from "../../../generated/prisma/client";
import { allocateRepaymentProportionally } from "./repayment-allocation";

export const REPAYMENT_ALLOCATION_METHOD =
  "PROPORTIONAL_LARGEST_REMAINDER";

export interface PersistRepaymentAllocationsInput {
  repaymentId: string;
  loanId: string;
  principalSatang: bigint;
  interestSatang: bigint;
  /** Override is intended for database rollback integration coverage. */
  allocationMethod?: string;
}

/**
 * Persists the auditable investor allocation for one repayment. This helper
 * must run on the caller's transaction so allocation failure rolls back the
 * repayment, ledger posting, wallet projections, and installment updates.
 */
export async function persistRepaymentAllocations(
  tx: Prisma.TransactionClient,
  input: PersistRepaymentAllocationsInput,
): Promise<void> {
  const investments = await tx.investment.findMany({
    where: {
      loanId: input.loanId,
      status: "ACTIVE",
      investorProfile: { investorStatus: "ACTIVE" },
    },
    select: {
      id: true,
      contributions: {
        where: { ledgerTransaction: { status: "POSTED" } },
        select: { amountSatang: true },
      },
    },
    orderBy: { id: "asc" },
  });

  console.dir(
  {
    loanId: input.loanId,
    investments: investments.map((investment) => ({
      id: investment.id,
      contributions: investment.contributions.map((contribution) => ({
        amountSatang: contribution.amountSatang.toString(),
      
      })),
    })),
  },
  { depth: null },
);

  const weightedInvestments = investments.map((investment) => ({
    investmentId: investment.id,
    contributionSatang: investment.contributions.reduce(
      (total, contribution) => total + contribution.amountSatang,
      0n,
    ),
  }));

  const allocations = allocateRepaymentProportionally({
    principalSatang: input.principalSatang,
    interestSatang: input.interestSatang,
    investments: weightedInvestments,
  });

  await tx.payoutAllocation.createMany({
    data: allocations.map((allocation) => ({
      repaymentId: input.repaymentId,
      investmentId: allocation.investmentId,
      principalSatang: allocation.principalSatang,
      interestSatang: allocation.interestSatang,
      recoverySatang: allocation.recoverySatang,
      allocationMethod:
        input.allocationMethod ?? REPAYMENT_ALLOCATION_METHOD,
    })),
  });
}
