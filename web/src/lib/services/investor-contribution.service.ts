import {Prisma} from "../../generated/prisma/client";
import {prisma} from "../prisma";
import { createInAppNotification } from "./notification.service";

const ESCROW_ACCOUNT_CODE = "2200";
const CURRENCY = "THB";
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
const MAX_RETRIES = 3;

export interface PostInvestorContributionInputs {
    userId: string;
    loanId: string;
    amountSatang: bigint;
    idempotencyKey: string;
}

export class InvestorContributionError extends Error {
    constructor(message:string, public readonly code:string){
        super(message);
        this.name = "InvestorContributionError";
    }
}

const contributionInclude = {
    investment: {include: {investorProfile:true}},
    ledgerTransaction: true,
} satisfies Prisma.InvestmentContributionInclude;

type ContributionRecord = Prisma.InvestmentContributionGetPayload<{
    include: typeof contributionInclude;
}>;

type TranscationClient = Prisma.TransactionClient;

function reject(message:string,code:string):never{
    throw new InvestorContributionError(message,code);
}

function validateInput(input: PostInvestorContributionInputs):void{
    if (!input.userId || !input.loanId){
        reject("User ID and Loan ID are required","INVALID_REFERENCE");
    }

    if (typeof input.amountSatang !== "bigint" || input.amountSatang <= 0){
        reject("Invalid contribution amount","INVALID_AMOUNT");
    }

    if(
        typeof input.idempotencyKey !== "string" ||
        !input.idempotencyKey.trim() ||
        input.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
    ){
        reject("Invalid idempotency key","INVALID_IDEMPOTENCY_KEY");
    }
}

async function findContribution(
    client: TranscationClient | typeof prisma,
    idempotencyKey: string,
) : Promise<ContributionRecord | null> {
    return client.investmentContribution.findUnique({
        where: {idempotencyKey},
        include: contributionInclude,
    });
}

function assertSameRequest(
    existing: ContributionRecord,
    input: PostInvestorContributionInputs
): void {
    const matches = 
      existing.investment.investorProfile.userId === input.userId &&
      existing.investment.loanId === input.loanId &&
      existing.amountSatang === input.amountSatang;

    if (!matches){
        reject("The idempotency key has already been used for a different request","IDEMPOTENCY_KEY_CONFLICT");
    }

    if (existing.ledgerTransaction.status !== "POSTED"){
        reject("The existing contribution has not been posted yet","INVALID_EXISITNG_CONTRIBUTION");
    }
}

async function postWithinTransaction(
    tx: TranscationClient,
    input: PostInvestorContributionInputs,
): Promise<ContributionRecord> {
    const existing = await findContribution(tx, input.idempotencyKey);

    if(existing){
        assertSameRequest(existing, input);
        return existing;
    }

    const user = await tx.user.findUnique({
        where: {id: input.userId},
        include: {investorProfile: true,wallets: true},
    });

    if(!user || user.accountStatus !== "ACTIVE"){
        reject("Invalid user or account status","INVALID_USER");
    }

    const profile = user.investorProfile;
    if(!profile || profile.investorStatus !== "ACTIVE"){
        reject("Invalid investor profile or status","INVALID_INVESTOR_PROFILE");
    }

    const investorWallet = user.wallets.find(
        (wallet)=>
            wallet.ownerUserId === user.id &&
            wallet.ownerPlatformAccountId === null,
    );

    if (
        !investorWallet ||
        investorWallet.currency !== CURRENCY ||
        investorWallet.status !== "ACTIVE"
    ){
        reject("Invalid investor wallet","INVALID_INVESTOR_WALLET");
    }

    if (investorWallet.balanceSatang < input.amountSatang){
        reject("Insufficient wallet balance.","INSUFFICIENT_BALANCE");
    }

    const loan = await tx.loan.findUnique({
        where: {id: input.loanId},
        include: { borrowerProfile: { select: { userId: true } } },
    });

    const now = new Date();

    if (!loan || loan.status !== "FUNDING"){
        reject("The loan is not availabe for funding","INVALID_LOAN");
    }

    if (loan.fundingDeadline <= now) {
        reject("The funding deadline has passed.", "FUNDING_DEADLINE_PASSED");
    }

    if (
        loan.fundedSatang >= loan.principalSatang ||
        input.amountSatang > loan.principalSatang - loan.fundedSatang
    ) {
        reject("Contribution exceeds the remaining funding amount.", "FUNDING_LIMIT_EXCEEDED");
    }

    const platformAccount = await tx.platformAccount.findUnique({
        where: { accountCode: ESCROW_ACCOUNT_CODE },
        include: { wallets: true },
    });

    if (
        !platformAccount ||
        platformAccount.accountType !== "LIABILITY" ||
        platformAccount.currency !== CURRENCY ||
        platformAccount.status !== "ACTIVE"
    ) {
        reject("The shared escrow platform account is unavailable.", "ESCROW_ACCOUNT_UNAVAILABLE");
    }

    const escrowWallet = platformAccount.wallets.find(
        (wallet) =>
        wallet.ownerPlatformAccountId === platformAccount.id &&
        wallet.ownerUserId === null,
    );

    if (
        !escrowWallet ||
        escrowWallet.status !== "ACTIVE" ||
        escrowWallet.currency !== CURRENCY
    ) {
        reject("The shared escrow wallet is unavailable.", "ESCROW_WALLET_UNAVAILABLE");
    }

    const escrow = await tx.escrowAccount.findUnique({
        where: { loanId: loan.id },
    });

    if (
        !escrow ||
        escrow.status !== "OPEN" ||
        escrow.platformWalletId !== escrowWallet.id
    ) {
        reject("A matching open loan escrow account is required.", "LOAN_ESCROW_UNAVAILABLE");
    }

    let investment = await tx.investment.findUnique({
        where: {
        investorProfileId_loanId: {
            investorProfileId: profile.id,
            loanId: loan.id,
        },
        },
    });

    if (investment && investment.status !== "ACTIVE") {
        reject("The investment is not active.", "INVESTMENT_NOT_ACTIVE");
    }

    investment ??= await tx.investment.create({
        data: {
        investorProfileId: profile.id,
        loanId: loan.id,
        status: "ACTIVE",
        },
    });

    // Create draft ledger transaction
    const ledger = await tx.ledgerTransaction.create({
        data: {
        transactionType: "INVESTOR_CONTRIBUTION",
        status: "DRAFT",
        idempotencyKey: input.idempotencyKey,
        referenceType: "INVESTMENT",
        referenceId: investment.id,
        description: "Investor contribution to loan escrow",
        },
    });

    // Balanced ledger entries
    await tx.ledgerEntry.createMany({
        data: [
        {
            ledgerTransactionId: ledger.id,
            walletId: investorWallet.id,
            entryType: "DEBIT",
            amountSatang: input.amountSatang,
            currency: CURRENCY,
        },
        {
            ledgerTransactionId: ledger.id,
            walletId: escrowWallet.id,
            entryType: "CREDIT",
            amountSatang: input.amountSatang,
            currency: CURRENCY,
        },
        ],
    });

    // Conditional wallet updates protect against stale balances
    const debit = await tx.wallet.updateMany({
        where: {
        id: investorWallet.id,
        ownerUserId: user.id,
        ownerPlatformAccountId: null,
        status: "ACTIVE",
        currency: CURRENCY,
        balanceSatang: { gte: input.amountSatang },
        },
        data: { balanceSatang: { decrement: input.amountSatang } },
    });

    if (debit.count !== 1) {
        reject("Investor wallet balance changed or is unavailable.", "WALLET_DEBIT_FAILED");
    }

    const credit = await tx.wallet.updateMany({
        where: {
        id: escrowWallet.id,
        ownerUserId: null,
        ownerPlatformAccountId: platformAccount.id,
        status: "ACTIVE",
        currency: CURRENCY,
        },
        data: { balanceSatang: { increment: input.amountSatang } },
    });

    if (credit.count !== 1) {
        reject("Shared escrow wallet could not be credited.", "ESCROW_CREDIT_FAILED");
    }

    // Post only after every related write succeeds
    await tx.ledgerTransaction.update({
        where: { id: ledger.id },
        data: { status: "POSTED", postedAt: now },
    });

    const contribution = await tx.investmentContribution.create({
        data: {
        investmentId: investment.id,
        amountSatang: input.amountSatang,
        ledgerTransactionId: ledger.id,
        idempotencyKey: input.idempotencyKey,
        },
    });

    await createInAppNotification(tx, {
        userId: input.userId,
        category: "INVESTMENT",
        title: "Investment contribution confirmed",
        content: "Your contribution has been posted to the loan's funding escrow. Track it in your portfolio.",
        actionPath: "/investor/portfolio",
    });
    
    await tx.escrowTransaction.create({
        data: {
        escrowAccountId: escrow.id,
        ledgerTransactionId: ledger.id,
        type: "DEPOSIT",
        amountSatang: input.amountSatang,
        },
    });

    // Update loan funding with a conditional capacity check
    const fundingUpdate = await tx.loan.updateMany({
        where: {
        id: loan.id,
        status: "FUNDING",
        fundingDeadline: { gt: now },
        fundedSatang: { lte: loan.principalSatang - input.amountSatang },
        },
        data: { fundedSatang: { increment: input.amountSatang } },
    });

    if (fundingUpdate.count !== 1) {
        reject("Loan funding capacity changed.", "FUNDING_UPDATE_FAILED");
    }

    // Update loan-specific escrow balance
    const escrowUpdate = await tx.escrowAccount.updateMany({
        where: {
        id: escrow.id,
        status: "OPEN",
        platformWalletId: escrowWallet.id,
        },
        data: { heldSatang: { increment: input.amountSatang } },
    });

    if (escrowUpdate.count !== 1) {
        reject("Loan escrow could not be updated.", "ESCROW_UPDATE_FAILED");
    }


    // Complete funding without automatically disbursing the loan
    const updatedLoan = await tx.loan.findUniqueOrThrow({
        where: { id: loan.id },
        select: { fundedSatang: true, principalSatang: true },
    });

    if (updatedLoan.fundedSatang === updatedLoan.principalSatang) {
        const completedFunding = await tx.loan.updateMany({
        where: { id: loan.id, status: "FUNDING" },
        data: { status: "FUNDED", fundedAt: now },
        });

        if (completedFunding.count === 1) {
            await createInAppNotification(tx, {
                userId: loan.borrowerProfile.userId,
                category: "LOAN_STATUS",
                title: "Your loan is fully funded",
                content: "Funding is complete. Your loan will proceed through the platform's disbursement process.",
                actionPath: "/borrower/loans",
            });
            const investors = await tx.investment.findMany({
                where: { loanId: loan.id, status: "ACTIVE" },
                select: { investorProfile: { select: { userId: true } } },
            });
            for (const investor of investors) {
                await createInAppNotification(tx, {
                    userId: investor.investorProfile.userId,
                    category: "INVESTMENT",
                    title: "A loan you backed is fully funded",
                    content: "Funding is complete for a loan in your portfolio. You can follow its status from your investments.",
                    actionPath: "/investor/portfolio",
                });
            }
        }

        await tx.escrowAccount.updateMany({
        where: { id: escrow.id, status: "OPEN" },
        data: { status: "FULLY_FUNDED" },
        });
    }

    return tx.investmentContribution.findUniqueOrThrow({
        where: { id: contribution.id },
        include: contributionInclude,
    });
    }

    export async function postInvestorContribution(
    input: PostInvestorContributionInputs,
    ): Promise<ContributionRecord> {
    validateInput(input);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
        return await prisma.$transaction(
            (tx) => postWithinTransaction(tx, input),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 10_000,
                timeout: 30_000,
             },
            
        );
        } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
            throw error;
        }

        if (error.code === "P2002") {
            const existing = await findContribution(prisma, input.idempotencyKey);

            if (existing) {
            assertSameRequest(existing, input);
            return existing;
            }
        }

        if (
            (error.code === "P2034" || error.code === "P2002") &&
            attempt < MAX_RETRIES
        ) {
            continue;
        }

        throw error;
        }
    }

    reject("Contribution failed after multiple transaction retries.", "RETRY_LIMIT_REACHED");
    }
