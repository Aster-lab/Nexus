"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import type { NexusRole } from "../../lib/client/auth-access";

const WORKSPACES: Record<NexusRole, { label: string; href: string }> = {
  BORROWER: { label: "Borrower", href: "/borrower" },
  INVESTOR: { label: "Investor", href: "/investor" },
  ADMIN: { label: "Administrator", href: "/admin" },
};

function isNexusRole(role: string): role is NexusRole {
  return role === "BORROWER" || role === "INVESTOR" || role === "ADMIN";
}

export function WorkspaceSwitcher({ roles }: { roles: readonly string[] }) {
  const pathname = usePathname();
  const workspaces = [...new Set(roles.filter(isNexusRole))];
  // Borrower/investor switching is available only when both self-service roles
  // were selected or subsequently enabled. Administrator alone is not a switch.
  if (!roles.includes("BORROWER") || !roles.includes("INVESTOR")) return null;

  const activeRole = workspaces.find((role) => {
    const root = WORKSPACES[role].href;
    return pathname === root || pathname.startsWith(`${root}/`);
  });

  return <details className="nexus-workspace-switcher">
    <summary aria-label="Switch workspace" title="Switch workspace">
      <span>{activeRole ? `${WORKSPACES[activeRole].label} workspace` : "Choose workspace"}</span>
      <ChevronsUpDown aria-hidden="true" size={16} />
    </summary>
    <nav className="nexus-workspace-switcher__options" aria-label="Available workspaces">
      {workspaces.map((role) => {
        const workspace = WORKSPACES[role];
        const active = role === activeRole;
        return <Link key={role} href={workspace.href} aria-current={active ? "page" : undefined} onClick={(event) => {
          const details = event.currentTarget.closest("details");
          if (details) details.open = false;
        }}>
          <span>{workspace.label} workspace</span>
          {active ? <Check aria-label="Current workspace" size={16} /> : null}
        </Link>;
      })}
    </nav>
  </details>;
}
