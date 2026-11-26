import { defineConfig, devices } from "@playwright/test";

// A port of its own, so tests can run while the factory has the app up on 4173.
const PORT = Number(process.env.E2E_PORT ?? 4174);

export default defineConfig({
  testDir: "tests/e2e",
  // One test database is shared by the whole run.
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bash tests/supabase/start.sh ${PORT}`,
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
