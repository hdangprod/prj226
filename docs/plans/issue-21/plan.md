# Add Execution Time Frame and Obsidian Link to /view_task (#21)

Người dùng yêu cầu bổ sung thông tin hiển thị khi chạy lệnh `/view_task` trên Telegram:
1. Hiển thị khung thời gian thực hiện (nếu có dữ liệu thời gian cụ thể trong thuộc tính `Date` của Obsidian).
2. Chèn link dẫn trực tiếp đến trang Task trên Obsidian để bấm vào xem nhanh.

## Proposed Changes

### Cập nhật Logic ở `src/router.ts` (Lệnh `/view_task`)
- **Hiển thị thời gian:** Parse thuộc tính `t.dueDate` (định dạng ISO 8601). Nếu chuỗi này có chứa ký tự `T` (tức là có thông tin giờ), hệ thống sẽ dùng `Date` của JavaScript để format ra chuỗi thân thiện với người dùng (ví dụ: `🕒 9:30 PM | `).
- **Thêm Hyperlink:** Tiêu đề của task (VD: `PRJ226_T1: ...`) sẽ được bọc trong thẻ HTML `<a>` sử dụng `parse_mode='HTML'` của Telegram API. Link đích được tạo ra từ hàm `obsidianDeepLink(t.id)` đã có sẵn.

**Ví dụ hiển thị mới:**
```
[PRJ226_T2: Research GLM 5.2](https://obsidian.so/...)
🕒 9:30 PM | Priority: Medium | Est: 3h (Tiến độ: 0%)
```

## User Review Required
Không có cảnh báo rủi ro nào. Đây là chỉnh sửa UI nhỏ, an toàn.

## Verification Plan
- Chạy lệnh `/view_task` với task có ngày giờ cụ thể -> Kiểm tra hiển thị `🕒 hh:mm AM/PM`.
- Chạy lệnh `/view_task` với task chỉ có ngày (không có giờ) -> Không hiển thị icon đồng hồ, chỉ hiển thị Priority như cũ.
- Click vào tên task trên điện thoại/máy tính -> Trình duyệt mở ra đúng Obsidian page.
- Biên dịch code (npm run build).
