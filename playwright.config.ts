import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/phase1.e2e.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8787",
    headless: true,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      // The embed test serves a fake https site that frames the local server.
      args: [
        "--no-sandbox",
        "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests",
      ],
    },
    trace: "retain-on-failure",
  },
  reporter: "list",
});
