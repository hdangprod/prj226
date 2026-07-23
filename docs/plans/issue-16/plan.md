---
title: "Implementation Plan: Feature 16 — Rollover/Defer Task"
version: 1.0.0
---

# Kế hoạch Triển khai: Rollover / Defer Task (#16)

**Mục tiêu:**
Khi người dùng nhận ra một task không thể hoàn thành trong ngày hôm nay, họ có thể bấm nút `[⏳ Defer]` trên giao diện Telegram. Hệ thống sẽ tự động dời task này sang ngày mai một cách thông minh (Rollover).

**Workflow mong đợi:**
1. Lấy dữ liệu của task cũ (Tên, checklist, Project, Area, v.v.).
2. Kiểm tra những subtask/checklist nào chưa hoàn thành.
3. Tạo một Task MỚI (Clone) trên Notion:
   - Tên và thuộc tính giống hệt task cũ.
   - Checklist: **Giữ nguyên toàn bộ checklist (cả mục đã check và chưa check) để Sếp dễ dàng review lại.**
   - Estimate (Thời gian dự kiến): **Sẽ hỏi người dùng đã dùng bao nhiêu tiếng. Thời gian còn lại = Estimate cũ - Thời gian đã dùng. Nếu người dùng bỏ qua (skip), mặc định chia đôi (Estimate / 2).**
   - Liên kết vào Daily Log của **ngày mai**.
   - Due Date: Đặt thành ngày mai.
4. Cập nhật Task CŨ:
   - Chuyển trạng thái sang "Deferred" (hoặc "Archived").
5. Phản hồi cho người dùng qua Telegram kèm link mở Task mới.

---

## Proposed Changes

### Component 1: `src/notion/client.ts`
- Cập nhật thêm tính năng đọc Checklist từ task cũ. *(Đã có hàm `getTaskPage` và `getTaskChecklist`, cần tái sử dụng).*
- Bổ sung/cập nhật `createTask` để hỗ trợ truyền vào danh sách checklist tuỳ chọn (thay vì chỉ dùng `session.taskInput.checklist`).
- Thêm `getOrCreateDailyLog(dateStr)` với tham số là `ngày mai`.
- Bổ sung logic đổi trạng thái task cũ thành `Deferred`. *(Đã có hàm `updateTaskStatus`)*.

### Component 2: `src/services/taskService.ts`
- Implement hàm `rolloverTask(taskId: string): Promise<string>`.
  - Lấy thông tin chi tiết task cũ.
  - Tính toán chuỗi ngày mai (vd: `2026-06-23`).
  - Lấy/Tạo Daily Log của ngày mai.
  - Tạo task mới với estimate = `old_estimate / 2`.
  - Cập nhật status task cũ thành `Deferred`.
  - Trả về ID của task mới.

### Component 3: `src/router.ts` & `src/services/stateManager.ts`
- Bổ sung State `AWAITING_DEFER_TIME` trong `stateManager`.
- Thêm điều kiện bắt callback query `defer:<taskId>`.
- Khi người dùng click `[⏳ Defer]`, bot hỏi: *"Bạn đã dành bao nhiêu thời gian cho task này rồi? (Gõ số giờ, hoặc gõ 'skip' để chia đôi thời gian tự động)"* và lưu `taskId` vào session.
- Khi người dùng gõ số giờ (vd: 2) hoặc 'skip', router sẽ tính toán `remaining_estimate` và gọi `rolloverTask(taskId, remaining_estimate)`.
- Cập nhật lại tin nhắn cũ thành `⏳ Task deferred. Rollover created for tomorrow.`
- Hiển thị Inline Button `[📂 Mở Rollover Task]` dẫn đến task mới.

---

## User Review Required

> [!IMPORTANT]
> **Notion Database Status:** Thuộc tính `Status` của bảng Tasks trên Notion của Sếp phải đảm bảo có sẵn tuỳ chọn **"Deferred"** (hoặc nếu Sếp muốn dùng "Archived" thay thế thì xin hãy báo cho tôi biết). Mặc định tôi sẽ dùng chuỗi `"Deferred"`.

## Open Questions
*(Đã được giải đáp)*
1. **Logic Estimate:** Tính theo thời gian người dùng cung cấp (Estimate cũ - Thời gian đã làm). Nếu không nhập, mặc định chia đôi.
2. **Checklist:** Giữ nguyên toàn bộ checklist (cả tích và chưa tích) sang task ngày mai để dễ review.

---

## Verification Plan (DoD)

### 1. Code chạy đúng spec, không bug
- Nút Defer hoạt động, tự động clone task sang ngày mai trên Notion, tính lại estimate, xoá bỏ các checklist đã tích.
- Status task cũ được cập nhật thành Deferred.

### 2. Unit Test bao phủ
- Bổ sung unit test cho logic `rolloverTask` (đặc biệt là test việc lọc checklist và chia đôi estimate).

### 3. Cập nhật Tài liệu
- Cập nhật `docs/troubleshooting.md` hoặc README nếu có issue phát sinh.
