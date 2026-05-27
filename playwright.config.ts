import { defineConfig, devices } from "@playwright/test";

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const chromiumLaunchOptions = {
  ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
  ...(process.env.CI
    ? {
        args: [
          "--disable-gpu",
          "--disable-gpu-compositing",
          "--disable-software-rasterizer",
          "--disable-accelerated-2d-canvas",
          "--use-gl=disabled",
        ],
      }
    : {}),
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["list"], ["junit", { outputFile: "test-results/playwright-junit.xml" }]]
    : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "bun run dev",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: chromiumLaunchOptions,
      },
    },
  ],
});
