import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RegistrationForm } from "../../src/components/auth/registration-form";

describe("WP11 registration experience", () => {
  it("guides account creation with role choice, progress, and accessible password visibility control", () => {
    const markup = renderToStaticMarkup(createElement(RegistrationForm));

    expect(markup).toContain("Create your NEXUS account");
    expect(markup).toContain("Step 1 of 3");
    expect(markup).toContain('aria-label="Show password"');
    expect(markup).toContain("Borrower account");
    expect(markup).toContain("Investor account");
    expect(markup).toContain("You can choose both");
    expect(markup).toContain("Administrator access is provisioned securely");
  });

  it("communicates the password policy and account email expectations", () => {
    const markup = renderToStaticMarkup(createElement(RegistrationForm));

    expect(markup).toContain("12–128 characters");
    expect(markup).toContain('type="email"');
    expect(markup).toContain("We use this email for sign-in and account updates.");
  });
});
