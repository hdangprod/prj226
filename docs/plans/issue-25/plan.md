# Enhance Weekly Scheduler Output & DB Linking (Issue #25)

Cải thiện trải nghiệm và tự động hóa toàn bộ luồng tạo task của Weekly Scheduler V2 theo yêu cầu của User.

## Open Questions
- Không có câu hỏi nào. Kế hoạch đã bao quát đủ 5 yêu cầu DoD.

## Proposed Changes

### 1. Model & Data Transfer Layer
Cập nhật interface để truyền được tên Project chưa tồn tại từ kỹ năng lập kế hoạch xuống Service.
#### [MODIFY] [WeeklyPlanningSkill.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/skills/WeeklyPlanningSkill.ts)
- Bổ sung trường `rawProjectName: string` vào interface `ScheduledTask`.
- Ở Phase 3 (Resolve project IDs), gán `rawProjectName: t.properties.Project` để truyền đi kể cả khi `findProjectByName` không tìm thấy dự án trong database.

### 2. Notion & Task Service Layer
Cập nhật logic tự động tạo Project mới và liên kết Daily Log khi bulk tạo tasks.
#### [MODIFY] [taskService.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/services/taskService.ts)
- Trong hàm `bulkCreateTasksV2`:
  - Khởi tạo bộ nhớ tạm (cache) cho các project mới tạo và daily log để tránh gọi API trùng lặp trong cùng 1 vòng lặp.
  - Nếu task có `rawProjectName` mà chưa có `projectId`, gọi `createProject(rawProjectName)` để tạo Project mới trên Notion, lưu ID lại và map vào `projectId`.
  - Từ `task.Date.start`, lấy ra chuỗi ngày (YYYY-MM-DD), gọi `getOrCreateDailyLog(dateStr)` để lấy `dailyLogId`.
  - Truyền cả `projectId` và `dailyLogId` vào `createTaskV2`.

#### [MODIFY] [client.ts (Notion)](file:///Users/dangnguyen/Desktop/PRJ226/src/notion/client.ts)
- Trong hàm `createTaskV2`:
  - Sửa logic tiền tố task (Task Prefix). Đổi từ `ProjectName_T{count}: ` thành `[{ProjectName}] ` theo đúng format yêu cầu.

### 3. Telegram Router & UI Layer
Cập nhật giao diện trả về Telegram theo thiết kế mock-up của User.
#### [MODIFY] [router.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/router.ts)
- Trong `preview_plan`:
  - Lặp qua mảng `drafts`, tính tổng thời gian (Estimate).
  - Gom nhóm các task theo `rawProjectName` (hoặc "Other" nếu không có).
  - Render giao diện text bằng ASCII layout (`───────────────────────`) và emoji như mock-up cung cấp.
- Trong `schedule_confirm`:
  - Sau khi `bulkCreateTasksV2` thành công, xóa bỏ Inline Keyboard.
  - Render danh sách task thành công bằng text dạng: `1. 📁 [Tên task](Link)` (sử dụng HTML `<a>` tag qua hàm escape/format của bot).

## Verification Plan
### Automated Tests
- Chạy `npm run build` để kiểm tra lỗi cú pháp và kiểu dữ liệu.
### Manual Verification
- Chạy lệnh `/weekly_planning` với đoạn prompt được cung cấp.
- Kiểm tra tin nhắn Preview hiển thị đúng format nhóm theo Project.
- Nhấn Xác nhận và kiểm tra trong Notion:
  1. Project mới (`PRJ_Person_1`) được tạo.
  2. Các task được link vào đúng Project.
  3. Cột `Daily_Task` (Daily Log) được link đúng vào ngày tương ứng.
  4. Tên Task có tiền tố `[Project_Name] `.
  5. Tin nhắn Success trên Telegram hiển thị gọn gàng, không có nút.
