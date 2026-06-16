# Hướng dẫn sử dụng — Telegram Notion Second Brain Bot

Tài liệu này hướng dẫn chi tiết cách cài đặt và sử dụng bot để quản lý hệ thống Second Brain trên Notion (theo phương pháp PARA) thông qua Telegram.

> 🇬🇧 English version: [usage.en.md](usage.en.md)

## Mục lục
1. [Tổng quan](#tổng-quan)
2. [Cài đặt lần đầu](#cài-đặt-lần-đầu)
3. [Cấu hình biến môi trường](#cấu-hình-biến-môi-trường)
4. [Danh sách lệnh](#danh-sách-lệnh)
5. [Hướng dẫn từng lệnh](#hướng-dẫn-từng-lệnh)
6. [Multi-Model Routing](#multi-model-routing)
7. [Câu hỏi thường gặp](#câu-hỏi-thường-gặp)

---

## Tổng quan

Bot là một trợ lý năng suất hội thoại chạy serverless (GCP Functions). Bạn nhắn tin với bot trên Telegram, bot dùng Gemini để hiểu ngôn ngữ tự nhiên và thao tác trực tiếp trên 5 database Notion:

| Database | Vai trò |
|----------|---------|
| **Tasks** | Các đầu việc hàng ngày, có checklist, priority, estimate |
| **Projects** | Dự án; task được link về project tương ứng |
| **Areas** | Các lĩnh vực trách nhiệm dài hạn |
| **Resources** | Tài liệu, tham khảo |
| **Daily Logs** | Nhật ký theo ngày (`YYYY-MM-DD`), chứa highlight |

> **Nguyên tắc an toàn**: Bot **không bao giờ xóa** dữ liệu Notion. Task hoàn thành được chuyển trạng thái `Done` hoặc clone thành task rollover.

---

## Cài đặt lần đầu

### 1. Chuẩn bị tài khoản & token
- **Telegram Bot Token**: tạo bot qua [@BotFather](https://t.me/BotFather) → lấy token.
- **Notion Integration**: tạo integration tại https://www.notion.so/my-integrations → lấy `NOTION_API_KEY`. Sau đó **share** từng database cho integration này.
- **Notion Database IDs**: mở từng database trên web, copy ID từ URL (chuỗi 32 ký tự trước dấu `?`).
- **Gemini API Key**: lấy tại https://aistudio.google.com/app/apikey.

### 2. Cài đặt & chạy local
```bash
cp .env.example .env
# điền đầy đủ các giá trị trong .env
npm install
npm run build
npm run start   # chạy Functions Framework local
```

### 3. Thiết lập webhook Telegram
Sau khi deploy (hoặc dùng ngrok cho local), đăng ký webhook:
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<YOUR_FUNCTION_URL>"
```

### 4. (Tùy chọn) Lập lịch báo cáo tuần
Tạo GCP Cloud Scheduler job với lịch `0 20 * * 0` (20h Chủ nhật) POST tới URL Cloud Function để tự động chạy `/weekly_report`.

---

## Cấu hình biến môi trường

Các biến **bắt buộc** (xem `.env.example`):

```
TELEGRAM_BOT_TOKEN=
NOTION_API_KEY=
NOTION_TASKS_DB_ID=
NOTION_PROJECTS_DB_ID=
NOTION_AREAS_DB_ID=
NOTION_RESOURCES_DB_ID=
NOTION_DAILY_LOGS_DB_ID=
GEMINI_API_KEY=
```

Các biến **tùy chọn** (ghi đè model Gemini mà không cần sửa code):

```
GEMINI_MODEL_LITE=gemini-1.5-flash   # tier nhẹ, tối ưu chi phí (mặc định)
GEMINI_MODEL_PRO=gemini-1.5-pro      # tier mạnh, tối ưu logic (mặc định)
```

> Nếu không set 2 biến model, bot dùng giá trị mặc định ở trên. Tên model thay đổi theo thời gian, nên chỉ cần cập nhật env khi muốn đổi model.

---

## Danh sách lệnh

| Lệnh | Chức năng | Tier |
|------|----------|------|
| `/add_task <mô tả>` | Tạo 1 task từ ngôn ngữ tự nhiên | LITE |
| `/view_task` | Xem task hôm nay + tỉ lệ hoàn thành theo project | — |
| `/rescue` | Gợi ý 1 task High priority, ≤ 30 phút | LITE |
| `/highlight <nội dung>` | Cập nhật highlight Daily Log (tự dịch sang tiếng Anh) | LITE |
| `/plan_week <mô tả>` | Lập kế hoạch tuần, tạo **hàng loạt** task | PRO |
| `/weekly_report` | Báo cáo retrospective tuần | PRO |

---

## Hướng dẫn từng lệnh

### `/add_task` — Tạo một task
Mô tả task bằng câu tự nhiên. Bot bóc tách tên, project, priority, estimate và tự sinh checklist.

**Ví dụ:**
```
/add_task Nghiên cứu đối thủ cạnh tranh cho dự án PRJ226, độ ưu tiên High, dự tính 2h
```
Kết quả: tạo page trong Tasks DB, tên có prefix tăng dần (ví dụ `PRJ226_T3: ...`), kèm các checklist `to_do` chưa tích.

### `/view_task` — Xem task hôm nay
Hiển thị tất cả task có ngày là hôm nay, kèm tỉ lệ hoàn thành của project (`Done / Tổng`). Mỗi task có nút:
- `[✅ Complete]` → đánh dấu `Done`, nút biến mất.
- `[⏳ Defer]` → chuyển sang logic **rollover** (xem dưới).

### Rollover (Defer)
Khi nhấn `[⏳ Defer]` hoặc nhắn kiểu "Chưa xong hôm nay, mới được một nửa":
1. Kiểm đếm checklist đã tích / chưa tích.
2. Tính **earned value**, giảm estimate của task gốc theo phần đã làm.
3. Đánh dấu task gốc `Done`.
4. Tạo task mới cho ngày mai tên `[Rollover] <Tên gốc>`, giữ quan hệ project, chuyển phần checklist **chưa xong** sang.

### `/rescue` — Gỡ rối tập trung
Khi bị "tê liệt lựa chọn", gửi `/rescue`. Bot trả về **đúng 1 task** High priority có estimate ≤ 30 phút để bạn làm ngay.

### `/highlight` — Ghi dấu ấn trong ngày
```
/highlight Đạt được cột mốc quan trọng trong việc tối ưu cơ sở dữ liệu
```
Bot tự dịch sang tiếng Anh và cập nhật thuộc tính Highlight của Daily Log hôm nay (tự tạo Daily Log nếu chưa có).

### `/plan_week` — Lập kế hoạch tuần & tạo hàng loạt task
Đây là tính năng mạnh nhất: mô tả cả tuần bằng một đoạn văn, hoặc dán lại transcript trao đổi với Gemini, bot sẽ tự bóc tách thành nhiều task.

**Ví dụ:**
```
/plan_week Trong tuần tới tôi làm về dự án phát triển sản phẩm học tiếng Anh,
các đầu việc gồm: lên kế hoạch nghiên cứu người dùng, tạo customer journey map,
làm competitive analysis, viết báo cáo đề xuất tính năng.
```

**Quy trình:**
1. Bot dùng **PRO tier** để phân rã thành nhiều task, suy ra project / priority / estimate / checklist.
2. Tìm project khớp gần đúng trong Projects DB (fuzzy match) và áp prefix tăng dần `<Project>_T<n>`.
3. Bot gửi **bản nháp** liệt kê toàn bộ task dự kiến kèm 3 nút:
   - `[✅ Tạo tất cả]` → ghi hàng loạt vào Notion.
   - `[✏️ Sửa]` → hủy bản nháp, bạn gửi lại `/plan_week` với nội dung đã chỉnh.
   - `[❌ Hủy]` → bỏ toàn bộ, không ghi gì.
4. Khi xác nhận, bot tạo task **tuần tự** (giữ prefix đúng + tránh rate limit) và báo số task đã tạo.

**Ví dụ bản nháp bot trả về:**
```
🗓 Weekly Plan Preview (4 tasks)

1. English App_T1: Lên kế hoạch nghiên cứu người dùng
   Priority: High | Est: 3h | Due: 2026-06-17
   • Xác định mục tiêu nghiên cứu
   • Soạn bộ câu hỏi phỏng vấn
   • Tuyển 5 người dùng mục tiêu

2. English App_T2: Tạo customer journey map
   Priority: Medium | Est: 2h | Due: 2026-06-18
   • Liệt kê các giai đoạn sử dụng
   • Đánh dấu pain point từng bước

3. English App_T3: Làm competitive analysis
   Priority: Medium | Est: 4h | Due: 2026-06-19
   • Chọn top 3 đối thủ
   • Lập bảng so sánh tính năng

4. English App_T4: Viết báo cáo đề xuất tính năng
   Priority: Low | Est: 2h | Due: 2026-06-20
   • Tổng hợp insight
   • Đề xuất 3 tính năng ưu tiên

[✅ Tạo tất cả]  [✏️ Sửa]  [❌ Hủy]
```
Sau khi nhấn `[✅ Tạo tất cả]`:
```
✅ Created 4/4 tasks in Notion.
```

> **Lưu ý**: Nếu một task không tìm được project khớp, bot vẫn tạo nhưng để chưa link (có cảnh báo ⚠️ trong bản nháp).
>
> **Idempotent**: Mỗi bản nháp có một draft ID; nhấn nút nhiều lần cũng không tạo trùng. Nếu bản nháp "expired" (do server khởi động lại), chỉ cần gửi lại `/plan_week`.

### `/weekly_report` — Retrospective tuần
Tính các chỉ số cứng: **Slippage Rate**, **Velocity Score**, phân loại **Discovery vs Delivery**. Các chỉ số được gửi sang **PRO tier** (persona Mentor Liam) để phân tích bottleneck và đưa lời khuyên Product Management, trả về một tin nhắn retro tổng hợp.

---

## Multi-Model Routing

Bot dùng 2 tier model để cân bằng chi phí và chất lượng:

- **LITE tier** (`MODELS.LITE`): tác vụ tần suất cao, có cấu trúc, xác định — parse lệnh, dịch, lọc rescue.
- **PRO tier** (`MODELS.PRO`): tác vụ tần suất thấp, suy luận phức tạp — lập kế hoạch hàng loạt (`/plan_week`) và retrospective (`/weekly_report`).

Cả hai đều env-driven, ghi đè qua `GEMINI_MODEL_LITE` / `GEMINI_MODEL_PRO`.

---

## Câu hỏi thường gặp

**Bot không phản hồi?**
Kiểm tra webhook đã đăng ký đúng URL (`getWebhookInfo`), và Cloud Function trả HTTP 200 trong < 2000ms.

**Task tạo ra không có prefix?**
Prefix chỉ sinh khi task gắn với một project. Nếu mô tả không nhắc tới project, task sẽ không có prefix.

**`/plan_week` báo "expired"?**
Bản nháp lưu in-memory; nếu server cold start giữa lúc xem preview và lúc confirm thì bản nháp mất. Chỉ cần gửi lại lệnh.

**Đổi model Gemini?**
Set `GEMINI_MODEL_LITE` / `GEMINI_MODEL_PRO` trong env rồi deploy lại — không cần sửa code.

**Dữ liệu có bị xóa không?**
Không. Bot chỉ chuyển trạng thái hoặc clone, không bao giờ xóa page Notion.
