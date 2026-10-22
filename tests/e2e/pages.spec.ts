import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("dashboard renders its summary and recent transactions", async ({ page }) => {
  await open(page, "/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(/^Income · /)).toBeVisible();
  await expect(page.getByText("Last 6 months")).toBeVisible();
  await expect(page.getByText("Recent transactions")).toBeVisible();
});

test("reports switch between weekly, monthly and quarterly", async ({ page }) => {
  await open(page, "/reports");
  await expect(page.getByText("Monthly income vs. expense")).toBeVisible();
  await expect(page.locator(".recharts-surface").first()).toBeVisible();

  await page.getByRole("tab", { name: "Weekly" }).click();
  await expect(page).toHaveURL(/period=week/);
  await expect(page.getByText("Weekly income vs. expense")).toBeVisible();

  await page.getByRole("tab", { name: "Quarterly" }).click();
  await expect(page).toHaveURL(/period=quarter/);
  await expect(page.getByText("Quarterly income vs. expense")).toBeVisible();

  await page.getByRole("tab", { name: "Income", exact: true }).click();
  await expect(page).toHaveURL(/show=income/);
  await expect(page.getByText("Quarterly income by category group")).toBeVisible();
});

test("navigation links reach every page", async ({ page }) => {
  await open(page, "/");
  for (const [link, heading] of [
    ["Transactions", "Transactions"],
    ["Reports", "Reports"],
    ["Categories", "Categories"],
    ["Category Groups", "Category Groups"],
    ["Dashboard", "Dashboard"],
  ]) {
    await page.getByRole("navigation").getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
  }
});
