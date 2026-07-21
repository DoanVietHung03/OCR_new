import { expect, test } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL2YQAAAABJRU5ErkJggg==", "base64");
const document = { id: "smoke", file_name: "smoke.pdf", status: "completed", fields: { so_van_ban: { value: "OLD", confidence: .91, bbox: [0, 0, 10, 10], page_index: 0 } }, pages: [{ page_index: 0, image_url: `/api/jobs/${id}/artifacts/smoke/page-1.png` }] };
const job = (status: string) => ({ id, status, expected_files: 1, uploaded_files: 1, upload_name: "smoke.pdf", documents: [document], page_count: 1, correction_count: 0 });

test("fake backend upload, polling, review, correction, crop and delete", async ({ page }) => {
  let status = "completed", reads = 0, deleted = false, created = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/state") return route.fulfill({ json: { jobs: !created || deleted ? [] : [job(status)], metrics: { total_jobs: !created || deleted ? 0 : 1, pages: !created || deleted ? 0 : 1, correction_count: 0, error_jobs: 0 }, ocr_methods: [{ id: "qwen", label: "Qwen", status: "configured" }], pagination: { page: 1, pages: 1, total: !created || deleted ? 0 : 1 } } });
    if (path === "/api/engines/qwen/check") return route.fulfill({ json: { summary: "Configuration is present." } });
    if (path === "/api/jobs" && request.method() === "POST") { created = true; return route.fulfill({ json: job("uploading") }); }
    if (path === `/api/jobs/${id}/files`) return route.fulfill({ json: { job: job("ready") } });
    if (path === `/api/jobs/${id}/start`) return route.fulfill({ json: job("queued") });
    if (path === `/api/jobs/${id}` && request.method() === "GET") return route.fulfill({ json: job(reads++ ? "completed" : "queued") });
    if (path.endsWith("/cancel")) return route.fulfill({ json: job("cancelling") });
    if (path.endsWith("/rerun")) return route.fulfill({ json: job("completed") });
    if (path.endsWith("/corrections")) return route.fulfill({ json: { job: job("completed") } });
    if (path.endsWith("/manual-crop")) return route.fulfill({ json: { crop_image: `/api/jobs/${id}/artifacts/smoke/crop.png` } });
    if (path === "/api/jobs/delete-preview") return route.fulfill({ json: { deletable: [{ id, name: "smoke.pdf" }], skipped: [] } });
    if (path === "/api/jobs/bulk-delete") { deleted = true; return route.fulfill({ json: { deleted: [id] } }); }
    if (path.includes("/artifacts/")) return route.fulfill({ status: 200, contentType: "image/png", body: png });
    return route.fulfill({ status: 404, json: { detail: { message: "unmocked" } } });
  });
  await page.goto("/");
  await page.getByLabel("Check engine").click();
  await expect(page.getByText("Configuration is present.")).toBeVisible();
  await page.getByLabel("PDF files").setInputFiles({ name: "smoke.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fake") });
  await page.locator(".upload-panel .primary").click();
  await page.getByRole("link", { name: "smoke.pdf" }).click();
  await page.locator(".engine-panel .danger").click();
  await page.getByRole("button", { name: /chạy lại|rerun/i }).click();
  await expect(page.locator("img.page-preview")).toBeVisible();
  await page.locator(".editor-panel .primary").click();
  await page.getByLabel("Crop field").selectOption("so_van_ban");
  await page.getByRole("button", { name: /tạo crop|crop/i }).click();
  await expect(page.getByText(/xem crop|view crop/i)).toBeVisible();
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".job-row").filter({ hasText: "smoke.pdf" }).locator("button.danger").click();
  await expect(page.locator(".empty")).toBeVisible();
});
