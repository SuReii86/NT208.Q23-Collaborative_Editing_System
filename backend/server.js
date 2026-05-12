const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const Y = require('yjs');


// YJS DOCUMENTS IN MEMORY
const docs = new Map();

function getYDoc(docId) {
    if (!docs.has(docId)) {
        docs.set(docId, new Y.Doc());
    }
    return docs.get(docId);
}

const pool = require('./db');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const crypto = require('crypto');
const e = require('express');
const { error } = require('console');
const generateInviteCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(str) {
    return UUID_REGEX.test(str);
}

app.use(cors());
app.use(express.json());


// PRESENCE: userId → socketId (in-memory)
// Dùng để push real-time notification kết bạn
const onlineSocketMap = new Map(); // userId (UUID string) → socket.id


// MIDDLEWARE XÁC THỰC
function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Bạn chưa đăng nhập' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Mã xác thực không hợp lệ' });
    }
}


// RATE LIMITING
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Quá nhiều tài khoản được tạo. Vui lòng thử lại sau.' }
});

const friendLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Quá nhiều yêu cầu. Vui lòng chờ một chút.' }
});


// ROUTES XÁC THỰC (AUTH)
app.post('/auth/register', registerLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password || password.length < 6) {
            return res.status(400).json({ error: 'Email và mật khẩu (tối thiểu 6 ký tự) là bắt buộc' });
        }
        const hash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
            [email, hash]
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Email này đã được sử dụng' });
        }
        res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại' });
    }
});

app.post('/auth/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
        }
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        const user = result.rows[0];
        if (user && await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
            res.json({ token });
        } else {
            res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại' });
    }
});


// ROUTES QUẢN LÝ TÀI LIỆU (giữ nguyên)
app.get('/api/documents', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT DISTINCT d.id, d.title, d.invite_code, d.created_at, d.owner_id
             FROM documents d
             LEFT JOIN document_collaborators dc ON d.id = dc.document_id
             WHERE d.owner_id = $1 OR dc.user_id = $1
             ORDER BY d.created_at DESC`,
            [req.user.userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/documents', requireAuth, async (req, res) => {
    try {
        const inviteCode = generateInviteCode();
        const title = (req.body.title || 'Tài liệu mới').trim().slice(0, 100);
        const result = await pool.query(
            "INSERT INTO documents (title, owner_id, invite_code) VALUES ($1, $2, $3) RETURNING *",
            [title, req.user.userId, inviteCode]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/documents/join', requireAuth, async (req, res) => {
    try {
        const { inviteCode } = req.body;
        if (!inviteCode) return res.status(400).json({ error: 'Vui lòng nhập mã mời' });
        const result = await pool.query(
            'SELECT id, title, invite_code, owner_id FROM documents WHERE invite_code = $1',
            [inviteCode.trim().toUpperCase()]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Mã mời không hợp lệ' });
        const doc = result.rows[0];
        if (doc.owner_id !== req.user.userId) {
            await pool.query(
                'INSERT INTO document_collaborators (document_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [doc.id, req.user.userId]
            );
        }
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

app.patch('/api/documents/:id/rename', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        if (!isValidUUID(id)) return res.status(400).json({ error: 'ID tài liệu không hợp lệ' });
        if (!title || !title.trim()) return res.status(400).json({ error: 'Tên tài liệu không được để trống' });
        const result = await pool.query(
            'UPDATE documents SET title = $1 WHERE id = $2 AND owner_id = $3 RETURNING id, title',
            [title.trim().slice(0, 100), id, req.user.userId]
        );
        if (result.rows.length === 0) return res.status(403).json({ error: 'Không tìm thấy hoặc bạn không có quyền đổi tên' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/documents/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidUUID(id)) return res.status(400).json({ error: 'ID tài liệu không hợp lệ' });
        const result = await pool.query(
            'SELECT id, title, invite_code, created_at FROM documents WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/documents/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidUUID(id)) return res.status(400).json({ error: 'ID tài liệu không hợp lệ' });
        const result = await pool.query(
            'DELETE FROM documents WHERE id = $1 AND owner_id = $2 RETURNING id',
            [id, req.user.userId]
        );
        if (result.rows.length === 0) return res.status(403).json({ error: 'Bạn không có quyền xóa tài liệu này' });
        res.json({ message: 'Đã xóa tài liệu thành công' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rời tài liệu (collaborator tự xóa mình khỏi document_collaborators)
app.delete('/api/documents/:id/leave', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidUUID(id)) return res.status(400).json({ error: 'ID tài liệu không hợp lệ' });

        // Không cho owner rời — owner phải xóa tài liệu thay vào đó
        const ownerCheck = await pool.query(
            'SELECT id FROM documents WHERE id = $1 AND owner_id = $2',
            [id, req.user.userId]
        );
        if (ownerCheck.rows.length > 0) {
            return res.status(403).json({ error: 'Bạn là chủ tài liệu, không thể rời. Hãy xóa tài liệu nếu muốn.' });
        }

        const result = await pool.query(
            'DELETE FROM document_collaborators WHERE document_id = $1 AND user_id = $2 RETURNING document_id',
            [id, req.user.userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Bạn không có trong tài liệu này' });
        }
        res.json({ message: 'Đã rời tài liệu' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ROUTES KẾT BẠN
// Tìm kiếm user theo email (loại bỏ chính mình và bạn đã có)
app.get('/api/users/search', requireAuth, friendLimiter, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q || q.length < 2) {
            return res.status(400).json({ error: 'Nhập ít nhất 2 ký tự để tìm kiếm' });
        }
        const result = await pool.query(
            `SELECT u.id, u.email,
                CASE
                    WHEN f.id IS NULL THEN 'none'
                    ELSE f.status
                END AS friendship_status,
                f.id AS friendship_id,
                f.requester_id
             FROM users u
             LEFT JOIN friendships f
                ON (f.requester_id = $2 AND f.receiver_id = u.id)
                OR (f.receiver_id  = $2 AND f.requester_id = u.id)
             WHERE u.email ILIKE $1
               AND u.id <> $2
             LIMIT 10`,
            [`%${q}%`, req.user.userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lấy danh sách bạn bè (accepted) + trạng thái online
app.get('/api/friends', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                f.id AS friendship_id,
                CASE WHEN f.requester_id = $1 THEN u2.id     ELSE u1.id     END AS friend_id,
                CASE WHEN f.requester_id = $1 THEN u2.email  ELSE u1.email  END AS friend_email
             FROM friendships f
             JOIN users u1 ON f.requester_id = u1.id
             JOIN users u2 ON f.receiver_id  = u2.id
             WHERE (f.requester_id = $1 OR f.receiver_id = $1)
               AND f.status = 'accepted'
             ORDER BY friend_email`,
            [req.user.userId]
        );
        // Gắn trạng thái online từ Map in-memory
        const friends = result.rows.map(row => ({
            ...row,
            is_online: onlineSocketMap.has(row.friend_id)
        }));
        res.json(friends);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lấy lời mời kết bạn đang chờ (nhận về phía mình)
app.get('/api/friends/pending', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT f.id AS friendship_id, u.id AS requester_id, u.email AS requester_email
             FROM friendships f
             JOIN users u ON f.requester_id = u.id
             WHERE f.receiver_id = $1 AND f.status = 'pending'
             ORDER BY f.created_at DESC`,
            [req.user.userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Gửi lời mời kết bạn
app.post('/api/friends/request', requireAuth, friendLimiter, async (req, res) => {
    try {
        const { receiverId } = req.body;
        if (!receiverId || receiverId === req.user.userId) {
            return res.status(400).json({ error: 'Người nhận không hợp lệ' });
        }
        // Kiểm tra user tồn tại
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [receiverId]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: 'Người dùng không tồn tại' });

        // Kiểm tra đã có quan hệ chưa (cả hai chiều)
        const existing = await pool.query(
            `SELECT id, status FROM friendships
             WHERE (requester_id = $1 AND receiver_id = $2)
                OR (requester_id = $2 AND receiver_id = $1)`,
            [req.user.userId, receiverId]
        );
        if (existing.rows.length > 0) {
            const s = existing.rows[0].status;
            const msg = s === 'accepted' ? 'Hai bạn đã là bạn bè'
                      : s === 'pending'  ? 'Lời mời đã được gửi'
                      :                    'Đã có quan hệ trước đó';
            return res.status(409).json({ error: msg });
        }

        const result = await pool.query(
            'INSERT INTO friendships (requester_id, receiver_id) VALUES ($1, $2) RETURNING id',
            [req.user.userId, receiverId]
        );

        // Push real-time nếu người nhận đang online
        const receiverSocketId = onlineSocketMap.get(receiverId);
        if (receiverSocketId) {
            const senderInfo = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.userId]);
            io.to(receiverSocketId).emit('friend:request', {
                friendshipId: result.rows[0].id,
                senderEmail: senderInfo.rows[0]?.email,
                senderId: req.user.userId
            });
        }

        res.json({ message: 'Đã gửi lời mời kết bạn' });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Lời mời đã được gửi' });
        res.status(500).json({ error: err.message });
    }
});

// Chấp nhận lời mời
app.patch('/api/friends/:id/accept', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE friendships SET status = 'accepted'
             WHERE id = $1 AND receiver_id = $2 AND status = 'pending'
             RETURNING id, requester_id`,
            [req.params.id, req.user.userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy lời mời hoặc đã xử lý' });
        }
        // Notify người gửi lời mời
        const requesterId = result.rows[0].requester_id;
        const requesterSocketId = onlineSocketMap.get(requesterId);
        if (requesterSocketId) {
            const accepterInfo = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.userId]);
            io.to(requesterSocketId).emit('friend:accepted', {
                friendshipId: result.rows[0].id,
                accepterEmail: accepterInfo.rows[0]?.email,
                accepterId: req.user.userId
            });
        }
        res.json({ message: 'Đã chấp nhận lời mời kết bạn' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Từ chối lời mời
app.patch('/api/friends/:id/decline', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE friendships SET status = 'declined'
             WHERE id = $1 AND receiver_id = $2 AND status = 'pending'
             RETURNING id`,
            [req.params.id, req.user.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy lời mời' });
        res.json({ message: 'Đã từ chối' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Hủy kết bạn
app.delete('/api/friends/:id', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM friendships
             WHERE id = $1 AND (requester_id = $2 OR receiver_id = $2) AND status = 'accepted'
             RETURNING id`,
            [req.params.id, req.user.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
        res.json({ message: 'Đã hủy kết bạn' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// SOCKET.IO — xác thực + presence + yjs
const saveTimers = {};

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        next(new Error('Unauthorized'));
    }
});

io.on('connection', (socket) => {
    const userId = socket.user.userId;

    // Đăng ký presence — String() để tránh type mismatch khi get
    onlineSocketMap.set(String(userId), socket.id);
    console.log(`[presence] SET key=${JSON.stringify(String(userId))} socket=${socket.id} mapSize=${onlineSocketMap.size}`);

    // Notify bạn bè rằng mình online
    notifyFriendsPresence(userId, true);

    //  JOIN DOCUMENT 
    socket.on('join-document', async (docId, userEmail) => {
        if (!isValidUUID(docId)) {
            socket.emit('error', 'ID tài liệu không hợp lệ');
            return;
        }
        const accessCheck = await pool.query(
            `SELECT d.id FROM documents d
             LEFT JOIN document_collaborators dc ON d.id = dc.document_id
             WHERE d.id = $1 AND (d.owner_id = $2 OR dc.user_id = $2)`,
            [docId, userId]
        );
        if (accessCheck.rows.length === 0) {
            socket.emit('error', 'Bạn không có quyền truy cập tài liệu này');
            return;
        }
        const roomName = `doc-${docId}`;
        socket.join(roomName);
        socket.docId = docId;
        socket.userEmail = userEmail;

        const socketsInRoom = await io.in(roomName).fetchSockets();
        io.to(roomName).emit('update-users', socketsInRoom.map(s => s.userEmail).filter(Boolean));

        try {
            const ydoc = getYDoc(docId);
            if (!ydoc.isLoaded) {
                const result = await pool.query(
                    'SELECT content FROM document_snapshots WHERE document_id = $1 ORDER BY saved_at DESC LIMIT 1',
                    [docId]
                );
                if (result.rows.length > 0 && result.rows[0].content) {
                    Y.applyUpdate(ydoc, new Uint8Array(result.rows[0].content));
                    console.log('[load] Đã restore document từ DB');
                }
                ydoc.isLoaded = true;
            }
            socket.emit('load-document', Array.from(Y.encodeStateAsUpdate(ydoc)));
        } catch (err) {
            console.error('[load] lỗi:', err);
        }
    });

    //  YJS UPDATE
    socket.on('yjs-update', async (docId, update) => {
        if (!isValidUUID(docId)) return;
        const roomName = `doc-${docId}`;
        socket.to(roomName).emit('yjs-update', update);
        try {
            const ydoc = getYDoc(docId);
            Y.applyUpdate(ydoc, new Uint8Array(update));
            clearTimeout(saveTimers[docId]);
            saveTimers[docId] = setTimeout(async () => {
                try {
                    const fullState = Y.encodeStateAsUpdate(ydoc);
                    await pool.query(
                        `INSERT INTO document_snapshots (document_id, content, saved_at)
                         VALUES ($1, $2, NOW())
                         ON CONFLICT (document_id) DO UPDATE SET content = $2, saved_at = NOW()`,
                        [docId, Buffer.from(fullState)]
                    );
                } catch (err) {
                    console.error('[save] lỗi DB:', err);
                }
            }, 2000);
        } catch (err) {
            console.error('[yjs-update] lỗi:', err);
        }
    });

    //  MỜI BẠN BÈ VÀO TÀI LIỆU 
    socket.on('doc:invite-friend', async ({ docId, friendId }) => {
        // Dùng cho DEBUG 
        console.log('[invite] docId:', docId);
        console.log('[invite] friendId received:', JSON.stringify(friendId));
        console.log('[invite] onlineSocketMap keys:', [...onlineSocketMap.keys()].map(k => JSON.stringify(k)));
        console.log('[invite] map has friendId?', onlineSocketMap.has(String(friendId)));
        //  END DEBUG

        if (!isValidUUID(docId) || !isValidUUID(String(friendId))) {
            console.log('[invite] UUID invalid — docId valid:', isValidUUID(docId), '| friendId valid:', isValidUUID(String(friendId)));
            socket.emit('doc:invite-error', 'ID không hợp lệ');
            return;
        }

        // Người mời phải có quyền trên doc
        const docCheck = await pool.query(
            `SELECT d.id, d.title FROM documents d
             LEFT JOIN document_collaborators dc ON d.id = dc.document_id
             WHERE d.id = $1 AND (d.owner_id = $2 OR dc.user_id = $2)`,
            [docId, userId]
        );
        if (docCheck.rows.length === 0) {
            socket.emit('doc:invite-error', 'Bạn không có quyền mời vào tài liệu này');
            return;
        }

        // Phải là bạn bè thật sự
        const friendCheck = await pool.query(
            `SELECT id FROM friendships
             WHERE ((requester_id = $1 AND receiver_id = $2)
                 OR (requester_id = $2 AND receiver_id = $1))
               AND status = 'accepted'`,
            [userId, friendId]
        );
        if (friendCheck.rows.length === 0) {
            socket.emit('doc:invite-error', 'Chỉ có thể mời bạn bè');
            return;
        }

        // Kiểm tra đã có quyền chưa
        const alreadyIn = await pool.query(
            `SELECT 1 FROM documents d
             LEFT JOIN document_collaborators dc ON d.id = dc.document_id
             WHERE d.id = $1 AND (d.owner_id = $2 OR dc.user_id = $2)`,
            [docId, friendId]
        );
        if (alreadyIn.rows.length > 0) {
            socket.emit('doc:invite-error', 'Người này đã có quyền truy cập tài liệu');
            return;
        }

        const inviterInfo = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
        const docTitle = docCheck.rows[0].title;
        const friendSocketId = onlineSocketMap.get(String(friendId));

        console.log('[invite] friendSocketId:', friendSocketId || 'NOT FOUND');
        console.log('[invite] docTitle:', docTitle);

        if (friendSocketId) {
            io.to(friendSocketId).emit('doc:invite-received', {
                docId,
                docTitle,
                inviterEmail: inviterInfo.rows[0]?.email,
                inviterId: userId
            });
            socket.emit('doc:invite-sent', { docTitle });
        } else {
            socket.emit('doc:invite-error', 'Bạn bè không online, không thể gửi lời mời trực tiếp');
        }
    });

    //  CHẤP NHẬN LỜI MỜI VÀO DOC
    socket.on('doc:invite-accept', async ({ docId, inviterId }) => {
        if (!isValidUUID(docId)) return;

        await pool.query(
            'INSERT INTO document_collaborators (document_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [docId, userId]
        );

        // Notify người mời
        const inviterSocketId = onlineSocketMap.get(String(inviterId));
        if (inviterSocketId) {
            const accepterInfo = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
            io.to(inviterSocketId).emit('doc:invite-accepted', {
                accepterEmail: accepterInfo.rows[0]?.email,
                docId
            });
        }

        // Báo client redirect vào doc
        socket.emit('doc:invite-join', { docId });
    });

    //  DISCONNECT
    socket.on('disconnect', async () => {
        onlineSocketMap.delete(String(userId));
        notifyFriendsPresence(userId, false);

        if (socket.docId) {
            const roomName = `doc-${socket.docId}`;

            setTimeout(async () => {
                const socketsInRoom = await io.in(roomName).fetchSockets();
                io.to(roomName).emit('update-users',
                    socketsInRoom.map(s => s.userEmail).filter(Boolean)
                );
            }, 100);
        }
    });
});

// Notify bạn bè khi một user online/offline
async function notifyFriendsPresence(userId, isOnline) {
    try {
        const result = await pool.query(
            `SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS friend_id
             FROM friendships
             WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
            [userId]
        );
        result.rows.forEach(row => {
            const friendSocketId = onlineSocketMap.get(row.friend_id);
            if (friendSocketId) {
                io.to(friendSocketId).emit('friend:presence', { userId, isOnline });
            }
        });
    } catch (err) {
        // Không critical — bỏ qua nếu lỗi
    }
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Backend Server đang chạy tại http://localhost:${PORT}`);
});