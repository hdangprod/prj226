---
title: "[GOV] PM Documentation & Governance Guide - SOP"
tags: [notion-sync, second-brain]
category: "Notion Knowledge Base"
synthesized_at: "2026-07-27T11:35:30.201Z"
---

# [GOV] PM Documentation & Governance Guide - SOP

Mục đích: Tài liệu này quy định cách tổ chức, đặt tên và quản lý vòng đời của tất cả các tài liệu Product Management thuộc dự án. Giúp toàn bộ team (Dev, Design, Stakeholders) luôn tiếp cận được phiên bản tài liệu mới nhất và chính xác nhất.


1. Cấu trúc Database (Database Schema)

Mỗi tài liệu trong Product Management Document’s Hub bắt buộc phải điền đầy đủ các thuộc tính (Properties) sau để phục vụ việc lọc và tìm kiếm:

Name of Document (Title): Tên tài liệu (Áp dụng quy tắc đặt tên ở mục 2).

Doc Type (Select): Thể loại tài liệu (Đây chính là thuộc tính "Section/Category" bạn cần). Các giá trị chuẩn bao gồm:

Projects (Relation): Liên kết trực tiếp với Database Projects tổng để biết tài liệu này thuộc Phase/Dự án nào.

Status (Select): Trạng thái của tài liệu:

2. Quy tắc đặt tên tài liệu (Naming Convention)

Để tránh việc tài liệu bị rối khi số lượng lên đến hàng trăm file, tất cả thành viên phải tuân theo cấu trúc đặt tên nghiêm ngặt sau:

📌 Công thức: [Mã Dự Án] Loại Tài Liệu - Tên Tính Năng/Nội Dung (Version)

Ví dụ thực tế:

[PRJ326] PRD - Onboarding Flow (v1.0)

[PRJ326] Research - User Interview Insights

[PRJ326] Analytics Spec - Checkout Funnel Tracking

3. Quy trình vận hành tài liệu (Document Lifecycle)

Một tài liệu PM từ khi sinh ra đến khi đưa vào vận hành sẽ đi qua 4 bước:

[Khởi tạo: Draft] ➔ [Phản biện: In Review] ➔ [Phê duyệt: Approved] ➔ [Lưu trữ: Archived]

Bước 1 (Khởi tạo): PM tạo trang mới, đổi Status thành Draft, chọn đúng Doc Type và link vào Projects.

Bước 2 (Review): Khi viết xong, chuyển Status thành In Review. Tag @Tech Lead để check tính khả thi về kỹ thuật (Technical Feasibility) và @Designer để check flow.

Bước 3 (Chốt): Sau khi thống nhất, chuyển Status thành Approved. Đây là tín hiệu cho Dev bắt đầu code dựa trên tài liệu này.

Bước 4 (Cập nhật): Nếu có thay đổi nhỏ sau đó, PM cập nhật trực tiếp vào file và ghi rõ ở mục Log thay đổi trong tài liệu. Nếu thay đổi quá lớn, tăng số Version (v1.1, v2.0).
