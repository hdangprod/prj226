# Fix AI Scheduler Overlap Bug (Issue #27)

Xử lý lỗi AI tạo task mới đè lên các khung giờ đã bị chặn bởi các task/event cũ (ví dụ: task đồng bộ từ Personal Calendar).

## Open Questions
- Không có câu hỏi nào. Nguyên nhân là do AI thiếu tham số `end_time` của các Notion task hiện tại.

## Proposed Changes

### 1. Data Types
Cập nhật interface để chứa tham số thời gian kết thúc của Task.
#### [MODIFY] [notion/types.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/notion/types.ts)
- Bổ sung trường `end?: string` vào interface `NotionBusySlot`.

### 2. Notion Client Layer
Extract thêm dữ liệu `end time` từ database Notion.
#### [MODIFY] [notion/client.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/notion/client.ts)
- Bổ sung hàm helper `getDateEnd(page: NotionPage, prop: string): string | undefined` để lấy được `Date.end`.
- Cập nhật hàm `fetchActiveTasksWithDates`: gán thêm `end: getDateEnd(p, 'Date')` vào object trả về.

### 3. AI Prompting Layer
Cung cấp ngữ cảnh rõ ràng về thời gian kết thúc (end time) cho AI.
#### [MODIFY] [skills/WeeklyPlanningSkill.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/skills/WeeklyPlanningSkill.ts)
- Cập nhật hàm `buildBusySlotsContext`: Kiểm tra nếu `NotionBusySlot` có tồn tại `end`, format chuỗi thành `• [Notion] "Task Name" → {start} to {end}`. Ngược lại, nếu không có `end`, giữ nguyên format cũ `starts {start}, est. {estimate}h`.

## Verification Plan
### Automated Tests
- Chạy `npm run build` đảm bảo không có lỗi type.
### Manual Verification
- Chạy lệnh `/weekly_planning` với các task có sẵn trên Notion Calendar (như hình đính kèm của User).
- Kiểm tra kết quả trả về của AI xem có bị đè vào khung giờ 4 PM - 9:15 PM không.
