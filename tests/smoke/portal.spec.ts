import { test, expect, type Page } from "@playwright/test";

const SMOKE_SLUG = "smoke-e2e";
const PORTAL_TESTER_EMAIL = "portal.tester@smoke.example.com";

// OTP login via the dev-peek endpoint (enabled through DEV_OTP_PEEK_ENABLED
// in playwright.config.ts) — the UI flow is exercised for real; only the
// email inbox is bypassed. dev-peek must be called AFTER the UI's own
// request so its freshly issued code is the latest one.
async function loginToPortal(page: Page) {
  await page.goto(`/portal/${SMOKE_SLUG}`);
  await page.locator("#email").fill(PORTAL_TESTER_EMAIL);
  await page.getByRole("button", { name: "Send me a code" }).click();
  // The OTP request endpoint throttles per email; a CI retry of this test
  // can land inside the window ("Please wait N seconds…"). Give it one
  // more attempt after the window clears.
  try {
    await expect(page.locator("#otp")).toBeVisible({ timeout: 10_000 });
  } catch {
    await page.waitForTimeout(6_000);
    await page.getByRole("button", { name: "Send me a code" }).click();
    await expect(page.locator("#otp")).toBeVisible();
  }

  const res = await page.request.get(
    `/api/portal/${SMOKE_SLUG}/otp/dev-peek?email=${encodeURIComponent(
      PORTAL_TESTER_EMAIL
    )}`
  );
  expect(res.ok(), "dev-peek must be enabled (DEV_OTP_PEEK_ENABLED)").toBe(
    true
  );
  const { code } = (await res.json()) as { code: string };

  // Typing the 6th digit auto-submits the verify call.
  await page.locator("#otp").fill(code);
  await expect(page.getByText("Registration Status")).toBeVisible();
}

// One combined journey (login → status → phase submit) rather than separate
// tests: the OTP request endpoint rate-limits per email, so logging in once
// per test would throttle the second test.
test("attendee can log into the portal and submit a phase", async ({
  page,
}) => {
  await loginToPortal(page);

  // Status card shows the seeded registration as confirmed.
  await expect(page.getByText("Confirmed")).toBeVisible();

  // Open the seeded "Travel Info" phase from the Additional Information card.
  await page.getByRole("link", { name: /Fill in|Edit/ }).click();
  await expect(
    page.getByRole("heading", { name: "Travel Info" })
  ).toBeVisible();

  // Fill the required field and submit (single-step phase → one button).
  await page.locator("#airline").fill("Smoke Airlines");
  await page.getByRole("button", { name: /Submit|Update/ }).click();

  // Fullscreen "Saved" confirmation, then back on the portal home the
  // phase shows as completed. Navigate by URL rather than the "Back to
  // portal" link: the success screen re-renders as it appears and a click
  // during that re-render can be swallowed (observed on CI's slower dev
  // server) — a direct load asserts the same end state without the race.
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
  await page.goto(`/portal/${SMOKE_SLUG}`);
  await expect(page.getByText("Completed")).toBeVisible();
});
