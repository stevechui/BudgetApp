import { expect, test, type Page } from "@playwright/test";
import { choose, expectToast, open, pickCategory, row, unique } from "./helpers";

async function createCategory(page: Page, name: string, type: string, group: string) {
  await page.getByRole("button", { name: "New category" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  const [typeSelect, groupSelect] = await dialog.getByRole("combobox").all();
  await choose(page, typeSelect, type);
  await choose(page, groupSelect, group);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expectToast(page, "Category created");
  await expect(dialog).toBeHidden();
}

async function addTransaction(page: Page, description: string, category: string) {
  await open(page, "/transactions");
  await page.getByRole("button", { name: "Add transaction" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("10.00");
  await dialog.getByLabel("Description").fill(description);
  await pickCategory(page, dialog.getByRole("button", { name: "Select a category" }), category);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expectToast(page, "Transaction added");
}

test.describe("categories", () => {
  test("lists seeded categories under their groups", async ({ page }) => {
    await open(page, "/categories");
    await expect(row(page, "Groceries")).toContainText("Debit");
    await expect(row(page, "Salary")).toContainText("Credit");
    await expect(row(page, "Credit Card Payment")).toContainText("Transfer");
  });

  test("create, edit and delete a category", async ({ page }) => {
    const name = unique("Vet");
    const renamed = unique("Veterinarian");
    await open(page, "/categories");

    await createCategory(page, name, "Debit (expense)", "Health");
    await expect(row(page, name)).toContainText("Debit");

    await row(page, name).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Name")).toHaveValue(name);
    await dialog.getByLabel("Name").fill(renamed);
    const [typeSelect, groupSelect] = await dialog.getByRole("combobox").all();
    await choose(page, typeSelect, "Transfer (no budget impact)");
    await choose(page, groupSelect, "Transfers");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Category updated");
    await expect(row(page, renamed)).toContainText("Transfer");

    await open(page, "/category-groups");
    await row(page, "Transfers").getByRole("link").click();
    await expect(page).toHaveURL(/\/categories\?group=\d+/);
    await expect(row(page, renamed)).toBeVisible();

    await row(page, renamed).getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toContainText("This cannot be undone.");
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expectToast(page, "Deleted");
    await expect(row(page, renamed)).toHaveCount(0);
  });

  test("filters by group and type", async ({ page }) => {
    await open(page, "/categories");
    const [groupFilter, typeFilter] = await page.getByRole("combobox").all();
    await choose(page, groupFilter, "Food");
    await expect(row(page, "Groceries")).toBeVisible();
    await expect(row(page, "Salary")).toHaveCount(0);

    await choose(page, groupFilter, "All groups");
    await choose(page, typeFilter, "Transfer");
    await expect(row(page, "Account Transfer")).toBeVisible();
    await expect(row(page, "Groceries")).toHaveCount(0);
  });

  test("deleting a category in use moves its transactions first", async ({ page }) => {
    const name = unique("Snacks");
    const description = unique("Vending machine");
    await open(page, "/categories");
    await createCategory(page, name, "Debit (expense)", "Food");
    await addTransaction(page, description, name);

    await open(page, "/categories");
    await expect(row(page, name)).toContainText("1");
    await row(page, name).getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("1 transaction uses this category");
    const confirm = dialog.getByRole("button", { name: "Delete" });
    await expect(confirm).toBeDisabled();

    await choose(page, dialog.getByRole("combobox"), "Dining Out (Food)");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expectToast(page, "Deleted");
    await expect(row(page, name)).toHaveCount(0);

    await open(page, `/transactions?q=${encodeURIComponent(description)}`);
    await expect(row(page, description)).toContainText("Dining Out");
  });
});
