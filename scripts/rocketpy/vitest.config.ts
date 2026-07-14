import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["scripts/rocketpy/**/*.ts"], exclude: ["**/vitest.config.ts"] } });
