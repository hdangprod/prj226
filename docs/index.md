---
title: "Knowledge Index: Telegram Bot Notion Second Brain"
version: 1.1.0
date: 2026-06-20
type: index
---

# Bản đồ Tri thức (Knowledge Index)

Chào mừng bạn đến với hệ thống tri thức của dự án **Telegram Bot Notion Second Brain Orchestrator**. Dự án được xây dựng theo tiêu chuẩn **AI-Native Workspace** (Google Antigravity Primitives) kết hợp định dạng **Open Knowledge Format (OKF v0.1)**.

Dưới đây là mục lục điều hướng đến các tài liệu quan trọng trong hệ thống:

## 1. Đặc tả Hệ thống (Specifications)
- [System Specification (spec.md)](./spec.md) - Tài liệu trung tâm quy định kiến trúc, công nghệ và tính năng của toàn bộ hệ thống (Bao gồm Data Flow, Models Routing).

## 2. Hướng dẫn Lắp ráp & Thiết lập (Setup & Database)
- [Notion Database Setup](./notion_database_setup.md) - Hướng dẫn tạo và cấu hình 5 Database lõi (Tasks, Projects, Daily Logs, Areas, Resources) trên Notion.
- [Walkthrough (Artifact)](../walkthrough.md) - Tóm tắt chi tiết các luồng hội thoại và tính năng đã hiện thực hóa.

## 3. Ranh giới Kỹ thuật & DevOps (.agents/)
- [Notion API Limits](../.agents/rules/notion-limits.md) - Quy định cứng về việc giới hạn tốc độ (Rate Limit) và cấm sử dụng chạy song song vô tội vạ (`Promise.all`) khi giao tiếp với Notion API.
- [Deploy Check Workflow](../.agents/workflows/deploy-check.md) - Checklist 3 bước bắt buộc phải rà soát (Validate Env, Build, IAM Permissions) trước khi đẩy code lên GCP Cloud Run.

## 4. Lịch sử Nâng cấp & Bài học (History & Retrospectives)
- [Changelog & Refactoring Notes](./changelog.md) - Ghi chép chi tiết các đợt đập đi xây lại (Refactoring) và bài học kinh nghiệm vận hành GCP.
- [Sprint 01 Retrospective](./retrospectives/sprint-01.md) - Đánh giá quá trình thiết lập hạ tầng và thông suốt luồng dữ liệu cơ bản.

## 5. Hướng dẫn Sử dụng (User Manuals)
- [User Manual (Tiếng Việt)](./usage.md)
- [User Manual (English)](./usage.en.md)
- [Weekly Plan Workflow](./weekly_plan.md) - Chi tiết cách thức vận hành tính năng lập kế hoạch tuần bằng ngôn ngữ tự nhiên.
