---
title: "Quy tắc viết Code: Centralized Constants for Messages"
type: "rule"
---

# Quy tắc quản lý thông báo (Centralized Messages)

**BẮT BUỘC:** Tuyệt đối không được "hardcode" (gõ chết) các chuỗi văn bản thông báo, chuỗi văn bản trên giao diện, thông báo lỗi, nút bấm (inline button labels) trực tiếp vào trong logic của code (như `router.ts`, `services/*.ts`, `skills/*.ts`).

Mọi chuỗi văn bản gửi đến người dùng phải được tạo thành một biến/hằng số và đưa vào file quản lý tập trung: `src/constants/messages.ts`.

## Cách thức triển khai:
1. Mở file `src/constants/messages.ts`.
2. Định nghĩa hằng số thông báo mới vào trong đối tượng `BOT_MESSAGES` theo đúng phân cấp logic (`SUCCESS`, `ERRORS`, `PROMPTS`, `BUTTONS`, `GREETINGS`).
3. Nếu thông báo có chứa biến động (ví dụ: tên task, số đếm), hãy sử dụng kiểu hàm trả về chuỗi (Arrow Function). Ví dụ:
   ```typescript
   PLAN_CREATED: (count: number, total: number) => `✅ Created ${count}/${total} tasks!`
   ```
4. `import { BOT_MESSAGES } from '../constants/messages';` vào file logic và sử dụng hằng số đó (ví dụ: `BOT_MESSAGES.SUCCESS.PLAN_CREATED(1, 5)`).

**Lý do:** Giữ codebase sạch, dễ dàng hỗ trợ đa ngôn ngữ (i18n) trong tương lai, hạn chế nguy cơ gãy logic khi chỉ muốn sửa một chữ lỗi chính tả.
