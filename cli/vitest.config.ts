import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    pool: "forks",
    poolOptions: {
      forks: {
        // each test file gets its own fork so PWAGENT_HOME isolation works
        singleFork: false,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/cli/**", "src/content/**"],
    },
  },
});
