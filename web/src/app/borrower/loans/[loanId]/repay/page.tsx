import { BorrowerRepaymentForm } from "../../../../../components/borrower/borrower-repayment-form";

export default async function BorrowerRepaymentRoute({ params }: { params: Promise<{ loanId: string }> }) {
  const { loanId } = await params;
  return <BorrowerRepaymentForm loanId={loanId} />;
}
