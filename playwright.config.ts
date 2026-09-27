import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  /**
   * Per-run artifact directory, keyed on the process id.
   *
   * This was a single shared path, and Playwright CLEARS its outputDir at the start of every run.
   * So two spec files launched concurrently in one checkout — the obvious way to save time — have
   * the second run delete traces the first is still writing. The result is a handful of unrelated
   * failures across different specs with an `ENOENT ... recording*.trace` among them, which reads
   * exactly like a real regression in whatever you last touched. Both sessions on this repo hit it
   * and both nearly filed it as a product bug; running each spec alone came back clean.
   *
   * A pid keeps concurrent runs apart without the caller having to remember anything. Everything
   * under test-results/ is gitignored, so stale directories cost nothing but disk.
   */
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? `test-results/.artifacts-${process.pid}`,
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
