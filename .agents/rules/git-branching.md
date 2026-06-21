---
title: "Quy trình Git Branching & Pull Request"
type: "rule"
---

# Quy trình Git Branching & Pull Request (GitHub Flow)

**BẮT BUỘC:** Khi xử lý bất kỳ Issue nào trên GitHub, AI Agent phải tuân thủ quy trình sau:

## 1. Tạo Branch cho Issue
- Ngay sau khi tạo Issue trên GitHub, **tạo một branch riêng** từ `main` với tên theo chuẩn:
  ```
  issue-<number>/<short-description>
  ```
  Ví dụ: `issue-9/fix-daily-log-date`, `issue-12/add-area-selection`
- Checkout sang branch mới đó trước khi bắt đầu code.

## 2. Làm việc trên Branch
- Toàn bộ commit phải nằm trên branch của Issue đó, **KHÔNG bao giờ commit trực tiếp lên `main`**.
- Commit message tuân thủ chuẩn Semantic: `<type>(<scope>): <description> (#<issue_number>)`

## 3. Tạo Pull Request
- Khi hoàn tất code và `npm run build` pass, tạo Pull Request từ branch đó vào `main` bằng lệnh:
  ```bash
  gh pr create --base main --head <branch-name> --title "<PR Title>" --body "<Report>"
  ```
- PR body phải chứa Implementation Report (các file đã sửa, giải pháp kỹ thuật, cách test).

## 4. Chờ User Review & Merge
- **KHÔNG tự merge PR.** User (Product Manager) là người duy nhất có quyền duyệt và merge.
- Sau khi User merge, AI Agent có thể đóng Issue tương ứng (nếu chưa tự đóng qua PR).
