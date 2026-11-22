export type NexusRole = "BORROWER" | "INVESTOR" | "ADMIN";

export interface RoleNavigationItem {
  label: string;
  href: string;
}

const ROLE_HOME: Record<NexusRole, string> = {
  ADMIN: "/admin",
  BORROWER: "/borrower",
  INVESTOR: "/investor",
};

const ROLE_NAVIGATION: Record<NexusRole, RoleNavigationItem[]> = {
  BORROWER: [
    { label: "Overview", href: "/borrower" },
    { label: "Applications", href: "/borrower/applications" },
    { label: "Offers", href: "/borrower/offers" },
    { label: "Loans", href: "/borrower/loans" },
    { label: "Repayment history", href: "/borrower/repayments" },
    { label: "Wallet", href: "/borrower/wallet" },
    { label: "User guide", href: "/borrower/guide" },
  ],
  INVESTOR: [
    { label: "Overview", href: "/investor" },
    { label: "Marketplace", href: "/investor/marketplace" },
    { label: "Portfolio", href: "/investor/portfolio" },
    { label: "Allocations", href: "/investor/allocations" },
    { label: "Payout history", href: "/investor/payouts" },
    { label: "Wallet", href: "/investor/wallet" },
    { label: "Recommendations", href: "/investor/recommendations" },
    { label: "User guide", href: "/investor/guide" },
  ],
  ADMIN: [
    { label: "Dashboard", href: "/admin" },
    { label: "Applications", href: "/admin/applications" },
    { label: "Loans", href: "/admin/loans" },
    { label: "Repayments", href: "/admin/repayments" },
    { label: "Investor payouts", href: "/admin/payouts" },
    { label: "Financial overview", href: "/admin/financial" },
    { label: "Policies", href: "/admin/policies" },
    { label: "Users", href: "/admin/users" },
    { label: "Audit logs", href: "/admin/audit-logs" },
    { label: "User guide", href: "/admin/guide" },
  ],
};

const ROLE_PATH: Record<NexusRole, string> = {
  BORROWER: "/borrower",
  INVESTOR: "/investor",
  ADMIN: "/admin",
};

export function getRoleHomePath(roles: readonly string[]): string | null {
  for (const role of ["ADMIN", "BORROWER", "INVESTOR"] as const) {
    if (roles.includes(role)) return ROLE_HOME[role];
  }
  return null;
}

export function canAccessRolePath(roles: readonly string[], pathname: string): boolean {
  return (Object.keys(ROLE_PATH) as NexusRole[]).some((role) =>
    roles.includes(role) && (pathname === ROLE_PATH[role] || pathname.startsWith(`${ROLE_PATH[role]}/`)),
  );
}

export function getRoleNavigation(roles: readonly string[]): RoleNavigationItem[] {
  return (["BORROWER", "INVESTOR", "ADMIN"] as const)
    .filter((role) => roles.includes(role))
    .flatMap((role) => ROLE_NAVIGATION[role]);
}

export function safeInAppReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.startsWith("/login")) {
    return null;
  }
  return value;
}
