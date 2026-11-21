"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiClientError, apiGet } from "../../lib/client/api-client";

export interface AuthIdentity {
  id: string;
  email: string;
  roles: string[];
  borrowerProfile: { id: string; legalName: string; phone: string | null } | null;
  investorProfile: { id: string; displayName: string } | null;
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthContextValue {
  identity: AuthIdentity | null;
  status: AuthStatus;
  error: string | null;
  refresh: () => Promise<AuthIdentity | null>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const signOut = useCallback(() => {
    requestSequence.current += 1;
    setIdentity(null);
    setError(null);
    setStatus("unauthenticated");
  }, []);

  const refresh = useCallback(async (): Promise<AuthIdentity | null> => {
    const requestId = ++requestSequence.current;
    setStatus("loading");
    setError(null);
    try {
      const response = await apiGet<AuthIdentity>("/api/auth/me", { onUnauthorized: signOut });
      if (requestId !== requestSequence.current) return null;
      setIdentity(response.data);
      setStatus("authenticated");
      return response.data;
    } catch (requestError) {
      if (requestId !== requestSequence.current) return null;
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        signOut();
        return null;
      }
      setIdentity(null);
      setStatus("error");
      setError(requestError instanceof ApiClientError
        ? requestError.message
        : "We could not confirm your sign-in. Check your connection and try again.");
      return null;
    }
  }, [signOut]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  const value = useMemo(() => ({ identity, status, error, refresh, signOut }), [identity, status, error, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
