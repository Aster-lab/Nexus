import { BorrowerApplicationDetailsPage } from "../../../../components/borrower/borrower-application-details";

export default async function BorrowerApplicationDetailsRoute({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return <BorrowerApplicationDetailsPage applicationId={applicationId} />;
}
