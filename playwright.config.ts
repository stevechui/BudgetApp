import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const DATABASE_URL = "file:./prisma/e2e.db";

export default defineConfig({
  testDir: "tests/e2e",
  // Specs share one database, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Fresh database with only the default categories, then a production server.
    command: `rm -f prisma/e2e.db && prisma migrate deploy && tsx prisma/seed.ts && next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { DATABASE_URL },
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
