const dictionaries = {
  vi: {
    title: "IntelliDoc OCR", jobs: "Công việc", subtitle: "Theo dõi, kiểm tra và hiệu chỉnh kết quả OCR.",
    upload: "Tải PDF", uploadHint: "Chọn tối đa 15 tệp PDF cho một công việc.", chooseFiles: "Chọn tệp PDF", pdfFiles: "Tệp PDF",
    selectedFiles: "Đã chọn {count} tệp", start: "Bắt đầu OCR", uploading: "Đang tải…",
    consent: "Tôi đồng ý gửi ảnh trang PDF đến endpoint OCR bên ngoài đã được máy chủ cấu hình.",
    consentConfirm: "Công việc mới sẽ gửi ảnh trang PDF đến endpoint OCR bên ngoài. Tiếp tục?",
    engine: "Engine OCR", engineHint: "Kiểm tra kết nối OCR trước khi bắt đầu.", checkEngine: "Kiểm tra engine",
    jobMetrics: "Số liệu công việc", totalJobs: "Tổng công việc", pages: "Số trang", corrections: "Số hiệu chỉnh", errorJobs: "Công việc lỗi",
    matchingJobs: "{count} công việc phù hợp", refresh: "Làm mới", search: "Tìm kiếm", pagination: "Phân trang",
    allStatuses: "Tất cả trạng thái", allEngines: "Tất cả engine", selectedJobs: "Đã chọn {count} công việc", selectJob: "Chọn {name}",
    job: "Công việc", status: "Trạng thái", progress: "Tiến độ", actions: "Thao tác",
    filesPages: "{files}/{expected} tệp · {pages} trang", open: "Mở", cancel: "Hủy", rerun: "Chạy lại",
    delete: "Xóa", noJobs: "Chưa có công việc.", previous: "Trước", next: "Sau", page: "Trang {page} / {pages}",
    back: "Công việc", loading: "Đang tải…", jobSummary: "{pages} trang · {corrections} hiệu chỉnh",
    activeHint: "Kết quả sẽ tự làm mới trong khi OCR đang chạy.",
    terminalHint: "Công việc đã kết thúc; có thể chạy lại hoặc hiệu chỉnh kết quả.",
    report: "Báo cáo", documents: "Tài liệu", noResult: "Chưa có kết quả OCR.", fields: "Trường OCR",
    confidence: "{value}%", save: "Lưu chỉnh sửa", approve: "Phê duyệt", approved: "Đã phê duyệt",
    cropEvidence: "Crop bằng chứng", cropField: "Trường crop", chooseField: "Chọn trường", cropPage: "Trang crop",
    createCrop: "Tạo crop bằng chứng", viewCrop: "Xem crop", savedEvidence: "Bằng chứng đã lưu",
    status_uploading: "Đang tải", status_ready: "Sẵn sàng", status_starting: "Đang khởi tạo",
    status_queued: "Đang chờ", status_running: "Đang chạy", status_cancelling: "Đang hủy",
    status_completed: "Hoàn thành", status_completed_with_warnings: "Hoàn thành có cảnh báo",
    status_error: "Lỗi", status_cancelled: "Đã hủy", status_interrupted: "Bị gián đoạn",
    status_configured: "Đã cấu hình", status_not_configured: "Chưa cấu hình",
  },
  en: {
    title: "IntelliDoc OCR", jobs: "Jobs", subtitle: "Track, review, and correct OCR results.",
    upload: "Upload PDF", uploadHint: "Choose up to 15 PDF files for one job.", chooseFiles: "Choose PDF files", pdfFiles: "PDF files",
    selectedFiles: "{count} files selected", start: "Start OCR", uploading: "Uploading…",
    consent: "I consent to sending PDF page images to the external OCR endpoint configured by the server.",
    consentConfirm: "The new job will send PDF page images to an external OCR endpoint. Continue?",
    engine: "OCR engine", engineHint: "Check the OCR connection before starting.", checkEngine: "Check engine",
    jobMetrics: "Job metrics", totalJobs: "Total jobs", pages: "Pages", corrections: "Corrections", errorJobs: "Error jobs",
    matchingJobs: "{count} matching jobs", refresh: "Refresh", search: "Search", pagination: "Pagination",
    allStatuses: "All statuses", allEngines: "All engines", selectedJobs: "{count} jobs selected", selectJob: "Select {name}",
    job: "Job", status: "Status", progress: "Progress", actions: "Actions", filesPages: "{files}/{expected} files · {pages} pages",
    open: "Open", cancel: "Cancel", rerun: "Rerun", delete: "Delete", noJobs: "No jobs yet.",
    previous: "Previous", next: "Next", page: "Page {page} / {pages}", back: "Jobs", loading: "Loading…",
    jobSummary: "{pages} pages · {corrections} corrections", activeHint: "Results refresh automatically while OCR is running.",
    terminalHint: "The job has ended and can be rerun or reviewed.", report: "Report", documents: "Documents",
    noResult: "No OCR result yet.", fields: "OCR fields", confidence: "{value}%", save: "Save edits",
    approve: "Approve", approved: "Approved", cropEvidence: "Crop evidence", cropField: "Crop field",
    chooseField: "Choose field", cropPage: "Crop page", createCrop: "Create crop evidence", viewCrop: "View crop",
    savedEvidence: "Saved evidence", status_uploading: "Uploading", status_ready: "Ready", status_starting: "Starting",
    status_queued: "Queued", status_running: "Running", status_cancelling: "Cancelling", status_completed: "Completed",
    status_completed_with_warnings: "Completed with warnings", status_error: "Error", status_cancelled: "Cancelled",
    status_interrupted: "Interrupted", status_configured: "Configured", status_not_configured: "Not configured",
  },
} as const;

export type TextKey = keyof typeof dictionaries.vi;
type Language = keyof typeof dictionaries;
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
}
export function text(key: TextKey, values: Record<string, string | number> = {}) {
  return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), dictionaries[language()][key] as string);
}
export const statusText = (status: string) => {
  const key = `status_${status}` as TextKey;
  return key in dictionaries.vi ? text(key) : status.replaceAll("_", " ");
};
