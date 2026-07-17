import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// MySQL 8's official image generates a self-signed CA on first start and
// accepts TLS by default; rejectUnauthorized:false means "encrypted, but
// don't verify that self-signed cert" — fine for a same-network/same-host
// Docker link, not a substitute for a real CA if backend and DB are ever
// split across hosts.
const useSsl = String(process.env.DB_SSL ?? 'true').trim().toLowerCase() !== 'false';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root_password_dev',
  database: process.env.DB_NAME || 'fixlife_db',
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;