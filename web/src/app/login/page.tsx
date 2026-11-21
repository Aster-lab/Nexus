import { Suspense } from "react";
import { LoginForm } from "../../components/auth/login-form";
import { LoadingState } from "../../components/ui/request-state";

export default function LoginPage() {
  return <div className="nexus-auth-page">
    <Suspense fallback={<LoadingState label="Preparing secure sign-in…" />}>
      <LoginForm />
    </Suspense>
  </div>;
}
