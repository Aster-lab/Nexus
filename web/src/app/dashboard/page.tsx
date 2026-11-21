"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorState, LoadingState } from "../../components/ui/request-state";
import { useAuth } from "../../components/auth/auth-provider";
import { getRoleHomePath } from "../../lib/client/auth-access";

export default function DashboardPage() {
  const { identity, status, refresh } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    if (status === "authenticated" && identity) {
      router.replace(getRoleHomePath(identity.roles) ?? "/login");
    }
  }, [identity, router, status]);

  if (status === "error") return <ErrorState title="Workspace unavailable" message="We could not confirm your account. Retry to check your secure session." />;
  return <div className="nexus-page-container">
    <LoadingState label="Opening your NEXUS workspace…" />
    <button className="nexus-text-button" type="button" onClick={() => void refresh()}>Retry session check</button>
  </div>;
}
