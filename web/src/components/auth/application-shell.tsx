"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiClientError, apiRequest } from "../../lib/client/api-client";
import { useAuth } from "./auth-provider";
import { NotificationCenter } from "../shared/notification-center";
import { DemoEnvironmentBanner } from "../shared/demo-environment-banner";
import { WorkspaceSidebar } from "./workspace-sidebar";
import type { NexusRole } from "../../lib/client/auth-access";

export function ApplicationShell({ children, demoMode = false }: { children: React.ReactNode; demoMode?: boolean }) {
  const { identity, status } = useAuth();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    function addResponsiveLabels(table: HTMLTableElement) {
      const headers = Array.from(table.tHead?.rows[0]?.cells ?? []).map((cell) => cell.textContent?.trim() ?? "");
      if (!headers.length) return;
      table.setAttribute("role", "table");
      table.tHead?.setAttribute("role", "rowgroup");
      Array.from(table.tBodies).forEach((body) => body.setAttribute("role", "rowgroup"));
      if (table.tHead) {
        for (const headerRow of Array.from(table.tHead.rows)) {
          headerRow.setAttribute("role", "row");
          for (const cell of Array.from(headerRow.cells)) cell.setAttribute("role", "columnheader");
        }
      }
      for (const body of Array.from(table.tBodies)) {
        for (const row of Array.from(body.rows)) {
          if (row.closest("table") !== table) continue;
          row.setAttribute("role", "row");
          Array.from(row.cells).forEach((cell, index) => {
            if (headers[index]) cell.dataset.label = headers[index];
            cell.setAttribute("role", cell instanceof HTMLTableCellElement && cell.tagName === "TH" ? "rowheader" : "cell");
          });
        }
      }
    }

    function tablesWithin(node: Node): Set<HTMLTableElement> {
      const tables = new Set<HTMLTableElement>();
      if (!(node instanceof Element)) return tables;
      if (node instanceof HTMLTableElement) tables.add(node);
      node.querySelectorAll("table").forEach((table) => tables.add(table));
      const parentTable = node.closest("table");
      if (parentTable) tables.add(parentTable);
      return tables;
    }

    document.querySelectorAll("table").forEach((table) => addResponsiveLabels(table));
    const observer = new MutationObserver((records) => {
      const tables = new Set<HTMLTableElement>();
      for (const record of records) {
        tablesWithin(record.target).forEach((table) => tables.add(table));
        record.addedNodes.forEach((node) => tablesWithin(node).forEach((table) => tables.add(table)));
      }
      tables.forEach(addResponsiveLabels);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const workspaceRole: NexusRole | null = pathname.startsWith("/admin") && identity?.roles.includes("ADMIN") ? "ADMIN"
    : pathname.startsWith("/borrower") && identity?.roles.includes("BORROWER") ? "BORROWER"
      : pathname.startsWith("/investor") && identity?.roles.includes("INVESTOR") ? "INVESTOR" : null;

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await apiRequest<{ signedOut: boolean }>("/api/auth/logout", { method: "POST" });
      window.location.replace("/login?notice=signed-out");
    } catch (error) {
      setSignOutError(error instanceof ApiClientError ? error.message : "We could not sign you out. Please retry.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <header className="nexus-shell-header">
        <Link className="nexus-brand" href={identity ? "/dashboard" : "/"} aria-label="NEXUS home">NEXUS</Link>
        {!identity && <nav className="nexus-shell-nav" aria-label="Main navigation">
          {status === "unauthenticated" && <Link href="/login">Sign in</Link>}
          {status === "unauthenticated" && <Link href="/register">Register</Link>}
        </nav>}
        <div className="nexus-shell-account">
          {identity ? <span className="nexus-shell-account__email">{identity.email}</span> : null}
          {identity ? <NotificationCenter roles={identity.roles} /> : null}
          {identity ? <button type="button" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button> : null}
        </div>
      </header>
      {demoMode ? <DemoEnvironmentBanner /> : null}
      {signOutError ? <p className="nexus-shell-error" role="alert">{signOutError}</p> : null}
      <div className="nexus-shell-body">
        {workspaceRole ? <WorkspaceSidebar role={workspaceRole} /> : null}
        <div className="nexus-main">{children}</div>
      </div>
    </>
  );
}
