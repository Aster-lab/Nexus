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
    { label: "Loans and repayments", href: "/borrower/loans" },
  ],
  INVESTOR: [
    { label: "Overview", href: "/investor" },
    { label: "Marketplace", href: "/investor/marketplace" },
    { label: "Portfolio", href: "/investor/portfolio" },
    { label: "Payout history", href: "/investor/payouts" },
    { label: "Wallet", href: "/investor/wallet" },
  ],
  ADMIN: [
    { label: "Operations", href: "/admin" },
    { label: "Applications", href: "/admin/applications" },
    { label: "Administration", href: "/admin/operations" },
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
