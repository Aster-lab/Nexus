import { InvestorInvestmentFormPage } from "../../../../../components/investor/investor-investment-form";

export default async function InvestorInvestmentRoute({ params }: { params: Promise<{ loanId: string }> }) {
  const { loanId } = await params;
  return <InvestorInvestmentFormPage loanId={loanId} />;
}
