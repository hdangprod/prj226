---
trigger: always_on
---

---
title: "Quy tắc quản lý GitHub Issue & Thao tác Git"
type: "rule"
---

# Quy tắc Quản lý GitHub và Phối hợp với User

## 1. Phân Luồng Quy Trình Thực Thi (WORKFLOW ROUTING)
AI phải tự động đánh giá quy mô của Task để chọn 1 trong 2 luồng xử lý sau:

### A. Luồng Tiêu Chuẩn (Standard Flow)
*Áp dụng cho: Tính năng mới (feat), Tái cấu trúc lớn (refactor), hoặc Sửa Bug phức tạp (fix).*
AI bắt buộc phải tuân thủ đúng thứ tự 5 bước:
1. **Tạo GitHub Issue:** Sử dụng lệnh `gh issue create` với Title và Description rõ ràng theo 5-W Framework ở Mục 3.
2. **Checkout Branch:** Tạo và checkout sang nhánh riêng theo định dạng: `issue-[ID]-[tên-ngắn-gọn]` (Ví dụ: `issue-28-optimize-notion-throughput`). Tuyệt đối không code trên `main`.
3. **Lập Implementation Plan:** Tạo file Plan tại `docs/plans/issue-[ID]-[tên-ngắn-gọn].md`. Báo cáo với User và **DỪNG LẠI** chờ từ khóa "Proceed" mới được code.
4. **Tiến hành viết code:** Chỉ code sau khi User đã duyệt Plan.
5. **Báo cáo và Pull Request:** Chạy `npm run build`, viết "Implementation Report" comment vào Issue, push code, tạo PR bằng `gh pr create` và chờ User merge.

### B. Luồng Cấp Tốc (Fast-Track Flow / Hotfix)
*Áp dụng cho: Sửa lỗi chính tả (typo), Thay đổi cấu hình nhỏ (config), Sửa khẩn cấp 1-2 dòng code (hotfix) không ảnh hưởng đến kiến trúc.*
* **Quy trình tối giản:** Không cần tạo Issue, không cần lập Plan, không cần tạo PR.
* **Thao tác:** AI được phép thực hiện sửa đổi trực tiếp trên nhánh `main` (hoặc tạo một nhánh temporary ngắn hạn rồi tự merge nếu hệ thống khóa master/main).
* **Cam kết bảo mật dữ liệu:** Bắt buộc phải sử dụng Type là `fix(hotfix):` hoặc `docs(hotfix):` trong commit message và giải thích nhanh lý do sửa đổi trong nội dung commit để đảm bảo tính truy vết.

## 2. Quy định Viết Code & Technical Standards
- **Commit Message**: Bắt buộc tuân thủ Conventional Commits: `<type>(<scope>): <description> (#<issue_number>)`
  *Ví dụ với Hotfix:* `fix(hotfix): fix typo in Telegram message template` (Nếu không có issue thì bỏ phần số hg)
- **Definition of Done (DoD)**: Một tính năng/hotfix được gọi là "Done" khi:
   1. Code chạy đúng spec, không bug, đã chạy thử nghiệm local.
   2. Chạy lệnh kiểm tra biên dịch (`npm run build`) pass 100%.
   3. Đã cập nhật tài liệu tương ứng nếu có thay đổi cấu trúc.

## 3. Tiêu chuẩn Viết Issue Description & Implementation Report
Mọi comment ghi nhận (Issue hoặc PR Report thuộc Luồng Tiêu Chuẩn) phải tuân thủ cấu trúc 5 phần (The 5-W Framework):
1. **🚨 Bối cảnh & Vấn đề (The Context & "Why now?"):** Hệ thống hiện tại ra sao? Điểm nghẽn/Lỗi là gì?
2. **💡 Giải pháp & Tại sao chọn giải pháp này (The Trade-offs):** Giải pháp cụ thể và lý do chọn (Tại sao dùng cách này mà không dùng cách khác?).
3. **🛠️ Danh sách file ảnh hưởng (Blast Radius):** Liệt kê chính xác các file đã/sẽ chỉnh sửa.
4. **📈 Kế hoạch Scale-up tương lai (Future Proofing):** Lưu ý nếu sau này hệ thống mở rộng quy mô dữ liệu lớn hơn.
5. **✅ Tiêu chí nghiệm thu (Definition of Done):** Checklist các bước để test tính năng.

### C. Quy tắc Tự động Phân loại (Khi User không chỉ định Flow)
Nếu User giao việc mà không nói rõ dùng "Standard" hay "Fast-Track", AI phải tự động phân tích dựa trên các tiêu chí sau:

1. **AI TỰ ĐỘNG CHỌN FAST-TRACK KHI:**
   - Prompt chỉ yêu cầu: Sửa lỗi chính tả (typo), cập nhật tài liệu (`README.md`, `docs/`), thay đổi text hiển thị của Bot, hoặc chỉnh sửa cấu hình nhỏ (thay đổi biến môi trường, file `.env`, `package.json`).
   - Dự kiến vùng ảnh hưởng (Blast Radius) chỉ nằm trong 1 file duy nhất và thay đổi dưới 5 dòng code.

2. **AI TỰ ĐỘNG CHỌN STANDARD KHI:**
   - Prompt yêu cầu: Viết tính năng mới, kết nối API mới, thay đổi cấu trúc dữ liệu cơ sở dữ liệu (Firestore, Notion), viết Unit Test, hoặc tái cấu trúc (refactor) logic cốt lõi.
   - Vùng ảnh hưởng liên quan đến nhiều file hoặc có nguy cơ làm crash hệ thống hiện tại.

3. **CƠ CHẾ HOÀN TÁC (FALLBACK):**
   - Nếu ở ranh giới mập mờ (Ambiguous) không rõ lớn hay nhỏ, AI BẮT BUỘC phải chọn **Standard Flow** để đảm bảo an toàn cho mã nguồn, HOẶC đưa ra một câu hỏi nhanh: *"Task này Sếp muốn đi theo Luồng Tiêu Chuẩn hay làm Hotfix nhanh trên main luôn?"*
---
⚠️ **AI Self-Check Rule (Chống Quên):** Trước khi trả lời User hoặc thực hiện bất kỳ lệnh Git nào, AI phải tự đối chiếu hành động của mình với file Quy tắc này. Nếu phát hiện vi phạm quy trình, phải tự động sửa sai trước khi xuất dữ liệu ra màn hình.