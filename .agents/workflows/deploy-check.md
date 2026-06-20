# Deploy Check Workflow

Trước khi thực hiện deploy code lên GCP Cloud Run, hệ thống yêu cầu rà soát bắt buộc 3 bước sau để đảm bảo an toàn vận hành:

1. **Kiểm tra Môi trường (validateEnv)**:
   Môi trường đám mây phải được cung cấp đầy đủ các biến môi trường thông qua cờ `--set-env-vars` (hoặc Secret Manager). Việc thiếu biến môi trường sẽ khiến hàm `validateEnv()` crash và sập container (lỗi PORT 8080 Timeout).

2. **Kiểm tra Biên dịch (TypeScript Build)**:
   Bắt buộc chạy lệnh `npm run build` ở local. Nếu có bất kỳ lỗi cú pháp nào (ví dụ: gãy import path), tuyệt đối không được deploy.

3. **Cấp quyền IAM (Firestore)**:
   Do dự án sử dụng Firestore (Native Mode) làm State Buffer, bạn phải cấp quyền **Firebase Firestore Admin** (hoặc Cloud Datastore User) cho tài khoản Service Account mặc định (ví dụ: đuôi `@appspot.gserviceaccount.com`) trong tab Security của Cloud Run -> IAM & Admin. Thiếu bước này sẽ gây lỗi `7 PERMISSION_DENIED`.
