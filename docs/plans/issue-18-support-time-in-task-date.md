# Support Time in Task Date for Calendar View (#18)

Người dùng yêu cầu khi thêm task, thuộc tính `Date` không chỉ lưu ngày (VD: `2026-06-23`) mà lưu kèm theo cả thời gian (VD: `2026-06-23T15:00:00+08:00`). Việc này giúp Notion hiển thị chính xác vị trí của task trên giao diện Calendar view.

## Proposed Changes

### 1. Cập nhật `src/gemini/client.ts`
- Sửa `description` của trường `dueDate` trong `taskSchema` thành: `"Due date in ISO 8601 format including time and timezone (e.g., 2026-06-23T15:00:00+08:00). If the user specifies a time, include it. If no time is specified, default to 09:00:00+08:00 of the target day."`
- Cập nhật prompt truyền vào hàm `parseTaskInput` và `parseWeeklyPlan` để truyền chuỗi ISO 8601 của thời điểm hiện tại (current exact time) thay vì chỉ truyền chuỗi YYYY-MM-DD. Việc này giúp AI nhận diện "chiều nay" hay "2 giờ nữa" một cách chính xác.

### 2. Cập nhật `src/utils/date.ts` (hoặc nơi định nghĩa `getTodayStr`)
- Bổ sung hàm lấy thời gian hiện tại định dạng ISO (bao gồm timezone +08:00) để cung cấp context cho Gemini (ví dụ: `getCurrentIsoTime()`).

### 3. Cập nhật `src/notion/client.ts`
- Thuộc tính `Date` của Notion API vốn đã hỗ trợ chuỗi ISO 8601 chứa Time. Nên `createTask` không cần thay đổi logic mapping (`Date: { date: { start: task.dueDate } }`). Nó sẽ tự động nhận diện thời gian. Tuy nhiên có thể kiểm tra xem có cần update type hay parse cho cẩn thận không.

### 4. Cập nhật `src/services/taskService.ts`
- Khi `rolloverTask` sang ngày mai, `dueDate` mới sẽ được đặt là `09:00` sáng của ngày mai (hoặc tùy theo trả lời ở mục Open Questions bên dưới).

## Open Questions
*(Đã được giải đáp)*
1. **Giờ mặc định khi tạo mới:** Mặc định lấy 09:00 AM nếu không đề cập.
2. **Khi Defer/Rollover:** Mặc định lấy 09:00 AM của ngày hôm sau. (Trong tương lai nếu Sếp nhập thời gian lúc rollover thì sẽ parse sau, hiện tại sẽ lấy mặc định 09:00 AM để đáp ứng yêu cầu nhanh chóng).
3. **Cập nhật tài liệu:** Sẽ cập nhật file `notion_database_setup.md` để ghi chú về thuộc tính `Date` bao gồm cả Time.

## Verification Plan
- Chạy thử lệnh `/add_task Đọc sách lúc 20:00` -> Mở Notion kiểm tra xem thuộc tính Date có kèm thời gian `8:00 PM` không.
- Chạy thử lệnh `/add_task Tập thể dục` -> Kiểm tra xem mặc định có gán thành `9:00 AM` không.
- Biên dịch code (`npm run build`).
