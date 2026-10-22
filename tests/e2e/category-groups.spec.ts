import { expect, test } from "@playwright/test";
import { expectToast, open, row, unique } from "./helpers";

test.describe("category groups", () => {
  test("lists the seeded groups with category counts", async ({ page }) => {
    await open(page, "/category-groups");
    for (const name of ["Income", "Food", "Transfers", "Utilities"]) {
      await expect(row(page, name).first()).toBeVisible();
    }
    await expect(row(page, "Food")).toContainText("3");
  });

  test("create, rename and delete a group", async ({ page }) => {
    const name = unique("Pets");
    const renamed = unique("Animals");
    await open(page, "/category-groups");

    await page.getByRole("button", { name: "New group" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Group created");
    await expect(dialog).toBeHidden();
    await expect(row(page, name)).toContainText("0");

    await row(page, name).getByRole("button", { name: "Edit" }).click();
    await expect(dialog.getByLabel("Name")).toHaveValue(name);
    await dialog.getByLabel("Name").fill(renamed);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Group updated");
    await expect(row(page, renamed)).toBeVisible();
    await expect(row(page, name)).toHaveCount(0);

    await row(page, renamed).getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toContainText(`Delete "${renamed}"?`);
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expectToast(page, "Deleted");
    await expect(row(page, renamed)).toHaveCount(0);

    await open(page, "/category-groups");
    await expect(row(page, renamed)).toHaveCount(0);
  });

  test("shows an error for a duplicate name", async ({ page }) => {
    await open(page, "/category-groups");
    await page.getByRole("button", { name: "New group" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Food");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "A group with that name already exists");
    await expect(dialog).toBeVisible();
  });

  test("cannot delete a group that still has categories", async ({ page }) => {
    await open(page, "/category-groups");
    await row(page, "Food").getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Move or delete them before deleting the group");
    await expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
