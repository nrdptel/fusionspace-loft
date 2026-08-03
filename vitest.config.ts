import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // **`lib/**/*.test.tsx` was missing, and a missing include is the quietest failure there is.**
    // `app` had both extensions and `lib` had only `.ts`, so the first test file written under `lib`
    // that rendered anything reported "No test files found" — which is a red exit for a filtered run
    // and, for the whole suite, simply a file that never runs and never says so. That is the same
    // false all-clear shape `MAINTAINING.md` warns about for the corpus suite, one directory over.
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "app/**/*.test.ts", "app/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "lib/**/*.tsx", "app/**/*.ts", "app/**/*.tsx"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.config.ts"],
      reporter: ["text"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
