import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://release-v1-0-0-rc-1-viteplus-dev.voidzero-docs.workers.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
  },
  run: {
    tasks: {
      build: {
        command: "tsc",
        cache: {
          input: [
            { auto: true },
            // Auto-detection tracks the conventional src/ layout, but this
            // package's sources live at the package root (api/, util/,
            // testDocument*.ts, ...) - without listing them, edits here never
            // change the input hash, and cache hits restore stale dist
            // artifacts over fresh builds.
            "api/**",
            "assets/**",
            "util/**",
            "*.ts",
            "tsconfig.json",
            { pattern: "!**/*.tsbuildinfo", base: "workspace" },
          ],
          // Without declared outputs the cache can't restore `dist/` on a
          // cache hit, leaving consumers type-checking against missing or
          // stale declarations.
          output: ["dist/**", "!dist/**/*.tsbuildinfo"],
        },
      },
    },
  },
});
