import { BorrowerLoanDetailsPage } from "../../../../components/borrower/borrower-loan-details";

export default async function BorrowerLoanDetailsRoute({ params }: { params: Promise<{ loanId: string }> }) {
  const { loanId } = await params;
  return <BorrowerLoanDetailsPage loanId={loanId} />;
}
