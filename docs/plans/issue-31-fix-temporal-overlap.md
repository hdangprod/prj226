## 🚨 Bối cảnh & Vấn đề (The Context & "Why now?")
Hệ thống Validator của quá trình Hybrid Routing đang có lỗ hổng: Hàm `hasTemporalOverlap` hiện tại chỉ kiểm tra việc chồng chéo lịch trình **giữa các task mới** được AI tạo ra với nhau. Nó hoàn toàn bỏ qua việc so sánh với các lịch trình **đã có sẵn** từ Google Calendar (`gcalEvents`) và Notion Tasks (`notionTasks`).
Hậu quả là Gemini LITE có thể xếp lịch đè lên một cuộc họp đã có sẵn, nhưng hệ thống vẫn báo hợp lệ (`🟢 LITE Optimized`) thay vì tự động escalate lên PRO để sửa sai.

## 💡 Giải pháp & Tại sao chọn giải pháp này (The Trade-offs)
- **Giải pháp:** Bổ sung tham số `gcalEvents` và `notionTasks` vào hàm `hasTemporalOverlap`. Chuyển đổi toàn bộ mốc thời gian của lịch cũ và lịch mới thành một danh sách các "Khoảng thời gian bận" chung (Time Intervals). Sắp xếp mảng này và duyệt để tìm sự giao nhau (overlap).
  (Lưu ý: Đối với `NotionBusySlot` thiếu trường `end`, ta sẽ tính `end = start + estimate (hours)`).
- **Trade-offs:** Việc tính toán này sẽ tốn thêm một ít cycle của CPU để gộp và sắp xếp mảng lớn hơn, nhưng hoàn toàn xứng đáng vì nó làm Validator chính xác tuyệt đối.

## 🛠️ Danh sách file ảnh hưởng (Blast Radius)
- [MODIFY] `src/services/weeklyScheduleValidator.ts`: Thay đổi cấu trúc hàm `hasTemporalOverlap` và thuật toán kiểm tra đè lịch.
- [MODIFY] `src/skills/WeeklyPlanningSkill.ts`: Truyền `gcalEvents` và `notionTasks` (đã fetch ở Phase 1) vào hàm validator tại Phase 2.2.

## 📈 Kế hoạch Scale-up tương lai (Future Proofing)
- Logic gộp Time Intervals này có thể tái sử dụng nếu sau này ta phát triển thêm kỹ năng tìm giờ rảnh (Free Time Slot Finder).

## ✅ Tiêu chí nghiệm thu (Definition of Done)
- [ ] Thuật toán bắt lỗi chính xác khi LITE xếp lịch đè lên sự kiện Google Calendar hoặc Notion Task có sẵn.
- [ ] Nhận diện thành công và tự động Fallback sang PRO để xử lý.
- [ ] Không có lỗi type khi chạy `npm run build`.
