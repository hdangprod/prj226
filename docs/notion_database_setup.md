# Hướng dẫn Thiết lập Database Notion cho PRJ226

Để hệ thống bot hoạt động chính xác với mã nguồn hiện tại, bạn cần thiết lập **5 Database** trong Notion với cấu trúc các trường (Properties) chuẩn xác như dưới đây. 

> [!WARNING]
> **Lưu ý quan trọng về Tên trường (Property Name) và Loại (Type)**
> Code API Notion phân biệt chữ hoa chữ thường. Hãy đặt tên các cột **chính xác 100%** như trong hướng dẫn này (ví dụ: `Name`, `Status`, `Estimate`).

---

## 1. Database: `Areas` (Lĩnh vực/Khía cạnh)
Database này quản lý các khía cạnh lớn trong công việc/cuộc sống (VD: Sức khỏe, Công việc, Học tập).

| Tên trường (Property Name) | Loại (Type) | Cài đặt chi tiết / Ghi chú |
| :--- | :--- | :--- |
| **Name** | `Title` (Aa) | Tên của Area (mặc định của Notion) |
| **Projects** | `Relation` | Liên kết (Relation) với database **Projects** (chọn `Dual relation` để hiển thị 2 chiều) |
| **Resources** | `Relation` | Liên kết (Relation) với database **Resources** (chọn `Dual relation`) |

---

## 2. Database: `Projects` (Dự án)
Database quản lý các dự án có thời hạn cụ thể.

| Tên trường (Property Name) | Loại (Type) | Cài đặt chi tiết / Ghi chú |
| :--- | :--- | :--- |
| **Name** | `Title` (Aa) | Tên dự án (VD: PRJ226) |
| **Status** | `Select` | Trạng thái dự án (VD: `Active`, `Completed`, `Paused`) |
| **Area** | `Relation` | Liên kết tự động sinh ra khi bạn cấu hình ở database **Areas** |
| **Tasks** | `Relation` | Liên kết với database **Tasks** (chọn `Dual relation`) |

---

## 3. Database: `Daily Logs` (Sổ tay hàng ngày)
Database lưu trữ tiến độ, highlight và các task trong một ngày.

| Tên trường (Property Name) | Loại (Type) | Cài đặt chi tiết / Ghi chú |
| :--- | :--- | :--- |
| **Name** | `Title` (Aa) | Định dạng ngày `YYYY-MM-DD` (VD: 2026-06-18) |
| **Date** | `Date` | Ngày tháng tương ứng |
| **Highlight** | `Text` (Rich text) | Thành tựu/Ghi chú nổi bật nhất trong ngày (Lệnh `/highlight` sẽ ghi vào đây) |
| **Tasks** | `Relation` | Liên kết tự động sinh ra khi cấu hình ở database **Tasks** |

---

## 4. Database: `Tasks` (Công việc)
Database quan trọng nhất, nơi bot tương tác nhiều nhất.

| Tên trường (Property Name) | Loại (Type) | Cài đặt chi tiết / Ghi chú |
| :--- | :--- | :--- |
| **Name** | `Title` (Aa) | Tên công việc (Có thể chứa tiền tố tự động VD: `PRJ226_T1: Thiết kế UI`) |
| **Status** | `Select` | **Bắt buộc phải có đúng các tag sau (chính tả, viết hoa):**<br>- `Not Started`<br>- `On Hold`<br>- `In Progress`<br>- `Done`<br>- `Archived` |
| **Priority** | `Select` | **Bắt buộc phải có đúng các tag sau:**<br>- `High`<br>- `Medium`<br>- `Low` |
| **Estimate** | `Number` | Chứa con số ước tính thời gian làm việc (đơn vị: Giờ) |
| **Date** | `Date` | Hạn chót (Due date) hoặc Ngày làm việc của Task |
| **Project** | `Relation` | Liên kết tự động sinh ra khi cấu hình ở **Projects** |
| **Daily Log** | `Relation` | Liên kết (Relation) với database **Daily Logs** (chọn `Dual relation`) |

> [!TIP]
> **Trường `Description` ở đâu?**
> Mã nguồn đã được refactor để **không dùng trường (property) Description**. Thay vào đó, ngữ cảnh mô tả của Task sẽ được bot tự động chèn thành một **Callout block (nền xám có icon 💡)** vào thẳng phần thân (page body) của Task đó, ngay bên trên checklist. Vì vậy bạn **không cần tạo cột Description**.

---

## 5. Database: `Resources` (Tài nguyên / Bookmark)
Nơi lưu trữ các đường link, tài liệu tham khảo.

| Tên trường (Property Name) | Loại (Type) | Cài đặt chi tiết / Ghi chú |
| :--- | :--- | :--- |
| **Name** | `Title` (Aa) | Tên hoặc tiêu đề của tài liệu |
| **URL** | `URL` | Đường dẫn trang web |
| **Area** | `Relation` | Liên kết tự động sinh ra khi cấu hình ở database **Areas** |

---

## Bước tiếp theo (Cập nhật `.env`)

Sau khi thiết lập xong 5 Database này trong Notion, bạn cần lấy **Database ID** (đoạn mã 32 ký tự trên URL của mỗi database) và dán vào file `.env`. 

Hiện tại file `.env` của bạn đang bị sai tên biến so với cấu hình code. Bạn cần sửa lại cho đúng như sau:

```env
TELEGRAM_BOT_TOKEN=
NOTION_API_KEY=      <-- Sửa NOTION_TOKEN thành NOTION_API_KEY
NOTION_AREAS_DB_ID=
NOTION_PROJECTS_DB_ID=
NOTION_DAILY_LOGS_DB_ID=
NOTION_TASKS_DB_ID=
NOTION_RESOURCES_DB_ID=
GEMINI_API_KEY=
```
