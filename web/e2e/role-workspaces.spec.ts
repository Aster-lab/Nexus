import { expect, test } from "@playwright/test";

const roleWorkspaces = [
  {
    role: "borrower",
    email: process.env.E2E_BORROWER_EMAIL,
    password: process.env.E2E_BORROWER_PASSWORD,
    path: "/borrower",
    heading: /^welcome,/i,
  },
  {
    role: "investor",
    email: process.env.E2E_INVESTOR_EMAIL,
    password: process.env.E2E_INVESTOR_PASSWORD,
    path: "/investor",
    heading: /^welcome back,/i,
  },
  {
    role: "administrator",
    email: process.env.E2E_ADMIN_EMAIL,
    password: process.env.E2E_ADMIN_PASSWORD,
    path: "/admin",
    heading: /^welcome back,/i,
  },
] as const;

for (const workspace of roleWorkspaces) {
  test(`${workspace.role} can sign in and use the workspace at desktop and mobile widths`, async ({ page }) => {
    test.skip(!workspace.email || !workspace.password, `Set E2E credentials for ${workspace.role} in .env.staging.`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    await page.getByLabel("Email address").fill(workspace.email!);
    await page.getByLabel("Password", { exact: true }).fill(workspace.password!);
    await page.getByRole("button", { name: "Sign in securely" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(workspace.path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(workspace.heading);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(horizontalOverflow, `${workspace.role} workspace should not overflow horizontally at 390px`).toBe(false);
  });
}
