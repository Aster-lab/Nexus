import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { withSerializableTransactionRetry } from "./ledger-posting.service";

type TransactionClient = Prisma.TransactionClient;

export class BorrowerOfferAcceptanceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BorrowerOfferAcceptanceError";
  }
}

function fail(code: string): never {
  throw new BorrowerOfferAcceptanceError(code);
}

async function lockApplication(tx: TransactionClient, applicationId: string): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM loan_applications WHERE id = ${applicationId}::uuid FOR UPDATE
  `;
}

export async function acceptBorrowerLoanOffer(input: {
  actorUserId: string;
  borrowerProfileId: string;
  offerId: string;
}) {
  return withSerializableTransactionRetry(async (tx) => {
    const offerReference = await tx.loanOffer.findUnique({
      where: { id: input.offerId },
      select: { applicationId: true },
    });
    if (!offerReference) fail("OFFER_NOT_FOUND");

    await lockApplication(tx, offerReference.applicationId);
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM loan_offers WHERE id = ${input.offerId}::uuid FOR UPDATE
    `;

    const offer = await tx.loanOffer.findUnique({
      where: { id: input.offerId },
      include: {
        application: {
          select: {
            borrowerProfileId: true,
            status: true,
            currentVersionId: true,
          },
        },
        loan: { select: { id: true } },
      },
    });
    if (!offer || offer.application.borrowerProfileId !== input.borrowerProfileId) {
      fail("OFFER_NOT_FOUND");
    }
    if (offer.status === "ACCEPTED" || offer.loan) fail("OFFER_ALREADY_ACCEPTED");
    if (offer.status !== "ISSUED") fail("OFFER_NOT_AVAILABLE");
    const acceptedAt = new Date();
    if (offer.expiresAt <= acceptedAt) fail("OFFER_EXPIRED");
    if (
      offer.application.status !== "APPROVED" ||
      offer.application.currentVersionId !== offer.applicationVersionId
    ) {
      fail("OFFER_NOT_AVAILABLE");
    }

    const loan = await tx.loan.create({
      data: {
        borrowerProfileId: input.borrowerProfileId,
        applicationId: offer.applicationId,
        acceptedOfferId: offer.id,
        principalSatang: offer.principalSatang,
        annualInterestRate: offer.annualInterestRate,
        termMonths: offer.termMonths,
        status: "FUNDING",
        fundingDeadline: offer.expiresAt,
      },
      select: {
        id: true,
        status: true,
        principalSatang: true,
        fundedSatang: true,
        annualInterestRate: true,
        termMonths: true,
        fundingDeadline: true,
      },
    });

    const transitioned = await tx.loanOffer.updateMany({
      where: { id: offer.id, status: "ISSUED", expiresAt: { gt: acceptedAt } },
      data: { status: "ACCEPTED", acceptedAt },
    });
    if (transitioned.count !== 1) fail("OFFER_NOT_AVAILABLE");

    await tx.loanStatusHistory.create({
      data: {
        loanId: loan.id,
        previousStatus: null,
        newStatus: "FUNDING",
        reason: "Borrower accepted the issued loan offer.",
        changedByUserId: input.actorUserId,
      },
    });

    return {
      loanId: loan.id,
      offerId: offer.id,
      status: loan.status,
      principalSatang: loan.principalSatang.toString(),
      fundedSatang: loan.fundedSatang.toString(),
      annualInterestRate: loan.annualInterestRate.toString(),
      termMonths: loan.termMonths,
      fundingDeadline: loan.fundingDeadline,
    };
  });
}
