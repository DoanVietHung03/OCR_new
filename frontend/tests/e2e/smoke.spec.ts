import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const id = "11111111-1111-4111-8111-111111111111";
const rerunId = "22222222-2222-4222-8222-222222222222";
const pdf = Buffer.from("JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjkuMAoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjkuMCk+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDw+PgplbmRvYmoKCjQgMCBvYmoKPDwvVHlwZS9QYWdlL01lZGlhQm94WzAgMCAyMDAgMjAwXS9Sb3RhdGUgMC9SZXNvdXJjZXMgMyAwIFIvUGFyZW50IDIgMCBSPj4KZW5kb2JqCgp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNDIgMDAwMDAgbiAKMDAwMDAwMDEyMCAwMDAwMCBuIAowMDAwMDAwMTcyIDAwMDAwIG4gCjAwMDAwMDAxOTMgMDAwMDAgbiAKCnRyYWlsZXIKPDwvU2l6ZSA1L1Jvb3QgMSAwIFIvSURbPDNEN0M2OEMzQjc1NzM3QzJBODJFNjFDMzkwQzM5QTMzPjw0ODZCMDFGNTNCNjRFNURCM0UwQUFDNjNFRTlGMEMwMT5dPj4Kc3RhcnR4cmVmCjI4NAolJUVPRgo=", "base64");
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="20" y="40">OCR</text></svg>');
const now = "2026-07-21T10:00:00Z";
const cleanCapture = async (page: Page) => page.locator("nextjs-portal").evaluateAll((nodes) => nodes.forEach((node) => node.remove())).catch(() => {});

function fixtureJob(status = "completed", document: Record<string, unknown> = fixtureDocument()) {
  return { id, status, created_at: now, updated_at: now, started_at: now, completed_at: now, ocr_method: "qwen", provider: "qwen", provider_profile_id: "qwen", model: "test-model", prompt_version: "3", endpoint_external: false, cloud_data_confirmed: false, expected_files: 1, uploaded_files: 1, upload_name: "smoke.pdf", documents: [document], logs: [{ timestamp: now, severity: "info", category: "lifecycle", code: "job_created", job_id: id, message: "sanitized operation log", warning_codes: [] }], page_count: 1, failed_pages: 0, correction_count: 0, vlm_task: "full_ocr", vlm_pages: "all", vlm_max_pages: 0, report_url: `/api/jobs/${id}/artifacts/report.json` };
}
function fixtureDocument() {
  return { id: "smoke", file_name: "smoke.pdf", status: "completed", review_status: null as string | null, fields: { so_van_ban: { value: "OLD", ocr_value: null, confidence: .91, bbox: [0, 0, 10, 10], page_index: 0, evidence_url: `/api/jobs/${id}/artifacts/smoke/page-1.png` } }, pages: [{ page_index: 0, image_url: `/api/jobs/${id}/artifacts/smoke/page-1.png` }], crop_evidence: [] as Record<string, unknown>[] };
}
const state = (jobs: ReturnType<typeof fixtureJob>[], external = false) => ({ server_mode: true, jobs, documents: [], logs: [], metrics: { total_jobs: jobs.length, active_jobs: jobs.filter((job) => ["starting", "queued", "running", "cancelling"].includes(job.status)).length, completed_jobs: jobs.filter((job) => ["completed", "completed_with_warnings"].includes(job.status)).length, documents: jobs.reduce((count, job) => count + job.documents.length, 0), pages: jobs.length, correction_count: 0, error_jobs: 0 }, ocr_methods: [{ id: "qwen", label: "Qwen", status: "configured", external }], limits: { max_files_per_job: 15, max_job_upload_bytes: 209715200 }, pagination: { page: 1, page_size: 25, pages: 1, total: jobs.length } });

test("mocked upload, review, exact crop, logs, monitor and delete", async ({ page }) => {
  const document = fixtureDocument(); let created = false, deleted = false, reads = 0, conflictOnce = true, cropCalls = 0; let correctionBody: any; let cropBody: any;
  document.crop_evidence.push({ crop_image: `/api/jobs/${id}/artifacts/smoke/old-crop.png`, field: "so_van_ban", page_index: 0, created_at: "2026-07-20T10:00:00Z", bbox: { x: 1, y: 1, width: 2, height: 2 }, evidence_source: "manual_crop", evidence_status: "trusted" });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), apiPath = url.pathname;
    if (apiPath === "/api/state") return route.fulfill({ json: state(created && !deleted ? [fixtureJob("completed", document)] : []) });
    if (apiPath === "/api/system-metrics") return route.fulfill({ json: { cpu_percent: 12, memory_percent: 34, cpu: { model: "Test CPU", physical_cores: 4, logical_cores: 8, percent: 12, load_1m: .1, load_5m: .2, load_15m: .3 }, disk: { used_bytes: 25, total_bytes: 100, free_bytes: 75, percent: 25 }, gpu: { status: "unavailable", devices: [] } } });
    if (apiPath === "/api/reports") return route.fulfill({ json: { operations: { total_jobs: 1, active_jobs: 0, completed_jobs: 1, error_jobs: 0, documents: 1, pages: 1, duration_seconds_average: 60, pages_per_minute: 1, failure_codes: {} }, quality: { documents: 1, approved_documents: 1, corrected_fields: 0, confidence_average: .91, total_fields: 1, confidence_coverage: 1, evidence_coverage: 0, warning_documents: 0 }, benchmark_samples: [] } });
    if (apiPath === "/api/engines/qwen/check") return route.fulfill({ json: { id: "qwen", status: "ready", summary: "OCR provider is ready." } });
    if (apiPath === "/api/jobs" && request.method() === "POST") { created = true; return route.fulfill({ json: fixtureJob("uploading", document) }); }
    if (apiPath === `/api/jobs/${id}/files`) return route.fulfill({ json: { job: fixtureJob("ready", document) } });
    if (apiPath === `/api/jobs/${id}/start`) return route.fulfill({ json: fixtureJob("queued", document) });
    if (apiPath === `/api/jobs/${id}` && request.method() === "GET") return route.fulfill({ json: fixtureJob(reads++ ? "completed" : "queued", document) });
    if (apiPath.endsWith("/corrections")) {
      correctionBody = request.postDataJSON();
      if (conflictOnce) { conflictOnce = false; document.fields.so_van_ban.value = "SERVER"; return route.fulfill({ status: 409, json: { detail: { code: "correction_conflict", message: "correction_conflict" } } }); }
      document.fields.so_van_ban.value = correctionBody.corrections[0]?.new_value ?? document.fields.so_van_ban.value; document.review_status = "approved";
      return route.fulfill({ json: { saved_count: correctionBody.corrections.length, job: fixtureJob("completed", document), document_status: {} } });
    }
    if (apiPath.endsWith("/manual-crop")) { cropCalls += 1; cropBody = request.postDataJSON(); document.crop_evidence.push({ crop_image: `/api/jobs/${id}/artifacts/smoke/crop.png`, field: "so_van_ban", page_index: 0, created_at: now, bbox: cropBody.rect, evidence_source: "manual_crop", evidence_status: "trusted" }); return route.fulfill({ json: document.crop_evidence.at(-1) }); }
    if (apiPath === "/api/jobs/delete-preview") return route.fulfill({ json: { deletable: [{ id, name: "smoke.pdf" }], skipped: [] } });
    if (apiPath === "/api/jobs/bulk-delete") { deleted = true; return route.fulfill({ json: { deleted: [id], skipped: [], failed: [] } }); }
    if (apiPath === `/api/jobs/${id}/artifacts`) return route.fulfill({ json: { items: [{ name: "page-1.png", kind: "image", status: "available", size_bytes: 200, updated_at: now, document_id: "smoke", page_index: 0, field: "so_van_ban", download_url: `/api/jobs/${id}/artifacts/smoke/page-1.png` }, { name: "missing-crop.png", kind: "image", status: "missing", size_bytes: 0, updated_at: "", document_id: "smoke", page_index: 0, field: "so_van_ban", download_url: `/api/jobs/${id}/artifacts/smoke/missing-crop.png` }] } });
    if (apiPath.includes("/artifacts/") && apiPath.endsWith(".png")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    if (apiPath.endsWith("report.json")) return route.fulfill({ json: { ok: true } });
    return route.fulfill({ status: 404, json: { detail: { code: "unmocked", message: "unmocked" } } });
  });

  await page.goto("/upload");
  await expect(page.locator(".upload-options .locked-value")).toContainText(/Do máy chủ quản lý|Managed by server/);
  await expect(page.locator(".upload-panel h2")).toHaveCount(0);
  await expect(page.locator(".dropzone-links button")).toHaveCount(2);
  await expect(page.getByLabel(/Giới hạn trang ứng viên|Candidate page limit/)).toHaveCount(0);
  await page.getByLabel(/Tác vụ VLM|VLM task/).selectOption("metadata");
  await page.getByLabel(/Phạm vi trang|Page scope/).selectOption("auto");
  await expect(page.locator(".page-scope-card .page-scope-details").getByLabel(/Giới hạn trang ứng viên|Candidate page limit/)).toBeVisible();
  const optionHeights = await page.locator(".upload-option-card").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
  expect(optionHeights.at(-1)).toBeGreaterThan(optionHeights[0] + 20);
  await page.getByRole("button", { name: /sẵn sàng|readiness/i }).click();
  await expect(page.locator(".upload-actions")).toContainText(/sẵn sàng|ready/i);
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({ name: "smoke.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: /bắt đầu OCR|start OCR/i }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${id}(?:\\?.*)?$`));
  await expect(page.locator(".field-card input").first()).toHaveValue("OLD");
  await expect(page.locator(".field-diff")).toHaveCount(0);
  await page.locator(".evidence-thumb").click(); await expect(page.locator(".evidence-modal[open] img")).toBeVisible(); await page.locator(".evidence-modal[open] .modal-actions").getByRole("button", { name: /đóng|close/i }).click();
  await page.locator(".field-card input").first().fill("NEW");
  await page.getByRole("button", { name: /lưu và duyệt|save and approve/i }).click();
  await expect(page.locator(".conflict")).toContainText("SERVER"); await expect(page.locator(".field-card input").first()).toHaveValue("NEW");
  await page.getByRole("button", { name: /giữ bản sửa|keep draft/i }).click(); await page.getByRole("button", { name: /lưu và duyệt|save and approve/i }).click();
  expect(correctionBody.corrections).toEqual([{ field: "so_van_ban", old_value: "SERVER", new_value: "NEW" }]);

  await page.getByRole("button", { name: /vẽ crop|draw crop/i }).click();
  const image = page.locator(".crop-canvas img"); await expect(image).toBeVisible(); const box = await image.boundingBox(); expect(box).toBeTruthy();
  await page.mouse.move(box!.x + 20, box!.y + 30); await page.mouse.down(); await page.mouse.move(box!.x + 100, box!.y + 90); await page.mouse.up();
  const rectangle = page.locator(".crop-rectangle"); await rectangle.focus(); await rectangle.press("ArrowRight"); await rectangle.press("Shift+ArrowRight");
  for (let index = 0; index < 30; index += 1) await rectangle.press("ArrowLeft");
  if (process.env.UPDATE_UI_BASELINE === "1") { await cleanCapture(page); await page.screenshot({ path: path.resolve(process.cwd(), "../docs/ui-parity/crop-modal.png") }); }
  await page.getByRole("button", { name: /lưu crop|save crop/i }).click();
  expect(cropBody).toEqual({ document_id: "smoke", page_index: 0, field: "so_van_ban", rect: { x: 0, y: 30, width: 81, height: 60 } });
  await expect(page.locator(".evidence-list")).toBeVisible(); await expect(page.locator(".evidence-list a").first()).toHaveAttribute("href", /\/crop\.png$/);
  if (process.env.UPDATE_UI_BASELINE === "1") { await cleanCapture(page); await page.screenshot({ path: path.resolve(process.cwd(), "../docs/ui-parity/review-workspace.png") }); }
  await page.getByRole("button", { name: /vẽ crop|draw crop/i }).click(); const smallBox = await page.locator(".crop-canvas img").boundingBox(); await page.mouse.move(smallBox!.x + 10, smallBox!.y + 10); await page.mouse.down(); await page.mouse.move(smallBox!.x + 11, smallBox!.y + 11); await page.mouse.up(); await page.getByRole("button", { name: /lưu crop|save crop/i }).click(); await expect(page.locator(".notice.error")).toContainText("Vùng crop không hợp lệ"); expect(cropCalls).toBe(1); await page.locator(".crop-modal .modal-actions").getByRole("button", { name: /đóng|close/i }).click();
  await page.locator(".detail-tabs").getByRole("button", { name: /artifacts/i }).click(); await expect(page.locator(".artifact-section")).toContainText("page-1.png"); await expect(page.locator(".artifact-section")).toContainText("200 B"); await expect(page.locator(".artifact-section")).toContainText("missing-crop.png"); await page.locator(".artifact-item").filter({ hasText: "page-1.png" }).click(); await expect(page.locator(".evidence-modal[open] img")).toBeVisible(); await page.locator(".evidence-modal[open] .modal-actions").getByRole("button", { name: /đóng|close/i }).click();
  await page.locator(".detail-tabs").getByRole("button", { name: /nhật ký|logs/i }).click(); await expect(page.locator(".logs-section")).toContainText("sanitized operation log");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]); await page.locator(".logs-section").getByRole("button", { name: /sao chép|copy/i }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("sanitized operation log");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: /tải xuống|download/i }).click(); expect((await download).suggestedFilename()).toContain("logs.txt");

  await page.getByRole("button", { name: /công cụ hệ thống|system tools/i }).click();
  await page.getByRole("button", { name: /giám sát hệ thống|system monitor/i }).click();
  await expect(page.locator(".monitor-modal")).toContainText("12%");
  await expect(page.locator(".monitor-modal")).toContainText("load 0.1/0.2/0.3");
  await page.locator(".monitor-modal").getByRole("button", { name: /đóng|close/i }).click();
  await page.getByRole("link", { name: /công việc|jobs/i }).first().click(); await expect(page).toHaveURL(/\/$/);
  if (process.env.UPDATE_UI_BASELINE === "1") { await cleanCapture(page); await page.screenshot({ path: path.resolve(process.cwd(), "../docs/ui-parity/dashboard.png") }); await page.setViewportSize({ width: 1366, height: 768 }); await page.screenshot({ path: path.resolve(process.cwd(), "../docs/ui-parity/dashboard-1366x768.png") }); await page.setViewportSize({ width: 1440, height: 900 }); }
  await page.locator(".job-row").filter({ hasText: "smoke.pdf" }).getByRole("button", { name: /xóa|delete/i }).click();
  await page.getByRole("button", { name: /xóa vĩnh viễn|delete permanently/i }).click();
  await expect(page.locator(".job-row").filter({ hasText: "smoke.pdf" })).toHaveCount(0);
});

test("real Next and FastAPI use eager Celery with a fake HTTP provider", async ({ page }) => {
  await page.goto("/upload");
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({ name: "integration.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: /bắt đầu OCR|start OCR/i }).click();
  await expect(page).toHaveURL(/\/jobs\//);
  const documentNumber = page.locator(".field-card").filter({ hasText: "Số văn bản" }).locator("input");
  await expect(documentNumber).toHaveValue("DOC-001", { timeout: 20_000 });
  const sourceId = new URL(page.url()).pathname.split("/").pop()!;
  await documentNumber.fill("DOC-002");
  await page.getByRole("button", { name: /lưu và duyệt|save and approve/i }).click();
  await page.reload(); await expect(documentNumber).toHaveValue("DOC-002");
  await page.locator(".detail-tabs").getByRole("button", { name: /artifacts/i }).click();
  await expect(page.locator(".artifact-section")).toContainText("corrected.json");
  await page.locator(".detail-tabs").getByRole("button", { name: /rà soát|review/i }).click();
  await documentNumber.focus(); await page.getByRole("button", { name: /vẽ crop|draw crop/i }).click();
  const image = page.locator(".crop-canvas img"), box = await image.boundingBox(); expect(box).toBeTruthy();
  await page.mouse.move(box!.x + 10, box!.y + 10); await page.mouse.down(); await page.mouse.move(box!.x + 50, box!.y + 50); await page.mouse.up();
  await page.getByRole("button", { name: /lưu crop|save crop/i }).click(); await expect(page.locator(".evidence-list")).toBeVisible();
  await page.getByRole("button", { name: /chạy lại|rerun/i }).first().click(); await page.locator("dialog[open]").getByRole("button", { name: /xác nhận|confirm/i }).click();
  await expect(page).not.toHaveURL(new RegExp(`${sourceId}$`));
  await page.goto("/");
  const source = page.locator(".job-row").filter({ hasText: sourceId.slice(0, 8) }); await source.getByRole("button", { name: /xóa|delete/i }).click();
  await page.getByRole("button", { name: /xóa vĩnh viễn|delete permanently/i }).click(); await expect(source).toHaveCount(0);
});

test("desktop lifecycle modals and URL filters preserve backend semantics", async ({ page }) => {
  let status = "running", rerunConsent = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request(), apiPath = new URL(request.url()).pathname;
    const current = { ...fixtureJob(status), endpoint_external: true };
    if (apiPath === "/api/state") return route.fulfill({ json: state([current], true) });
    if (apiPath.endsWith("/cancel")) { status = "cancelling"; return route.fulfill({ json: { ...current, status } }); }
    if (apiPath.endsWith("/rerun")) { rerunConsent = request.postDataJSON().cloud_data_confirmed; return route.fulfill({ json: { ...current, id: rerunId, status: "starting" } }); }
    if (apiPath === `/api/jobs/${rerunId}`) return route.fulfill({ json: { ...current, id: rerunId, status: "starting" } });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto("/"); await expect(page.locator(".job-row").filter({ hasText: "smoke.pdf" })).toBeVisible(); await page.getByPlaceholder(/tìm kiếm|search/i).fill("smoke"); await expect(page).toHaveURL(/q=smoke/);
  await page.getByLabel(/sắp xếp|sort/i).selectOption("updated_desc"); await expect(page).toHaveURL(/sort=updated_desc/);
  await page.getByLabel(/trạng thái|status/i).selectOption("running"); await expect(page).toHaveURL(/status=running/);
  await page.goBack(); await expect(page.getByLabel(/trạng thái|status/i)).toHaveValue("all");
  await page.goForward(); await expect(page.getByLabel(/trạng thái|status/i)).toHaveValue("running");
  await page.locator(".job-row").filter({ hasText: "smoke.pdf" }).getByRole("button", { name: /hủy|cancel/i }).click();
  await page.getByRole("button", { name: /xác nhận|confirm/i }).click(); await expect(page.locator(".job-row").filter({ hasText: "smoke.pdf" })).toContainText(/đang hủy|cancelling/i);
  status = "interrupted"; await page.getByRole("button", { name: /làm mới|refresh/i }).click();
  await page.locator(".job-row").filter({ hasText: "smoke.pdf" }).getByRole("button", { name: /chạy lại|rerun/i }).click();
  await page.locator("dialog").getByRole("checkbox").check(); await page.getByRole("button", { name: /xác nhận|confirm/i }).click(); expect(rerunConsent).toBeTruthy();
  await page.setViewportSize({ width: 1366, height: 768 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("desktop jobs warning status stays inside its column", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const job = {
    ...fixtureJob("completed_with_warnings"),
    upload_name: "1040-ttg.signed.pdf + 14", expected_files: 15, uploaded_files: 15,
    page_count: 51, total_pages: 29, completed_pages: 29, progress_stage: "completed",
  };
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === "/api/state") return route.fulfill({ json: state([job]) });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto("/");
  const row = page.locator(".job-row").filter({ hasText: job.upload_name });
  const badge = row.locator(".status");
  await expect(badge).toBeVisible();
  expect(await badge.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  const textRight = await badge.evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element);
    return range.getBoundingClientRect().right;
  });
  const providerLeft = (await row.locator(":scope > span").nth(1).boundingBox())?.x;
  expect(providerLeft).toBeDefined();
  expect(textRight).toBeLessThanOrEqual(providerLeft!);
});

test("mobile English keeps PDF-only errors, instant language and closable monitor", async ({ page }) => {
  let uploadFails = true;
  await page.setViewportSize({ width: 390, height: 844 }); await page.addInitScript(() => localStorage.setItem("intellidoc.language", "en"));
  await page.route("**/api/**", async (route) => {
    const request = route.request(), apiPath = new URL(request.url()).pathname;
    if (apiPath === "/api/state") return route.fulfill({ json: state([]) });
    if (apiPath === "/api/system-metrics") return route.fulfill({ json: { cpu_percent: 1, memory_percent: 2, disk: null, gpu: { status: "unavailable", devices: [] } } });
    if (apiPath === "/api/jobs" && request.method() === "POST") return route.fulfill({ json: fixtureJob("uploading") });
    if (apiPath === `/api/jobs/${id}/files`) return uploadFails ? route.fulfill({ status: 400, json: { detail: { code: "unsupported_file", message: "unsupported_file" } } }) : route.fulfill({ json: { job: fixtureJob("ready") } });
    if (apiPath === `/api/jobs/${id}/start`) return route.fulfill({ status: 503, json: { detail: { code: "worker_unavailable", message: "worker_unavailable" } } });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto("/upload"); await expect(page.locator("html")).toHaveAttribute("lang", "en"); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Upload PDF");
  await page.getByRole("button", { name: "VI", exact: true }).click(); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tải PDF"); await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator('input[type="file"]:not([webkitdirectory])')).toHaveAttribute("accept", "application/pdf,.pdf"); expect((await page.request.get("/icon.svg")).ok()).toBeTruthy();
  await page.getByLabel("VLM task").selectOption("metadata"); await page.getByLabel("Page scope").selectOption("auto"); await page.getByLabel("Candidate page limit").fill("2");
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({ name: "bad.pdf", mimeType: "application/pdf", buffer: pdf }); await page.getByRole("button", { name: "Start OCR" }).click();
  await expect(page.locator(".notice.error")).toContainText("Unsupported file"); uploadFails = false;
  await page.getByRole("button", { name: "Start OCR" }).click();
  await expect(page.locator(".notice.error")).toContainText("Worker unavailable");
  await expect(page.locator('input[type="file"]:not([webkitdirectory])')).toHaveValue(/bad\.pdf$/); await expect(page.getByLabel("VLM task")).toHaveValue("metadata"); await expect(page.getByLabel("Page scope")).toHaveValue("auto"); await expect(page.getByLabel("Candidate page limit")).toHaveValue("2");
  await page.locator(".menu-toggle").click(); await page.getByRole("button", { name: /system tools/i }).click(); await page.getByRole("button", { name: /system monitor/i }).click();
  await expect(page.locator("#primary-navigation")).not.toHaveClass(/open/); await expect(page.locator(".monitor-modal")).toBeVisible(); await page.locator(".monitor-modal").getByRole("button", { name: "Close" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  if (process.env.UPDATE_UI_BASELINE === "1") { await cleanCapture(page); await page.screenshot({ path: path.resolve(process.cwd(), "../docs/ui-parity/mobile-upload-390x844.png") }); }
});

test("initial and stale state errors preserve only real snapshots", async ({ page }) => {
  let mode: "initial-error" | "success" | "stale" | "running" = "initial-error";
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/state") return route.fulfill({ status: 404, json: { detail: "unmocked" } });
    if (mode === "initial-error") return route.fulfill({ status: 503, json: { detail: { code: "provider_unavailable", message: "provider_unavailable" } } });
    if (mode === "stale") return route.fulfill({ status: 503, json: { detail: { code: "worker_unavailable", message: "worker_unavailable" } } });
    return route.fulfill({ json: state([fixtureJob(mode === "running" ? "running" : "completed")]) });
  });
  await page.goto("/"); await expect(page.locator("section[role=alert]")).toContainText("Provider không khả dụng"); await expect(page.locator(".metrics")).toHaveCount(0);
  mode = "success"; await page.getByRole("button", { name: /thử lại|retry/i }).click(); const row = page.locator(".job-row").filter({ hasText: "smoke.pdf" }); await expect(row).toContainText("Số hiệu chỉnh: 0"); await expect(row).toContainText("Tạo lúc");
  await page.getByLabel(/chọn mọi công việc đã kết thúc|select all terminal/i).check(); await expect(row.getByRole("checkbox")).toBeChecked(); mode = "stale"; await page.getByRole("button", { name: /làm mới|refresh/i }).click(); await expect(page.locator(".notice.warning")).toBeVisible(); await expect(row.getByRole("checkbox")).toBeChecked();
  mode = "running"; await page.locator(".notice.warning").getByRole("button", { name: /thử lại|retry/i }).click(); await expect(row.getByRole("checkbox")).toBeDisabled(); await expect(row.getByRole("checkbox")).not.toBeChecked();
});

test("upload validates duplicate, limits and native drag-drop", async ({ page }) => {
  await page.route("**/api/state**", (route) => route.fulfill({ json: { ...state([]), limits: { max_files_per_job: 2, max_job_upload_bytes: 1024 } } }));
  await page.goto("/upload"); const input = page.locator('input[type="file"]:not([webkitdirectory])');
  await page.locator(".dropzone").evaluate((element) => { const transfer = new DataTransfer(); transfer.items.add(new File(["%PDF"], "same.pdf")); transfer.items.add(new File(["%PDF"], "SAME.PDF")); element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); }); await expect(page.locator(".notice.error")).toContainText("trùng");
  await input.setInputFiles([{ name: "a.pdf", mimeType: "application/pdf", buffer: pdf }, { name: "b.pdf", mimeType: "application/pdf", buffer: pdf }, { name: "c.pdf", mimeType: "application/pdf", buffer: pdf }]); await expect(page.locator(".notice.error")).toContainText("giới hạn");
  await page.locator(".dropzone").evaluate((element) => { const transfer = new DataTransfer(); transfer.items.add(new File(["%PDF-1.7"], "DROP.PDF", { type: "" })); element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); });
  await expect(page.locator(".file-list")).toContainText("DROP.PDF");
});

test("upload keeps fifteen selected files compact and clearable", async ({ page }) => {
  await page.route("**/api/state**", (route) => route.fulfill({ json: state([]) }));
  await page.goto("/upload");
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles(Array.from({ length: 15 }, (_, index) => ({ name: `file-${index + 1}.pdf`, mimeType: "application/pdf", buffer: pdf })));
  await expect(page.locator(".file-list-head")).toContainText("15");
  await expect(page.locator(".file-list-head").getByRole("button", { name: /xóa tất cả|clear all/i })).toBeVisible();
  const listSize = await page.locator(".file-list-items").evaluate((list) => ({ client: list.clientHeight, scroll: list.scrollHeight }));
  expect(listSize.scroll).toBeGreaterThan(listSize.client);
  await page.locator(".file-list-head").getByRole("button", { name: /xóa tất cả|clear all/i }).click();
  await expect(page.locator(".file-list")).toHaveCount(0);
});

test("folder picker selects only a PDF folder through the existing upload flow", async ({ page }) => {
  await page.route("**/api/state**", (route) => route.fulfill({ json: state([]) }));
  await page.goto("/upload");
  const folder = page.getByLabel(/thư mục PDF|PDF folder/i);
  await expect(folder).toHaveAttribute("webkitdirectory", "");
  await folder.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["%PDF-1.7"], "first.pdf", { type: "application/pdf" }));
    transfer.items.add(new File(["%PDF-1.7"], "second.pdf", { type: "application/pdf" }));
    Object.defineProperty(element, "files", { configurable: true, value: transfer.files });
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator(".file-list")).toContainText("first.pdf");
  await expect(page.locator(".file-list")).toContainText("second.pdf");
});

test("upload sends selected PDFs sequentially with a compact name", async ({ page }) => {
  const uploaded: string[] = []; let createBody: any;
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), apiPath = url.pathname;
    if (apiPath === "/api/state") return route.fulfill({ json: state([]) });
    if (apiPath === "/api/jobs" && request.method() === "POST") { createBody = request.postDataJSON(); return route.fulfill({ json: { ...fixtureJob("uploading"), expected_files: 2, uploaded_files: 0 } }); }
    if (apiPath === `/api/jobs/${id}/files`) { uploaded.push(url.searchParams.get("path") || ""); return route.fulfill({ json: { job: { ...fixtureJob(uploaded.length === 2 ? "ready" : "uploading"), expected_files: 2, uploaded_files: uploaded.length } } }); }
    if (apiPath === `/api/jobs/${id}/start`) return route.fulfill({ json: fixtureJob("starting") });
    if (apiPath === `/api/jobs/${id}`) return route.fulfill({ json: fixtureJob("completed") });
    if (apiPath.endsWith(".png")) return route.fulfill({ contentType: "image/svg+xml", body: svg });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto("/upload"); await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles([{ name: "first.pdf", mimeType: "application/pdf", buffer: pdf }, { name: "second.pdf", mimeType: "application/pdf", buffer: pdf }]); await page.getByRole("button", { name: /bắt đầu OCR|start OCR/i }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${id}(?:\\?.*)?$`)); expect(uploaded).toEqual(["first.pdf", "second.pdf"]); expect(createBody).toMatchObject({ upload_name: "first.pdf +1", vlm_task: "full_ocr", vlm_pages: "all", vlm_max_pages: 0 });
});

test("default document, dirty navigation and browser back keep drafts", async ({ page }) => {
  const bad = { id: "bad", file_name: "bad.pdf", status: "error", error: "provider_timeout", fields: {}, pages: [], crop_evidence: [] };
  const valid = { ...fixtureDocument(), id: "valid", file_name: "valid.pdf", fields: { ...fixtureDocument().fields, trich_yeu: { value: "Long", ocr_value: "Long", confidence: .8, bbox: [], page_index: 1 }, legacy_blob: { value: { legacy: true }, confidence: -1, bbox: [], page_index: 0 } }, pages: [{ page_index: 0, image_url: `/api/jobs/${id}/artifacts/valid/page-1.png` }, { page_index: 1, image_url: `/api/jobs/${id}/artifacts/valid/page-2.png` }] };
  const approved = { ...fixtureDocument(), id: "approved", file_name: "approved.pdf", review_status: "approved", approved_at: now };
  const job = { ...fixtureJob("completed"), documents: [approved, valid, bad], logs: [] } as any;
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === "/api/state") return route.fulfill({ json: state([job]) });
    if (apiPath === `/api/jobs/${id}`) return route.fulfill({ json: job });
    if (apiPath.endsWith("page-2.png")) return route.fulfill({ status: 404, body: "" });
    if (apiPath.endsWith(".png")) return route.fulfill({ contentType: "image/svg+xml", body: svg });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto("/"); await page.locator(".job-row").getByRole("link", { name: "smoke.pdf" }).click(); await expect(page.locator(".document-error")).toContainText("Provider quá thời gian chờ");
  await page.getByRole("button", { name: /valid\.pdf/i }).click(); await expect(page.locator(".field-card pre")).toContainText('"legacy": true'); await expect(page.locator(".logs-section")).toHaveCount(0);
  await page.locator(".field-card textarea").focus(); await expect(page.locator('.page-numbers button[aria-current="page"]')).toHaveText("2"); await expect(page.locator(".artifact-error")).toContainText("Không tải được ảnh trang");
  const input = page.locator(".field-card input").first(); await input.fill("DRAFT"); await page.locator("a.brand").click(); await expect(page.locator("dialog[open]")).toContainText("Thay đổi chưa lưu"); await page.locator("dialog[open] .modal-actions").getByRole("button", { name: "Đóng" }).click(); await expect(input).toHaveValue("DRAFT");
  await page.evaluate(() => history.back()); await expect(page.locator("dialog[open]")).toContainText("Bỏ các thay đổi"); await page.locator("dialog[open] .modal-actions").getByRole("button", { name: "Đóng" }).click(); await expect(page).toHaveURL(new RegExp(`/jobs/${id}(?:\\?.*)?$`)); await expect(input).toHaveValue("DRAFT");
  await page.getByRole("button", { name: /approved\.pdf/i }).click(); await page.locator("dialog[open]").getByRole("button", { name: "Xác nhận" }).click(); await expect(page.locator(".document-tabs button.active")).toContainText("approved.pdf");
});

test("partial page warning keeps usable review fields visible", async ({ page }) => {
  const base = fixtureDocument();
  const document = { ...base, fields: {
    ...base.fields,
    so_van_ban: { ...base.fields.so_van_ban, bbox: [], page_index: 1, evidence_url: "", evidence_status: "unavailable", review_reason: "missing_evidence", evidence_reason: "bbox_missing" },
  }, errors: ["provider_timeout"], pages: [
    { page_index: 0, image_url: `/api/jobs/${id}/artifacts/smoke/page-1.png`, status: "completed", ocr_scope: "metadata", error: "" },
    { page_index: 1, image_url: `/api/jobs/${id}/artifacts/smoke/page-2.png`, status: "completed", ocr_scope: "metadata", error: "" },
    { page_index: 2, image_url: `/api/jobs/${id}/artifacts/smoke/page-3.png`, status: "error", ocr_scope: "metadata", error: "provider_timeout" },
  ] } as any;
  const job = { ...fixtureJob("completed_with_warnings"), documents: [document], failed_pages: 1 } as any;
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === `/api/jobs/${id}`) return route.fulfill({ json: job });
    if (apiPath.endsWith(".png")) return route.fulfill({ contentType: "image/svg+xml", body: svg });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto(`/jobs/${id}?view=review`);
  await expect(page.locator(".partial-warning")).toContainText(/2\/3/);
  await expect(page.locator(".field-card")).toBeVisible();
  await expect(page.locator(".field-card")).toContainText("Provider không trả vùng định vị");
  await page.getByRole("button", { name: "Xem trang nguồn" }).click();
  await expect(page.locator('.page-numbers button[aria-current="page"]')).toHaveText("2");
  await expect(page.locator(".viewer-panel")).toBeVisible();
  await expect(page.locator(".page-numbers .page-error")).toHaveText("3");
  await expect(page.locator(".document-error")).toHaveCount(0);
});

test("warning pages remain successful and skipped pages are excluded", async ({ page }) => {
  const document = { ...fixtureDocument(), errors: ["invalid_field_value"], pages: [
    { page_index: 0, image_url: `/api/jobs/${id}/artifacts/smoke/page-1.png`, status: "completed_with_warnings", ocr_scope: "metadata", error: "invalid_field_value", warnings: ["invalid_field_value"] },
    { page_index: 1, image_url: `/api/jobs/${id}/artifacts/smoke/page-2.png`, status: "skipped", ocr_scope: "none", error: "" },
  ] } as any;
  const job = { ...fixtureJob("completed_with_warnings"), documents: [document], page_count: 2, failed_pages: 0 } as any;
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === `/api/jobs/${id}`) return route.fulfill({ json: job });
    if (apiPath.endsWith(".png")) return route.fulfill({ contentType: "image/svg+xml", body: svg });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto(`/jobs/${id}?view=review`);
  await expect(page.locator(".partial-warning")).toContainText(/1\/1/);
  await expect(page.locator(".page-numbers .page-warning")).toHaveText("1");
  await expect(page.locator(".page-numbers .page-error")).toHaveCount(0);
});

test("metadata page plan distinguishes processed pages from PDF pages", async ({ page }) => {
  const document = { ...fixtureDocument(), pages: Array.from({ length: 5 }, (_, pageIndex) => ({
    page_index: pageIndex,
    image_url: `/api/jobs/${id}/artifacts/smoke/page-${pageIndex + 1}.png`,
    status: pageIndex === 0 || pageIndex === 4 ? "completed" : "skipped",
    ocr_scope: pageIndex === 0 || pageIndex === 4 ? "metadata" : "none",
    error: "",
  })) } as any;
  const job = { ...fixtureJob("completed", document), page_count: 5, vlm_task: "metadata", vlm_pages: "first,last" } as any;
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === `/api/jobs/${id}`) return route.fulfill({ json: job });
    if (apiPath.endsWith(".png")) return route.fulfill({ contentType: "image/svg+xml", body: svg });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto(`/jobs/${id}?view=overview`);
  await expect(page.locator(".job-header")).toContainText("5 trang PDF");
  await expect(page.locator(".job-header")).toContainText("2/5 trang metadata");
  await expect(page.locator(".job-facts")).toContainText("Trang PDF");
  await expect(page.locator(".report-section")).toContainText("2 trang xử lý");
  await page.getByRole("button", { name: "Rà soát" }).click();
  await expect(page.locator(".page-numbers button[data-page-index]")).toHaveCount(5);
  await expect(page.locator(".page-numbers .page-skipped")).toHaveCount(3);
  await page.getByLabel(/đi đến trang|jump to page/i).fill("5"); await expect(page).toHaveURL(/page=4/);
  await page.getByLabel(/đi đến trang|jump to page/i).fill("1"); await expect(page).toHaveURL(/page=0/);
  await page.goBack(); await expect(page.getByLabel(/đi đến trang|jump to page/i)).toHaveValue("5");
  await page.reload(); await expect(page.getByLabel(/đi đến trang|jump to page/i)).toHaveValue("5");
});

test("monitor stops polling and preserves nullable GPU values", async ({ page }) => {
  let metricsCalls = 0;
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === "/api/state") return route.fulfill({ json: state([]) });
    if (apiPath === "/api/system-metrics") { metricsCalls += 1; return route.fulfill({ json: { cpu_percent: 10, memory_percent: 20, disk: null, gpu: { status: "available", devices: [{ index: 0, name: "GPU", utilization_percent: null, memory_used_mb: null, memory_total_mb: null, temperature_c: null }] } } }); }
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto("/"); await page.getByRole("button", { name: /công cụ hệ thống|system tools/i }).click(); await page.getByRole("button", { name: /giám sát hệ thống|system monitor/i }).click(); await expect(page.locator(".gpu-device")).toContainText("—"); await expect(page.locator(".gpu-device")).not.toContainText("0%");
  await expect(page).toHaveURL(/monitor=1/); const opened = metricsCalls; await page.waitForTimeout(2_200); expect(metricsCalls).toBeGreaterThan(opened);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); }); const hidden = metricsCalls; await page.waitForTimeout(2_200); expect(metricsCalls).toBe(hidden);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); }); await expect.poll(() => metricsCalls).toBeGreaterThan(hidden);
  await page.locator(".monitor-modal").getByRole("button", { name: /đóng|close/i }).click(); await expect(page).not.toHaveURL(/monitor=1/); const closed = metricsCalls; await page.waitForTimeout(2_200); expect(metricsCalls).toBe(closed);
});

test("terminal detail renders persisted progress, safe failure and timeline", async ({ page }) => {
  let reads = 0;
  const failed = {
    ...fixtureJob("error"), progress_stage: "failed", progress_detail: "metadata", completed_pages: 1, total_pages: 2,
    failure: { code: "provider_timeout", retryable: true, operator_hint: "rerun_job", page_index: 0 },
    logs: [{ timestamp: now, severity: "error", category: "document", code: "page_pass_failed", job_id: id, page_index: 0, message: "page_pass_failed" }],
  };
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === `/api/jobs/${id}`) { reads += 1; return route.fulfill({ json: failed }); }
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/jobs/${id}?view=logs`);
  await expect(page.locator(".job-progress")).toContainText("1/2");
  await expect(page.locator(".failure-card")).toContainText(/provider|nhà cung cấp/i);
  await expect(page.locator(".timeline")).toContainText(/page pass|lượt xử lý/i);
  await page.locator(".failure-card").getByRole("button", { name: /sao chép|copy/i }).click();
  const diagnostics = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(Object.keys(diagnostics).sort()).toEqual(["code", "job_id", "page_index", "provider_profile_id", "timestamp"]);
  const terminalReads = reads; await page.waitForTimeout(2_200); expect(reads).toBe(terminalReads);
});

test("app routes deep-link and Code Catalog CRUD survives reload", async ({ page }) => {
  let catalog = { revision: 0, items: [] as any[] }; let eventsQuery = ""; let reportsFail = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request(), apiPath = new URL(request.url()).pathname;
    if (apiPath === "/api/state") return route.fulfill({ json: state([]) });
    if (apiPath === "/api/documents") return route.fulfill({ json: { items: [{ id: "smoke", job_id: id, job_status: "completed", file_name: "smoke.pdf", document_type: "Thông báo", status: "completed", review_status: "approved", page_count: 1, confidence_average: .91, warning_count: 1, needs_review: true, has_blocker: true, has_risk: false, low_confidence: false, has_suggestion: false, has_manual_crop: false, blocker_count: 1, risk_count: 0, low_confidence_count: 0, suggestion_count: 0, manual_crop_count: 0, target_page_index: 0, target_field: "so_van_ban", updated_at: now, deep_link: `/jobs/${id}?document=smoke&view=review&page=0&field=so_van_ban` }], pagination: { page: 1, page_size: 25, total: 1, pages: 1 }, triage_counts: { all: 1, needs_review: 1, blocker: 1, risk: 0, low_confidence: 0, suggestion: 0, manual_crop: 0 } } });
    if (apiPath === "/api/events") { eventsQuery = new URL(request.url()).search; return route.fulfill({ json: { items: [{ timestamp: now, severity: "info", category: "lifecycle", code: "job_created", job_id: id, provider_profile_id: "qwen", document_id: "smoke", page_index: 0, message: "job_created" }], pagination: { page: 1, page_size: 50, total: 1, pages: 1 } } }); }
    if (apiPath === "/api/reports") return reportsFail ? route.fulfill({ status: 503, json: { detail: { code: "worker_unavailable", message: "worker_unavailable" } } }) : route.fulfill({ json: { operations: { total_jobs: 1, active_jobs: 0, completed_jobs: 1, error_jobs: 0, documents: 1, pages: 1, duration_seconds_average: 60, pages_per_minute: 1, failure_codes: {} }, quality: { documents: 1, approved_documents: 1, corrected_fields: 0, confidence_average: .91, total_fields: 1, confidence_coverage: 1, evidence_coverage: .5, warning_documents: 0 }, profiles: [{ provider_profile_id: "qwen", operations: { total_jobs: 1, active_jobs: 0, completed_jobs: 1, error_jobs: 0, documents: 1, pages: 1, duration_seconds_average: 60, pages_per_minute: 1, failure_codes: {} }, quality: { documents: 1, approved_documents: 1, corrected_fields: 0, confidence_average: .91, total_fields: 1, confidence_coverage: 1, evidence_coverage: .5, warning_documents: 0 }, recent_errors: [] }], benchmark_samples: null } });
    if (apiPath === "/api/sizing/overview") return route.fulfill({ json: { generated_at: now, sample_count: 0, operation_count: 0, value_kind: "unavailable", coverage: { response_usage_percent: null, billing_certainty_percent: null, complete_usage_attempts: 0, response_attempts: 0, known_billing_attempts: 0, total_attempts: 0 }, gates: { preview: { minimum_jobs: 1, available: false, reason: "measurement_foundation_pending" }, comparison: { minimum_jobs: 2, available: false, reason: "insufficient_sample" }, trend: { minimum_jobs: 5, available: false, reason: "insufficient_sample" }, capacity: { minimum_jobs: 20, available: false, reason: "insufficient_sample" } } } });
    if (apiPath === "/api/sizing/jobs") return route.fulfill({ json: { items: [], pagination: { page: 1, page_size: 25, total: 0, pages: 1 } } });
    if (apiPath === "/api/sizing/catalog") return route.fulfill({ json: { revision: 0, price_profiles: [], workload_profiles: [], hardware_profiles: [] } });
    if (apiPath === "/api/sizing/snapshots") return route.fulfill({ json: { items: [], pagination: { page: 1, page_size: 25, total: 0, pages: 1 }, quota_used: 0, quota_limit: 1000 } });
    if (apiPath === "/api/codes" && request.method() === "GET") return route.fulfill({ json: catalog });
    if (apiPath === "/api/codes" && request.method() === "POST") { const body = request.postDataJSON(); catalog = { revision: catalog.revision + 1, items: [{ ...body, created_at: now, updated_at: now }] }; return route.fulfill({ status: 201, json: catalog }); }
    if (apiPath === "/api/codes/BC" && request.method() === "PUT") { const body = request.postDataJSON(); catalog = { revision: catalog.revision + 1, items: catalog.items.map((item) => ({ ...item, ...body, code: item.code, group: item.group, updated_at: now })) }; return route.fulfill({ json: catalog }); }
    if (apiPath === "/api/codes/BC" && request.method() === "DELETE") { catalog = { revision: catalog.revision + 1, items: [] }; return route.fulfill({ json: catalog }); }
    return route.fulfill({ status: 404, json: { detail: { code: "unmocked", message: "unmocked" } } });
  });

  await page.goto("/"); const nav = page.locator("#primary-navigation");
  const shell = page.locator(".app-shell"), collapse = page.getByRole("button", { name: /thu gọn|collapse sidebar/i });
  await collapse.click(); await expect(shell).toHaveClass(/sidebar-collapsed/); await page.getByRole("button", { name: /mở rộng|expand sidebar/i }).click(); await expect(shell).not.toHaveClass(/sidebar-collapsed/);
  await expect(nav.getByRole("link", { name: /hàng đợi rà soát|review queue/i })).toHaveCount(0); await expect(nav.getByRole("link", { name: /nhật ký xử lý|processing logs/i })).toHaveCount(0);
  await page.locator(".review-queue-cta").click(); await expect(page).toHaveURL(/\/documents\?triage=needs_review$/); await expect(page.getByLabel(/lọc rà soát|review filter/i)).toContainText(/1/); await expect(page.getByRole("link", { name: /mở|open/i }).last()).toHaveAttribute("href", new RegExp(`document=smoke&view=review&page=0&field=so_van_ban`));
  await page.getByLabel(/lọc rà soát|review filter/i).selectOption("blocker"); await expect(page).toHaveURL(/triage=blocker/);
  await page.getByLabel(/lọc rà soát|review filter/i).selectOption("all"); await page.goBack(); await expect(page.getByLabel(/lọc rà soát|review filter/i)).toHaveValue("blocker"); await page.goForward();
  await nav.getByRole("link", { name: /công việc|jobs/i }).click(); await nav.getByRole("link", { name: /ocr mới|new ocr/i }).click(); await expect(page).toHaveURL(/\/upload$/);
  await page.getByRole("button", { name: /công cụ hệ thống|system tools/i }).click(); await nav.getByRole("link", { name: /nhật ký xử lý|processing logs/i }).click(); await expect(page).toHaveURL(/\/logs$/); await expect(page.locator(".data-table")).toContainText("job_created");
  await page.getByLabel(/trạng thái|status/i).selectOption("warning"); await page.getByLabel("Provider").fill("qwen"); await page.getByLabel(/tài liệu|document/i).fill("smoke"); await page.getByLabel(/số trang|pages/i).fill("0"); await expect.poll(() => eventsQuery).toContain("provider_profile_id=qwen"); expect(eventsQuery).toContain("document_id=smoke"); expect(eventsQuery).toContain("page_index=0"); await expect(page).toHaveURL(/severity=warning/); await expect(page).toHaveURL(/provider_profile_id=qwen/);
  await page.getByLabel(/trạng thái|status/i).selectOption("all"); await page.goBack(); await expect(page.getByLabel(/trạng thái|status/i)).toHaveValue("warning"); await page.goForward();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]); await page.getByRole("button", { name: /sao chép|copy/i }).click(); expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("job_created"); const safeDownload = page.waitForEvent("download"); await page.getByRole("button", { name: /tải xuống|download/i }).click(); expect((await safeDownload).suggestedFilename()).toBe("safe-events.json");
  await nav.getByRole("link", { name: /tổng quan vận hành|operations overview/i }).click(); await expect(page).toHaveURL(/\/reports$/); await expect(page.locator(".attention-grid")).toContainText("1"); await expect(page.locator(".attention-grid").getByRole("link", { name: /mở hàng đợi rà soát|open review queue/i })).toHaveAttribute("href", "/documents?triage=needs_review"); await expect(page.locator(".report-card").first()).toContainText("91%"); await expect(page.locator(".report-card").first()).toContainText("50%"); await expect(page.locator(".report-card").first()).toContainText("100%"); await expect(page.locator(".report-card").last()).toContainText("60s"); await expect(page.locator(".provider-report")).toContainText("qwen"); await expect(page.getByRole("heading", { name: /so sánh lần chạy|run comparison/i })).toHaveCount(0);
  await page.setViewportSize({ width: 1366, height: 768 }); const attentionCards = page.locator(".attention-card"); const firstDesktopCard = await attentionCards.first().boundingBox(), lastDesktopCard = await attentionCards.last().boundingBox(); expect(lastDesktopCard!.y).toBe(firstDesktopCard!.y); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy(); await page.setViewportSize({ width: 1440, height: 900 });
  reportsFail = true; await page.getByRole("button", { name: /làm mới|refresh/i }).click(); await expect(page.locator(".notice.warning")).toBeVisible(); await expect(page.locator(".provider-report")).toContainText("qwen"); reportsFail = false;
  await nav.getByRole("link", { name: /sizing and cost/i }).click(); await expect(page).toHaveURL(/\/sizing$/); await expect(page.getByRole("heading", { name: "Sizing and cost" })).toBeVisible(); await expect(page.getByText(/Chưa có measurement tương thích|No compatible measurements/i)).toBeVisible(); await expect(page.locator(".data-table tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: /công cụ hệ thống|system tools/i }).click(); await nav.getByRole("link", { name: /danh mục mã|code catalog/i }).click(); await expect(page).toHaveURL(/\/codes$/);
  await page.getByRole("button", { name: /thêm mã|add code/i }).click(); await page.getByLabel("Code").fill("BC"); await page.getByLabel(/nhãn|label/i).fill("Báo cáo"); await page.getByRole("button", { name: /^lưu$|^save$/i }).click();
  let row = page.locator(".data-table tbody tr").filter({ hasText: "BC" }); await expect(row).toContainText("Báo cáo");
  await page.reload(); row = page.locator(".data-table tbody tr").filter({ hasText: "BC" }); await expect(row).toBeVisible();
  await row.getByRole("button", { name: /sửa mã|edit code/i }).click(); await page.getByLabel(/nhãn|label/i).fill("Báo cáo mới"); await page.getByRole("button", { name: /^lưu$|^save$/i }).click(); await expect(row).toContainText("Báo cáo mới");
  page.once("dialog", (dialog) => dialog.accept()); await row.getByRole("button", { name: /xóa|delete/i }).click(); await expect(row).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/reports"); await expect(page.locator(".attention-card")).toHaveCount(4);
  const firstCard = await page.locator(".attention-card").nth(0).boundingBox(), secondCard = await page.locator(".attention-card").nth(1).boundingBox();
  expect(firstCard).not.toBeNull(); expect(secondCard!.y).toBeGreaterThan(firstCard!.y); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("operations overview distinguishes empty data from no attention", async ({ page }) => {
  let totalJobs = 0;
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === "/api/reports") return route.fulfill({ json: {
      operations: { total_jobs: totalJobs, active_jobs: 0, completed_jobs: totalJobs, error_jobs: 0, documents: 0, pages: 0, duration_seconds_average: null, pages_per_minute: null, failure_codes: {} },
      quality: { documents: 0, approved_documents: 0, corrected_fields: 0, confidence_average: null, total_fields: 0, confidence_coverage: null, evidence_coverage: null, warning_documents: 0 },
      profiles: [], benchmark_samples: null,
    } });
    if (apiPath === "/api/documents") return route.fulfill({ json: { items: [], pagination: { page: 1, page_size: 1, total: 0, pages: 1 }, triage_counts: { all: 0, needs_review: 0, blocker: 0, risk: 0, low_confidence: 0, suggestion: 0, manual_crop: 0 } } });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto("/reports"); await expect(page.locator(".report-empty")).toContainText(/chưa có dữ liệu vận hành|no operational data/i); await expect(page.locator(".attention-grid")).toHaveCount(0);
  totalJobs = 1; await page.getByRole("button", { name: /làm mới|refresh/i }).click(); await expect(page.locator(".report-empty")).toHaveCount(0); await expect(page.locator(".notice.success")).toContainText(/không có việc cần xử lý|nothing needs attention/i);
});

test("ready detail delete uses preview and result", async ({ page }) => {
  const ready = { ...fixtureJob("ready"), documents: [], page_count: 0 } as any; let allow = false;
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === `/api/jobs/${id}`) return route.fulfill({ json: ready });
    if (apiPath === "/api/jobs/delete-preview") return route.fulfill({ json: allow ? { deletable: [{ id, name: "smoke.pdf" }], skipped: [] } : { deletable: [], skipped: [{ id, name: "smoke.pdf" }] } });
    if (apiPath === "/api/jobs/bulk-delete") return route.fulfill({ json: { deleted: [], skipped: [], failed: [id] } });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto(`/jobs/${id}`); await page.getByRole("button", { name: /xóa|delete/i }).click(); await expect(page.locator("dialog[open]")).toContainText("smoke.pdf"); await expect(page.locator("dialog[open]").getByRole("button", { name: /xóa vĩnh viễn|delete permanently/i })).toBeDisabled(); await page.locator("dialog[open] .modal-actions").getByRole("button", { name: /đóng|close/i }).click();
  allow = true; await page.getByRole("button", { name: /xóa|delete/i }).click(); await page.locator("dialog[open]").getByRole("button", { name: /xóa vĩnh viễn|delete permanently/i }).click(); await expect(page.locator(".notice.error")).toContainText("Không xóa được 1 công việc");
});

test("combined dossier keeps revisioned segmentation review in the job detail", async ({ page }) => {
  const source = {
    id: "source-1", file_name: "dossier.pdf", page_count: 3, revision: 1, confirmed: false, confirmed_segments: [],
    pages: [0, 1, 2].map((source_page_index) => ({ source_page_index, classification: source_page_index ? "document_start" : "cover", error: "", image_url: `/api/jobs/${id}/artifacts/source-1/page-${source_page_index + 1}.png` })),
    proposal: [
      { id: "segment-1", logical_document_type: "dossier_cover", start_page: 0, end_page: 0 },
      { id: "segment-2", logical_document_type: "administrative_document", start_page: 1, end_page: 2 },
    ],
  };
  const job = { ...fixtureJob("awaiting_segmentation_review"), processing_mode: "combined_dossier", documents: [], source_pdfs: [source], segmentation_completed_pages: 3, segmentation_total_pages: 3 } as any;
  const bodies: any[] = []; let conflicted = false; let continued = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request(), apiPath = new URL(request.url()).pathname;
    if (apiPath === `/api/jobs/${id}` && request.method() === "GET") return route.fulfill({ json: conflicted ? { ...job, source_pdfs: [{ ...source, revision: 2 }] } : job });
    if (apiPath.endsWith("/segmentation/confirm")) { bodies.push(request.postDataJSON()); if (!conflicted) { conflicted = true; return route.fulfill({ status: 409, json: { detail: { code: "segmentation_conflict", message: "segmentation_conflict" } } }); } return route.fulfill({ json: { ...job, status: "segmentation_confirmed", source_pdfs: [{ ...source, confirmed: true }] } }); }
    if (apiPath.endsWith("/continue")) { continued = true; return route.fulfill({ json: { ...job, status: "extraction_starting" } }); }
    if (apiPath.includes("/artifacts/") && apiPath.endsWith(".png")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto(`/jobs/${id}`); await expect(page.getByRole("heading", { name: /xác nhận cấu trúc hồ sơ|confirm document structure/i })).toBeVisible();
  const types = page.getByLabel(/loại phân đoạn|segment type/i), confirm = page.getByRole("button", { name: /xác nhận PDF này|confirm this PDF/i });
  await types.nth(1).selectOption("excluded"); await expect(confirm).toBeEnabled();
  await types.nth(1).selectOption("administrative_document");
  await page.getByLabel(/tách trước trang|split before page/i).selectOption("2");
  await page.getByLabel(/loại phân đoạn|segment type/i).nth(2).selectOption("excluded");
  await confirm.click();
  const conflict = page.locator(".segmentation-review .conflict"); await expect(conflict).toBeVisible(); await expect(conflict.getByRole("button", { name: /tải lại và bỏ bản nháp|reload and discard/i })).toBeVisible(); await conflict.getByRole("button", { name: /giữ bản nháp|keep draft/i }).click();
  await page.getByRole("button", { name: /xác nhận PDF này|confirm this PDF/i }).click();
  expect(bodies.map((body) => body.revision)).toEqual([1, 2]); expect(bodies[1].segments[2].logical_document_type).toBe("excluded");
  await page.getByRole("button", { name: /tiếp tục trích xuất|continue extraction/i }).click(); expect(continued).toBeTruthy();
});

test("multi-PDF dossier can confirm the whole document structure at once", async ({ page }) => {
  const source = (id: string, file_name: string, logical_document_type: "dossier_cover" | "administrative_document") => ({
    id, file_name, page_count: 1, revision: 1, confirmed: false, confirmed_segments: [],
    pages: [{ source_page_index: 0, classification: logical_document_type === "dossier_cover" ? "cover" : "document_start", error: "", image_url: `/api/jobs/${id}/artifacts/${id}/page-1.png` }],
    proposal: [{ id: "segment-1", logical_document_type, start_page: 0, end_page: 0 }],
  });
  const sources = Array.from({ length: 19 }, (_, index) => source(`source-${index + 1}`, `Scan_${String(index).padStart(4, "0")}.pdf`, index ? "administrative_document" : "dossier_cover"));
  const job = { ...fixtureJob("awaiting_segmentation_review"), processing_mode: "combined_dossier", documents: [], source_pdfs: sources, segmentation_completed_pages: 19, segmentation_total_pages: 19, completed_pages: 19, total_pages: 19, progress_stage: "pages awaiting review" } as any;
  const confirmed: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(), apiPath = new URL(request.url()).pathname;
    if (apiPath === `/api/jobs/${id}`) return route.fulfill({ json: job });
    if (apiPath.endsWith("/segmentation/confirm")) {
      confirmed.push(apiPath.split("/")[5]);
      return route.fulfill({ json: { ...job, status: confirmed.length === sources.length ? "segmentation_confirmed" : "awaiting_segmentation_review" } });
    }
    if (apiPath.includes("/artifacts/")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto(`/jobs/${id}`);
  await expect(page.getByLabel(/loại phân đoạn|segment type/i).first().locator("option")).toHaveCount(2);
  await expect(page.locator(".job-header .status")).toHaveCSS("background-color", "rgb(255, 241, 204)");
  await expect(page.locator(".job-progress")).toHaveClass(/needs-review/);
  await expect(page.locator(".job-progress progress")).toHaveCSS("accent-color", "rgb(217, 147, 18)");
  await expect(page.locator(".job-facts").getByRole("button", { name: /hủy|cancel/i })).toHaveCount(0);
  await expect(page.locator(".job-lifecycle-actions").getByRole("button", { name: /hủy|cancel/i })).toBeVisible();
  await expect(page.locator(".confirm-source")).toHaveCount(19);
  await expect(page.locator(".confirm-source.primary")).toHaveCount(0);
  const reviewSpacing = await page.locator(".segmentation-review").evaluate((review) => {
    const panel = getComputedStyle(review), row = getComputedStyle(review.querySelectorAll("article")[1]), list = getComputedStyle(review.querySelector(".segmentation-sources")!);
    return { panelPadding: parseFloat(panel.paddingLeft), rowPadding: parseFloat(row.paddingTop), divider: row.borderTopStyle, listBorder: list.borderTopWidth };
  });
  expect(reviewSpacing).toMatchObject({ panelPadding: 20, rowPadding: 16, divider: "solid", listBorder: "1px" });
  const sourceListSize = await page.locator(".segmentation-sources").evaluate((list) => ({ client: list.clientHeight, scroll: list.scrollHeight }));
  expect(sourceListSize.scroll).toBeGreaterThan(sourceListSize.client);
  await page.getByRole("button", { name: /xác nhận tất cả PDF|confirm all PDFs/i }).click();
  await expect.poll(() => confirmed.length).toBe(sources.length);
  expect(confirmed).toEqual(sources.map((item) => item.id));
});

test("rerun keeps the snapshot and exposes both segmentation choices", async ({ page }) => {
  const source = { ...fixtureJob("completed"), processing_mode: "combined_dossier", vlm_task: "metadata", vlm_pages: "first,last", vlm_max_pages: 2 } as any;
  const bodies: any[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(), apiPath = new URL(request.url()).pathname;
    if (apiPath === `/api/jobs/${id}`) return route.fulfill({ json: source });
    if (apiPath.endsWith("/rerun")) {
      bodies.push(request.postDataJSON());
      if (bodies.length === 1) return route.fulfill({ status: 409, json: { detail: { code: "provider_profile_unavailable", message: "provider_profile_unavailable" } } });
      return route.fulfill({ json: { ...source, id: rerunId, status: "starting" } });
    }
    if (apiPath === `/api/jobs/${rerunId}`) return route.fulfill({ json: { ...source, id: rerunId, status: "starting" } });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto(`/jobs/${id}`);
  await page.getByRole("button", { name: /chạy lại|rerun/i }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText(/metadata.*first,last.*max 2/i);
  await dialog.getByRole("combobox").selectOption("resegment");
  await dialog.getByRole("button", { name: /xác nhận|confirm/i }).click();
  await expect(dialog).toBeVisible(); await expect(page.locator(".notice.error")).toContainText(/không còn khả dụng|unavailable/i);
  await dialog.getByRole("combobox").selectOption("reuse_segmentation");
  await dialog.getByRole("button", { name: /xác nhận|confirm/i }).click();
  await expect(page).toHaveURL(new RegExp(rerunId));
  expect(bodies.map((body) => body.rerun_mode)).toEqual(["resegment", "reuse_segmentation"]);
});

test("missing canonical fields keep drafts until atomic approval succeeds", async ({ page }) => {
  const document: any = fixtureDocument();
  document.expected_fields = ["co_quan_ban_hanh", "so_van_ban", "ngay_ban_hanh", "trich_yeu", "nguoi_ky", "khoa"];
  document.required_fields = document.expected_fields.slice(0, 4);
  document.fields = { co_quan_ban_hanh: { value: "A" }, so_van_ban: { value: "1" }, trich_yeu: { value: "T" }, document_type: { value: "legacy" } };
  document.approval_blockers = [{ code: "missing_required_field", field: "ngay_ban_hanh" }]; document.review_risks = []; document.review_risk_count = 0;
  let calls = 0, body: any;
  await page.route("**/api/**", async (route) => {
    const request = route.request(), apiPath = new URL(request.url()).pathname;
    if (apiPath === `/api/jobs/${id}` && request.method() === "GET") return route.fulfill({ json: fixtureJob("completed", document) });
    if (apiPath.endsWith("/corrections")) {
      body = request.postDataJSON(); calls += 1;
      if (calls === 1) return route.fulfill({ status: 409, json: { detail: { code: "approval_blocked", message: "approval_blocked", blockers: [{ code: "missing_required_field", field: "trich_yeu" }] } } });
      document.fields.ngay_ban_hanh = { value: "2026-07-22", method: "manual" }; document.fields.nguoi_ky = { value: "B", method: "manual" }; document.approval_blockers = []; document.review_status = "approved";
      return route.fulfill({ json: { saved_count: 2, job: fixtureJob("completed", document), document_status: { approved: true } } });
    }
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto(`/jobs/${id}`);
  await expect(page.locator(".field-card").filter({ hasText: /^Khóa/ })).toBeVisible();
  await expect(page.locator(".field-card").filter({ hasText: "Loại tài liệu" }).locator("input, textarea")).toHaveCount(0);
  await page.getByLabel(/người ký|signatory/i).fill("B"); await page.getByRole("button", { name: /lưu và duyệt|save and approve/i }).click();
  await expect(page.getByLabel(/người ký|signatory/i)).toHaveValue("B");
  await expect(page.locator(".editor-panel .notice.error")).toContainText(/trích yếu|summary/i);
  await page.getByLabel(/ngày ban hành|issue date/i).fill("2026-07-22"); await page.keyboard.press("Control+s");
  expect(body.corrections).toEqual(expect.arrayContaining([{ field: "ngay_ban_hanh", old_value: null, new_value: "2026-07-22" }, { field: "nguoi_ky", old_value: null, new_value: "B" }]));
});

test("sizing local workflow gates drilldown calculator catalog snapshot and retention", async ({ page }) => {
  const secondJobId = "22222222-2222-4222-8222-222222222222";
  let catalog = { revision: 0, price_profiles: [] as any[], workload_profiles: [] as any[], hardware_profiles: [] as any[] };
  let snapshots: any[] = [];
  const overview = { generated_at: now, sample_count: 1, operation_count: 1, value_kind: "measured", unit: "job", unit_sample_count: 1, prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, duration_ms_p50: 20, duration_ms_p95: 20, known_cost: null, total_cost: null, unknown_cost_attempts: 1, series: [{ date: "2026-07-27", total_tokens: 12 }], provenance: { value_kind: "measured", sample_count: 1 }, coverage: { response_usage_percent: 100, billing_certainty_percent: 0, complete_usage_attempts: 1, response_attempts: 1, known_billing_attempts: 0, total_attempts: 1 }, gates: { preview: { minimum_jobs: 1, available: true, reason: "available" }, comparison: { minimum_jobs: 2, available: false, reason: "insufficient_sample" }, trend: { minimum_jobs: 5, available: false, reason: "insufficient_sample" }, capacity: { minimum_jobs: 20, available: false, reason: "insufficient_sample" } } };
  const sizingJob = (job_id: string) => ({ job_id, provider_profile_id: "qwen", processing_mode: "administrative_document", operation_count: 1, prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, known_cost: null, total_cost: null, response_usage_percent: 100, billing_certainty_percent: 0, started_at: now });
  const jobs = { items: [sizingJob(id), sizingJob(secondJobId)], pagination: { page: 1, page_size: 25, total: 2, pages: 1 } };
  await page.route("**/api/**", async (route) => {
    const request = route.request(), apiPath = new URL(request.url()).pathname;
    if (apiPath === "/api/sizing/overview") return route.fulfill({ json: overview });
    if (apiPath === "/api/sizing/jobs") return route.fulfill({ json: jobs });
    if (apiPath.endsWith("/operations")) return route.fulfill({ json: { items: [{ schema_version: 1, operation_id: "op", attempt: 1, scope: "job", job_id: id, provider_profile_id: "qwen", model: "m", task: "metadata", processing_mode: "administrative_document", document_id: "doc", page_index: 0, status: "success", started_at: now, duration_ms: 20, request_bytes: 10, response_bytes: 5, retryable: false, usage_status: "complete", usage: { prompt_tokens: 10, completion_tokens: 2, canonical_total_tokens: 12 } }], pagination: { page: 1, page_size: 50, total: 1, pages: 1 } } });
    if (apiPath === "/api/sizing/catalog" && request.method() === "GET") return route.fulfill({ json: catalog });
    if (apiPath === "/api/sizing/catalog" && request.method() === "PUT") { const body = request.postDataJSON(); catalog = { ...body, revision: catalog.revision + 1 }; return route.fulfill({ json: catalog }); }
    if (apiPath === "/api/sizing/calculate") return route.fulfill({ json: { value_kind: "calculated", average_jobs_per_hour: .625, peak_jobs_per_hour: .9375, required_capacity_jobs_per_hour: 1.17, measured_capacity_jobs_per_hour: null, theoretical_capacity_units: null, capacity_verdict: "insufficient_sample", cost_forecast_available: false, estimated_monthly_tokens: 1200, estimated_monthly_known_cost: null, self_host_tco: null } });
    if (apiPath === "/api/sizing/snapshots" && request.method() === "GET") return route.fulfill({ json: { items: snapshots, pagination: { page: 1, page_size: 25, total: snapshots.length, pages: 1 }, quota_used: snapshots.length, quota_limit: 1000 } });
    if (apiPath === "/api/sizing/snapshots" && request.method() === "POST") { const body = request.postDataJSON(); const item = { id: "snapshot-1", revision: 0, archived: false, created_at: now, ...body }; snapshots = [item]; return route.fulfill({ status: 201, json: item }); }
    if (apiPath === "/api/sizing/retention/preview") return route.fulfill({ json: { plan_token: "a".repeat(32), checksum: "b".repeat(64), operation_count: 1, rollup_count: 0 } });
    if (apiPath === "/api/sizing/retention/apply") return route.fulfill({ json: { deleted_operations: 1, deleted_rollups: 0 } });
    if (apiPath === "/api/sizing/exchange-rate-sources") return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 404, json: { detail: { code: "unmocked", message: "unmocked" } } });
  });
  await page.goto("/sizing"); await expect(page.getByText("12")).toBeVisible();
  await page.getByRole("button", { name: /Document Explorer/i }).click(); const attempts = page.getByRole("button", { name: /Xem attempts|View attempts/i }); await attempts.nth(0).click(); await attempts.nth(1).click(); await expect(page.locator(".attempts-table")).toHaveCount(2); await expect(page.locator(".attempts-table").first()).toContainText("complete");
  await page.getByRole("button", { name: /Kịch bản|Scenario/i }).click(); await page.getByRole("button", { name: /Tính Preview|Calculate Preview/i }).click(); await expect(page.locator(".safe-json")).toContainText("insufficient_sample");
  await page.getByRole("button", { name: /Lưu snapshot|Save snapshot/i }).click();
  await page.getByRole("button", { name: /Retention/i }).click(); await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  const dates = page.locator('input[type="date"]'); await dates.nth(0).fill("2026-01-01"); await dates.nth(1).fill("2026-12-31"); await page.getByRole("button", { name: /Preview xóa|Preview measurement/i }).click();
  await expect(page.locator(".retention-preview-operations")).toHaveText("1");
  await expect(page.locator(".retention-preview-rollups")).toHaveText("0");
  await dates.nth(1).fill("2026-11-30");
  await expect(page.locator(".retention-preview")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Xác nhận xóa|Confirm deletion/i })).toHaveCount(0);
  await dates.nth(1).fill("2026-12-31"); await page.getByRole("button", { name: /Preview xóa|Preview measurement/i }).click();
  await page.getByRole("button", { name: /Xác nhận xóa|Confirm deletion/i }).click(); await expect(page.getByRole("button", { name: /Xác nhận xóa|Confirm deletion/i })).toHaveCount(0);
});
