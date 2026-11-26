import { expect, test } from "@playwright/test";

// Test accounts from tests/supabase/seed.py.
const PASSWORD = "factory-test-password";

async function signIn(page, email) {
  await page.goto("/");
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByPlaceholder("At least 6 characters").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("a builder signs in and opens a site ledger", async ({ page }) => {
  await signIn(page, "builder@nirman.test");
  await expect(
    page.getByRole("heading", { name: "Your sites" }),
  ).toBeVisible();

  await page
    .getByRole("region", { name: "Active sites" })
    .getByRole("link", { name: /Lakeview Villa/ })
    .click();

  await expect(page.getByText("Kerala Cement Traders")).toBeVisible();
});

test("a supervisor with one site lands on it", async ({ page }) => {
  await signIn(page, "supervisor@nirman.test");

  await expect(page).toHaveURL(/\/sites\/00000000-0000-4000-8002-000000000001$/);
  await expect(page.getByText("Suresh Masonry")).toBeVisible();
});
