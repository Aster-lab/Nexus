import {prisma} from '../../src/lib/prisma';
import {Prisma} from "../../src/generated/prisma/client";

const PLATFORM_ACCOUNTS = [
    {
        accountCode : "1200",
        accountName : "Simulated Loan Principal Receivable",
        accountType : "ASSET",
        currency : "THB",
        status : "INACTIVE",
    },
    {
        accountCode : "2100",
        accountName : "Shared User-Wallet Control",
        accountType : "LIABILITY",
        currency : "THB",
        status : "INACTIVE",
    },
    {
        accountCode : "2200",
        accountName : "Simulated Escrow",
        accountType : "LIABILITY",
        currency : 'THB',
        status : "INACTIVE",
    },
    {
        accountCode : "2300",
        accountName : "Repayment Clearing",
        accountType : "LIABILITY",
        currency : "THB",
        status : "INACTIVE",
    }
] satisfies Prisma.PlatformAccountCreateManyInput[];

export async function seedPlatformAccounts() {
    await prisma.$transaction(async (tx)=>{
        for (const account of PLATFORM_ACCOUNTS) {
            const existing = await tx.platformAccount.findUnique({
                where: {accountCode : account.accountCode}
            });

            if (existing){
                const matches =
                    existing.accountName == account.accountName &&
                    existing.accountType == account.accountType &&
                    existing.currency == account.currency &&
                    existing.status == account.status;
                
                if  (!matches) {
                    throw new Error(
                        `PlatformAccount conflict for code ${account.accountCode}.` +
                        "Existing record does not match the approved seed definition"
                    )
                }
                console.log(`PlatformAccount ${account.accountCode} already exists; skipping.`);
                continue;
            }
            await tx.platformAccount.create({data: account,});
            console.log(`PlatformAccount ${account.accountCode} created`);
        }
    });
}