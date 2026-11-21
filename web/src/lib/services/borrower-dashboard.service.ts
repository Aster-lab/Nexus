import { prisma } from "../prisma";

const ACTIVE_LOAN_STATUSES = ["ACTIVE", "DELINQUENT"] as const;
const OPEN_APPLICATION_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUESTED"] as const;
const MAX_INSTALLMENTS_PER_GROUP = 5;

export interface BorrowerDashboardInstallment {
  loanId: string;
  installmentId: string;
  installmentNumber: number;
  dueDate: string;
  remainingBalanceSatang: string;
}

export interface BorrowerDashboardLoanBalance {
  loanId: string;
  outstandingBalanceSatang: string;
  nextDueDate: string | null;
}

export interface BorrowerDashboardSummary {
  activeLoanCount: number;
  totalOutstandingBalanceSatang: string;
  pendingApplicationCount: number;
  availableOfferCount: number;
  nextInstallment: BorrowerDashboardInstallment | null;
  upcomingInstallments: BorrowerDashboardInstallment[];
  overdueInstallments: BorrowerDashboardInstallment[];
  activeLoans: BorrowerDashboardLoanBalance[];
}

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function getBorrowerDashboardSummary(
  borrowerProfileId: string,
  now = new Date(),
): Promise<BorrowerDashboardSummary> {
  const [activeLoans, pendingApplicationCount, availableOfferCount] = await Promise.all([
    prisma.loan.findMany({
      where: { borrowerProfileId, status: { in: [...ACTIVE_LOAN_STATUSES] } },
      select: {
        id: true,
        repaymentSchedule: {
          select: {
            currentVersion: {
              select: {
                installments: {
                  orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
                  select: {
                    id: true,
                    installmentNumber: true,
                    dueDate: true,
                    principalDueSatang: true,
                    interestDueSatang: true,
                    paidPrincipalSatang: true,
                    paidInterestSatang: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.loanApplication.count({
      where: { borrowerProfileId, status: { in: [...OPEN_APPLICATION_STATUSES] } },
    }),
    prisma.loanOffer.count({
      where: {
        status: "ISSUED",
        expiresAt: { gt: now },
        application: { borrowerProfileId, status: "APPROVED" },
      },
    }),
  ]);

  const today = utcStartOfDay(now);
  const outstandingInstallments: BorrowerDashboardInstallment[] = [];
  const loanBalances: BorrowerDashboardLoanBalance[] = [];
  let totalOutstanding = 0n;

  for (const loan of activeLoans) {
    const currentVersion = loan.repaymentSchedule?.currentVersion;
    if (!currentVersion) {
      throw new Error(`Active borrower loan ${loan.id} is missing its current repayment schedule.`);
    }
    const installments = currentVersion.installments;
    let loanOutstanding = 0n;
    let nextDueDate: string | null = null;

    for (const installment of installments) {
      const remainingPrincipal = installment.principalDueSatang - installment.paidPrincipalSatang;
      const remainingInterest = installment.interestDueSatang - installment.paidInterestSatang;
      const remaining = remainingPrincipal + remainingInterest;
      if (remaining <= 0n) continue;

      loanOutstanding += remaining;
      const dueDate = installment.dueDate.toISOString();
      nextDueDate ??= dueDate;
      outstandingInstallments.push({
        loanId: loan.id,
        installmentId: installment.id,
        installmentNumber: installment.installmentNumber,
        dueDate,
        remainingBalanceSatang: remaining.toString(),
      });
    }

    totalOutstanding += loanOutstanding;
    loanBalances.push({
      loanId: loan.id,
      outstandingBalanceSatang: loanOutstanding.toString(),
      nextDueDate,
    });
  }

  outstandingInstallments.sort((left, right) =>
    left.dueDate.localeCompare(right.dueDate) ||
    left.loanId.localeCompare(right.loanId) ||
    left.installmentNumber - right.installmentNumber,
  );

  const overdueInstallments = outstandingInstallments.filter((installment) =>
    new Date(installment.dueDate) < today,
  );
  const upcomingInstallments = outstandingInstallments.filter((installment) =>
    new Date(installment.dueDate) >= today,
  );

  return {
    activeLoanCount: activeLoans.length,
    totalOutstandingBalanceSatang: totalOutstanding.toString(),
    pendingApplicationCount,
    availableOfferCount,
    nextInstallment: outstandingInstallments[0] ?? null,
    upcomingInstallments: upcomingInstallments.slice(0, MAX_INSTALLMENTS_PER_GROUP),
    overdueInstallments: overdueInstallments.slice(0, MAX_INSTALLMENTS_PER_GROUP),
    activeLoans: loanBalances,
  };
}
