"use client";

import { useEffect, useState } from "react";

const vi = {
  partialPages: "{success}/{total} trang thành công",
  title: "IntelliDoc OCR", jobs: "Công việc", newOcr: "OCR mới", systemMonitor: "Giám sát hệ thống",
  manage: "Quản lý", processingLogs: "Nhật ký xử lý", codes: "Danh mục mã", admin: "Quản trị",
  subtitle: "Theo dõi, kiểm tra và hiệu chỉnh kết quả OCR.", filteredResults: "Kết quả đang lọc",
  upload: "Tải PDF", uploadSubtitle: "Cấu hình và khởi chạy một công việc OCR PDF.", uploadHint: "Kéo thả hoặc chọn tối đa {files} PDF, tổng cộng {size}.", chooseFiles: "Chọn tệp PDF",
  pdfFiles: "Tệp PDF", clear: "Xóa lựa chọn", removeFile: "Bỏ {name}", selectedFiles: "Đã chọn {count} tệp",
  start: "Bắt đầu OCR", uploading: "Đang tải {current}/{total}: {name}", invalidPdf: "Chỉ chấp nhận tệp PDF.",
  duplicateFile: "Tên tệp PDF bị trùng.", fileLimit: "Lựa chọn vượt giới hạn của máy chủ.", pageLimit: "Tối đa 100 trang/PDF.",
  consent: "Tôi đồng ý gửi ảnh trang PDF đến endpoint OCR bên ngoài đã được máy chủ cấu hình.",
  consentConfirm: "Công việc mới chỉ sao chép PDF nguồn và sẽ gửi ảnh trang đến endpoint bên ngoài. Tiếp tục?",
  engine: "Engine OCR", task: "Tác vụ VLM", pageScope: "Phạm vi trang", maxPages: "Số trang tối đa", fullOcr: "OCR toàn văn", metadata: "Metadata nhanh", allPages: "Tất cả trang", autoPages: "Tự động", edgePages: "Trang đầu và cuối", configuredHint: "Đây là trạng thái cấu hình máy chủ, không phải phép thử kết nối provider.",
  checkEngine: "Kiểm tra lại cấu hình", jobMetrics: "Số liệu công việc", totalJobs: "Tổng công việc", pages: "Số trang", pdfPages: "Trang PDF",
  metadataPageSummary: "{processed}/{total} trang metadata", fullOcrPageSummary: "{processed}/{total} trang OCR toàn văn", processedPages: "{count} trang xử lý", skippedPage: "Trang không được chọn xử lý",
  corrections: "Số hiệu chỉnh", completedJobs: "Đã hoàn thành", errorJobs: "Công việc lỗi", matchingJobs: "{count} công việc phù hợp", refresh: "Làm mới",
  retry: "Thử lại", stale: "Không thể làm mới. Đang hiển thị dữ liệu thành công gần nhất.", search: "Tìm kiếm",
  allStatuses: "Tất cả trạng thái", allEngines: "Tất cả engine", selectedJobs: "Đã chọn {count} công việc",
  selectJob: "Chọn {name}", job: "Công việc", status: "Trạng thái", filesAndPages: "{files}/{expected} tệp · {pages} trang · {failed} trang lỗi",
  provider: "Provider", created: "Tạo lúc", updated: "Cập nhật", actions: "Thao tác", open: "Mở", cancel: "Hủy",
  rerun: "Chạy lại", delete: "Xóa", noJobs: "Chưa có công việc.", previous: "Trước", next: "Sau", pageOf: "Trang {page}/{pages}",
  deleteTitle: "Xác nhận xóa", deleteSummary: "{count} công việc có thể xóa.", blocked: "Bị chặn hoặc đã thay đổi",
  deleteIncomplete: "Không xóa được {count} công việc; danh sách đã được làm mới.", discardTitle: "Thay đổi chưa lưu",
  confirmDelete: "Xóa vĩnh viễn", cancelTitle: "Hủy công việc?", cancelBody: "Công việc không thể tiếp tục sau khi hủy.",
  rerunTitle: "Chạy lại công việc?", rerunBody: "Công việc cũ được giữ nguyên. Công việc mới chỉ sao chép PDF, không mang hiệu chỉnh, duyệt hoặc crop.",
  confirm: "Xác nhận", close: "Đóng", back: "Công việc", loading: "Đang tải…", jobSummary: "{pages} trang PDF · {corrections} hiệu chỉnh",
  activeHint: "Kết quả tự làm mới khi OCR đang chạy.", terminalHint: "Công việc đã kết thúc và có thể được kiểm tra.",
  documents: "Tài liệu", document: "Tài liệu", noResult: "Chưa có kết quả OCR.", fields: "Trường OCR", other: "Khác",
  overview: "Tổng quan", review: "Rà soát", artifacts: "Artifacts", rawText: "Văn bản OCR", quality: "Chất lượng", source: "Nguồn", suggestion: "Gợi ý", applySuggestion: "Áp dụng gợi ý", evidence: "Bằng chứng",
  documentsSubtitle: "Rà soát tài liệu xuyên suốt các công việc OCR.", confidenceLabel: "Độ tin cậy", noDocuments: "Chưa có tài liệu phù hợp.", sort: "Sắp xếp", newest: "Mới nhất", oldest: "Cũ nhất", recentlyUpdated: "Mới cập nhật", leastRecentlyUpdated: "Ít cập nhật nhất", nameAz: "Tên A–Z", nameZa: "Tên Z–A", unreviewed: "Chưa duyệt", duration: "Thời lượng", warnings: "Cảnh báo", documentType: "Loại tài liệu", throughput: "Thông lượng", failureCodes: "Mã lỗi", confidenceCoverage: "Phủ confidence", evidenceCoverage: "Phủ bằng chứng",
  confidence: "Độ tin cậy {value}%", noConfidence: "Không có dữ liệu", fit: "Vừa khung", actualSize: "100%",
  imageFailed: "Không tải được ảnh trang.", openArtifact: "Mở artifact", pageUnknown: "Trang không xác định", selectField: "Chọn trường",
  saveApprove: "Lưu và duyệt", approve: "Duyệt", approved: "Đã duyệt", approvedAt: "Duyệt lúc {date}",
  originalValue: "OCR gốc", newValue: "Giá trị mới", emptyValue: "trống", readOnly: "Chỉ đọc", conflict: "Dữ liệu máy chủ đã thay đổi.",
  serverValue: "Máy chủ", draftValue: "Bản đang sửa", keepDraft: "Giữ bản sửa", useServer: "Dùng bản máy chủ",
  discardDraft: "Bỏ các thay đổi chưa lưu?", cropEvidence: "Crop bằng chứng", createCrop: "Vẽ crop", saveCrop: "Lưu crop",
  reset: "Đặt lại", cropHelp: "Kéo để vẽ. Phím mũi tên di chuyển; Shift + mũi tên thay đổi kích thước.",
  savedEvidence: "Bằng chứng đã lưu", report: "Báo cáo", reportSummary: "{documents} tài liệu · {pages} trang PDF · {corrections} hiệu chỉnh · {failures} lỗi",
  logs: "Nhật ký legacy", copy: "Sao chép", download: "Tải xuống", cpu: "CPU", memory: "RAM", disk: "Ổ dữ liệu OCR", gpu: "GPU",
  safeEvents: "Sự kiện an toàn", logsSubtitle: "Dòng thời gian lifecycle đã loại bỏ payload nhạy cảm.", noEvents: "Chưa có sự kiện phù hợp.", category: "Danh mục", allCategories: "Mọi danh mục", lifecycle: "Vòng đời",
  operations: "Vận hành", activeJobs: "Đang hoạt động", benchmark: "So sánh lần chạy", noBenchmark: "Chưa có mẫu benchmark tương thích.", reportsSubtitle: "Số liệu được tổng hợp từ dữ liệu công việc bền vững.", samples: "mẫu", fixtureGroup: "Nhóm fixture", sampleSize: "Cỡ mẫu", measured: "Thời điểm đo",
  codesSubtitle: "Danh mục mã TT05 được lưu bền vững trong thư mục dữ liệu OCR.", addCode: "Thêm mã", editCode: "Sửa mã", group: "Nhóm", label: "Nhãn hiển thị", keywords: "Từ khóa OCR", order: "Thứ tự", active: "Hoạt động", hidden: "Ẩn", save: "Lưu", noCodes: "Chưa có mã trong nhóm này.",
  used: "Đã dùng", free: "Còn trống", unavailable: "Không khả dụng", telemetryError: "Không đọc được", lastUpdated: "Cập nhật {date}",
  unknownError: "Không thể hoàn tất yêu cầu", noFields: "Tài liệu không có trường để duyệt.", rerunRequired: "Hãy chạy lại toàn bộ công việc.",
  status_uploading: "Đang tải", status_ready: "Sẵn sàng", status_starting: "Đang khởi tạo", status_queued: "Đang chờ",
  status_running: "Đang chạy", status_cancelling: "Đang hủy", status_completed: "Hoàn thành",
  status_completed_with_warnings: "Hoàn thành có cảnh báo", status_error: "Lỗi", status_cancelled: "Đã hủy",
  status_interrupted: "Bị gián đoạn", status_configured: "Đã cấu hình", status_not_configured: "Chưa cấu hình",
} as const;

type TextKey = keyof typeof vi;
const en: Record<TextKey, string> = {
  partialPages: "{success}/{total} pages succeeded",
  title: "IntelliDoc OCR", jobs: "Jobs", newOcr: "New OCR", systemMonitor: "System Monitor",
  manage: "Manage", processingLogs: "Processing logs", codes: "Code catalog", admin: "Administration",
  subtitle: "Track, review, and correct OCR results.", filteredResults: "Filtered results",
  upload: "Upload PDF", uploadSubtitle: "Configure and start a PDF OCR job.", uploadHint: "Drop or choose up to {files} PDFs, {size} total.", chooseFiles: "Choose PDF files",
  pdfFiles: "PDF files", clear: "Clear", removeFile: "Remove {name}", selectedFiles: "{count} files selected",
  start: "Start OCR", uploading: "Uploading {current}/{total}: {name}", invalidPdf: "Only PDF files are accepted.",
  duplicateFile: "PDF filenames must be unique.", fileLimit: "The selection exceeds server limits.", pageLimit: "Maximum 100 pages/PDF.",
  consent: "I consent to sending PDF page images to the external OCR endpoint configured by the server.",
  consentConfirm: "The new job copies source PDFs only and will send page images to an external endpoint. Continue?",
  engine: "OCR engine", task: "VLM task", pageScope: "Page scope", maxPages: "Maximum pages", fullOcr: "Full OCR", metadata: "Quick metadata", allPages: "All pages", autoPages: "Auto", edgePages: "First and last pages", configuredHint: "This is server configuration status, not a provider connectivity probe.",
  checkEngine: "Recheck configuration", jobMetrics: "Job metrics", totalJobs: "Total jobs", pages: "Pages", pdfPages: "PDF pages", corrections: "Corrections",
  metadataPageSummary: "{processed}/{total} metadata pages", fullOcrPageSummary: "{processed}/{total} full OCR pages", processedPages: "{count} processed pages", skippedPage: "Page was not selected for processing",
  completedJobs: "Completed jobs", errorJobs: "Error jobs", matchingJobs: "{count} matching jobs", refresh: "Refresh", retry: "Retry",
  stale: "Refresh failed. Showing the last successful data.", search: "Search", allStatuses: "All statuses", allEngines: "All engines",
  selectedJobs: "{count} jobs selected", selectJob: "Select {name}", job: "Job", status: "Status",
  filesAndPages: "{files}/{expected} files · {pages} pages · {failed} failed", provider: "Provider", created: "Created", updated: "Updated",
  actions: "Actions", open: "Open", cancel: "Cancel", rerun: "Rerun", delete: "Delete", noJobs: "No jobs yet.",
  previous: "Previous", next: "Next", pageOf: "Page {page}/{pages}", deleteTitle: "Confirm deletion",
  deleteSummary: "{count} jobs can be deleted.", blocked: "Blocked or changed", confirmDelete: "Delete permanently",
  deleteIncomplete: "{count} jobs could not be deleted; the list has been refreshed.", discardTitle: "Unsaved changes",
  cancelTitle: "Cancel job?", cancelBody: "The job cannot be resumed after cancellation.", rerunTitle: "Rerun job?",
  rerunBody: "The old job remains intact. The new job copies PDFs only, without corrections, approval, or crops.", confirm: "Confirm", close: "Close",
  back: "Jobs", loading: "Loading…", jobSummary: "{pages} PDF pages · {corrections} corrections", activeHint: "Results refresh while OCR is active.",
  terminalHint: "The job has ended and can be reviewed.", documents: "Documents", document: "Document", noResult: "No OCR result yet.",
  overview: "Overview", review: "Review", artifacts: "Artifacts", rawText: "OCR text", quality: "Quality", source: "Source", suggestion: "Suggestion", applySuggestion: "Apply suggestion", evidence: "Evidence",
  documentsSubtitle: "Review documents across OCR jobs.", confidenceLabel: "Confidence", noDocuments: "No matching documents.", sort: "Sort", newest: "Newest", oldest: "Oldest", recentlyUpdated: "Recently updated", leastRecentlyUpdated: "Least recently updated", nameAz: "Name A–Z", nameZa: "Name Z–A", unreviewed: "Unreviewed", duration: "Duration", warnings: "Warnings", documentType: "Document type", throughput: "Throughput", failureCodes: "Failure codes", confidenceCoverage: "Confidence coverage", evidenceCoverage: "Evidence coverage",
  fields: "OCR fields", other: "Other", confidence: "Confidence {value}%", noConfidence: "No data", fit: "Fit", actualSize: "100%",
  imageFailed: "The page image could not be loaded.", openArtifact: "Open artifact", pageUnknown: "Unknown page", selectField: "Select field",
  saveApprove: "Save and approve", approve: "Approve", approved: "Approved", approvedAt: "Approved {date}", originalValue: "Original OCR",
  newValue: "New value", emptyValue: "empty", readOnly: "Read only", conflict: "The server data changed.", serverValue: "Server",
  draftValue: "Your draft", keepDraft: "Keep draft", useServer: "Use server", discardDraft: "Discard unsaved changes?",
  cropEvidence: "Crop evidence", createCrop: "Draw crop", saveCrop: "Save crop", reset: "Reset",
  cropHelp: "Drag to draw. Arrow keys move; Shift + arrow keys resize.", savedEvidence: "Saved evidence", report: "Report",
  reportSummary: "{documents} documents · {pages} PDF pages · {corrections} corrections · {failures} failures", logs: "Legacy logs",
  safeEvents: "Safe events", logsSubtitle: "Lifecycle timeline without sensitive payloads.", noEvents: "No matching events.", category: "Category", allCategories: "All categories", lifecycle: "Lifecycle",
  operations: "Operations", activeJobs: "Active jobs", benchmark: "Run comparison", noBenchmark: "No compatible benchmark samples yet.", reportsSubtitle: "Metrics derived from durable job data.", samples: "samples", fixtureGroup: "Fixture group", sampleSize: "Sample size", measured: "Measured",
  codesSubtitle: "The TT05 catalog is persisted in the OCR data directory.", addCode: "Add code", editCode: "Edit code", group: "Group", label: "Display label", keywords: "OCR keywords", order: "Order", active: "Active", hidden: "Hidden", save: "Save", noCodes: "No codes in this group.",
  copy: "Copy", download: "Download", cpu: "CPU", memory: "Memory", disk: "OCR data disk", gpu: "GPU", used: "Used", free: "Free",
  unavailable: "Unavailable", telemetryError: "Read error", lastUpdated: "Updated {date}", unknownError: "The request could not be completed",
  noFields: "This document has no fields to approve.", rerunRequired: "Rerun the whole job.", status_uploading: "Uploading",
  status_ready: "Ready", status_starting: "Starting", status_queued: "Queued", status_running: "Running", status_cancelling: "Cancelling",
  status_completed: "Completed", status_completed_with_warnings: "Completed with warnings", status_error: "Error", status_cancelled: "Cancelled",
  status_interrupted: "Interrupted", status_configured: "Configured", status_not_configured: "Not configured",
};

export type Language = "vi" | "en";
export { type TextKey };
const dictionaries = { vi, en };
let currentLanguage: Language = "vi";

export const language = () => currentLanguage;
export function initializeLanguage() {
  currentLanguage = localStorage.getItem("intellidoc.language") === "en" ? "en" : "vi";
  document.documentElement.lang = currentLanguage;
  return currentLanguage;
}
export function setLanguage(value: Language) {
  currentLanguage = value;
  localStorage.setItem("intellidoc.language", value);
  document.documentElement.lang = value;
  window.dispatchEvent(new CustomEvent("intellidoc-language", { detail: value }));
}
export function useLanguage() {
  const [locale, setLocale] = useState<Language>("vi");
  useEffect(() => {
    setLocale(initializeLanguage());
    const update = (event: Event) => setLocale((event as CustomEvent<Language>).detail);
    window.addEventListener("intellidoc-language", update);
    return () => window.removeEventListener("intellidoc-language", update);
  }, []);
  return [locale, setLanguage] as const;
}
export function text(key: TextKey, values: Record<string, string | number> = {}) {
  return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), dictionaries[currentLanguage][key]);
}
export const statusText = (status: string) => {
  const key = `status_${status}` as TextKey;
  return key in vi ? text(key) : status.replaceAll("_", " ");
};

const errorLabels: Record<string, [string, string]> = {
  unknown_field: ["Provider trả về trường không xác định", "Provider returned an unknown field"],
  invalid_field_value: ["Provider trả về giá trị trường không hợp lệ", "Provider returned an invalid field value"],
  incomplete_field: ["Provider trả về trường chưa đầy đủ", "Provider returned an incomplete field"],
  provider_timeout: ["Provider quá thời gian chờ", "Provider timed out"],
  provider_unavailable: ["Provider không khả dụng", "Provider unavailable"],
  invalid_model_json: ["Kết quả model không hợp lệ", "Invalid model result"],
  worker_interrupted: ["Worker bị gián đoạn", "Worker interrupted"],
  worker_unavailable: ["Worker không khả dụng", "Worker unavailable"],
  unsupported_file: ["Tệp không được hỗ trợ", "Unsupported file"],
  encrypted_pdf: ["PDF được bảo vệ bằng mật khẩu", "Password-protected PDF"],
  pdf_page_limit_exceeded: ["PDF vượt quá 100 trang", "PDF exceeds 100 pages"],
  duplicate_upload_path: ["Tên tệp PDF bị trùng", "Duplicate PDF filename"],
  job_quota_exceeded: ["Công việc vượt giới hạn tải lên", "The job exceeds upload limits"],
  cloud_data_confirmation_required: ["Cần đồng ý gửi dữ liệu ra endpoint bên ngoài", "External endpoint consent is required"],
  ocr_not_configured: ["OCR chưa được cấu hình", "OCR is not configured"],
  job_active: ["Công việc đang hoạt động", "The job is active"],
  source_files_incomplete: ["PDF nguồn không đầy đủ", "Source PDFs are incomplete"],
  invalid_crop_rectangle: ["Vùng crop không hợp lệ", "Invalid crop rectangle"],
  invalid_provider_profile: ["Provider Profile không hợp lệ", "Invalid Provider Profile"],
  invalid_vlm_scope: ["Phạm vi trang không hợp lệ", "Invalid page scope"],
  catalog_conflict: ["Code Catalog đã thay đổi; hãy tải lại", "Code Catalog changed; reload it"],
  code_exists: ["Code đã tồn tại", "Code already exists"],
  code_not_found: ["Không tìm thấy code", "Code not found"],
  catalog_corrupt: ["Code Catalog bị hỏng; dữ liệu chưa bị ghi đè", "Code Catalog is corrupt; data was not overwritten"],
};
export const safeError = (code: string) => errorLabels[code]?.[currentLanguage === "vi" ? 0 : 1] || `${text("unknownError")} (${code})`;
