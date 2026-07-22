# Các hạng mục chưa thể hoàn thành tại máy hiện tại

File này chỉ giữ những việc còn phụ thuộc dữ liệu, hạ tầng hoặc quyết định vận
hành bên ngoài repository. Các contract và kiểm thử local đã hoàn thành vẫn được
theo dõi trong `implementation_plan.md` và `legacy_browser_recreated.md`.

## 1. X7 — Field evidence trên bốn fixture thật

Chưa thể đóng vì repository không chứa bốn PDF chuẩn, ground truth và provider
production-like. Điều kiện hoàn thành:

- cung cấp ngoài Git và ngoài `OCR_DATA_DIR`: `63-btc.pdf`, một Bìa, một hồ sơ
  gộp rõ có trang trắng phân cách và một hồ sơ gộp khó;
- khóa manifest, SHA-256 và ground truth page/field mà không chép nội dung tài
  liệu vào Git;
- chạy job mới qua provider thật, kiểm tra evidence/provenance cho field, partial
  page, reload/restart và chất lượng so với ground truth;
- ghi bằng chứng đã khử nhạy cảm vào `implementation_plan.md#be-c-evidence`.

## 2. X16 — Segmentation hồ sơ gộp thật

Contract, worker và UI mock đã có; chưa có fixture/live evidence để xác nhận tính
đúng. Điều kiện hoàn thành:

- fixture rõ phải auto-segment đúng ground truth;
- fixture khó phải cho sửa boundary, loại/khôi phục trang và xác nhận từng source
  PDF theo revision, sau đó extraction thành công;
- Bìa và từng văn bản được review, sửa missing field và approve độc lập; trạng
  thái cùng artifact sống qua reload/restart;
- kiểm tra conflict reload/discard, terminal job đọc được qua runtime legacy,
  job X16 đang chạy trở thành `interrupted` khi rollback và không bị resume chéo
  phiên bản.

## 3. X14 — Benchmark tương thích

Corrected JSON, timing pass và report theo Provider Profile đã hoàn thành local.
Benchmark thật còn thiếu vì chưa có sample có fingerprint. Điều kiện hoàn thành:

- thống nhất fingerprint gồm fixture/manifest SHA-256, Provider Profile, task,
  page scope, DPI và config version;
- chạy lặp lại các fixture đại diện trên cùng cấu hình, lưu timing/resource mẫu
  đã khử nhạy cảm và chứng minh sample khác fingerprint không bị trộn;
- chỉ mở field-quality sâu, resource drilldown hoặc HTML/PDF offline report khi
  có workflow đo lường/bàn giao được operator xác nhận.

## 4. X15 — Polish phụ thuộc dữ liệu và nhu cầu operator

URL state, page jump, monitor deep-link, phím tắt, copy ID và select-all terminal
đã hoàn thành local. Các việc sau chỉ làm khi có đầu vào thật:

- chốt bốn dashboard metric và mật độ 1366×768 sau usability review với dữ liệu
  vận hành đại diện;
- thêm safe server-log download hoặc `total_bytes` cho delete preview chỉ khi
  operator xác nhận cần; nếu duyệt, phải đi qua OpenAPI/generated types và kiểm
  thử không lộ dữ liệu nhạy cảm;
- retry-specific timeline chỉ mở khi X7 đã persist metadata retry thật.

## 5. Milestone C — internal production-like pilot

Máy hiện tại không có đủ stack và bằng chứng live để ký gate. Điều kiện hoàn
thành:

- tạm dừng upload, drain/stop legacy, backup `OCR_DATA_DIR` kèm size/checksum;
- chạy Nginx → FastAPI → Redis → Celery → provider thật; xác nhận task đăng ký,
  `--concurrency=1`, `--prefetch-multiplier=1`, artifact/report và bốn fixture;
- diễn tập restart/interrupted, persistence, cross-version round-trip và rollback;
- ghi toàn bộ bằng chứng sanitized vào `BE-C-EVIDENCE`, giữ `src/ocr/` và `web/`
  trong cửa sổ rollback một ngày, không chạy hai worker trên cùng data directory;
- việc bỏ auth anonymous hoặc nâng lên customer production là một yêu cầu kiến
  trúc riêng, không thuộc gate pilot hiện tại.
