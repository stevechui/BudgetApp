import { expect, type Locator, type Page } from "@playwright/test";

/** A short suffix so names created by one run never collide with another. */
export function unique(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** Navigate and wait until streaming and hydration have settled. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

export function row(page: Page, text: string) {
  return page.getByRole("row").filter({ hasText: text });
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

/** Pick an option from a Radix Select trigger. */
export async function choose(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Pick an account in a dialog's account select. */
export async function pickAccount(page: Page, scope: Locator, name = "Main Account") {
  await choose(page, scope.getByRole("combobox", { name: "Account", exact: true }), name);
}

/** Pick a category from the searchable category picker. */
export async function pickCategory(page: Page, trigger: Locator, name: string) {
  await trigger.click();
  await page.getByPlaceholder("Search categories...").fill(name);
  await page.getByRole("option", { name, exact: true }).click();
}
