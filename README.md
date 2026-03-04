# Device Management Backend

## 1. Giới thiệu
Device Management Backend là dịch vụ API đảm nhiệm việc thu thập và cung cấp các chỉ số giám sát hệ thống (System Monitoring) theo thời gian thực. Dự án đóng vai trò là máy chủ nền tảng cung cấp dữ liệu về trạng thái thiết bị (tài nguyên hệ thống) cho giao diện Dashboard (Frontend).

## 2. Tính năng chính
- **Thu thập thông tin hệ thống**: Lấy các thông số thời gian thực từ máy chủ như CPU, bộ nhớ (RAM), ổ cứng (Disk) thông qua thư viện `systeminformation`.
- **Luồng dữ liệu thời gian thực (SSE)**: Cung cấp API cập nhật dữ liệu liên tục cho Client thông qua công nghệ kết nối chuẩn HTTP Server-Sent Events (SSE) tại endpoint `/api/system-metrics`.
- **CORS hỗ trợ linh hoạt**: Cấu hình CORS để cho phép kết nối an toàn từ UI Dashboard ở các domain/port khác.

## 3. Công nghệ sử dụng
- **Ngôn ngữ**: JavaScript (Node.js)
- **Framework**: Express.js
- **Thư viện chính**: `systeminformation`, `cors`

## 4. Hướng dẫn cài đặt và chạy dự án

### Yêu cầu môi trường
- Node.js (phiên bản v18.x hoặc v20.x trở lên)
- npm hoặc yarn

### Các bước cài đặt
1. Mở terminal và di chuyển vào thư mục dự án `device-management-be`.
2. Cài đặt các thư viện phụ thuộc:
   ```bash
   npm install
   ```
3. Khởi chạy server ở chế độ phát triển:
   ```bash
   npm run dev
   # hoặc
   npm start
   ```
   *Mặc định, server sẽ chạy ở port 3001 (hoặc theo cấu hình biến môi trường PORT).*
4. Kiểm tra API SSE hoạt động tại luồng: `http://localhost:3001/api/system-metrics`

## 5. Kiểm thử tự động
*Lưu ý: Các bài kiểm thử tích hợp tự động (E2E) đối với luồng dữ liệu từ Backend được quản lý tập trung ở thư mục `playwright-test`.*

## 6. Triển khai (Deployment lên AWS EC2)
Dự án được cấu hình sẵn Dockerfile để dễ dàng đóng gói và deploy lên máy chủ AWS EC2.

### Bước 1: Build Docker Image
Trên máy chủ EC2 hoặc môi trường local có cài đặt Docker:
```bash
docker build -t device-management-be .
```

### Bước 2: Chạy Docker Container
Chạy lệnh khởi chạy container ở chế độ background (detached) với cổng port 5000:
```bash
docker run -d -p 5000:5000 --name dev-management-api device-management-be
```
Sau đó cấu hình Security Group (Inbound Rules) trên AWS EC2 để mở port `5000` (nếu front-end và back-end ở khác máy, hoặc mở cho localhost nếu dùng network local/NGINX proxy).
