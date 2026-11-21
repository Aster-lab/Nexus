import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn(), getProviders: vi.fn(async () => null) }));
vi.mock("../../src/components/auth/auth-provider", () => ({ useAuth: () => ({ refresh: vi.fn() }) }));

import { LoginForm } from "../../src/components/auth/login-form";

describe("WP11 login experience", () => {
  it("provides a password visibility toggle with an accessible name", () => {
    const markup = renderToStaticMarkup(createElement(LoginForm));
    expect(markup).toContain('aria-label="Show password"');
    expect(markup).toContain('aria-pressed="false"');
  });
});
