import { InvestorMarketplaceDetailPage } from "../../../../components/investor/investor-marketplace";

export default async function InvestorMarketplaceDetailRoute({ params }: { params: Promise<{ loanId: string }> }) {
  const { loanId } = await params;
  return <InvestorMarketplaceDetailPage loanId={loanId} />;
}
