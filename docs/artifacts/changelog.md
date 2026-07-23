---
title: "Changelog & Refactoring Notes"
version: 1.1.0
date: 2026-06-20
type: changelog
ai_policy: "human_reviewer_only"
---

# Changelog & Refactoring Notes

> [!CAUTION]
> **AI AGENT TOKEN GUARD**: This file is intended exclusively for human reviewers and project documentation. AI agents MUST NOT auto-load or process this file during standard coding tasks unless explicitly requested by the user.


Tài liệu này ghi chú lại các đợt refactor và thay đổi cấu trúc mã nguồn để hỗ trợ việc review trong tương lai.

## Đợt Refactor 2 (Hiện tại)
**Mục tiêu**: Chuẩn hóa AI-Native Architecture và tách module Agent Skills.

### Các thay đổi chính

1. **Khởi tạo Ranh giới Kỹ thuật (`.agents/`)**
   - Định nghĩa quy tắc `notion-limits.md` chống lỗi Rate Limit.
   - Định nghĩa quy trình kiểm tra `deploy-check.md` trước khi đẩy lên GCP.

2. **Áp dụng mô hình Agent Skills (`src/skills/`)**
   - Định nghĩa `AgentSkill` interface (abstract layer cho mọi kỹ năng của hệ thống).
   - Tách toàn bộ logic nghiệp vụ (NLP parsing, prefix generation, Firestore state) của tính năng lập kế hoạch tuần (`/plan_week`) thành `WeeklyPlanningSkill.ts`.
   - Biến đổi `router.ts` thành Thin Router, chỉ chịu trách nhiệm nhận/trả request thay vì gánh vác logic.
   - Bổ sung Error Boundary cho Kỹ năng lập kế hoạch tuần, tối ưu hiển thị Fallback Project cho tính năng Preview, và dọn dẹp Tech Debt đặt tên hàm (Đổi escapeMarkdown thành escapeHtml).

3. **Đồng bộ hóa Tài liệu (OKF v0.1)**
   - Cập nhật chuẩn Open Knowledge Format (YAML Frontmatter) cho hệ thống tài liệu.
   - Bổ sung `docs/index.md` làm Knowledge Index.

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

## Bài học Kinh nghiệm Vận hành (DevOps & GCP Infrastructure)

**1. Lỗi PORT 8080 Timeout khi khởi động**
- **Nguyên nhân**: Hàm `validateEnv()` trong `src/config.ts` văng lỗi (crash) khi thiếu cấu hình biến môi trường trên đám mây, dẫn đến container bị sập.
- **Giải pháp**: Cần nạp đầy đủ các biến môi trường thông qua cờ `--set-env-vars` tại lệnh deploy trên Cloud Run.

**2. Tiêu chuẩn cấu hình Firestore Instance**
- **Standard Edition**: Dùng phiên bản này để tận dụng gói Always Free và tính năng Automatic Indexing.
- **Native Mode**: Bắt buộc để khớp hoàn toàn với SDK Node.js (`@google-cloud/firestore`).
- **Region cố định (`asia-southeast1`)**: Phải chọn khu vực Singapore để ép độ trễ (latency) <10ms thay vì chọn Multi-region ở Mỹ.

**3. Cơ chế ID Database ngầm định**
- Việc khởi tạo client bằng cú pháp `new Firestore()` (để trống tham số) trong file `stateManager.ts` bắt buộc ID database trên giao diện UI GCP phải là `(default)`. Nếu đặt tên khác sẽ vướng lỗi `5 NOT_FOUND`.

**4. Bẫy định danh Runtime & Lỗi 7 PERMISSION_DENIED**
Để khắc phục triệt để lỗi không có quyền đọc/ghi Firestore trên Cloud Run, cần thực hiện chuẩn xác 2 bước sau:

*Bước 1: Check danh tính thật*
- Vào **Cloud Run** -> tab **Revisions** -> chọn revision mới nhất.
- Ở bảng phụ bên phải, chọn tab **Security**.
- Tìm dòng **Service Account** để lấy địa chỉ email thực tế đang chạy (Ví dụ: một email đuôi `@appspot.gserviceaccount.com`).

*Bước 2: Cấp quyền kiểu mới*
- Vào menu **IAM & Admin** -> **IAM**.
- Bấm nút **GRANT ACCESS** (nút giao diện mới thay thế cho nút ADD).
- Dán địa chỉ email vừa lấy vào.
- Cấp role chuyên biệt cho Data Plane: Chọn **Firebase Firestore Admin** (hoặc **Cloud Datastore User**) để thông ống quyền ghi/đọc.
