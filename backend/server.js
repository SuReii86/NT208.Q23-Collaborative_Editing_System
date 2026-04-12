const express = require('express');
const cors = require('cors');
const pool = require('./db'); // Gọi file kết nối Database bạn vừa tạo

const app = express();

// Middleware
app.use(cors()); // Cho phép Frontend gọi API mà không bị chặn lỗi CORS
app.use(express.json()); // Giúp server đọc được dữ liệu JSON gửi lên

// ==========================================
// CÁC ROUTES API QUẢN LÝ TÀI LIỆU
// ==========================================

// 1. Lấy danh sách tài liệu
app.get('/api/documents', async (req, res) => {
    // Tương lai: Lệnh SQL SELECT * FROM documents...
    res.json({ message: "Sẽ trả về danh sách tài liệu của user" });
});

// 2. Tạo tài liệu mới
app.post('/api/documents', async (req, res) => {
    // Tương lai: Lệnh SQL INSERT INTO documents...
    res.json({ message: "Sẽ tạo một tài liệu mới trong Database" });
});

// 3. Lấy nội dung 1 tài liệu cụ thể
app.get('/api/documents/:id', async (req, res) => {
    const docId = req.params.id;
    res.json({ message: `Sẽ trả về snapshot của tài liệu có ID: ${docId}` });
});

// 4. Cập nhật tiêu đề tài liệu
app.put('/api/documents/:id', async (req, res) => {
    const docId = req.params.id;
    res.json({ message: `Sẽ đổi tên tài liệu có ID: ${docId}` });
});

// 5. Xóa tài liệu
app.delete('/api/documents/:id', async (req, res) => { // Dùng delete thay vì del cho chuẩn Express
    const docId = req.params.id;
    res.json({ message: `Sẽ xóa tài liệu có ID: ${docId}` });
});

// ==========================================
// KHỞI ĐỘNG SERVER
// ==========================================
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Backend Server đang chạy tại http://localhost:${PORT}`);
});
