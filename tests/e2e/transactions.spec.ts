import { expect, test, type Page } from "@playwright/test";
import { expectToast, open, pickCategory, row, unique } from "./helpers";

async function search(page: Page, text: string) {
  await open(page, `/transactions?q=${encodeURIComponent(text)}`);
}

test.describe("transactions", () => {
  test("add, filter, edit, recategorize and delete a transaction", async ({ page }) => {
    const description = unique("Safeway");
    await open(page, "/transactions");

    // Create
    await page.getByRole("button", { name: "Add transaction" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Date").fill("2026-03-15");
    await dialog.getByLabel("Amount").fill("42.50");
    await dialog.getByLabel("Description").fill(description);
    await pickCategory(page, dialog.getByRole("button", { name: "Select a category" }), "Groceries");
    await expect(dialog.getByRole("tab", { name: /Debit/ })).toHaveAttribute("aria-selected", "true");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Transaction added");
    await expect(dialog).toBeHidden();

    // Read, through the search filter in the UI
    await page.getByPlaceholder("Description").fill(description);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByText("1 transaction", { exact: true })).toBeVisible();
    const tx = row(page, description);
    await expect(tx).toContainText("Mar 15, 2026");
    await expect(tx).toContainText("-$42.50");
    await expect(tx).toContainText("Groceries");

    // Update through the edit dialog
    await tx.getByRole("button", { name: "Edit" }).click();
    await expect(dialog.getByLabel("Amount")).toHaveValue("42.50");
    await dialog.getByLabel("Amount").fill("50");
    await dialog.getByRole("tab", { name: /Credit/ }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Transaction updated");
    await expect(tx).toContainText("+$50.00");

    // Update the category inline from the table
    await pickCategory(page, tx.getByRole("button", { name: "Groceries" }), "Dining Out");
    await expectToast(page, "Category updated");
    await search(page, description);
    await expect(row(page, description)).toContainText("Dining Out");

    // Delete
    await row(page, description).getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toContainText("Delete transaction?");
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expectToast(page, "Deleted");
    await expect(row(page, description)).toHaveCount(0);
    await search(page, description);
    await expect(page.getByText("No transactions found.")).toBeVisible();
  });

  test("new transactions follow the category's direction", async ({ page }) => {
    await open(page, "/transactions");
    await page.getByRole("button", { name: "Add transaction" }).click();
    const dialog = page.getByRole("dialog");
    await pickCategory(page, dialog.getByRole("button", { name: "Select a category" }), "Salary");
    await expect(dialog.getByRole("tab", { name: /Credit/ })).toHaveAttribute("aria-selected", "true");
  });

  test("shows validation errors and keeps the dialog open", async ({ page }) => {
    await open(page, "/transactions");
    await page.getByRole("button", { name: "Add transaction" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Amount").fill("abc");
    await dialog.getByLabel("Description").fill("Bad amount");
    await pickCategory(page, dialog.getByRole("button", { name: "Select a category" }), "Groceries");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Enter a positive amount, e.g. 12.34");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Amount").fill("0");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Amount must be greater than 0");
    await expect(dialog).toBeVisible();
  });

  test("filters by direction and date range", async ({ page }) => {
    const tag = unique("Filter");
    for (const [date, direction, category] of [
      ["2026-01-10", "Debit", "Groceries"],
      ["2026-02-10", "Credit", "Salary"],
    ] as const) {
      await open(page, "/transactions");
      await page.getByRole("button", { name: "Add transaction" }).click();
      const dialog = page.getByRole("dialog");
      await pickCategory(page, dialog.getByRole("button", { name: "Select a category" }), category);
      await dialog.getByRole("tab", { name: new RegExp(direction) }).click();
      await dialog.getByLabel("Date").fill(date);
      await dialog.getByLabel("Amount").fill("1.00");
      await dialog.getByLabel("Description").fill(`${tag} ${direction}`);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expectToast(page, "Transaction added");
    }

    const q = encodeURIComponent(tag);
    await open(page, `/transactions?q=${q}&direction=CREDIT`);
    await expect(row(page, `${tag} Credit`)).toBeVisible();
    await expect(row(page, `${tag} Debit`)).toHaveCount(0);

    await open(page, `/transactions?q=${q}&from=2026-01-01&to=2026-01-31`);
    await expect(row(page, `${tag} Debit`)).toBeVisible();
    await expect(row(page, `${tag} Credit`)).toHaveCount(0);

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
  });
});
