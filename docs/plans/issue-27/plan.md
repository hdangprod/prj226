# Fix AI Scheduler Overlap Bug (Issue #27)

Xử lý lỗi AI tạo task mới đè lên các khung giờ đã bị chặn bởi các task/event cũ (ví dụ: task đồng bộ từ Personal Calendar).

## Open Questions
- Không có câu hỏi nào. Nguyên nhân là do AI thiếu tham số `end_time` của các Obsidian task hiện tại.

## Proposed Changes

### 1. Data Types
Cập nhật interface để chứa tham số thời gian kết thúc của Task.
#### [MODIFY] [obsidian/types.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/obsidian/types.ts)
- Bổ sung trường `end?: string` vào interface `ObsidianBusySlot`.

### 2. Obsidian Client Layer
Extract thêm dữ liệu `end time` từ database Obsidian.
#### [MODIFY] [obsidian/client.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/obsidian/client.ts)
- Bổ sung hàm helper `getDateEnd(page: ObsidianPage, prop: string): string | undefined` để lấy được `Date.end`.
- Cập nhật hàm `fetchActiveTasksWithDates`: gán thêm `end: getDateEnd(p, 'Date')` vào object trả về.

### 3. AI Prompting Layer
Cung cấp ngữ cảnh rõ ràng về thời gian kết thúc (end time) cho AI.
#### [MODIFY] [skills/WeeklyPlanningSkill.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/skills/WeeklyPlanningSkill.ts)
- Cập nhật hàm `buildBusySlotsContext`: Kiểm tra nếu `ObsidianBusySlot` có tồn tại `end`, format chuỗi thành `• [Obsidian] "Task Name" → {start} to {end}`. Ngược lại, nếu không có `end`, giữ nguyên format cũ `starts {start}, est. {estimate}h`.

## Verification Plan
### Automated Tests
- Chạy `npm run build` đảm bảo không có lỗi type.
### Manual Verification
- Chạy lệnh `/weekly_planning` với các task có sẵn trên Obsidian Calendar (như hình đính kèm của User).
- Kiểm tra kết quả trả về của AI xem có bị đè vào khung giờ 4 PM - 9:15 PM không.
