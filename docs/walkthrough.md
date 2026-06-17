# Walkthrough: PRJ226 Refactor (6 Tác Vụ)

## Tổng kết thay đổi

### Tác vụ 1: Dọn dẹp Entrypoint & Sửa lỗi biên dịch
- **Xoá** `index.ts` và `localTest.ts` ở root (nằm ngoài `rootDir: ./src`, gây lỗi `tsc`).
- **Viết lại** [src/index.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/index.ts) thành thin GCP wrapper (5 dòng code), chỉ gọi `router.handleUpdate()`.
- **Sửa** [highlightService.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/services/highlightService.ts): `translateToEnglish` → `translateHighlight`.
- **Viết lại** [router.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/router.ts): map đúng tên hàm (`addTaskFromText`, `rolloverTask`, `rescueTask`, `completeTask`, `getTaskById`, `viewTodayTasks`, `planWeekDraft`, `bulkCreateTasks`).
- **Viết lại** [taskService.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/services/taskService.ts): export đầy đủ các hàm router cần + thêm `PlannedTask` interface.

### Tác vụ 2: Description Callout Block
- **Thêm** trường `description?: string` vào [types.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/notion/types.ts) (`TaskInput` + `GeminiTaskOutput`).
- **Thêm** `description` vào Gemini JSON schema + cập nhật prompt trong [gemini/client.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/gemini/client.ts).
- **Chèn** callout block (💡 `gray_background`) trước checklist `to_do` trong [notion/client.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/notion/client.ts).

### Tác vụ 3: Firestore State Management
- **Cài** `@google-cloud/firestore`.
- **Tạo** [stateManager.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/services/stateManager.ts) với 3 hàm: `saveDraft`, `loadDraft`, `deleteDraft`.
- **Router** gọi stateManager thay vì dùng `Map` trong RAM.

### Tác vụ 4: Bulk Create Fix & Rate Limit Throttle
- `bulkCreateTasks` nhận thêm param `dailyLogId`.
- Thêm `delay(350)` giữa các lần gọi Notion API tuần tự.
- Return `BulkCreateResult { createdCount, taskIds }`.

### Tác vụ 5: Deep Link `notion://`
- Tất cả link Notion đổi sang `notion://notion.so/{cleanId}`.
- Sau khi tạo task: gửi inline keyboard URL button `📂 Mở trong Notion`.
- Sau bulk create: gửi danh sách deep link + tối đa 3 inline URL buttons.

### Tác vụ 6: HTML Parse Mode & Escape
- Chuyển `parse_mode` từ `'Markdown'` sang `'HTML'` trong [telegram/client.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/telegram/client.ts).
- Thêm hàm `escapeMarkdown()` escape `& < >` cho an toàn HTML.
- Router dùng HTML tags (`<b>`, `<code>`, `<a>`) thay Markdown.

## Verification
- `npm run build` → ✅ **PASS** (0 errors)

## Lỗi phát sinh khi build và cách sửa
| Lỗi | File | Nguyên nhân | Cách sửa |
|---|---|---|---|
| `TS2305: no exported member 'Type'` | `gemini/client.ts` | SDK v0.21 export `SchemaType` chứ không phải `Type` | Đổi import + sed replace |
| `TS2322: properties type mismatch` | `notion/client.ts` | `Record<string, unknown>` không gán được cho Notion SDK strict type | Cast `as any` |
| `TS2339: Timestamp not on Firestore` | `stateManager.ts` | `@google-cloud/firestore` không export static `Timestamp` trên class | Dùng `new Date().toISOString()` |
