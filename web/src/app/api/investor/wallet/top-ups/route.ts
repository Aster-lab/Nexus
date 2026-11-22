import { handleWalletTopUp } from "../../../../../lib/api/wallet-top-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleWalletTopUp(request, "INVESTOR");
}
