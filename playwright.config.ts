import { defineConfig, devices } from "@playwright/test";

/**
 * An explicit E2E_BASE_URL means we are testing something already deployed —
 * the smoke run against staging. Nothing should be built or started locally
 * then; the point is to exercise the instance the pipeline just rolled out.
 */
const DEPLOYED_TARGET = process.env.E2E_BASE_URL;
const BASE_URL = DEPLOYED_TARGET ?? "http://localhost:3000";

/**
 * These are smoke tests, not a second copy of the unit suite. They exist to
 * catch what unit tests structurally cannot: server-rendering crashes,
 * hydration mismatches, and layout that silently fails to fill the viewport —
 * each of which has actually shipped in this project at least once.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Locally this reuses whatever already serves BASE_URL, and in CI it starts
  // the production build the tests should exercise. Against a deployed target
  // there is nothing to start.
  webServer: DEPLOYED_TARGET
    ? undefined
    : {
        command: process.env.CI ? "npm run start" : "npm run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
