import { expect, test, type Page } from "@playwright/test";
import { choose, expectToast, open, pickAccount, pickCategory, row, unique } from "./helpers";

async function createAccount(
  page: Page,
  { name, type, opening }: { name: string; type: string; opening: string },
) {
  await open(page, "/accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Institution").fill("Test Bank");
  await choose(page, dialog.getByRole("combobox", { name: "Account type" }), type);
  await dialog.getByLabel("Opening balance").fill(opening);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expectToast(page, "Account created");
  await expect(dialog).toBeHidden();
}

test.describe("accounts", () => {
  test("create, use, edit and delete an account with its balance", async ({ page }) => {
    const name = unique("Visa");
    const description = unique("Card purchase");
    await createAccount(page, { name, type: "Credit card", opening: "-100" });

    const account = row(page, name);
    await expect(account).toContainText("Test Bank");
    await expect(account).toContainText("-$100.00");

    // A new transaction must have an account once there is more than one
    await open(page, "/transactions");
    await page.getByRole("button", { name: "Add transaction" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Amount").fill("25.50");
    await dialog.getByLabel("Description").fill(description);
    await pickCategory(page, dialog.getByRole("button", { name: "Select a category" }), "Groceries");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Pick an account");
    await pickAccount(page, dialog, name);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Transaction added");

    // The last-used account is preselected next time
    await page.getByRole("button", { name: "Add transaction" }).click();
    await expect(dialog.getByRole("combobox", { name: "Account", exact: true })).toHaveText(name);
    await page.keyboard.press("Escape");

    // Balance = opening + credits − debits
    await open(page, "/accounts");
    await expect(account).toContainText("-$125.50");

    // Clicking the account lists its transactions
    await account.getByRole("link", { name }).click();
    await expect(page).toHaveURL(/\/transactions\?account=\d+/);
    await expect(page.getByText("1 transaction", { exact: true })).toBeVisible();
    await expect(row(page, description)).toContainText(name);

    // Edit
    const renamed = `${name} renamed`;
    await open(page, "/accounts");
    await account.getByRole("button", { name: "Edit" }).click();
    await expect(dialog.getByLabel("Opening balance")).toHaveValue("-100.00");
    await dialog.getByLabel("Name").fill(renamed);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Account updated");
    const renamedRow = row(page, renamed);
    await expect(renamedRow).toBeVisible();

    // Delete requires moving its transactions first
    await renamedRow.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toContainText("This account has 1 transaction");
    const del = dialog.getByRole("button", { name: "Delete" });
    await expect(del).toBeDisabled();
    await pickAccount(page, dialog, "Main Account");
    await del.click();
    await expectToast(page, "Deleted");
    await expect(row(page, renamed)).toHaveCount(0);

    await open(page, `/transactions?q=${encodeURIComponent(description)}`);
    await expect(row(page, description)).toContainText("Main Account");
  });

  test("rejects a duplicate name and a bad opening balance", async ({ page }) => {
    await open(page, "/accounts");
    await page.getByRole("button", { name: "New account" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Main Account");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "An account with that name already exists");

    await dialog.getByLabel("Name").fill(unique("Savings"));
    await dialog.getByLabel("Opening balance").fill("12.345");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Enter an amount, e.g. 1250.00 or -300");
    await expect(dialog).toBeVisible();
  });

  test("an empty account deletes without moving anything", async ({ page }) => {
    const name = unique("Cash");
    await createAccount(page, { name, type: "Cash", opening: "40" });
    await row(page, name).getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("This cannot be undone.");
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expectToast(page, "Deleted");
    await expect(row(page, name)).toHaveCount(0);
  });
});
