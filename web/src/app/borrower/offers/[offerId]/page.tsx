import { BorrowerOfferDetailsPage } from "../../../../components/borrower/borrower-offer-details";

export default async function BorrowerOfferDetailsRoute({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  return <BorrowerOfferDetailsPage offerId={offerId} />;
}
