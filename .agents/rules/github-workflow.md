---
trigger: always_on
---

---
title: "Quy tắc quản lý GitHub Issue & Thao tác Git"
type: "rule"
---

# Quy tắc Quản lý GitHub và Phối hợp với User

## 1. Tiếp nhận Yêu cầu & Tạo Issue
- Khi User đề xuất tính năng mới (Feature Request) hoặc báo lỗi (Bug), AI phải bóc tách thông tin thành cấu trúc chuẩn.
- Luôn tạo GitHub Issue (hoặc giả lập/draft nội dung Issue) với định dạng:
  - **Title**: `[Feature/Bug/Refactor] <Tên ngắn gọn của task>`
  - **Description**: Mô tả chi tiết, Context (File liên quan), Tiêu chí hoàn thành (Definition of Done - DoD).
- **Phân hạng Ưu tiên (Prioritization)**: AI TUYỆT ĐỐI không tự ý thay đổi thứ tự ưu tiên trừ khi User yêu cầu. Phải tuân thủ danh sách ưu tiên do User sắp xếp.

## 2. Quy định Đóng Issue & Viết Report
Mỗi khi hoàn thành một Issue, AI bắt buộc phải thực hiện chuỗi hành động sau:
1. **Viết Pull Request / Implementation Report**: Tóm tắt các file đã chỉnh sửa, giải pháp kỹ thuật đã áp dụng, và kết quả kiểm thử.
2. **Commit Message**: Phải tuân thủ chuẩn Semantic Commits:
   - Cú pháp: `<type>(<scope>): <description> (#<issue_number>)`
   - Ví dụ: `feat(notion): add auto-prefixing logic to task creation (#12)`
3. **Đóng Issue**: Chỉ đóng Issue sau khi đã xác nhận code biên dịch thành công không lỗi và gửi Report cho User.

## Boundaries (Ranh giới hành vi)
- **ALWAYS**: Chạy lệnh kiểm tra biên dịch (`npm run build`) ở local trước khi báo cáo hoàn thành hoặc tạo commit.
- **ASK FIRST**: Trước khi đóng hoàn toàn một Issue, hãy hỏi User xem họ đã test thử và hài lòng chưa.
- **NEVER**: Tự ý đóng Issue khi chưa chạy test hoặc chưa có sự xác nhận của User về kết quả sửa lỗi.
