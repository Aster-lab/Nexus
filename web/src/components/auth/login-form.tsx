"use client";

import { signIn, getProviders } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "../ui/card";
import { Button, buttonVariants } from "../ui/button";
import { ApiClientError, apiPost } from "../../lib/client/api-client";
import { getRoleHomePath, safeInAppReturnPath } from "../../lib/client/auth-access";
import { useAuth } from "./auth-provider";

interface LoginResponse {
  id: string;
  email: string;
  roles: string[];
  expiresAt: string;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (searchParams.get("notice") === "signed-out") setNotice("You have been signed out.");
      if (searchParams.has("error")) {
        setError("Organization sign-in could not be completed. Try again or use email and password.");
      }
    });
    void getProviders().then((providers) => {
      if (active) setOauthAvailable(Boolean(providers?.["nexus-oidc"]));
    }).catch(() => { if (active) setOauthAvailable(false); });
    return () => { active = false; };
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await apiPost<LoginResponse, { email: string; password: string }>("/api/auth/login", {
        email: String(data.get("email") ?? "").trim(),
        password: String(data.get("password") ?? ""),
      });
      const identity = await refresh();
      if (!identity) throw new Error("Your sign-in succeeded, but we could not confirm your active account. Please try again.");
      const destination = safeInAppReturnPath(searchParams.get("returnTo")) ?? getRoleHomePath(identity.roles) ?? "/login";
      router.replace(destination);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError && requestError.status === 401
        ? "Email or password is incorrect. Check your details and try again."
        : requestError instanceof ApiClientError
          ? requestError.message
          : requestError instanceof Error ? requestError.message : "We could not sign you in. Please retry.");
    } finally {
      setPending(false);
    }
  }

  async function handleOAuth() {
    setError(null);
    setPending(true);
    await signIn("nexus-oidc", { callbackUrl: safeInAppReturnPath(searchParams.get("returnTo")) ?? "/dashboard" });
  }

  return (
    <Card role="region" aria-labelledby="nexus-login-title" className="w-full max-w-lg rounded-2xl shadow-xl shadow-black/5">
      <CardHeader className="gap-4 p-6 sm:p-9">
        <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck aria-hidden="true" className="size-5" /></div>
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1783c1]">Secure account access</p><h1 id="nexus-login-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome to NEXUS</h1><CardDescription className="mt-3 text-base leading-6">Sign in to continue to your borrower, investor, or administrator workspace.</CardDescription></div>
      </CardHeader>
      <CardContent className="px-6 pb-7 sm:px-9 sm:pb-9">
        {notice ? <p className="mb-4 rounded-lg border border-success/25 bg-success/10 p-3 text-sm text-success" role="status">{notice}</p> : null}
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-1.5"><label htmlFor="nexus-email" className="text-sm font-medium">Email address</label><input id="nexus-email" name="email" type="email" autoComplete="username" required maxLength={254} className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          <div className="grid gap-1.5"><label htmlFor="nexus-password" className="text-sm font-medium">Password</label><div className="relative">
            <input id="nexus-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128} className="h-11 w-full rounded-lg border border-input bg-background px-3 pr-12 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <button type="button" className="absolute inset-y-0 right-1 inline-flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
              {showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
            </button>
          </div></div>
          {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
          <Button className="mt-1 w-full bg-[#0a3c6e] text-white hover:bg-[#082f56]" size="lg" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in securely"}</Button>
        </form>
        {oauthAvailable ? <div className="mt-5 grid gap-3"><div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div><Button className="w-full" variant="outline" type="button" onClick={handleOAuth} disabled={pending}>Continue with organization sign-in</Button></div> : null}
        <p className="mt-6 text-sm leading-6 text-muted-foreground">Your account access is protected by NEXUS session controls.</p>
        <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">New to NEXUS? <Link className={buttonVariants({ variant: "ghost", size: "sm", className: "ml-1 px-1 text-primary" })} href="/register">Create an account</Link></p>
      </CardContent>
    </Card>
  );
}
