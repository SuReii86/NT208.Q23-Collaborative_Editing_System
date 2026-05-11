const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // SSL bắt buộc khi kết nối Supabase
    ssl: process.env.DATABASE_URL?.includes('localhost')
        ? false
        : { rejectUnauthorized: false }
});

pool.connect(async (err, client, release) => {
    if (err) {
        console.error('Lỗi kết nối PostgreSQL:', err.stack);
        return;
    }
    console.log('Đã kết nối thành công tới PostgreSQL!');
    release();
    await initSchema();
});

async function initSchema() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS friendships (
                id           SERIAL PRIMARY KEY,
                requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status       VARCHAR(10) NOT NULL DEFAULT 'pending',
                created_at   TIMESTAMP DEFAULT NOW(),
                UNIQUE(requester_id, receiver_id),
                CHECK (requester_id <> receiver_id),
                CHECK (status IN ('pending', 'accepted', 'declined'))
            );
            CREATE INDEX IF NOT EXISTS idx_friendships_receiver  ON friendships(receiver_id);
            CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
        `);
        console.log('Schema friendships sẵn sàng');
    } catch (err) {
        // Bảng đã tồn tại hoặc lỗi khác — không crash server
        if (!err.message.includes('already exists')) {
            console.error('❌ initSchema lỗi:', err.message);
        }
    }
}

module.exports = pool;