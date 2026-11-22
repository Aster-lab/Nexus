import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) {
  throw new Error("Set E2E_BASE_URL to the NEXUS staging URL (or a local URL) before running browser E2E.");
}

const parsedBaseURL = new URL(baseURL);
const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(parsedBaseURL.hostname);
if (parsedBaseURL.protocol !== "https:" && !isLoopback) {
  throw new Error("E2E_BASE_URL must use HTTPS except when targeting a loopback development server.");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: "./test-results/e2e",
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
