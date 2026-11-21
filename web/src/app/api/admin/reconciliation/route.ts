import { apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { reconcileFinancialState } from "../../../../lib/services/financial-reconciliation.service";
import { reconcileInvestorPayouts } from "../../../../lib/services/investor-payout-reconciliation.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireAdministrator(request);
    const [financial, payouts] = await Promise.all([
      reconcileFinancialState({ actorUserId: identity.userId }),
      reconcileInvestorPayouts({ actorUserId: identity.userId }),
    ]);
    const payoutIssues = payouts.issues.map((issue) => ({ ...issue }));
    return apiSuccessResponse({
      valid: financial.valid && payouts.valid,
      issues: [...financial.issues, ...payoutIssues],
      financial,
      payouts: {
        ...payouts,
        clearing: payouts.clearing ? {
          ...payouts.clearing,
          walletBalanceSatang: payouts.clearing.walletBalanceSatang.toString(),
          ledgerBalanceSatang: payouts.clearing.ledgerBalanceSatang.toString(),
          collectionsSatang: payouts.clearing.collectionsSatang.toString(),
          completedPayoutsSatang: payouts.clearing.completedPayoutsSatang.toString(),
          otherPostedMovementSatang: payouts.clearing.otherPostedMovementSatang.toString(),
        } : null,
      },
    });
  } catch (error) { return apiErrorResponseFrom(error); }
}
