# Troubleshooting & Lessons Learned

Tài liệu này ghi lại các lỗi phổ biến và bài học kinh nghiệm trong quá trình phát triển Telegram-Notion Bot, giúp tránh lặp lại các sai lầm trong tương lai.

## 1. Lỗi Notion API: Mismatched Property Type trong Filter
**Triệu chứng:**
`❌ Something went wrong: The property type in the database does not match the property type of the filter provided: database property select does not match filter status`

**Nguyên nhân:**
Khi thực hiện truy vấn (`notion.databases.query`), bạn sử dụng sai kiểu thuộc tính so với thiết lập thực tế trên Notion. Ví dụ: Cột `Status` trên Notion được cấu hình là loại **Select**, nhưng trong code API bạn lại truyền filter theo cấu trúc của loại **Status**:
```typescript
// LỖI:
filter: { property: 'Status', status: { equals: 'Active' } }
```

**Cách khắc phục:**
Luôn đối chiếu kiểu dữ liệu (Property Type) của cột trên Notion trước khi viết filter.
```typescript
// ĐÚNG:
filter: { property: 'Status', select: { equals: 'Active' } }
```

## 2. Lỗi Telegram API: Unsupported URL protocol cho Inline Button
**Triệu chứng:**
`❌ [Telegram] editMessageText failed: {"ok":false,"error_code":400,"description":"Bad Request: inline keyboard button URL 'notion://...' is invalid: Unsupported URL protocol"}`

**Nguyên nhân:**
Telegram API không hỗ trợ các custom URL schemes (như `notion://`, `app://`) cho thuộc tính `url` của `InlineKeyboardButton`. Bất kỳ link nào không phải là `http://`, `https://` hoặc `tg://` đều sẽ bị Telegram từ chối và quăng lỗi 400 Bad Request, khiến toàn bộ tin nhắn không thể gửi hoặc cập nhật.

**Cách khắc phục:**
Luôn sử dụng `https://` cho các deeplink. Khi mở trên trình duyệt điện thoại, hệ điều hành sẽ tự động nhận diện và chuyển hướng vào ứng dụng Notion.
```typescript
// ĐÚNG:
return `https://notion.so/${pageId}`;
```

## 3. Lỗi "Lặng Im": Bắt lỗi Telegram API
**Triệu chứng:**
Bot nhận lệnh, xử lý xong logic (Notion có thay đổi) nhưng không gửi bất kỳ phản hồi nào lại cho người dùng, cũng không báo lỗi.

**Nguyên nhân:**
Trong các hàm fetch API của Telegram (`sendMessage`, `editMessageText`), nếu response trả về `ok: false`, code trước đó chỉ dùng `console.error` để log ra console thay vì ném ra Exception (throw Error). Điều này làm các block `try...catch` ở tầng Router không thể bắt được lỗi để báo về cho người dùng, dẫn đến hiện tượng "im lặng" khi có lỗi.

**Cách khắc phục:**
Mọi hàm wrapper gọi external API phải luôn throw error nếu response bị fail.
```typescript
if (!response.ok) {
  throw new Error(`[Telegram] API failed: ${JSON.stringify(body)}`);
}
```

## 4. Quản lý State: Gõ chữ thay vì bấm nút Inline
**Triệu chứng:**
Người dùng không bấm vào nút Inline (như [Workplace], [Finance]) mà gõ trực tiếp nội dung nút thành text và gửi. Bot không phản hồi.

**Nguyên nhân:**
Luồng state của bot chỉ chặn bắt Callback Query (khi bấm nút) nhưng lại bỏ qua Text Message trong state đó.

**Cách khắc phục:**
Khi người dùng đang ở một trạng thái chờ chọn nút (ví dụ `AWAITING_AREA_SELECTION`), cần bổ sung logic xử lý Text Message để nhận dạng text gõ vào có khớp với tên của nút nào hay không, nhằm tăng trải nghiệm người dùng (UX).

## 5. Cache Code của NodeJS (NPM Run Start)
**Triệu chứng:**
Đã sửa code, đã chạy `npm run build` thành công, nhưng bot vẫn bị lỗi cũ.

**Nguyên nhân:**
NodeJS load code vào bộ nhớ RAM khi chạy. Bất kỳ thay đổi nào trên file đã biên dịch (`dist/`) sẽ không có tác dụng nếu tiến trình (process) chưa được khởi động lại.

**Cách khắc phục:**
Luôn nhớ tắt bot (`Ctrl + C`) và chạy lại lệnh khởi động (`npm run start` hoặc `npm run dev`) sau khi cập nhật code.

