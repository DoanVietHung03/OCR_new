export const text = (key: "title" | "upload" | "jobs" | "refresh" | "start" | "cancel" | "rerun" | "save" | "delete") => {
  const vi = { title: "IntelliDoc OCR", upload: "Tải PDF", jobs: "Công việc", refresh: "Làm mới", start: "Bắt đầu OCR", cancel: "Hủy", rerun: "Chạy lại", save: "Lưu chỉnh sửa", delete: "Xóa" };
  const en = { title: "IntelliDoc OCR", upload: "Upload PDF", jobs: "Jobs", refresh: "Refresh", start: "Start OCR", cancel: "Cancel", rerun: "Rerun", save: "Save edits", delete: "Delete" };
  return (typeof window !== "undefined" && localStorage.getItem("intellidoc.language") === "en" ? en : vi)[key];
};
