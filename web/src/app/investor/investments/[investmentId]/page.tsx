import { InvestorInvestmentDetailsPage } from "../../../../components/investor/investor-portfolio";

export default async function InvestorInvestmentRoute({ params }: { params: Promise<{ investmentId: string }> }) {
  const { investmentId } = await params;
  return <InvestorInvestmentDetailsPage investmentId={investmentId} />;
}
