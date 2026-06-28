# Tối Ưu Hóa Định Tuyến Hybrid & Tự Kiểm Định Model (Gemini Free-Tier Optimization)

## 🚨 Bối cảnh & Vấn đề (The Context & "Why now?")
Hệ thống hiện tại (V2.0) đang phụ thuộc hoàn toàn vào **Gemini 3.5 Flash (PRO)** cho các tác vụ quan trọng như lập kế hoạch tuần (`/weekly_planning`) và báo cáo tuần (`/weekly_report`). 
**Vấn đề:** Giới hạn API của Free-tier cho model PRO cực kỳ khắt khe: **20 Requests Per Day (RPD)**. Việc sử dụng PRO cho mọi luồng lập lịch sẽ dẫn đến tình trạng cạn kiệt tài nguyên nhanh chóng, gây gián đoạn dịch vụ (`429 Quota Exceeded`) hoặc lỗi do quá tải máy chủ Google (`503 Service Unavailable`). 

## 💡 Giải pháp & Tại sao chọn giải pháp này (The Trade-offs)
Chúng ta sẽ triển khai cơ chế **Asymmetric Hybrid Router** kết hợp với **Self-Correction & Escalation**.
- **Giải pháp:** 
  1. Xây dựng **Bộ đếm (Quota Tracker)** bằng Firestore để lưu trữ số lượt gọi PRO hàng ngày. Khi chạm mốc cảnh báo (15/20), bot sẽ báo động. Khi chạm trần (20/20), hệ thống sẽ ngắt hoàn toàn PRO và chặn ở lớp Router.
  2. Áp dụng chiến lược **Lite-First**: Gọi mô hình 3.1 Flash Lite trước cho `/weekly_planning`. Nếu LITE trả về cấu trúc đúng và lịch không bị chồng chéo (dựa vào hàm *Validator* code cứng), ta giữ kết quả này (0 lượt gọi PRO).
  3. Nếu LITE xếp lịch sai, hệ thống mới **Escalate (Nâng cấp)** lên PRO để tối ưu.
- **Trade-offs:** 
  Đổi lại một chút độ phức tạp trong logic backend (phải viết hàm kiểm tra chồng chéo lịch biểu `validateWeeklySchedule`) và thời gian chờ tăng thêm 1-2 giây cho User (do phải thử nghiệm nhiều mô hình ngầm), chúng ta tiết kiệm được tới **80-100% chi phí/giới hạn API** của PRO. Cách tiếp cận này giúp ứng dụng có thể chịu tải cho mọi nhu cầu scale tính năng (như LLM Wiki) trong tương lai.

## 🛠️ Danh sách file ảnh hưởng (Blast Radius)
- `src/services/stateManager.ts`: Khởi tạo collection `system_stats` để track `proCalls`.
- `src/gemini/client.ts`: Sửa lại `planWeeklySchedule` và `analyzeWeeklyReport` để hỗ trợ cờ `forcedModel` và cơ chế fallback sang LITE.
- `src/services/weeklyScheduleValidator.ts` **[NEW]**: Thuật toán kiểm tra xung đột thời gian (Temporal overlap checker).
- `src/skills/WeeklyPlanningSkill.ts`: Chuyển đổi logic sang luồng Lite-First và Escalate lên PRO khi lỗi.
- `src/router.ts`: Cập nhật UI Telegram để hiển thị chỉ báo `🟢 LITE Optimized`, `⭐ PRO Optimized` hoặc `⚡ LITE Fallback` kèm theo cảnh báo quota (khi $\ge 15$).

## 📈 Kế hoạch Scale-up tương lai (Future Proofing)
Việc sử dụng Firestore làm trung tâm giám sát số lượng API Call sẽ là tiền đề vững chắc nếu sau này chúng ta:
1. Hỗ trợ **Multi-user** (mỗi User ID sẽ có một quota riêng biệt thay vì dùng chung 1 API Key).
2. Tích hợp **Multi-Key Pool** (khi quota của Key A cạn, tự động trỏ `stateManager` sang Key B).
3. Cho phép Admin dễ dàng mở rộng và tắt/bật tính năng trực tiếp từ Console.

## ✅ Tiêu chí nghiệm thu (Definition of Done)
- [ ] Tính năng chạy thành công với một prompt `/weekly_planning` đơn giản, dùng LITE hoàn toàn và không thay đổi đếm PRO trên Firestore.
- [ ] Tính năng leo cấp (escalate) thành công lên PRO nếu gửi một tập công việc phức tạp/xung đột.
- [ ] Chạy thành công lệnh `npm run build` không lỗi type.
- [ ] Hệ thống hiện cảnh báo khi mô phỏng số cuộc gọi $\ge 15$ trong Firestore.
