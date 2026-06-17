# Changelog & Refactoring Notes

Tài liệu này ghi chú lại các đợt refactor và thay đổi cấu trúc mã nguồn để hỗ trợ việc review trong tương lai.

## Đợt Refactor 1 (Mới nhất)
**Mục tiêu**: Khắc phục lỗi biên dịch TypeScript, chuẩn hóa luồng xử lý Telegram webhook, quản lý state cho Serverless và cải thiện UX (Notion Deep link, HTML Escape).

### Các thay đổi chính

1. **Dọn dẹp Entrypoint & Sửa lỗi biên dịch (`index.ts` & `router.ts`)**
   - Xóa `index.ts` và `localTest.ts` ở thư mục gốc (root) do nằm ngoài `rootDir` gây lỗi biên dịch.
   - Cập nhật lại `src/index.ts` thành một Thin GCP Wrapper (chỉ nhận webhook, trả 200 ngay lập tức và forward cho `router.ts`).
   - Sửa lỗi import các hàm không tồn tại ở `router.ts` và `highlightService.ts` (ví dụ: đổi `translateToEnglish` thành `translateHighlight`).

2. **Bổ sung Description vào Page Body (Notion Callout Block)**
   - Cập nhật interface `TaskInput` và `GeminiTaskOutput` (trong `src/notion/types.ts`) để hỗ trợ thêm trường `description`.
   - Cập nhật Prompt Schema của Gemini (`src/gemini/client.ts`) để AI tóm tắt ngữ cảnh từ người dùng thành 1-2 câu description.
   - Khi tạo Task trên Notion, chèn một Callout block (💡 nền xám) vào page body trước danh sách checklist (`to_do` blocks) nhằm lưu giữ context.

3. **Quản lý State cho môi trường Serverless (GCP Firestore)**
   - Do Cloud Functions là môi trường Stateless, việc lưu trữ tạm thời kế hoạch tuần (draft) bằng `Map` trên RAM gây mất dữ liệu.
   - Tích hợp `@google-cloud/firestore` và tạo file `src/services/stateManager.ts` để lưu trữ/đọc/xóa các bản nháp kế hoạch (`plan_week`).

4. **Tối ưu Rate Limit cho tính năng Bulk Create**
   - Bổ sung tham số `dailyLogId` vào hàm `bulkCreateTasks`.
   - Thêm cơ chế **Throttle (delay 350ms)** giữa các lần gọi Notion API tuần tự để tránh lỗi HTTP 429 Rate Limit khi tạo nhiều task cùng lúc.

5. **Tối ưu Deep Link và Inline Button UX**
   - Các đường link trả về cho người dùng (ví dụ: mở Notion Task) được đổi từ `https://` sang Deep link native của Notion: `notion://notion.so/`.
   - Các tính năng tạo task, defer task, bulk create giờ đây sẽ trả kèm các nút bấm Inline Keyboard URL (Mở trong Notion).

6. **Fix lỗi Telegram Parse Mode (HTML)**
   - Thay vì dùng `Markdown` (gặp lỗi 400 Bad Request nếu nội dung chứa các ký tự không được đóng mở đúng), hệ thống đã chuyển sang dùng `HTML` parse_mode (`src/telegram/client.ts`).
   - Bổ sung hàm `escapeMarkdown()` để tự động encode các ký tự đặc biệt (`&`, `<`, `>`) nhằm đảm bảo tin nhắn gửi lên Telegram luôn hợp lệ.
