import { describe, expect, it } from "vitest";
import { canAccessRolePath, getRoleHomePath, getRoleNavigation, safeInAppReturnPath } from "../../../src/lib/client/auth-access";

describe("WP9.3 role access decisions", () => {
  it("routes each active role to its own landing page", () => {
    expect(getRoleHomePath(["BORROWER"])).toBe("/borrower");
    expect(getRoleHomePath(["INVESTOR"])).toBe("/investor");
    expect(getRoleHomePath(["ADMIN"])).toBe("/admin");
  });

  it("prefers administrator landing when an identity has multiple roles", () => {
    expect(getRoleHomePath(["BORROWER", "INVESTOR", "ADMIN"])).toBe("/admin");
    expect(getRoleHomePath(["BORROWER", "INVESTOR"])).toBe("/borrower");
  });

  it("does not grant a role route to a different or unknown role", () => {
    expect(canAccessRolePath(["INVESTOR"], "/borrower/applications")).toBe(false);
    expect(canAccessRolePath(["BORROWER"], "/admin/reconciliation")).toBe(false);
    expect(canAccessRolePath(["UNRECOGNIZED"], "/investor/portfolio")).toBe(false);
    expect(canAccessRolePath(["BORROWER"], "/borrowerish")).toBe(false);
    expect(getRoleHomePath([])).toBeNull();
  });

  it("accepts only safe same-site return paths", () => {
    expect(safeInAppReturnPath("/borrower/loans?tab=active")).toBe("/borrower/loans?tab=active");
    expect(safeInAppReturnPath("https://example.test/" )).toBeNull();
    expect(safeInAppReturnPath("//example.test/" )).toBeNull();
    expect(safeInAppReturnPath("/\\example.test" )).toBeNull();
    expect(safeInAppReturnPath("/login" )).toBeNull();
  });

  it("shows only navigation entries backed by active roles", () => {
    expect(getRoleNavigation(["BORROWER"])).toEqual([
      { label: "Overview", href: "/borrower" },
      { label: "Applications", href: "/borrower/applications" },
      { label: "Offers", href: "/borrower/offers" },
      { label: "Loans", href: "/borrower/loans" },
      { label: "Repayment history", href: "/borrower/repayments" },
      { label: "Wallet", href: "/borrower/wallet" },
    ]);
    expect(getRoleNavigation(["INVESTOR", "ADMIN"]).map(({ href }) => href)).toEqual([
      "/investor", "/investor/marketplace", "/investor/portfolio", "/investor/allocations", "/investor/payouts", "/investor/wallet", "/investor/recommendations",
      "/admin", "/admin/applications", "/admin/loans", "/admin/repayments", "/admin/payouts", "/admin/financial", "/admin/users", "/admin/audit-logs",
    ]);
  });
});
