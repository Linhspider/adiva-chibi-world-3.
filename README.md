# ADIVA CHIBI WORLD

Game thế giới mở 3D React + Three.js, giữ lại nội dung từ `Liam World 2.tsx`, bổ sung presence đa thiết bị qua Firebase Firestore và giới hạn phòng bằng transaction ở 4 người.

## Chạy local

```bash
npm install
cp .env.example .env.local
# Điền cấu hình Web App Firebase vào .env.local
npm run dev
```

Mở URL Vite trên máy tính; để bạn bè ngoài mạng LAN chơi, hãy deploy lên HTTPS (Vercel/Netlify) sau khi cấu hình Firebase.

## Firebase bắt buộc cho multiplayer Internet

1. Tạo project tại https://console.firebase.google.com.
2. Thêm ứng dụng Web và chép các giá trị cấu hình vào `.env.local` (các biến `VITE_FIREBASE_*`).
3. Authentication → Sign-in method → bật **Anonymous**.
4. Firestore Database → tạo database.
5. Mở tab Rules, dán nội dung `firestore.rules` và Publish.
6. Deploy website; mọi người mở cùng URL, nhập cùng mã phòng.

Không commit `.env.local` hoặc khóa riêng tư lên GitHub. Firebase Web API key là cấu hình client; bảo vệ dữ liệu bằng Firestore Rules, App Check và giới hạn quota.

## Multiplayer

- Mỗi client đăng nhập Firebase Anonymous.
- Mỗi người chơi ghi trạng thái vào document riêng trong `players` mỗi 500 ms.
- Các client subscribe collection để nhận vị trí/nhân vật/vườn của người khác.
- Transaction quản lý roster phòng, tự loại thành viên quá hạn 15 giây và từ chối thành viên thứ 5.
- Người chơi mất heartbeat quá 12 giây sẽ bị ẩn khỏi danh sách trực tuyến.
- `BroadcastChannel` vẫn hỗ trợ đồng bộ nhanh giữa các tab cùng trình duyệt.

## Build

```bash
npm run build
npm run preview
```

## Deploy

Có thể import repository này vào Vercel hoặc Netlify, dùng build command `npm run build`, output directory `dist`, và khai báo đủ biến môi trường `VITE_FIREBASE_*` trong phần Environment Variables.
