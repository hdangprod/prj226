---
description: # Quy trình Tiếp nhận và Xử lý Bug qua Screenshot/Logs
---

Khi User cung cấp thông tin mô tả lỗi, logs, hoặc hình ảnh chụp màn hình (Screenshot), AI phải thực hiện theo quy trình 4 bước nghiêm ngặt sau:

## Bước 1: Trích xuất & Phân tích (Ingestion)
- Đọc kỹ mô tả của User. Nếu có Screenshot, phân tích các thành phần giao diện bị lỗi, mã lỗi hiển thị (HTTP Status, Stack Trace nếu có).
- Khớp mã lỗi hoặc hành vi lỗi với cấu trúc thư mục hiện tại của dự án để khoanh vùng các file bị ảnh hưởng.

## Bước 2: Tái hiện & Định vị lỗi (Root Cause Analysis)
- Tìm kiếm trong codebase các vị trí có khả năng gây lỗi (ví dụ: các đoạn gọi API Notion, Gemini hoặc Firestore).
- Kiểm tra các ranh giới kỹ thuật đã quy định (ví dụ: lỗi Rate Limit, lỗi thiếu biến môi trường).

## Bước 3: Đề xuất Giải pháp & Tạo Issue
- Tạo một Bug Issue với đầy đủ thông tin: Triệu chứng lỗi (Symptom), Nguyên nhân gốc rễ (Root Cause), và Giải pháp đề xuất (Proposed Solution).
- Chờ User duyệt giải pháp và xác nhận thứ tự ưu tiên (Prioritize) trước khi sửa code.

## Bước 4: Sửa lỗi & Đóng vòng lặp (Resolution)
- Tiến hành sửa lỗi code.
- Chạy biên dịch build kiểm tra hệ thống.
- Viết Commit message gắn thẻ Issue ID, gửi Báo cáo sửa lỗi cho User và đóng Issue.