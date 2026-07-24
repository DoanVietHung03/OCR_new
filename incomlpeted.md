# Các hạng mục chưa thể hoàn thành tại máy hiện tại

File này chỉ giữ những việc còn phụ thuộc dữ liệu, hạ tầng hoặc quyết định vận
hành bên ngoài repository. Các contract và kiểm thử local đã hoàn thành vẫn được
theo dõi trong `implementation_plan.md` và `frontend_plan.md`.

## 1. X7 — Field evidence trên bốn fixture thật

Chưa thể đóng vì repository không chứa bốn PDF chuẩn, ground truth và provider
production-like. Điều kiện hoàn thành:

Contract local typed/persistence đã được tái kiểm tra; phần dưới đây chỉ còn là
evidence fixture/provider/restart production-like.

Phần live repro của `BE-X1`/`FE-X1` cũng nằm trong gate external này. Nhãn
`PASS LOCAL CONTRACT` của X1 chỉ bao phủ planner, worker persistence và browser
eager-task/fake-provider; không thay thế lần chạy `63-btc.pdf` qua provider thật.

- cung cấp ngoài Git và ngoài `OCR_DATA_DIR`: `63-btc.pdf`, một Bìa, một hồ sơ
  gộp rõ có trang trắng phân cách và một hồ sơ gộp khó;
- khóa manifest, SHA-256 và ground truth page/field mà không chép nội dung tài
  liệu vào Git;
- chạy job mới qua provider thật, kiểm tra evidence/provenance cho field, partial
  page, reload/restart và chất lượng so với ground truth;
- với fixture `box_3/Hộp 3/05`, xác nhận `ma_luu_tru` lấy đúng mã lưu trữ
  (`A.30.15.03.05.xxx`) dù nằm ở vị trí nào, không lấy dòng `Lưu: ...`, và mọi
  field có bbox hợp lệ đều có thumbnail crop đúng vùng;
- với Bìa `box_3/Hộp 3/04/Scan_0000.pdf`, xác nhận `co_quan_luu_tru` giữ đủ hai
  dòng cơ quan, `khoa=V`, không có `hop_so`, `phong_so=14`,
  `so_tai_lieu=33`; với `full_ocr`, xác nhận metadata provider chỉ nhận prompt
  image-only nhưng labeled-value conflict vẫn bị validation cục bộ xóa
  confidence/bbox, và mọi crop còn available phải chứa đúng nhãn + giá trị;
- chạy cùng payload OpenAI-compatible tối thiểu với cấu hình hiện tại và một Qwen
  VLM; xác nhận readiness, metadata, full OCR và segmentation đều trả JSON hợp lệ;
- ghi bằng chứng đã khử nhạy cảm vào `implementation_plan.md#be-c-evidence`.

## 2. X16 — Segmentation hồ sơ gộp thật

Contract, worker và UI mock đã có; chưa có fixture/live evidence để xác nhận tính
đúng. Điều kiện hoàn thành:

Local gate đã bao phủ capability validation, paused-state restart, arbitrary
boundary, inline validation, revision conflict và Continue; các điều kiện dưới
đây vẫn cần dữ liệu/runtime bên ngoài repository.

- fixture rõ phải auto-segment đúng ground truth;
- fixture khó phải cho sửa boundary, loại/khôi phục trang và xác nhận từng source
  PDF theo revision, sau đó extraction thành công;
- Bìa và từng văn bản được review, sửa missing field và approve độc lập; trạng
  thái cùng artifact sống qua reload/restart;
- kiểm tra terminal job cũ vẫn đọc được mà không rewrite; job X16 đang chạy trở
  thành `interrupted` khi worker restart và không tự resume.

## 3. X14 — Benchmark tương thích

Corrected JSON, timing pass và report theo Provider Profile đã hoàn thành local.
Benchmark thật còn thiếu vì chưa có sample có fingerprint. Điều kiện hoàn thành:

- thống nhất fingerprint gồm fixture/manifest SHA-256, Provider Profile, task,
  page scope, DPI và config version;
- chạy lặp lại các fixture đại diện trên cùng cấu hình, lưu timing/resource mẫu
  đã khử nhạy cảm và chứng minh sample khác fingerprint không bị trộn;
## 4. Milestone C — internal production-like pilot

Máy hiện tại không có đủ stack và bằng chứng live để ký gate. Điều kiện hoàn
thành:

- tạm dừng upload, drain worker, backup `OCR_DATA_DIR` kèm size/checksum;
- chạy Nginx → FastAPI → Redis → Celery → provider thật; xác nhận task đăng ký,
  `--concurrency=1`, `--prefetch-multiplier=1`, artifact/report và bốn fixture;
- diễn tập restart/interrupted, persistence, đọc job cũ và rollback image/deployment;
- ghi toàn bộ bằng chứng sanitized vào `BE-C-EVIDENCE`;
- việc bỏ auth anonymous hoặc nâng lên customer production là một yêu cầu kiến
  trúc riêng, không thuộc gate pilot hiện tại.
