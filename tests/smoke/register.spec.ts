import { test, expect } from "@playwright/test";

const SMOKE_SLUG = "smoke-e2e";

// The public registration flow: load the form, fill the three required
// fields, submit, land on the success screen. The page defaults to Arabic,
// so the success assertion accepts either language.
test("visitor can register through the public form", async ({ page }) => {
  await page.goto(`/register/${SMOKE_SLUG}`);

  // Field inputs carry id={FormField.name} — language-independent hooks.
  await page.locator("#firstName").fill("Smoke");
  await page.locator("#lastName").fill("Visitor");
  await page
    .locator("#email")
    .fill(`smoke+${Date.now()}@example.com`);

  // .submit-button is a load-bearing class (customCss targets it) — the
  // most stable submit hook across languages.
  await page.locator("button.submit-button").click();

  await expect(
    page.getByText(/تم التسجيل بنجاح|Registration Successful/)
  ).toBeVisible();
});
