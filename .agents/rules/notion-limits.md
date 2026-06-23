---
trigger: model_decision
---

# Notion API Limits

## Quy định Rate Limit (HTTP 429)
Notion API có giới hạn tối đa 3 requests per second (rps). Để tránh hệ thống bị sập hoặc trả về lỗi HTTP 429 khi người dùng tạo hàng loạt task (bulk creation), **bắt buộc** phải tuân thủ các quy tắc sau:

1. **Bắt buộc dùng Throttle Delay**:
   Giữa các lần gọi Notion API tuần tự trong vòng lặp, luôn phải gọi hàm `delay(350)` (hoặc tương đương >333ms).
   
2. **Cấm chạy song song vô tội vạ**:
   Nghiêm cấm việc sử dụng `Promise.all()` cho mảng các lời gọi tạo/ghi vào Notion API khi kích thước mảng có thể lớn hơn 3. Luôn ưu tiên vòng lặp `for...of` để kiểm soát tốc độ request.
