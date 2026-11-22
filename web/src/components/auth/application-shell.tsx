"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "../../lib/client/api-client";
import { useAuth } from "./auth-provider";
import { NotificationCenter } from "../shared/notification-center";
import { DemoEnvironmentBanner } from "../shared/demo-environment-banner";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { NexusMark } from "../shared/nexus-mark";
import type { NexusRole } from "../../lib/client/auth-access";

export function ApplicationShell({ children, demoMode = false }: { children: React.ReactNode; demoMode?: boolean }) {
  const { identity, status } = useAuth();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [navigationPending, setNavigationPending] = useState(false);
  const navigationTimeout = useRef<number | null>(null);

  useEffect(() => {
    function startNavigation() {
      setNavigationPending(true);
      if (navigationTimeout.current !== null) window.clearTimeout(navigationTimeout.current);
      navigationTimeout.current = window.setTimeout(() => setNavigationPending(false), 5_000);
    }

    function handleInternalLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target && link.target !== "_self" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const current = `${window.location.pathname}${window.location.search}`;
      const next = `${destination.pathname}${destination.search}`;
      if (next !== current) startNavigation();
    }

    document.addEventListener("click", handleInternalLink, true);
    window.addEventListener("popstate", startNavigation);
    return () => {
      document.removeEventListener("click", handleInternalLink, true);
      window.removeEventListener("popstate", startNavigation);
      if (navigationTimeout.current !== null) window.clearTimeout(navigationTimeout.current);
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (navigationTimeout.current !== null) window.clearTimeout(navigationTimeout.current);
      navigationTimeout.current = null;
      setNavigationPending(false);
    });
  }, [pathname]);

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
            if (headers[index] && cell.dataset.label !== headers[index]) cell.dataset.label = headers[index];
            const role = cell instanceof HTMLTableCellElement && cell.tagName === "TH" ? "rowheader" : "cell";
            if (cell.getAttribute("role") !== role) cell.setAttribute("role", role);
          });
        }
      }
    }

    function queueTablesWithin(node: Node, pending: Set<HTMLTableElement>) {
      if (!(node instanceof Element)) return;
      if (node instanceof HTMLTableElement) pending.add(node);
      node.querySelectorAll("table").forEach((table) => pending.add(table));
    }

    document.querySelectorAll("table").forEach((table) => addResponsiveLabels(table));
    const pendingTables = new Set<HTMLTableElement>();
    let frame = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof Element) {
          const parentTable = record.target instanceof HTMLTableElement ? record.target : record.target.closest("table");
          if (parentTable) pendingTables.add(parentTable);
        }
        record.addedNodes.forEach((node) => queueTablesWithin(node, pendingTables));
      }
      if (!frame && pendingTables.size) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          pendingTables.forEach(addResponsiveLabels);
          pendingTables.clear();
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      pendingTables.clear();
    };
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
      {navigationPending ? <div className="nexus-navigation-progress" role="progressbar" aria-label="Loading page" /> : null}
      <header className="nexus-shell-header">
        <Link className="nexus-brand" href={identity ? "/dashboard" : "/"} aria-label="NEXUS home"><NexusMark size={25} /><span>NEXUS</span></Link>
        {!identity && <nav className="nexus-shell-nav" aria-label="Main navigation">
          {status === "unauthenticated" && <Link href="/login">Sign in</Link>}
          {status === "unauthenticated" && <Link href="/register">Register</Link>}
        </nav>}
        <div className="nexus-shell-account">
          {identity ? <span className="nexus-shell-account__email">{identity.email}</span> : null}
          {identity ? <WorkspaceSwitcher roles={identity.roles} /> : null}
          {identity ? <Link className="nexus-profile-link" href="/profile">Profile</Link> : null}
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
