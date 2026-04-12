const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.connect(async (err, client, release) => {
    if (err) {
        console.error('Lỗi kết nối PostgreSQL:', err.stack);
    } else {
        console.log('Đã kết nối thành công tới PostgreSQL!');
    }
});

module.exports = pool;