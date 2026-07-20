import { test, expect } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";
const document = { id: "smoke", file_name: "smoke.pdf", status: "completed", fields: { so_van_ban: { value: "OLD", confidence: .91, bbox: [0, 0, 10, 10], page_index: 0 } }, pages: [{ page_index: 0, image_url: `/api/jobs/${id}/artifacts/smoke/page-1.png` }] };
const job = (status: string) => ({ id, status, expected_files: 1, uploaded_files: 1, upload_name: "smoke.pdf", documents: [document], page_count: 1, correction_count: 0 });

test("fake backend upload, polling, review, correction, crop and delete", async ({ page }) => {
  let status = "completed";
  let jobReads = 0;
  let deleted = false;
  let created = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/state" && request.method() === "GET") return route.fulfill({ json: { server_mode: true, jobs: !created || deleted ? [] : [job(status)], documents: [], logs: [], metrics: { total_jobs: !created || deleted ? 0 : 1, pages: !created || deleted ? 0 : 1, correction_count: 0, error_jobs: 0 }, ocr_methods: [{ id: "qwen", label: "Qwen", status: "configured" }], pagination: { total: !created || deleted ? 0 : 1 } } });
    if (path === "/api/system-metrics") return route.fulfill({ json: { cpu_percent: null, memory_percent: null, gpu: null } });
    if (path === "/api/engines/qwen/check") return route.fulfill({ json: { id: "qwen", status: "configured", summary: "Configuration is present." } });
    if (path === "/api/jobs" && request.method() === "POST") { created = true; return route.fulfill({ json: job("uploading") }); }
    if (path === `/api/jobs/${id}/files` && request.method() === "PUT") return route.fulfill({ json: { job: job("ready") } });
    if (path === `/api/jobs/${id}/start`) { status = "completed"; return route.fulfill({ json: job("queued") }); }
    if (path === `/api/jobs/${id}` && request.method() === "GET") { jobReads += 1; status = jobReads === 1 ? "queued" : "completed"; return route.fulfill({ json: job(status) }); }
    if (path === `/api/jobs/${id}/cancel`) { status = "cancelling"; return route.fulfill({ json: job("cancelling") }); }
    if (path === `/api/jobs/${id}/rerun`) { status = "completed"; return route.fulfill({ json: job("completed") }); }
    if (path === `/api/jobs/${id}/corrections`) { status = "completed"; return route.fulfill({ json: { saved_count: 1, job: job("completed"), document_status: { approved: true } } }); }
    if (path === `/api/jobs/${id}/manual-crop`) { status = "completed"; return route.fulfill({ json: { crop_image: `/api/jobs/${id}/artifacts/smoke/crop-manual-1.png` } }); }
    if (path === "/api/jobs/delete-preview") return route.fulfill({ json: { deletable: [{ id, name: "smoke.pdf" }], skipped: [] } });
    if (path === "/api/jobs/bulk-delete") { deleted = true; return route.fulfill({ json: { deleted: [id], skipped: [], failed: [] } }); }
    if (path.includes("/artifacts/")) return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("fake") });
    return route.fulfill({ status: 404, json: { detail: { message: "unmocked" } } });
  });

  await page.goto("/");
  await expect(page.getByText("Công việc").first()).toBeVisible();
  await page.getByRole("button", { name: "Kiểm tra engine" }).click();
  await expect(page.getByText("Configuration is present.")).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose File" }).click();
  await (await chooser).setFiles({ name: "smoke.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fake") });
  await page.getByRole("button", { name: "Bắt đầu OCR" }).click();
  await expect(page.getByRole("link", { name: "smoke.pdf" })).toBeVisible();
  await page.getByRole("link", { name: "smoke.pdf" }).click();
  await expect(page.getByText("smoke.pdf").first()).toBeVisible();
  await page.getByRole("button", { name: "Hủy" }).click();
  await page.getByRole("button", { name: "Chạy lại" }).click();
  await expect(page.locator("img.page-preview")).toHaveCount(1);
  await page.getByRole("button", { name: "Lưu chỉnh sửa" }).click();
  await page.getByRole("button", { name: "Tạo crop bằng chứng" }).click();
  await expect(page.getByText("Xem crop")).toBeVisible();
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Xóa" }).click();
  await expect(page.getByText("Chưa có công việc.")).toBeVisible();
});
