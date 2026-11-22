"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
