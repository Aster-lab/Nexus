import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypassSecret) return;

  const baseOrigin = new URL(process.env.E2E_BASE_URL!).origin;
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== baseOrigin) {
      await route.continue();
      return;
    }

    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-vercel-protection-bypass": bypassSecret,
        "x-vercel-set-bypass-cookie": "true",
      },
    });
  });
});

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

const STAGING_LOGIN_TIMEOUT_MS = 30_000;

for (const workspace of roleWorkspaces) {
  test(`${workspace.role} can sign in and use the workspace at desktop and mobile widths`, async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!workspace.email || !workspace.password, `Set E2E credentials for ${workspace.role} in .env.staging.`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    await page.getByLabel("Email address").fill(workspace.email!);
    await page.getByLabel("Password", { exact: true }).fill(workspace.password!);
    const loginResponse = page.waitForResponse((response) => {
      const responseUrl = new URL(response.url());
      return responseUrl.origin === new URL(process.env.E2E_BASE_URL!).origin &&
        responseUrl.pathname === "/api/auth/login";
    }, { timeout: STAGING_LOGIN_TIMEOUT_MS });
    await page.getByRole("button", { name: "Sign in securely" }).click();
    const response = await loginResponse;
    expect(response.ok(), `NEXUS login API returned HTTP ${response.status()} for ${workspace.role}.`).toBe(true);

    await expect.poll(() => new URL(page.url()).pathname, {
      timeout: STAGING_LOGIN_TIMEOUT_MS,
      message: `${workspace.role} login should redirect to ${workspace.path}.`,
    }).toBe(workspace.path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(workspace.heading);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(horizontalOverflow, `${workspace.role} workspace should not overflow horizontally at 390px`).toBe(false);
  });
}
