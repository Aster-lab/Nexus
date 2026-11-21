import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("../../src/components/auth/auth-provider", () => ({ useAuth: () => ({ identity: { email: "investor@example.test", investorProfile: { displayName: "Niran Investor" } } }) }));
import { InvestorDashboardPage } from "../../src/components/investor/investor-dashboard";
import type { InvestorDashboardData } from "../../src/lib/client/investor-dashboard";

const emptyDashboard: InvestorDashboardData = {
  portfolio: { status: "success", data: { investorProfileId: "profile-1", investmentCounts: { active: 0, completed: 0 }, totalInvestedPrincipalSatang: "0", principalReceivedSatang: "0", interestReceivedSatang: "0", outstandingPrincipalSatang: "0", wallet: null } },
  investments: { status: "success", data: [] },
  payouts: { status: "success", data: [] },
};

describe("WP9.5 investor dashboard", () => {
  it("INV-DASH-07 exposes an accessible loading state", () => {
    const html = renderToStaticMarkup(createElement(InvestorDashboardPage, {}));
    expect(html).toContain("Loading portfolio summary");
    expect(html).toContain('aria-busy="true"');
  });

  it("INV-DASH-02 renders useful empty states without inventing wallet data", () => {
    const html = renderToStaticMarkup(createElement(InvestorDashboardPage, { initialData: emptyDashboard }));
    expect(html).toContain("No investments yet");
    expect(html).toContain("No payouts have been recorded yet");
    expect(html).toContain("Wallet unavailable");
  });

  it("INV-DASH-01/03/04/05 displays backend portfolio and payout summary values", () => {
    const populated: InvestorDashboardData = {
      portfolio: { status: "success", data: { investorProfileId: "profile-1", investmentCounts: { active: 2, completed: 1 }, totalInvestedPrincipalSatang: "300000", principalReceivedSatang: "25000", interestReceivedSatang: "4000", outstandingPrincipalSatang: "275000", wallet: { balanceSatang: "80000", currency: "THB", status: "ACTIVE" } } },
      investments: { status: "success", data: [] },
      payouts: { status: "success", data: [] },
    };
    const html = renderToStaticMarkup(createElement(InvestorDashboardPage, { initialData: populated }));
    expect(html).toContain("฿800.00");
    expect(html).toContain("฿3,000.00");
    expect(html).toContain("฿250.00 principal");
    expect(html).toContain("฿40.00 interest");
    expect(html).toContain("฿2,750.00");
  });

  it("greets the signed-in investor by their profile display name", () => {
    const html = renderToStaticMarkup(createElement(InvestorDashboardPage, {}));
    expect(html).toContain("Welcome back, Niran Investor");
  });

  it("links to persisted wallet activity and distinguishes it from allocations", () => {
    const html = renderToStaticMarkup(createElement(InvestorDashboardPage, {}));
    expect(html).toContain("Open wallet activity");
    expect(html).toContain("An allocation is not a wallet credit");
  });
});
