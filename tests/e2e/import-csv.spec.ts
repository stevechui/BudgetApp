import { expect, test } from "@playwright/test";
import { choose, expectToast, open, pickCategory, row, unique } from "./helpers";

test.describe("CSV import", () => {
  test("maps the file's category column onto existing categories", async ({ page }) => {
    const prefix = unique("CSVIMP");
    const csv = [
      "Date,Description,Category,Amount",
      `2026-01-05,${prefix} SAFEWAY,Supermarkets,-82.15`,
      `2026-01-06,${prefix} BLUE BOTTLE,Coffee,-4.50`,
      `2026-01-07,${prefix} GIZMO SHOP,Widgets & Gizmos,-19.99`,
      `2026-01-08,${prefix} TRADER JOES,supermarkets,-12.00`,
    ].join("\n");

    await open(page, "/import");
    await page.locator('input[type="file"]').setInputFiles({
      name: "bank.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await choose(page, page.locator("#import-account"), "Main Account");

    const mappings = page.getByTestId("category-mapping");
    await expect(mappings).toHaveCount(3);
    const supermarkets = mappings.filter({ hasText: "Supermarkets" });
    await expect(supermarkets).toContainText("2 rows");
    await expect(supermarkets).toContainText("Close match");
    await expect(supermarkets.getByRole("button", { name: "Groceries" })).toBeVisible();
    await expect(mappings.filter({ hasText: "Coffee" })).toContainText("Exact match");

    const gizmos = mappings.filter({ hasText: "Widgets & Gizmos" });
    await expect(gizmos).toContainText("No match");
    await expect(page.getByText("Fix 1 row before importing")).toBeVisible();

    await pickCategory(page, gizmos.getByRole("button", { name: "Pick a category" }), "Hobbies");
    await expect(gizmos).toContainText("Mapped");
    await expect(page.getByText("From CSV")).toHaveCount(4);

    // Resetting returns the value to unmatched
    await gizmos.getByRole("button", { name: "Reset mapping for Widgets & Gizmos" }).click();
    await expect(gizmos).toContainText("No match");
    await pickCategory(page, gizmos.getByRole("button", { name: "Pick a category" }), "Hobbies");

    await page.getByRole("button", { name: "Import 4 transactions" }).click();
    await expectToast(page, "Imported 4 transactions");
    await expect(page).toHaveURL(/\/transactions/);

    await open(page, `/transactions?q=${encodeURIComponent(prefix)}`);
    await expect(row(page, `${prefix} SAFEWAY`)).toContainText("Groceries");
    await expect(row(page, `${prefix} TRADER JOES`)).toContainText("Groceries");
    await expect(row(page, `${prefix} BLUE BOTTLE`)).toContainText("Coffee");
    await expect(row(page, `${prefix} GIZMO SHOP`)).toContainText("Hobbies");
  });
});
