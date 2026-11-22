"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Banknote, ClipboardCheck, FileText, Landmark, LayoutDashboard, ScrollText, Users, ShieldCheck } from "lucide-react";
import { cn } from "../../lib/utils";

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/applications", label: "Applications", icon: FileText },
  { href: "/admin/loans", label: "Loans", icon: Landmark },
  { href: "/admin/repayments", label: "Repayments", icon: Activity },
  { href: "/admin/payouts", label: "Investor payouts", icon: Banknote },
  { href: "/admin/financial", label: "Financial overview", icon: ClipboardCheck },
  { href: "/admin/policies", label: "Policies", icon: ShieldCheck },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
];

export function AdminNavigation() {
  const pathname = usePathname();
  return <nav className="admin-navigation" aria-label="Administrator sections">
    <p className="admin-navigation__label">Operations</p>
    {adminLinks.map(({ href, label, icon: Icon }) => {
      const current = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
      return <Link className={cn("admin-navigation__link", current && "admin-navigation__link--active")} href={href} key={href} aria-current={current ? "page" : undefined}>
        <Icon size={17} aria-hidden="true" /><span>{label}</span>
      </Link>;
    })}
  </nav>;
}
