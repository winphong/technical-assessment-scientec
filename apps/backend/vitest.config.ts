import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    // The concurrency tests race real Postgres transactions against each other 20x each;
    // give them room rather than tripping vitest's default 5s per-test timeout.
    testTimeout: 15000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          // All integration tests share one real `scientec_test` Postgres database and
          // each file's beforeEach TRUNCATEs it — running test files in parallel would
          // let one file's reset wipe rows another file mid-test still depends on.
          fileParallelism: false,
        },
      },
    ],
  },
});
