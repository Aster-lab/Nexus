"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiClientError, apiRequest } from "../../lib/client/api-client";
import { getRoleNavigation } from "../../lib/client/auth-access";
import { useAuth } from "./auth-provider";
import { NotificationCenter } from "../shared/notification-center";
import { DemoEnvironmentBanner } from "../shared/demo-environment-banner";

export function ApplicationShell({ children, demoMode = false }: { children: React.ReactNode; demoMode?: boolean }) {
  const { identity, status } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const navigation = identity ? getRoleNavigation(identity.roles) : [];

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
        <nav className="nexus-shell-nav" aria-label="Main navigation">
          {navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          {status === "unauthenticated" && <Link href="/login">Sign in</Link>}
          {status === "unauthenticated" && <Link href="/register">Register</Link>}
        </nav>
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
      <main className="nexus-main">{children}</main>
    </>
  );
}
