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
   - Checklist: Chỉ giữ lại các mục chưa hoàn thành.
   - Estimate (Thời gian dự kiến): Giảm một nửa so với task gốc.
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

### Component 3: `src/router.ts`
- Thêm điều kiện bắt callback query `defer:<taskId>`.
- Khi người dùng click `[⏳ Defer]`, gọi `rolloverTask(taskId)`.
- Cập nhật lại tin nhắn cũ thành `⏳ Task deferred. Rollover created for tomorrow.`
- Hiển thị Inline Button `[📂 Mở Rollover Task]` dẫn đến task mới.

---

## User Review Required

> [!IMPORTANT]
> **Notion Database Status:** Thuộc tính `Status` của bảng Tasks trên Notion của Sếp phải đảm bảo có sẵn tuỳ chọn **"Deferred"** (hoặc nếu Sếp muốn dùng "Archived" thay thế thì xin hãy báo cho tôi biết). Mặc định tôi sẽ dùng chuỗi `"Deferred"`.

## Open Questions

> [!NOTE]
> 1. **Logic Estimate:** Khi dời sang ngày mai, hiện tại tôi để mặc định là chia đôi Estimate của ngày hôm trước (ví dụ hôm nay định làm 2h mà không kịp, thì mai dự kiến làm nốt 1h). Sếp có muốn dùng logic khác không?
> 2. **Checklist:** Nếu checklist gồm 3 việc, hôm nay tích xong 1 việc, thì sang ngày mai checklist mới sẽ **chỉ hiển thị 2 việc còn lại**. Sếp đồng ý với logic này chứ?

---

## Verification Plan (DoD)

### 1. Code chạy đúng spec, không bug
- Nút Defer hoạt động, tự động clone task sang ngày mai trên Notion, tính lại estimate, xoá bỏ các checklist đã tích.
- Status task cũ được cập nhật thành Deferred.

### 2. Unit Test bao phủ
- Bổ sung unit test cho logic `rolloverTask` (đặc biệt là test việc lọc checklist và chia đôi estimate).

### 3. Cập nhật Tài liệu
- Cập nhật `docs/troubleshooting.md` hoặc README nếu có issue phát sinh.
