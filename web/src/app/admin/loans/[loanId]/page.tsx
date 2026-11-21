import { AdminLoanDetailPage } from "../../../../components/admin/admin-loans";

export default async function AdminLoanDetailRoute({ params }: { params: Promise<{ loanId: string }> }) {
  const { loanId } = await params;
  return <AdminLoanDetailPage loanId={loanId} />;
}
