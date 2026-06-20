# Tổng kết Sprint 1: Thiết lập hạ tầng và Thông suốt luồng dữ liệu

## Mục tiêu ban đầu (Sprint Goal)
- Thiết lập hạ tầng cốt lõi cho hệ thống Second Brain Orchestrator.
- Đảm bảo thông suốt luồng xử lý câu lệnh đơn lẻ cơ bản từ Telegram đến Notion.

## Kết quả đạt được (What We Delivered)
- [x] Triển khai thành công ứng dụng lên môi trường Serverless GCP Cloud Run.
- [x] Tích hợp thành công mô hình Gemini Pro Flash để phân tích ngôn ngữ tự nhiên (NLP) từ tin nhắn người dùng.
- [x] Trích xuất và đẩy context mô tả (description) từ AI vào trong Notion dưới dạng Callout block 💡.
- [x] Kết nối và thiết lập thành công Firestore làm State Buffer phục vụ luồng hội thoại.

## Khó khăn & Giải pháp (Blockers & Solutions)
- **Thiếu biến môi trường lúc Build/Deploy:** Lỗi crash `PORT 8080 Timeout` do hàm validate config không tìm thấy các giá trị API Key. Đã xử lý bằng cách chèn đầy đủ tham số qua cờ `--set-env-vars` trong script deploy.
- **Nghẽn phân quyền IAM Firestore:** Ứng dụng Cloud Run bị lỗi `PERMISSION_DENIED` khi giao tiếp với Firestore. Vấn đề gốc rễ nằm ở định danh Runtime. Đã xử lý bằng cách truy cập tab Security để tìm email Service Account thực tế đang chạy, sau đó qua giao diện IAM (nút GRANT ACCESS mới) để cấp quyền `Firebase Firestore Admin`.

## Hành động cho Sprint sau (Action Items)
- **Bài học kinh nghiệm:** Luôn phải kiểm tra danh tính chạy thật (runtime identity) trong tab **Security** của Cloud Run trước khi phân quyền trên IAM, tránh đoán mò Service Account.
- **Tối ưu chi phí:** Ưu tiên giữ vững các thiết lập mặc định (Standard Edition, Native Mode) và chọn region phù hợp (như `asia-southeast1`) để tối ưu hiệu suất và tận dụng gói Always Free của GCP.
