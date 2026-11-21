import { AdminApplicationDetailPage } from "../../../../components/admin/admin-applications";

export default async function AdminApplicationDetailRoute({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return <AdminApplicationDetailPage applicationId={applicationId} />;
}
