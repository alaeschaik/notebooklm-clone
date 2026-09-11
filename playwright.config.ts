import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

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
  // Starts a server only if nothing is already serving BASE_URL, so a local
  // run against `npm run dev` or a running container just works. CI has no
  // server up, so it starts the production build these tests should exercise.
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
