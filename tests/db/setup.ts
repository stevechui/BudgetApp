import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeEach, vi } from "vitest";

// Each test file gets its own migrated database so files can run in parallel.
const file = join(tmpdir(), `budget-test-${randomUUID()}.db`);
const migrationsDir = join(process.cwd(), "prisma/migrations");
const sqlite = new DatabaseSync(file);
for (const dir of readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()) {
  sqlite.exec(readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8"));
}
sqlite.close();
process.env.DATABASE_URL = `file:${file}`;

// These Next.js APIs only work inside a request; record calls instead.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

beforeEach(async () => {
  vi.clearAllMocks();
  const { resetDb } = await import("./helpers");
  await resetDb();
});

afterAll(async () => {
  const { db } = await import("@/lib/db");
  await db.$disconnect();
  rmSync(file, { force: true });
});
