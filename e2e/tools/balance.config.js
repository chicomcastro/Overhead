import { defineConfig, devices } from "@playwright/test";

// Config dedicado da ferramenta de balanceamento (não roda no CI, que usa
// ../playwright.config.js com testDir ./tests). Serve a pasta web/ e roda o
// simulador em tools/. Uso: npm run balance  (a partir de e2e/).
export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    launchOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
  ],
  webServer: {
    command: "python3 -m http.server 4173 --directory ../../web",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
