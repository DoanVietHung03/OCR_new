import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: process.platform === "win32" ? "..\\backend\\.venv\\Scripts\\python.exe ..\\backend\\tests\\integration_server.py" : "uv run --project ../backend python ../backend/tests/integration_server.py",
      url: "http://127.0.0.1:50179/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: process.platform === "win32" ? "cmd /d /s /c \"set OCR_BACKEND_URL=http://127.0.0.1:50179&& .\\node_modules\\.bin\\next.cmd dev -p 3100\"" : "OCR_BACKEND_URL=http://127.0.0.1:50179 ./node_modules/.bin/next dev -p 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
