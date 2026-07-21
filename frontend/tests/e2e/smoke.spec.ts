import { expect, test } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL2YQAAAABJRU5ErkJggg==", "base64");
const pdf = Buffer.from("JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjkuMAoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjkuMCk+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDw+PgplbmRvYmoKCjQgMCBvYmoKPDwvVHlwZS9QYWdlL01lZGlhQm94WzAgMCAyMDAgMjAwXS9Sb3RhdGUgMC9SZXNvdXJjZXMgMyAwIFIvUGFyZW50IDIgMCBSPj4KZW5kb2JqCgp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNDIgMDAwMDAgbiAKMDAwMDAwMDEyMCAwMDAwMCBuIAowMDAwMDAwMTcyIDAwMDAwIG4gCjAwMDAwMDAxOTMgMDAwMDAgbiAKCnRyYWlsZXIKPDwvU2l6ZSA1L1Jvb3QgMSAwIFIvSURbPDNEN0M2OEMzQjc1NzM3QzJBODJFNjFDMzkwQzM5QTMzPjw0ODZCMDFGNTNCNjRFNURCM0UwQUFDNjNFRTlGMEMwMT5dPj4Kc3RhcnR4cmVmCjI4NAolJUVPRgo=", "base64");
const mockDocument = { id: "smoke", file_name: "smoke.pdf", status: "completed", fields: { so_van_ban: { value: "OLD", confidence: .91, bbox: [0, 0, 10, 10], page_index: 0 } }, pages: [{ page_index: 0, image_url: `/api/jobs/${id}/artifacts/smoke/page-1.png` }] };
const job = (status: string) => ({ id, status, expected_files: 1, uploaded_files: 1, upload_name: "smoke.pdf", documents: [mockDocument], page_count: 1, correction_count: 0 });

test("fake backend upload, polling, review, correction, crop and delete", async ({ page }) => {
  let status = "completed", reads = 0, deleted = false, created = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/state") return route.fulfill({ json: { jobs: !created || deleted ? [] : [job(status)], metrics: { total_jobs: !created || deleted ? 0 : 1, pages: !created || deleted ? 0 : 1, correction_count: 0, error_jobs: 0 }, ocr_methods: [{ id: "qwen", label: "Qwen", status: "configured" }], pagination: { page: 1, pages: 1, total: !created || deleted ? 0 : 1 } } });
    if (path === "/api/engines/qwen/check") return route.fulfill({ json: { id: "qwen", status: "configured", summary: "Configuration is present." } });
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
  await page.locator(".engine-panel button").click();
  await expect(page.locator(".engine-panel")).toContainText(/đã cấu hình|configured/i);
  await page.locator('input[type="file"]').setInputFiles({ name: "smoke.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fake") });
  await page.locator(".upload-panel .primary").click();
  await page.getByRole("link", { name: "smoke.pdf" }).click();
  await page.locator(".engine-panel .danger").click();
  await page.locator(".engine-panel .secondary").click();
  await expect(page.locator("img.page-preview")).toBeVisible();
  await page.locator(".editor-panel .field input").first().fill("NEW");
  await page.locator(".editor-panel .primary").click();
  await page.locator(".editor-panel select").first().selectOption("so_van_ban");
  await page.getByRole("button", { name: /tạo crop|crop/i }).click();
  await expect(page.locator(".editor-panel a.link-button")).toBeVisible();
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".job-row").filter({ hasText: "smoke.pdf" }).locator("button.danger").click();
  await expect(page.locator(".empty")).toBeVisible();
});

test("real Next and FastAPI use eager Celery with a fake HTTP provider", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: "integration.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.locator(".upload-panel .primary").click();
  await page.getByRole("link", { name: "integration.pdf" }).click();
  await expect(page.locator(".editor-panel .field input").first()).toHaveValue("DOC-001", { timeout: 20_000 });
  const sourceId = new URL(page.url()).pathname.split("/").pop()!;

  await page.locator(".editor-panel .field input").first().fill("DOC-002");
  await page.locator(".editor-panel .primary").click();
  await page.reload();
  await expect(page.locator(".editor-panel .field input").first()).toHaveValue("DOC-002");
  await page.locator(".editor-panel select").first().selectOption("so_van_ban");
  await page.getByRole("button", { name: /tạo crop|crop/i }).click();
  await expect(page.locator(".evidence-list")).toBeVisible();
  await page.locator(".editor-panel .actions .secondary").click();
  await page.locator(".engine-panel .secondary").click();
  await expect(page).not.toHaveURL(new RegExp(`${sourceId}$`));

  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".job-row").filter({ hasText: sourceId }).locator("button.danger").click();
  await expect(page.locator(".job-row").filter({ hasText: sourceId })).toHaveCount(0);
});

test("mobile English UI keeps the PDF-only contract and exposes safe upload errors", async ({ page }) => {
  let uploadFails = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("intellidoc.language", "en"));
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/state") return route.fulfill({ json: {
      server_mode: true, jobs: [], documents: [], logs: [],
      metrics: { total_jobs: 0, pages: 0, correction_count: 0, error_jobs: 0 },
      ocr_methods: [{ id: "local", label: "Local OCR", status: "configured", external: false }],
      limits: { max_files_per_job: 15, max_job_upload_bytes: 209715200 },
      pagination: { page: 1, page_size: 25, pages: 1, total: 0 },
    } });
    if (path === "/api/jobs" && request.method() === "POST") return route.fulfill({ json: job("uploading") });
    if (path === `/api/jobs/${id}/files`) return uploadFails
      ? route.fulfill({ status: 400, json: { detail: "unsupported_file" } })
      : route.fulfill({ json: { job: job("ready") } });
    if (path === `/api/jobs/${id}/start`) return route.fulfill({ status: 503, json: { detail: "worker_unavailable" } });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jobs");
  await expect(page.locator('input[type="file"]')).toHaveAttribute("accept", "application/pdf,.pdf");
  expect((await page.request.get("/icon.svg")).ok()).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

  await page.locator('input[type="file"]').setInputFiles({ name: "bad.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
  await page.locator(".upload-panel .primary").click();
  await expect(page.locator(".upload-panel .error")).toContainText("unsupported_file");

  uploadFails = false;
  await page.locator('input[type="file"]').setInputFiles({ name: "good.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.locator(".upload-panel .primary").click();
  await expect(page.locator(".upload-panel .error")).toContainText("worker_unavailable");
});
