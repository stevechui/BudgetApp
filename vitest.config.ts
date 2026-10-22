import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const alias = { "@": root };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["lib/**/*.test.ts"],
        },
      },
      {
        resolve: {
          alias: {
            ...alias,
            "server-only": `${root}tests/db/stubs/server-only.ts`,
          },
        },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          setupFiles: ["tests/db/setup.ts"],
        },
      },
    ],
  },
});
