"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ErrorState, LoadingState } from "../ui/request-state";
import { useAuth } from "./auth-provider";
import { canAccessRolePath, getRoleHomePath } from "../../lib/client/auth-access";

export function RoleGuard({ children }: { children: ReactNode }) {
  const { identity, status, refresh } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    if (status === "authenticated" && identity && !canAccessRolePath(identity.roles, pathname)) {
      router.replace(getRoleHomePath(identity.roles) ?? "/login");
    }
  }, [identity, pathname, router, status]);

  if (status === "loading") return <LoadingState label="Checking your secure session…" />;
  if (status === "error") return <section className="nexus-page-container">
    <ErrorState title="Session check interrupted" message="Your session could not be confirmed. Retry to safely continue." />
    <button className="nexus-button nexus-button--secondary" type="button" onClick={() => void refresh()}>Retry session check</button>
  </section>;
  if (status !== "authenticated" || !identity || !canAccessRolePath(identity.roles, pathname)) return null;
  return <>{children}</>;
}
