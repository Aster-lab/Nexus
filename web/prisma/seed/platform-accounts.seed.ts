import {prisma} from '../../src/lib/prisma';
import {Prisma} from "../../src/generated/prisma/client";

const PLATFORM_ACCOUNTS = [
    {
        accountCode : "1200",
        accountName : "Simulated Loan Principal Receivable",
        accountType : "ASSET",
        currency : "THB",
        status : "ACTIVE",
    },
    {
        accountCode : "2100",
        accountName : "Shared User-Wallet Control",
        accountType : "LIABILITY",
        currency : "THB",
        status : "ACTIVE",
    },
    {
        accountCode : "2200",
        accountName : "Simulated Escrow",
        accountType : "LIABILITY",
        currency : 'THB',
        status : "ACTIVE",
    },
    {
        accountCode : "2300",
        accountName : "Repayment Clearing",
        accountType : "LIABILITY",
        currency : "THB",
        status : "ACTIVE",
    },
    {
        accountCode : "1300",
        accountName: "Simulated Opening Balance Asset",
        accountType : "ASSET",
        currency : "THB",
        status: "ACTIVE",
    }
] satisfies Prisma.PlatformAccountCreateManyInput[];

// These accounts hold simulated transfers in shared platform-owned wallets.
// Account 1300 is a ledger funding source and is posted to by platformAccountId,
// so it intentionally has no wallet. Account 1200 tracks the principal asset;
// account 2100 controls user-owned wallet liabilities without owning a wallet.
const PLATFORM_WALLET_ACCOUNT_CODES = new Set(["2200", "2300"]);
// These chart accounts are required by every financial write path. A stale
// inactive status must not leave a freshly migrated environment unusable.
const REQUIRED_ACTIVE_ACCOUNT_CODES = new Set(["1200", "2100", "1300"]);

export async function seedPlatformAccounts() {
    await prisma.$transaction(async (tx)=>{
        for (const account of PLATFORM_ACCOUNTS) {
            const existing = await tx.platformAccount.findUnique({
                where: {accountCode : account.accountCode}
            });

            let platformAccount = existing;
            if (existing){
                const matches =
                    existing.accountCode == account.accountCode &&
                    existing.accountName == account.accountName &&
                    existing.accountType == account.accountType &&
                    existing.currency == account.currency;
                
                if  (!matches) {
                    throw new Error(
                        `PlatformAccount conflict for code ${account.accountCode}.` +
                        "Existing record does not match the approved seed definition"
                    )
                }
                if (REQUIRED_ACTIVE_ACCOUNT_CODES.has(account.accountCode) && existing.status !== "ACTIVE") {
                    platformAccount = await tx.platformAccount.update({
                        where: { id: existing.id },
                        data: { status: "ACTIVE" },
                    });
                    console.log(`PlatformAccount ${account.accountCode} activated for required financial operations.`);
                } else {
                    console.log(
                        `PlatformAccount ${account.accountCode} already exists; preserving status ${existing.status}.`,
                    );
                }
            } else {
                platformAccount = await tx.platformAccount.create({data: account,});
                console.log(`PlatformAccount ${account.accountCode} created`);
            }

            if (platformAccount?.status === "ACTIVE" && PLATFORM_WALLET_ACCOUNT_CODES.has(account.accountCode)) {
                await tx.wallet.upsert({
                    where: { ownerPlatformAccountId: platformAccount.id },
                    create: {
                        ownerPlatformAccountId: platformAccount.id,
                        currency: "THB",
                        balanceSatang: 0n,
                        status: "ACTIVE",
                    },
                    update: {},
                });
            }
        }
    });
}
