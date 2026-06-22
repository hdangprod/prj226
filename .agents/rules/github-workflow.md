---
trigger: always_on
---

---
title: "Quy tắc quản lý GitHub Issue & Thao tác Git"
type: "rule"
---

# Quy tắc Quản lý GitHub và Phối hợp với User

## 1. Quy trình Khởi tạo (MANDATORY WORKFLOW)
Trừ khi User nói rõ "không cần tạo issue/không cần theo workflow", AI bắt buộc phải tuân thủ đúng thứ tự 5 bước sau mỗi khi phát triển tính năng mới hoặc sửa bug:

1. **Tạo GitHub Issue:** Sử dụng lệnh `gh issue create` với Title và Description rõ ràng (Context, DoD).
2. **Checkout Branch:** Tạo và checkout sang nhánh riêng biệt có liên kết với Issue theo định dạng: `feature/[Issue-ID]-[tên-ngắn-gọn]` hoặc `bugfix/[Issue-ID]-[tên-ngắn-gọn]`. Tuyệt đối không code trực tiếp trên `main`.
3. **Lập Implementation Plan:** Tạo một file Plan mới nằm trong thư mục `docs/plans/` với định dạng tên `issue-[ID]-[tên-ngắn-gọn].md` (vd: `docs/plans/issue-16-rollover-task.md`). Báo cáo với User và **DỪNG LẠI** chờ User đọc và xác nhận "Proceed/Đồng ý".
4. **Tiến hành viết code:** Chỉ bắt đầu code sau khi User đã duyệt Plan.
5. **Báo cáo và Pull Request:** Sau khi code và test (`npm run build`) thành công:
   - Viết một "Implementation Report" chứa các technical steps đã làm và comment trực tiếp vào GitHub Issue (`gh issue comment`).
   - Commit code theo chuẩn Semantic Commits và Push branch lên remote.
   - Tạo Pull Request (`gh pr create`) và yêu cầu User vào duyệt (Merge).

## 2. Quy định Viết Code & Technical Standards
- **Commit Message**: Bắt buộc tuân thủ Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`):
   - Cú pháp: `<type>(<scope>): <description> (#<issue_number>)`
   - Ví dụ: `feat(notion): add auto-prefixing logic to task creation (#12)`
- **Definition of Done (DoD)**: Một tính năng được gọi là "Done" khi:
   1. Code chạy đúng spec, không bug.
   2. Đã viết Unit Test bao phủ.
   3. Đã cập nhật tài liệu (API Docs, README hoặc hệ thống Notion của bạn) nếu có thay đổi về kiến trúc.
- **Đóng Issue**: Việc đóng Issue sẽ do GitHub tự động thực hiện khi User merge PR, AI không cần dùng lệnh `gh issue close` trừ khi được yêu cầu đặc biệt.

## Boundaries (Ranh giới hành vi)
- **ALWAYS**: Chạy lệnh kiểm tra biên dịch (`npm run build`) ở local trước khi báo cáo hoàn thành hoặc tạo commit.
- **ASK FIRST**: Trước khi đóng hoàn toàn một Issue, hãy hỏi User xem họ đã test thử và hài lòng chưa.
- **NEVER**: Tự ý đóng Issue khi chưa chạy test hoặc chưa có sự xác nhận của User về kết quả sửa lỗi.
