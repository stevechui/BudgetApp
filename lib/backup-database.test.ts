import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { backupDatabase } from "./backup-database";

let directory: string;

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("backupDatabase", () => {
  it("creates an online SQLite backup with the database name and MMDDYYYY", async () => {
    directory = await mkdtemp(join(tmpdir(), "budget-backup-"));
    const sourcePath = join(directory, "budget.db");
    const source = new Database(sourcePath);
    source.exec("CREATE TABLE entries (value TEXT); INSERT INTO entries VALUES ('saved');");
    source.close();

    const backupPath = await backupDatabase(
      pathToFileURL(sourcePath).href,
      new Date(2026, 9, 24),
    );

    expect(backupPath).toBe(join(directory, "budget-10242026.db"));
    const backup = new Database(backupPath, { readonly: true });
    expect(backup.prepare("SELECT value FROM entries").get()).toEqual({ value: "saved" });
    backup.close();
  });
});
