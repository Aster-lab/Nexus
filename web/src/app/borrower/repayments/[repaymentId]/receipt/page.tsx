import { BorrowerReceiptPage } from "../../../../../components/borrower/borrower-receipt-page";

export default async function BorrowerReceiptRoute({ params }: { params: Promise<{ repaymentId: string }> }) {
  const { repaymentId } = await params;
  return <BorrowerReceiptPage repaymentId={repaymentId} />;
}
