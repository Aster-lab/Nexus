"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowLeftToLine, ArrowRightToLine, Banknote, Bell, BriefcaseBusiness, ClipboardCheck, FileText, LayoutDashboard, Landmark, Lightbulb, ScrollText, WalletCards, X, Users } from "lucide-react";
import { useState } from "react";
import { getRoleNavigation, type NexusRole } from "../../lib/client/auth-access";
import { cn } from "../../lib/utils";

const ICONS: Record<string, typeof LayoutDashboard> = {
  Overview: LayoutDashboard, Dashboard: LayoutDashboard, Applications: FileText, Offers: ClipboardCheck,
  Loans: Landmark, "Loans and repayments": Landmark, "Repayment history": Activity, Repayments: Activity,
  Marketplace: Banknote, Portfolio: BriefcaseBusiness, Allocations: ClipboardCheck,
  "Payout history": Banknote, "Investor payouts": Banknote, Wallet: WalletCards,
  Recommendations: Lightbulb, "Financial overview": ClipboardCheck, Users, "Audit logs": ScrollText,
};

export function WorkspaceSidebar({ role }: { role: NexusRole }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigation = getRoleNavigation([role]);
  const roleName = role === "ADMIN" ? "Administrator" : role === "BORROWER" ? "Borrower" : "Investor";

  return <>
    <button type="button" className="workspace-sidebar-mobile-trigger" aria-expanded={mobileOpen} aria-controls="workspace-sidebar" onClick={() => setMobileOpen(true)}>
      <LayoutDashboard size={18} aria-hidden="true" /> <span>Workspace menu</span>
    </button>
    {mobileOpen ? <button type="button" className="workspace-sidebar-backdrop" aria-label="Close navigation menu" onClick={() => setMobileOpen(false)} /> : null}
    <aside id="workspace-sidebar" className={cn("workspace-sidebar", collapsed && "workspace-sidebar--collapsed", mobileOpen && "workspace-sidebar--mobile-open")} aria-label={`${roleName} workspace`}>
      <div className="workspace-sidebar__top">
        <span className="workspace-sidebar__section" aria-label={`${roleName} workspace`}>
          {collapsed ? roleName.slice(0, 1) : <><strong>{roleName}</strong><small>Workspace</small></>}
        </span>
        <button type="button" className="workspace-sidebar__toggle workspace-sidebar__desktop-toggle" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ArrowRightToLine size={18} /> : <ArrowLeftToLine size={18} />}
        </button>
        <button type="button" className="workspace-sidebar__toggle workspace-sidebar__mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu"><X size={18} /></button>
      </div>
      <nav className="workspace-sidebar__links" aria-label={`${roleName} navigation`}>
        {navigation.map(({ href, label }) => {
          const current = href === `/${role.toLowerCase()}` ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          const Icon = ICONS[label] ?? Bell;
          return <Link key={href} href={href} onClick={() => setMobileOpen(false)} aria-current={current ? "page" : undefined} title={collapsed ? label : undefined} className={cn("workspace-sidebar__link", current && "workspace-sidebar__link--active")}>
            <Icon size={19} aria-hidden="true" /><span>{label}</span>
          </Link>;
        })}
      </nav>
    </aside>
  </>;
}
