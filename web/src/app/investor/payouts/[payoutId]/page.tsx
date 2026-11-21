import { InvestorPayoutDetailsPage } from "../../../../components/investor/investor-payouts";

export default async function InvestorPayoutDetailsRoute({ params }: { params: Promise<{ payoutId: string }> }) {
  const { payoutId } = await params;
  return <InvestorPayoutDetailsPage payoutId={payoutId} />;
}
