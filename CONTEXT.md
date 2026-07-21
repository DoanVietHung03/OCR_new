# OCR Operations

## Purpose

Hệ thống xử lý PDF hành chính theo luồng upload, OCR, theo dõi, rà soát, chỉnh
sửa, phê duyệt và báo cáo. Filesystem trong `OCR_DATA_DIR` là durable truth;
Redis chỉ điều phối task.

## Language

**Legacy Reference Browser**: Browser trong `C:\HProjecT\OCR_paper\Web\src`,
dùng làm tham chiếu visual và workflow; không phải nguồn chuẩn cho security,
persistence hoặc public API.

**Legacy+ Browser**: Browser Next.js hiện tại, phục hồi đầy đủ browser tham chiếu
ngoại trừ ZIP/ảnh/folder upload, đồng thời dùng typed API, dữ liệu thật, durable
state và accessibility tốt hơn.

**Provider Profile**: Lựa chọn thực thi OCR do server định nghĩa và cho phép.
Browser chỉ biết ID, nhãn, capability và readiness an toàn; URL, key và secret
header không thuộc public contract.

**Code Catalog**: Danh mục mã nghiệp vụ có CRUD, revision và persistence thật
tại `OCR_DATA_DIR/_codes.json`; browser quản lý qua route Codes.

**Review Evidence**: Dữ liệu có provenance để giải thích hoặc chứng minh một kết
quả OCR, ví dụ source, confidence, crop hoặc artifact do worker ghi nhận.

**OCR Job**: Đơn vị xử lý durable gồm source PDFs, lifecycle state, documents,
artifacts, review audit và safe events. Job JSON/artifacts là nguồn sự thật, không
phải Redis state hoặc browser state.

**Safe Event**: Sự kiện typed, sanitized được suy ra từ lifecycle/review/crop
bền vững; không phải raw provider log hoặc stack trace.

**Unavailable**: Trạng thái metric hoặc bằng chứng không tồn tại/không truy cập
được. Không được thay bằng `0`, chuỗi giả hoặc dữ liệu suy đoán.
