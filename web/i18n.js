(function () {
  const messages = {
    vi: {
      "nav.jobs": "Vận hành OCR", "nav.upload": "Tải tài liệu", "nav.manage": "Quản lý hồ sơ",
      "nav.logs": "Nhật ký xử lý", "nav.report": "Báo cáo", "nav.codes": "Danh mục mã", "nav.admin": "Quản trị",
      "upload.title": "Tải tài liệu", "upload.engine": "Bộ máy OCR", "upload.start": "Bắt đầu xử lý",
      "upload.processing": "Đang số hóa...", "upload.choose_files": "Chọn tệp", "upload.choose_folder": "Chọn thư mục",
      "upload.drop": "Thả {kind} vào đây hoặc bấm để chọn", "upload.accepts": "Chấp nhận ZIP, PDF hoặc ảnh scan",
      "upload.clear": "Xóa lựa chọn", "upload.files": "{count} tệp · {size}", "upload.external": "Các trang tài liệu sẽ được gửi tới endpoint {provider} đã cấu hình.",
      "engine.check": "Kiểm tra lại", "engine.unchecked": "Chưa kiểm tra", "engine.checked": "Kiểm tra lúc {time}",
      "system.title": "Tài nguyên hệ thống", "system.subtitle": "Thông số realtime, cập nhật mỗi 2 giây.", "system.loading": "Đang lấy thông số...",
      "system.cpu": "CPU", "system.ram": "RAM", "system.disk": "Ổ đĩa dữ liệu", "system.gpu_util": "Mức sử dụng GPU", "system.vram": "VRAM",
      "system.logical_cores": "luồng CPU", "system.physical_cores": "nhân vật lý", "system.available_cores": "luồng khả dụng", "system.cpu_model": "Mẫu CPU", "system.runtime": "Môi trường chạy", "system.driver": "Driver", "system.view_resources": "Mức dùng khi chạy", "system.queue": "Đang chờ", "system.active": "Đang chạy", "system.no_gpu": "Không tìm thấy GPU NVIDIA.",
      "usage.title": "Tài nguyên đã sử dụng", "usage.subtitle": "Trung bình và đỉnh được lấy mẫu trong thời gian module chạy.", "usage.unavailable": "Job này hoàn tất trước khi tính năng telemetry được bật; hãy chạy lại để thu thập số liệu.",
      "usage.cpu_avg": "CPU trung bình", "usage.ram_avg": "RAM trung bình", "usage.gpu_avg": "GPU trung bình", "usage.vram_avg": "VRAM trung bình", "usage.peak": "đỉnh", "usage.power": "Công suất", "usage.sample": "Phạm vi lấy mẫu",
      "system.close": "Đóng bảng tài nguyên", "system.fetch_error": "Không thể lấy thông số hệ thống",
      "jobs.title": "Vận hành OCR", "jobs.subtitle": "Theo dõi tác vụ, mở kết quả và xử lý lại tài liệu.",
      "jobs.new": "+ Tải tài liệu mới", "jobs.refresh": "Làm mới", "jobs.refreshing": "Đang cập nhật...",
      "jobs.updated": "Cập nhật lúc {time}", "jobs.stale": "Không thể cập nhật. Đang hiển thị dữ liệu cũ.",
      "jobs.total": "Tổng job", "jobs.running": "Đang chạy", "jobs.completed": "Hoàn tất", "jobs.errors": "Lỗi",
      "jobs.all": "Tất cả job", "jobs.all_engines": "Tất cả engine", "jobs.with_warnings": "Hoàn tất có cảnh báo",
      "jobs.retry_refresh": "Thử lại", "jobs.search": "Tìm job, trạng thái, lỗi...", "jobs.empty": "Không có job phù hợp.",
      "jobs.open": "Mở kết quả", "jobs.follow": "Theo dõi", "jobs.cancel": "Hủy", "jobs.rerun": "Chạy lại",
      "jobs.more": "Thêm", "jobs.copy_id": "Sao chép mã job", "jobs.download_log": "Tải log", "jobs.delete": "Xóa",
      "jobs.selected": "Đã chọn {count}", "jobs.delete_selected": "Xóa job đã chọn", "jobs.select_page": "Chọn job đã kết thúc trên trang này",
      "pagination.previous": "Trang trước", "pagination.next": "Trang sau", "pagination.page": "Trang {page}/{pages}",
      "progress.rendering_unknown": "Đã render {count} trang · đang xác định tổng",
      "delete.title": "Xóa vĩnh viễn các job đã chọn?", "delete.summary": "{count} job · {size}",
      "delete.cancel": "Hủy", "delete.confirm": "Xóa vĩnh viễn", "delete.blocked": "{count} job không thể xóa.",
      "failure.retry": "Chạy lại", "failure.copy": "Sao chép thông tin lỗi", "failure.log": "Xem log kỹ thuật",
      "report.operations": "Báo cáo vận hành", "report.operations_subtitle": "Tổng quan hiệu năng, độ ổn định và lỗi của các engine OCR.",
      "report.jobs": "Tổng job", "report.pages": "Tổng trang", "report.corrections": "Hiệu chỉnh", "report.errors": "Job lỗi",
      "report.by_engine": "Hiệu quả theo engine", "report.common_errors": "Lỗi phổ biến", "report.recent": "10 job gần nhất",
      "report.engine": "Engine", "report.success_rate": "Tỷ lệ thành công", "report.module_page": "Module/trang", "report.no_errors": "Chưa ghi nhận lỗi.",
      "errors.provider_bad_gateway": "Máy chủ VLM phía nhà cung cấp đang lỗi (HTTP 502).",
      "errors.provider_rate_limited": "Nhà cung cấp đang giới hạn tần suất gọi.",
      "errors.pipeline_timeout": "Tác vụ xử lý đã quá thời gian chờ.", "errors.cuda_unavailable": "CUDA/GPU không khả dụng.",
      "errors.model_missing": "Thiếu model cần thiết.", "errors.dependency_missing": "Thiếu thư viện runtime cần thiết.",
      "errors.invalid_provider_response": "Nhà cung cấp không trả kết quả sử dụng được.",
      "errors.content_filtered": "Nhà cung cấp đã chặn nội dung tài liệu.", "errors.pipeline_failed": "Pipeline xử lý thất bại.",
      "lang.vi": "VI", "lang.en": "EN"
    },
    en: {
      "nav.jobs": "OCR Operations", "nav.upload": "Upload files", "nav.manage": "File management",
      "nav.logs": "Processing log", "nav.report": "Reports", "nav.codes": "Code catalog", "nav.admin": "Administration",
      "upload.title": "Upload documents", "upload.engine": "OCR engine", "upload.start": "Start processing",
      "upload.processing": "Digitizing...", "upload.choose_files": "Choose files", "upload.choose_folder": "Choose folder",
      "upload.drop": "Drop a {kind} or click to choose", "upload.accepts": "Accepts ZIP, PDF, or scanned images",
      "upload.clear": "Clear selection", "upload.files": "{count} files · {size}", "upload.external": "Document pages will be sent to the configured {provider} endpoint.",
      "engine.check": "Check again", "engine.unchecked": "Not checked", "engine.checked": "Checked at {time}",
      "system.title": "System resources", "system.subtitle": "Realtime metrics refreshed every 2 seconds.", "system.loading": "Loading metrics...",
      "system.cpu": "CPU", "system.ram": "RAM", "system.disk": "Data disk", "system.gpu_util": "GPU utilization", "system.vram": "VRAM",
      "system.logical_cores": "CPU threads", "system.physical_cores": "physical cores", "system.available_cores": "available threads", "system.cpu_model": "CPU model", "system.runtime": "Runtime", "system.driver": "Driver", "system.view_resources": "Run usage", "system.queue": "Queued", "system.active": "Active", "system.no_gpu": "No NVIDIA GPU detected.",
      "usage.title": "Resource usage", "usage.subtitle": "Average and peak values sampled while the module was running.", "usage.unavailable": "This job completed before telemetry was enabled; rerun it to collect usage data.",
      "usage.cpu_avg": "Average CPU", "usage.ram_avg": "Average RAM", "usage.gpu_avg": "Average GPU", "usage.vram_avg": "Average VRAM", "usage.peak": "peak", "usage.power": "Power", "usage.sample": "Sampling scope",
      "system.close": "Close system resources", "system.fetch_error": "Cannot load system metrics",
      "jobs.title": "OCR Operations", "jobs.subtitle": "Monitor jobs, reopen results, and process documents again.",
      "jobs.new": "+ New upload", "jobs.refresh": "Refresh", "jobs.refreshing": "Refreshing...",
      "jobs.updated": "Updated at {time}", "jobs.stale": "Refresh failed. Showing stale data.",
      "jobs.total": "Total jobs", "jobs.running": "Running", "jobs.completed": "Completed", "jobs.errors": "Error",
      "jobs.all": "All jobs", "jobs.all_engines": "All engines", "jobs.with_warnings": "Completed with warnings",
      "jobs.retry_refresh": "Try again", "jobs.search": "Search jobs, status, errors...", "jobs.empty": "No matching jobs.",
      "jobs.open": "Open result", "jobs.follow": "Follow", "jobs.cancel": "Cancel", "jobs.rerun": "Run again",
      "jobs.more": "More", "jobs.copy_id": "Copy job ID", "jobs.download_log": "Download log", "jobs.delete": "Delete",
      "jobs.selected": "{count} selected", "jobs.delete_selected": "Delete selected", "jobs.select_page": "Select terminal jobs on this page",
      "pagination.previous": "Previous", "pagination.next": "Next", "pagination.page": "Page {page}/{pages}",
      "progress.rendering_unknown": "{count} pages rendered · determining total",
      "delete.title": "Permanently delete selected jobs?", "delete.summary": "{count} jobs · {size}",
      "delete.cancel": "Cancel", "delete.confirm": "Delete permanently", "delete.blocked": "{count} jobs cannot be deleted.",
      "failure.retry": "Retry", "failure.copy": "Copy diagnostics", "failure.log": "Show technical log",
      "report.operations": "Operations report", "report.operations_subtitle": "System-wide OCR engine performance, reliability, and failures.",
      "report.jobs": "Total jobs", "report.pages": "Total pages", "report.corrections": "Corrections", "report.errors": "Failed jobs",
      "report.by_engine": "Performance by engine", "report.common_errors": "Common errors", "report.recent": "Latest 10 jobs",
      "report.engine": "Engine", "report.success_rate": "Success rate", "report.module_page": "Module/page", "report.no_errors": "No errors recorded.",
      "errors.provider_bad_gateway": "The provider VLM server returned HTTP 502.",
      "errors.provider_rate_limited": "The provider is rate limiting requests.",
      "errors.pipeline_timeout": "The processing job timed out.", "errors.cuda_unavailable": "CUDA/GPU is unavailable.",
      "errors.model_missing": "A required model is missing.", "errors.dependency_missing": "A required runtime dependency is missing.",
      "errors.invalid_provider_response": "The provider returned no usable result.",
      "errors.content_filtered": "The provider filtered the document content.", "errors.pipeline_failed": "The processing pipeline failed.",
      "lang.vi": "VI", "lang.en": "EN"
    }
  };
  const legacyVi = {
    "File management": "Quản lý hồ sơ", "Processing log": "Nhật ký xử lý", "Statistics report": "Báo cáo thống kê",
    "Overview": "Tổng quan", "Review needed": "Cần rà soát", "Boxes": "Hộp", "Files": "Hồ sơ", "Documents": "Tài liệu",
    "Status": "Trạng thái", "Date": "Ngày", "Actions": "Thao tác", "Progress": "Tiến độ", "Time": "Thời gian",
    "Corrections": "Hiệu chỉnh", "Result": "Kết quả", "No data.": "Không có dữ liệu.",
    "No matching documents.": "Không có tài liệu phù hợp.", "No matching logs.": "Không có log phù hợp.",
    "All statuses": "Tất cả trạng thái", "All review states": "Tất cả trạng thái rà soát", "All actions": "Tất cả thao tác",
    "Search files...": "Tìm hồ sơ...", "Search logs...": "Tìm log...", "Needs review": "Cần rà soát",
    "Approved": "Đã duyệt", "Completed": "Hoàn tất", "Completed with warnings": "Hoàn tất có cảnh báo",
    "Running": "Đang chạy", "Error": "Lỗi", "Cancelled": "Đã hủy", "Interrupted": "Bị gián đoạn",
    "Review": "Rà soát", "Edit": "Chỉnh sửa", "Save corrections": "Lưu hiệu chỉnh", "Saving...": "Đang lưu...",
    "Cancel": "Hủy", "Close": "Đóng", "Download": "Tải xuống", "Copy": "Sao chép", "Delete": "Xóa",
    "Page": "Trang", "Field": "Trường", "Value": "Giá trị", "Confidence": "Độ tin cậy", "Source": "Nguồn",
    "No image.": "Không có ảnh.", "No page image.": "Không có ảnh trang.", "No crop for this field.": "Không có crop cho trường này.",
    "Select a field to view its crop.": "Chọn một trường để xem crop.", "No fields to correct.": "Không có trường cần hiệu chỉnh.",
    "OCR Operations": "Vận hành OCR", "Upload documents": "Tải tài liệu", "Code catalog": "Danh mục mã",
    "Add item": "Thêm mục", "Edit code item": "Sửa mục mã", "Add code item": "Thêm mục mã",
    "Group": "Nhóm", "Code": "Mã", "Order": "Thứ tự", "Active": "Đang dùng", "Hidden": "Đã ẩn",
    "Issuing authority": "Cơ quan ban hành", "Document number": "Số văn bản", "National title / motto": "Quốc hiệu / tiêu ngữ",
    "Place of issue": "Địa điểm ban hành", "Issue date": "Ngày ban hành", "Document type": "Loại văn bản",
    "Summary": "Trích yếu", "Signing authority": "Quyền hạn ký thay", "Signature block": "Quyền hạn ký thay", "Signer title": "Chức vụ người ký", "Signer name": "Người ký",
    "Archive code": "Mã lưu trữ", "Archival agency": "Cơ quan lưu trữ", "File title": "Tiêu đề hồ sơ",
    "Term": "Nhiệm kỳ", "Fonds": "Phông số", "Finding aid number": "Mục lục số", "Administrative file": "Hồ sơ ĐVBQ",
    "Box number": "Hộp số", "Document count": "Số tài liệu", "Page count": "Số trang", "Start date": "Bắt đầu",
    "End date": "Kết thúc", "Retention period": "Thời hạn bảo quản"
  };
  function language() { return localStorage.getItem("intellidoc.language") === "en" ? "en" : "vi"; }
  function setLanguage(value) { localStorage.setItem("intellidoc.language", value === "en" ? "en" : "vi"); document.documentElement.lang = language(); }
  function t(key, params = {}) {
    const value = messages[language()][key] || messages.en[key] || key;
    return value.replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? ""));
  }
  function translate(root) {
    if (!root || language() !== "vi" || typeof document.createTreeWalker !== "function") return;
    // ponytail: exact-text bridge keeps the legacy report usable; migrate remaining templates to t() as they are touched.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (node.parentElement?.closest("pre, code, script, style")) return;
      const raw = node.nodeValue || "";
      const trimmed = raw.trim();
      if (legacyVi[trimmed]) node.nodeValue = raw.replace(trimmed, legacyVi[trimmed]);
    });
    root.querySelectorAll("[placeholder], [title], [aria-label]").forEach((element) => {
      for (const name of ["placeholder", "title", "aria-label"]) {
        const value = element.getAttribute(name);
        if (value && legacyVi[value]) element.setAttribute(name, legacyVi[value]);
      }
    });
  }
  window.IntelliDocI18n = { t, language, setLanguage, translate };
  document.documentElement.lang = language();
})();
