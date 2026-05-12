# 👥 Collaborative Editing System (CES)

Hệ thống soạn thảo văn bản cộng tác thời gian thực với đồng bộ CRDT và Socket.IO.

`REALTIME` `SOCKET.IO` `YJS CRDT` `POSTGRESQL` `JWT AUTH`

---


- 🏗️ **Thiết kế hệ thống:** Phân tích yêu cầu, xây dựng kiến trúc Client-Server và luồng xử lý realtime

- 🔄 **Triển khai đồng bộ dữ liệu:** Tích hợp Yjs CRDT và Socket.IO để hỗ trợ chỉnh sửa tài liệu đồng thời theo thời gian thực

- 🔐 **Xây dựng Authentication & Security:** Triển khai JWT Authentication, bcrypt hashing và Rate Limiting chống brute-force

- 💾 **Quản lý lưu trữ dữ liệu:** Thiết kế schema PostgreSQL, cơ chế snapshot và khôi phục trạng thái tài liệu

- 👥 **Phát triển tính năng cộng tác:** Xây dựng hệ thống bạn bè, presence online và realtime document invitation

- 📄 **Tài liệu & vận hành:** Viết runbook triển khai, hướng dẫn cấu hình và xử lý sự cố hệ thống

# 🚀 Runbook - Hướng dẫn Triển khai & Vận hành Hệ thống Soạn thảo Cộng tác (CES)

Runbook này cung cấp hướng dẫn toàn diện để khởi tạo, cấu hình, vận hành và xử lý sự cố cho dự án **CES (Collaborative Editing System)**.

---

# 📌 Tổng quan hệ thống

## 🔐 Kiến trúc tổng thể

Hệ thống hoạt động theo mô hình **Client - Server thời gian thực**.

| Thành phần | Công nghệ |
|---|---|
| Frontend | Vanilla JS, Bootstrap 5, Quill Editor, Yjs (CRDT) |
| Backend | Node.js, Express, Socket.IO, JWT Authentication |
| Database | PostgreSQL |
| Đồng bộ realtime | Yjs in-memory + Socket.IO |

---

## 💡 Điểm mấu chốt

- Backend mặc định chạy tại:

```txt
http://localhost:5000
```

- Frontend sẽ gọi:
  - REST API
  - Socket.IO

  trực tiếp đến backend.

- Database phải được khởi tạo schema đầy đủ trước khi chạy server.

---

# 📚 Mục lục

1. [Yêu cầu hệ thống](#1-yeu-cau-he-thong)
2. [Khởi động Database PostgreSQL](#2-khoi-dong-database-postgresql)
3. [Cấu hình & khởi động Backend](#3-cau-hinh--khoi-dong-backend)
4. [Khởi động Frontend](#4-khoi-dong-frontend)
5. [Phân tích luồng hoạt động cốt lõi](#5-phan-tich-luong-hoat-dong-cot-loi)
6. [Troubleshooting](#6-troubleshooting)

---

# 1. Yêu cầu hệ thống

## 📦 Phần mềm cần thiết

- Docker
- Docker Compose
- Node.js 18+
- npm

---

## ✅ Kiểm tra môi trường

```bash
docker --version
docker-compose --version
node --version
npm --version
```

---

# 2. Khởi động Database PostgreSQL

Hệ thống sử dụng PostgreSQL làm cơ sở dữ liệu chính.

> Redis có trong docker-compose nhưng hiện tại backend chưa sử dụng.

---

## 2.1. Khởi động PostgreSQL bằng Docker Compose

Tại thư mục gốc project:

```bash
docker-compose up -d postgres
```

---

## 2.2. Khởi tạo Schema Database

⚠️ Quan trọng:

`db.js` chỉ tự tạo bảng `friendships`.

Bạn bắt buộc phải chạy script SQL dưới đây vào database:

```txt
collaborative_editor
```

Có thể sử dụng:

- DBeaver
- pgAdmin
- psql
- hoặc truy cập trực tiếp container PostgreSQL

---

## 📄 Script SQL khởi tạo

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100) NOT NULL,
    owner_id UUID REFERENCES users(id),
    invite_code VARCHAR(10) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE document_collaborators (
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, user_id)
);

CREATE TABLE document_snapshots (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    content BYTEA,
    saved_at TIMESTAMP DEFAULT NOW()
);
```

---

# 3. Cấu hình & Khởi động Backend

---

## 3.1. Cài đặt Dependencies

```bash
cd backend

npm install express cors socket.io bcrypt jsonwebtoken express-rate-limit yjs pg dotenv
```

---

## 3.2. Tạo file `.env`

Tạo file:

```txt
backend/.env
```

Nội dung:

```env
PORT=5000

DATABASE_URL=postgres://ces_user:ces_pass@localhost:5432/collaborative_editor

JWT_SECRET=super_secret_jwt_key_ces_2026
```

---

## 3.3. Khởi động Backend

```bash
node server.js
```

---

## ✅ Kết quả mong đợi

Terminal backend hiển thị:

```txt
Đã kết nối thành công tới PostgreSQL!
Schema friendships sẵn sàng
Backend Server đang chạy tại http://localhost:5000
```

---

# 4. Khởi động Frontend

⚠️ Frontend sử dụng ES Modules.

Không thể mở trực tiếp:

```txt
file://index.html
```

Bắt buộc phải chạy thông qua HTTP Server.

---

## Cách 1 — Dùng `npx serve`

```bash
cd frontend

npx serve .
```

---

## Cách 2 — VS Code Live Server

- Mở thư mục `frontend`
- Chuột phải `index.html`
- Chọn:

```txt
Open with Live Server
```

---

# ▶️ Sử dụng hệ thống

## Bước 1 — Truy cập Frontend

```txt
http://localhost:3000
```

---

## Bước 2 — Đăng ký tài khoản

Tạo một tài khoản mới tại màn hình Login.

---

## Bước 3 — Tạo tài liệu

- Tạo document mới
- Hệ thống sẽ sinh:
  - Document ID
  - Invite Code

---

## Bước 4 — Test realtime collaboration

- Mở tab ẩn danh
- Đăng nhập bằng tài khoản khác
- Nhập Invite Code
- Thử gõ chung realtime

---

# 5. Phân tích Luồng hoạt động Cốt lõi

---

# 5.1. Authentication & Security

## 🔒 Băm mật khẩu

Sử dụng:

```txt
bcrypt
```

với:

```txt
12 salt rounds
```

tại route:

```txt
/auth/register
```

---

## 🚫 Rate Limiting

Sử dụng:

```txt
express-rate-limit
```

### Quy tắc:

| Endpoint | Giới hạn |
|---|---|
| `/auth/login` | 10 requests / 15 phút |
| `/auth/register` | 5 requests / 60 phút |

---

## 🔑 JWT Authentication

### Backend trả về:

```txt
JWT Token
```

thời hạn:

```txt
7 ngày
```

---

## 📦 Client lưu token

Client lưu tại:

```txt
localStorage
```

---

## 📡 REST API Authentication

Mọi request gửi kèm:

```http
Authorization: Bearer <token>
```

---

## 🔌 Socket.IO Authentication

Socket xác thực thông qua:

```js
socket.handshake.auth.token
```

---

# 5.2. Đồng bộ Realtime (Yjs + Socket.IO)

---

## 🧠 Khởi tạo phía Client

Client sử dụng:

- Yjs
- QuillBinding

để đồng bộ editor.

---

## 🔄 Luồng đồng bộ state

### Khi editor thay đổi:

Client emit:

```txt
yjs-update
```

kèm:

```txt
Uint8Array state update
```

---

### Backend xử lý

Server sẽ:

1. Nhận update
2. Broadcast đến:
   ```txt
   doc-{docId}
   ```
3. Apply update vào:
   ```txt
   Y.Doc in-memory
   ```

---

## 💾 Cơ chế Snapshot Database

Để tránh spam PostgreSQL:

Server sử dụng:

```txt
Debounce (2 giây)
```

---

### Quy trình:

- Nếu document ngừng thay đổi 2 giây
- Server serialize toàn bộ Y.Doc
- Chuyển thành:
  ```txt
  BYTEA
  ```
- Lưu vào bảng:
  ```txt
  document_snapshots
  ```

---

## 🔁 Khôi phục dữ liệu

Khi server restart:

- Snapshot được load lại từ PostgreSQL
- Restore vào Y.Doc memory

---

# 5.3. Hệ thống Bạn bè & Presence

---

## 👥 Tracking Online

Server dùng:

```js
onlineSocketMap
```

để lưu:

```txt
userId -> socket.id
```

---

## 📡 Presence Notification

Khi user:

- connect
- disconnect

server sẽ gọi:

```txt
notifyFriendsPresence()
```

---

### Chức năng:

- Query bảng `friendships`
- Emit:
  ```txt
  friend:presence
  ```
- Gửi realtime đến bạn bè liên quan

---

## 📄 Invite vào Document

Điều kiện kiểm tra:

- Hai người phải là bạn bè
- Người nhận chưa có quyền document
- Người gửi phải có quyền document

Sau đó backend emit:

```txt
doc:invite-received
```

---

# 6. Troubleshooting

---

# 6.1. Lỗi "Không thể kết nối đến server!"

## ❌ Nguyên nhân

- Backend chưa chạy
- Sai port backend

---

## ✅ Cách khắc phục

### Kiểm tra terminal backend

```bash
node server.js
```

---

### Kiểm tra API_BASE

Đảm bảo:

```js
API_BASE = "http://localhost:5000"
```

trong:

- `app.js`
- `login.js`

---

# 6.2. Lỗi PostgreSQL Connection

## ❌ Nguyên nhân

- PostgreSQL container chưa chạy
- Sai credentials trong `.env`

---

## ✅ Cách khắc phục

### Kiểm tra container

```bash
docker ps
```

---

### Kiểm tra DATABASE_URL

```env
DATABASE_URL=postgres://ces_user:ces_pass@localhost:5432/collaborative_editor
```

---

# 6.3. Mất dữ liệu editor sau F5 / Restart

## ❌ Nguyên nhân

Chưa tạo bảng:

```txt
document_snapshots
```

nên Yjs không có nơi lưu snapshot.

---

## ✅ Cách khắc phục

Chạy lại toàn bộ SQL schema tại:

```txt
Bước 2.2
```

---

# 6.4. Lỗi "ID tài liệu không hợp lệ"

## ❌ Nguyên nhân

Hệ thống validate UUID bằng regex:

```regex
^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
```

Nếu URL sai format sẽ bị chặn.

---

## ✅ Cách khắc phục

- Tạo tài liệu mới
- Hoặc truy cập document từ Sidebar

---

# 6.5. Lỗi Module Not Found (Yjs / Quill)

## ❌ Nguyên nhân

Mở trực tiếp:

```txt
index.html
```

làm browser chặn ESM modules từ CDN.

---

## ✅ Cách khắc phục

Bắt buộc chạy frontend bằng local HTTP server:

```bash
npx serve .
```

hoặc:

```txt
VS Code Live Server
```

---

# ✅ Kết luận

Sau khi hoàn thành các bước:

- PostgreSQL hoạt động
- Backend chạy ổn định
- Frontend kết nối thành công
- Yjs đồng bộ realtime
- Snapshot lưu trữ đúng
- Authentication & Presence hoạt động đầy đủ

Hệ thống CES sẽ sẵn sàng để phát triển và triển khai tiếp tục.

---