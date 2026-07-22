import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const id = "11111111-1111-4111-8111-111111111111";
const rerunId = "22222222-2222-4222-8222-222222222222";
const pdf = Buffer.from("JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjkuMAoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjkuMCk+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDw+PgplbmRvYmoKCjQgMCBvYmoKPDwvVHlwZS9QYWdlL01lZGlhQm94WzAgMCAyMDAgMjAwXS9Sb3RhdGUgMC9SZXNvdXJjZXMgMyAwIFIvUGFyZW50IDIgMCBSPj4KZW5kb2JqCgp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNDIgMDAwMDAgbiAKMDAwMDAwMDEyMCAwMDAwMCBuIAowMDAwMDAwMTcyIDAwMDAwIG4gCjAwMDAwMDAxOTMgMDAwMDAgbiAKCnRyYWlsZXIKPDwvU2l6ZSA1L1Jvb3QgMSAwIFIvSURbPDNEN0M2OEMzQjc1NzM3QzJBODJFNjFDMzkwQzM5QTMzPjw0ODZCMDFGNTNCNjRFNURCM0UwQUFDNjNFRTlGMEMwMT5dPj4Kc3RhcnR4cmVmCjI4NAolJUVPRgo=", "base64");
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="20" y="40">OCR</text></svg>');
const now = "2026-07-21T10:00:00Z";
const cleanCapture = async (page: Page) => page.locator("nextjs-portal").evaluateAll((nodes) => nodes.forEach((node) => node.remove())).catch(() => {});

function fixtureJob(status = "completed", document: Record<string, unknown> = fixtureDocument()) {
  return { id, status, created_at: now, updated_at: now, started_at: now, completed_at: now, ocr_method: "qwen", provider: "qwen", provider_profile_id: "qwen", model: "test-model", prompt_version: "3", endpoint_external: false, cloud_data_confirmed: false, expected_files: 1, uploaded_files: 1, upload_name: "smoke.pdf", documents: [document], logs: ["sanitized legacy log"], page_count: 1, failed_pages: 0, correction_count: 0, vlm_task: "full_ocr", vlm_pages: "all", vlm_max_pages: 0, report_url: `/api/jobs/${id}/artifacts/report.json` };
}
function fixtureDocument() {
  return { id: "smoke", file_name: "smoke.pdf", status: "completed", review_status: null as string | null, fields: { so_van_ban: { value: "OLD", ocr_value: "OLD", confidence: .91, bbox: [0, 0, 10, 10], page_index: 0 } }, pages: [{ page_index: 0, image_url: `/api/jobs/${id}/artifacts/smoke/page-1.png` }], crop_evidence: [] as Record<string, unknown>[] };
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
    if (apiPath === "/api/engines/qwen/check") return route.fulfill({ json: { id: "qwen", status: "configured", summary: "Configuration is present." } });
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
    if (apiPath === `/api/jobs/${id}/artifacts`) return route.fulfill({ json: { items: [{ name: "page-1.png", kind: "image", status: "available", size_bytes: 200, updated_at: now, document_id: "smoke", page_index: 0, download_url: `/api/jobs/${id}/artifacts/smoke/page-1.png` }] } });
    if (apiPath.includes("/artifacts/") && apiPath.endsWith(".png")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    if (apiPath.endsWith("report.json")) return route.fulfill({ json: { ok: true } });
    return route.fulfill({ status: 404, json: { detail: { code: "unmocked", message: "unmocked" } } });
  });

  await page.goto("/upload");
  await page.getByRole("button", { name: /kiểm tra lại|recheck/i }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "smoke.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: /bắt đầu OCR|start OCR/i }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${id}(?:\\?.*)?$`));
  await expect(page.locator(".field-card input").first()).toHaveValue("OLD");
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
  await page.locator(".detail-tabs").getByRole("button", { name: /artifacts/i }).click(); await expect(page.locator(".artifact-section")).toContainText("page-1.png"); await expect(page.locator(".artifact-section")).toContainText("200 B");
  await page.locator(".detail-tabs").getByRole("button", { name: /nhật ký|logs/i }).click(); await expect(page.locator(".logs-section")).toContainText("sanitized legacy log");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]); await page.getByRole("button", { name: /sao chép|copy/i }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("sanitized legacy log");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: /tải xuống|download/i }).click(); expect((await download).suggestedFilename()).toContain("logs.txt");

  await page.getByRole("button", { name: /giám sát hệ thống|system monitor/i }).click();
  await expect(page.locator(".monitor-modal")).toContainText("12%");
  await expect(page.locator(".monitor-modal")).toContainText("load 0.1/0.2/0.3");
  await page.locator(".monitor-modal").getByRole("button", { name: /đóng|close/i }).click();
  await page.getByRole("link", { name: /công việc|jobs/i }).first().click(); await expect(page).toHaveURL(/\/$/);
  if (process.env.UPDATE_UI_BASELINE === "1") { await cleanCapture(page); await page.screenshot({ path: path.resolve(process.cwd(), "../docs/ui-parity/recreated-dashboard.png") }); await page.setViewportSize({ width: 1366, height: 768 }); await page.screenshot({ path: path.resolve(process.cwd(), "../docs/ui-parity/recreated-dashboard-1366x768.png") }); await page.setViewportSize({ width: 1440, height: 900 }); }
  await page.locator(".job-row").filter({ hasText: "smoke.pdf" }).getByRole("button", { name: /xóa|delete/i }).click();
  await page.getByRole("button", { name: /xóa vĩnh viễn|delete permanently/i }).click();
  await expect(page.locator(".job-row").filter({ hasText: "smoke.pdf" })).toHaveCount(0);
});

test("real Next and FastAPI use eager Celery with a fake HTTP provider", async ({ page }) => {
  await page.goto("/upload");
  await page.locator('input[type="file"]').setInputFiles({ name: "integration.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: /bắt đầu OCR|start OCR/i }).click();
  await expect(page).toHaveURL(/\/jobs\//);
  await expect(page.locator(".field-card input").first()).toHaveValue("DOC-001", { timeout: 20_000 });
  const sourceId = new URL(page.url()).pathname.split("/").pop()!;
  await page.locator(".field-card input").first().fill("DOC-002");
  await page.getByRole("button", { name: /lưu và duyệt|save and approve/i }).click();
  await page.reload(); await expect(page.locator(".field-card input").first()).toHaveValue("DOC-002");
  await page.locator(".field-card input").first().focus(); await page.getByRole("button", { name: /vẽ crop|draw crop/i }).click();
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
  await page.locator(".job-row").filter({ hasText: "smoke.pdf" }).getByRole("button", { name: /hủy|cancel/i }).click();
  await page.getByRole("button", { name: /xác nhận|confirm/i }).click(); await expect(page.locator(".job-row").filter({ hasText: "smoke.pdf" })).toContainText(/đang hủy|cancelling/i);
  status = "interrupted"; await page.getByRole("button", { name: /làm mới|refresh/i }).click();
  await page.locator(".job-row").filter({ hasText: "smoke.pdf" }).getByRole("button", { name: /chạy lại|rerun/i }).click();
  await page.locator("dialog").getByRole("checkbox").check(); await page.getByRole("button", { name: /xác nhận|confirm/i }).click(); expect(rerunConsent).toBeTruthy();
  await page.setViewportSize({ width: 1366, height: 768 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
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
  await expect(page.locator('input[type="file"]')).toHaveAttribute("accept", "application/pdf,.pdf"); expect((await page.request.get("/icon.svg")).ok()).toBeTruthy();
  await page.getByLabel("VLM task").selectOption("metadata"); await page.getByLabel("Page scope").selectOption("first,last"); await page.getByLabel("Maximum pages").fill("2");
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.pdf", mimeType: "application/pdf", buffer: pdf }); await page.getByRole("button", { name: "Start OCR" }).click();
  await expect(page.locator(".notice.error")).toContainText("Unsupported file"); uploadFails = false;
  await page.getByRole("button", { name: "Start OCR" }).click();
  await expect(page.locator(".notice.error")).toContainText("Worker unavailable");
  await expect(page.locator('input[type="file"]')).toHaveValue(/bad\.pdf$/); await expect(page.getByLabel("VLM task")).toHaveValue("metadata"); await expect(page.getByLabel("Page scope")).toHaveValue("first,last"); await expect(page.getByLabel("Maximum pages")).toHaveValue("2");
  await page.getByRole("button", { name: /system monitor/i }).click(); await expect(page.locator(".monitor-modal")).toBeVisible(); await page.locator(".monitor-modal").getByRole("button", { name: "Close" }).click();
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
  await row.getByRole("checkbox").check(); mode = "stale"; await page.getByRole("button", { name: /làm mới|refresh/i }).click(); await expect(page.locator(".notice.warning")).toBeVisible(); await expect(row.getByRole("checkbox")).toBeChecked();
  mode = "running"; await page.locator(".notice.warning").getByRole("button", { name: /thử lại|retry/i }).click(); await expect(row.getByRole("checkbox")).toBeDisabled(); await expect(row.getByRole("checkbox")).not.toBeChecked();
});

test("upload validates duplicate, limits and native drag-drop", async ({ page }) => {
  await page.route("**/api/state**", (route) => route.fulfill({ json: { ...state([]), limits: { max_files_per_job: 2, max_job_upload_bytes: 1024 } } }));
  await page.goto("/upload"); const input = page.locator('input[type="file"]');
  await page.locator(".dropzone").evaluate((element) => { const transfer = new DataTransfer(); transfer.items.add(new File(["%PDF"], "same.pdf")); transfer.items.add(new File(["%PDF"], "SAME.PDF")); element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); }); await expect(page.locator(".notice.error")).toContainText("trùng");
  await input.setInputFiles([{ name: "a.pdf", mimeType: "application/pdf", buffer: pdf }, { name: "b.pdf", mimeType: "application/pdf", buffer: pdf }, { name: "c.pdf", mimeType: "application/pdf", buffer: pdf }]); await expect(page.locator(".notice.error")).toContainText("giới hạn");
  await page.locator(".dropzone").evaluate((element) => { const transfer = new DataTransfer(); transfer.items.add(new File(["%PDF-1.7"], "DROP.PDF", { type: "" })); element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); });
  await expect(page.locator(".file-list")).toContainText("DROP.PDF");
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
  await page.goto("/upload"); await page.locator('input[type="file"]').setInputFiles([{ name: "first.pdf", mimeType: "application/pdf", buffer: pdf }, { name: "second.pdf", mimeType: "application/pdf", buffer: pdf }]); await page.getByRole("button", { name: /bắt đầu OCR|start OCR/i }).click();
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
  const document = { ...fixtureDocument(), errors: ["provider_timeout"], pages: [
    { page_index: 0, image_url: `/api/jobs/${id}/artifacts/smoke/page-1.png`, status: "completed", ocr_scope: "metadata", error: "" },
    { page_index: 1, image_url: `/api/jobs/${id}/artifacts/smoke/page-2.png`, status: "error", ocr_scope: "metadata", error: "provider_timeout" },
  ] } as any;
  const job = { ...fixtureJob("completed_with_warnings"), documents: [document], failed_pages: 1 } as any;
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === `/api/jobs/${id}`) return route.fulfill({ json: job });
    if (apiPath.endsWith(".png")) return route.fulfill({ contentType: "image/svg+xml", body: svg });
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto(`/jobs/${id}?view=review`);
  await expect(page.locator(".partial-warning")).toContainText(/1\/2/);
  await expect(page.locator(".field-card")).toBeVisible();
  await expect(page.locator(".viewer-panel")).toBeVisible();
  await expect(page.locator(".page-numbers .page-error")).toHaveText("2");
  await expect(page.locator(".document-error")).toHaveCount(0);
});

test("monitor stops polling and preserves nullable GPU values", async ({ page }) => {
  let metricsCalls = 0;
  await page.route("**/api/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === "/api/state") return route.fulfill({ json: state([]) });
    if (apiPath === "/api/system-metrics") { metricsCalls += 1; return route.fulfill({ json: { cpu_percent: 10, memory_percent: 20, disk: null, gpu: { status: "available", devices: [{ index: 0, name: "GPU", utilization_percent: null, memory_used_mb: null, memory_total_mb: null, temperature_c: null }] } } }); }
    return route.fulfill({ status: 404, json: { detail: "unmocked" } });
  });
  await page.goto("/"); await page.getByRole("button", { name: /giám sát hệ thống|system monitor/i }).click(); await expect(page.locator(".gpu-device")).toContainText("—"); await expect(page.locator(".gpu-device")).not.toContainText("0%");
  const opened = metricsCalls; await page.waitForTimeout(2_200); expect(metricsCalls).toBeGreaterThan(opened);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); }); const hidden = metricsCalls; await page.waitForTimeout(2_200); expect(metricsCalls).toBe(hidden);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); }); await expect.poll(() => metricsCalls).toBeGreaterThan(hidden);
  await page.locator(".monitor-modal").getByRole("button", { name: /đóng|close/i }).click(); const closed = metricsCalls; await page.waitForTimeout(2_200); expect(metricsCalls).toBe(closed);
});

test("Legacy+ routes deep-link and Code Catalog CRUD survives reload", async ({ page }) => {
  let catalog = { revision: 0, items: [] as any[] }; let eventsQuery = "";
  await page.route("**/api/**", async (route) => {
    const request = route.request(), apiPath = new URL(request.url()).pathname;
    if (apiPath === "/api/state") return route.fulfill({ json: state([]) });
    if (apiPath === "/api/documents") return route.fulfill({ json: { items: [{ id: "smoke", job_id: id, job_status: "completed", file_name: "smoke.pdf", document_type: "Thông báo", status: "completed", review_status: "approved", page_count: 1, confidence_average: .91, warning_count: 0, updated_at: now, deep_link: `/jobs/${id}?document=smoke&view=review` }], pagination: { page: 1, page_size: 25, total: 1, pages: 1 } } });
    if (apiPath === "/api/events") { eventsQuery = new URL(request.url()).search; return route.fulfill({ json: { items: [{ timestamp: now, severity: "info", category: "lifecycle", code: "job_created", job_id: id, provider_profile_id: "qwen", document_id: "smoke", page_index: 0, message: "job_created" }], pagination: { page: 1, page_size: 50, total: 1, pages: 1 } } }); }
    if (apiPath === "/api/reports") return route.fulfill({ json: { operations: { total_jobs: 1, active_jobs: 0, completed_jobs: 1, error_jobs: 0, documents: 1, pages: 1, duration_seconds_average: 60, pages_per_minute: 1, failure_codes: {} }, quality: { documents: 1, approved_documents: 1, corrected_fields: 0, confidence_average: .91, total_fields: 1, confidence_coverage: 1, evidence_coverage: .5, warning_documents: 0 }, benchmark_samples: [] } });
    if (apiPath === "/api/codes" && request.method() === "GET") return route.fulfill({ json: catalog });
    if (apiPath === "/api/codes" && request.method() === "POST") { const body = request.postDataJSON(); catalog = { revision: catalog.revision + 1, items: [{ ...body, created_at: now, updated_at: now }] }; return route.fulfill({ status: 201, json: catalog }); }
    if (apiPath === "/api/codes/BC" && request.method() === "PUT") { const body = request.postDataJSON(); catalog = { revision: catalog.revision + 1, items: catalog.items.map((item) => ({ ...item, ...body, code: item.code, group: item.group, updated_at: now })) }; return route.fulfill({ json: catalog }); }
    if (apiPath === "/api/codes/BC" && request.method() === "DELETE") { catalog = { revision: catalog.revision + 1, items: [] }; return route.fulfill({ json: catalog }); }
    return route.fulfill({ status: 404, json: { detail: { code: "unmocked", message: "unmocked" } } });
  });

  await page.goto("/"); const nav = page.locator("#primary-navigation");
  await nav.getByRole("link", { name: /tải pdf|upload pdf/i }).click(); await expect(page).toHaveURL(/\/upload$/);
  await nav.getByRole("link", { name: /quản lý|manage/i }).click(); await expect(page).toHaveURL(/\/documents$/); await expect(page.getByRole("link", { name: /mở|open/i }).last()).toHaveAttribute("href", new RegExp(`document=smoke&view=review`));
  await nav.getByRole("link", { name: /nhật ký|logs/i }).click(); await expect(page).toHaveURL(/\/logs$/); await expect(page.locator(".data-table")).toContainText("job_created");
  await page.getByLabel("Provider").fill("qwen"); await page.getByLabel(/tài liệu|document/i).fill("smoke"); await page.getByLabel(/số trang|pages/i).fill("0"); await expect.poll(() => eventsQuery).toContain("provider_profile_id=qwen"); expect(eventsQuery).toContain("document_id=smoke"); expect(eventsQuery).toContain("page_index=0");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]); await page.getByRole("button", { name: /sao chép|copy/i }).click(); expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("job_created"); const safeDownload = page.waitForEvent("download"); await page.getByRole("button", { name: /tải xuống|download/i }).click(); expect((await safeDownload).suggestedFilename()).toBe("safe-events.json");
  await nav.getByRole("link", { name: /báo cáo|reports/i }).click(); await expect(page).toHaveURL(/\/reports$/); await expect(page.locator(".report-card").first()).toContainText("91%"); await expect(page.locator(".report-metrics")).toContainText("60s"); await expect(page.locator(".report-card").first()).toContainText("50%");
  await nav.getByRole("link", { name: /danh mục mã|code catalog/i }).click(); await expect(page).toHaveURL(/\/codes$/);
  await page.getByRole("button", { name: /thêm mã|add code/i }).click(); await page.getByLabel("Code").fill("BC"); await page.getByLabel(/nhãn|label/i).fill("Báo cáo"); await page.getByRole("button", { name: /^lưu$|^save$/i }).click();
  let row = page.locator(".data-table tbody tr").filter({ hasText: "BC" }); await expect(row).toContainText("Báo cáo");
  await page.reload(); row = page.locator(".data-table tbody tr").filter({ hasText: "BC" }); await expect(row).toBeVisible();
  await row.getByRole("button", { name: /sửa mã|edit code/i }).click(); await page.getByLabel(/nhãn|label/i).fill("Báo cáo mới"); await page.getByRole("button", { name: /^lưu$|^save$/i }).click(); await expect(row).toContainText("Báo cáo mới");
  page.once("dialog", (dialog) => dialog.accept()); await row.getByRole("button", { name: /xóa|delete/i }).click(); await expect(row).toHaveCount(0);
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

test("capture sanitized populated legacy dashboard", async ({ page }) => {
  test.skip(process.env.UPDATE_UI_BASELINE !== "1", "baseline capture only");
  const root = path.resolve(process.cwd(), "..");
  await page.addInitScript((data) => { (window as any).INTELLIDOC_DATA = data; }, {
    server_mode: true,
    app: { title: "IntelliDoc OCR" },
    metrics: { total_jobs: 1, pages: 2, correction_count: 1, error_jobs: 0 },
    ocr_methods: [{ id: "qwen", label: "Qwen", status: "configured" }],
    jobs: [{ ...fixtureJob("completed"), upload_name: "sanitized-record.pdf", page_count: 2, correction_count: 1 }],
    documents: [], logs: [],
  });
  await page.route("http://legacy.local/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const file = pathname === "/" ? "web/index.html" : pathname.replace(/^\//, "");
    const type = file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".svg") ? "image/svg+xml" : "text/html";
    try { await route.fulfill({ body: await readFile(path.join(root, file)), contentType: type }); } catch { await route.fulfill({ status: 404, body: "" }); }
  });
  await page.goto("http://legacy.local/"); await expect(page.locator("body")).toContainText("11111111-1111-4111-8111");
  await page.screenshot({ path: path.join(root, "docs/ui-parity/legacy-dashboard.png") });
  await page.setViewportSize({ width: 1366, height: 768 }); await page.screenshot({ path: path.join(root, "docs/ui-parity/legacy-dashboard-1366x768.png") });
});
