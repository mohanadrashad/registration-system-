import { defineConfig, devices } from "@playwright/test";

// Smoke tests for the three attendee-facing flows (register, portal login,
// phase submit). They run against the dev server and the database in
// DATABASE_URL, using the dedicated `smoke-e2e` event — seed it first with
// `npm run seed:smoke`.
//
// DEV_OTP_PEEK_ENABLED lets the portal test fetch the login code from the
// staging-only dev-peek endpoint instead of an inbox. The dev server never
// runs with NODE_ENV=production, so the endpoint's production gate stays
// intact.
export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // One worker: the flows share the seeded event and the OTP rate limiter
  // is per-email, so parallel runs would trip each other.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...(process.env as Record<string, string>),
      DEV_OTP_PEEK_ENABLED: "true",
    },
  },
});
