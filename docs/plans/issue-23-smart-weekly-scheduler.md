# Implementation Plan: Smart Weekly Scheduler (V2.0) - Issue #23

## Goal
Tự động hóa luồng lên kế hoạch tuần bằng lệnh `/weekly_planning`. Hệ thống sẽ phân tích dữ liệu lịch trình bận rộn (từ Google Calendar và các Task trên Notion có gán Date), gửi cho AI tối ưu hóa thời gian (Temporal Tetris), chia nhỏ task (Micro-checklists) và tạo trực tiếp vào Notion khi người dùng duyệt.

## User Review Required

> [!IMPORTANT]
> **Google Calendar API Integration**
> Tính năng này yêu cầu kết nối với Google Calendar. Tôi sẽ cần cài đặt thư viện `googleapis`. Sếp sẽ cần tạo một Service Account trên Google Cloud Console, chia sẻ (share) Lịch của Sếp với email của Service Account đó, và cấu hình các biến môi trường sau:
> - `GOOGLE_CALENDAR_ID`
> - `GOOGLE_CLIENT_EMAIL`
> - `GOOGLE_PRIVATE_KEY`
>
> Sếp có đồng ý để tôi cài thư viện này và bổ sung các biến môi trường vào file `.env` không?

> [!WARNING]
> **Thay đổi Command**
> Theo yêu cầu, tôi sẽ thay thế lệnh `/plan_week` hiện tại bằng `/weekly_planning`.

## Proposed Changes

### 1. Dependencies & Env
#### [MODIFY] package.json
- Chạy `npm install googleapis`.

#### [MODIFY] .env.example
- Thêm `GOOGLE_CALENDAR_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`.

### 2. Google Calendar Client
#### [NEW] src/google/client.ts
- Viết hàm `fetchUpcomingEvents(startDate, endDate)` sử dụng Google Calendar API với `singleEvents: true` để lấy các khung giờ bận của tuần tới.

### 3. Notion Client Updates
#### [MODIFY] src/notion/client.ts
- Bổ sung hàm `fetchActiveTasksWithDates(startDate, endDate)`: Query DB Notion lấy các task khác `Done`/`Archived` và có giá trị `Date`.
- Cập nhật hàm tạo Task (`createTaskPage`) để hỗ trợ chèn `Callout` (Mục đích task) và nhiều block `To-do` (Checklist) vào phần thân trang (Page Body).

### 4. Xử lý logic Weekly Planning Skill
#### [MODIFY] src/skills/WeeklyPlanningSkill.ts
- **Capture Phase:** Chạy song song `fetchUpcomingEvents` và `fetchActiveTasksWithDates`.
- Normalize thời gian từ cả 2 nguồn thành chuỗi `Busy_Slots_Context`.
- **AI Payload Validation:** Catch lỗi parse JSON, thực hiện silent-retry tối đa 2 lần.
- Đổi output của Gemini để khớp với schema mới trong bản thiết kế (Mảng các object chứa `properties` và `content`).
- Quản lý bộ nhớ đệm (Drafts) bằng TTL 15 phút.

#### [MODIFY] src/gemini/client.ts
- Cập nhật system prompt của `parseWeeklyPlan`:
  - Ép `responseMimeType: "application/json"`.
  - Truyền `Busy_Slots_Context` vào cho AI xếp lịch.
  - Áp dụng các rules: "Max 3 High priority/day", "Checklists < 45 min", "Work tasks 09:00-18:00, Personal 20:00-22:30".

### 5. Telegram Router & UI
#### [MODIFY] src/router.ts
- Đổi lệnh `/plan_week` thành `/weekly_planning`.
- Format giao diện Telegram tách bạch phần "Lịch Google" và "Lịch dự kiến AI xếp".
- Xử lý trạng thái nút bấm: Đổi thành "Processing..." khi người dùng click `[🟢 Duyệt & Lên lịch Notion Calendar]` để chống double-click.

### 6. Xử lý lỗi (Edge Cases)
- **Zero Free Slots:** AI sẽ tự động phân loại các task không chèn được lịch vào danh sách "Weekly Backlog".
- **API Drops:** Wrap toàn bộ trong try/catch và trả về cảnh báo `⚠️ Connection Failure`.

## Verification Plan
### Manual Verification
- Sếp điền các biến môi trường Google Calendar.
- Thử gửi `/weekly_planning Dọn nhà, Code tính năng X, Họp team Y`.
- Kiểm tra AI trả về danh sách lịch trình (không đè lên lịch bận hiện tại).
- Ấn "Duyệt" và check Notion xem task đã tạo với Callout và Checklists chưa.
