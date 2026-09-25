// ============================================================
//  📁 lib/db.js
//  MySQL Connection Pool สำหรับ Aiven for MySQL
//  ใช้ mysql2/promise + Connection Pooling (Serverless-friendly)
// ============================================================

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// โหลด .env ใน local development (Vercel จัดการ env ให้อัตโนมัติอยู่แล้ว)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv เป็น optional ถ้าอยู่ใน serverless runtime
}

/** @type {mysql.Pool | null} */
let pool = null;

/**
 * สร้างหรือคืน Connection Pool ที่มีอยู่แล้ว (Singleton)
 * Serverless function อาจถูก reuse container เดิม — pool จึงถูก cache ไว้
 */
function getPool() {
  if (pool) return pool;

  const config = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'defaultdb',
    charset: 'utf8mb4',
    timezone: '+07:00',
    waitForConnections: true,
    connectionLimit: 5,        // Serverless ไม่ควรเปิดเยอะ
    maxIdle: 2,
    idleTimeout: 30000,        // 30 วินาที
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  };

  // ตั้งค่า SSL (Aiven Cloud ต้องการ SSL แต่ Localhost/WAMP ไม่ต้องใช้)
  const isLocalhost = config.host === 'localhost' || config.host === '127.0.0.1';

  if (!isLocalhost) {
    if (process.env.MYSQL_SSL_CA) {
      const caPath = path.resolve(process.env.MYSQL_SSL_CA);
      if (fs.existsSync(caPath)) {
        config.ssl = { ca: fs.readFileSync(caPath, 'utf-8') };
      }
    } else if (process.env.MYSQL_SSL_CA_CONTENT) {
      config.ssl = { ca: process.env.MYSQL_SSL_CA_CONTENT };
    } else {
      // Cloud Aiven: ใช้ SSL โดยไม่ต้อง verify CA ในช่วง dev
      config.ssl = { rejectUnauthorized: false };
    }
  }

  pool = mysql.createPool(config);
  return pool;
}

/**
 * Execute a query with parameterized values
 * @param {string} sql - SQL query with ? placeholders
 * @param {any[]} params - Parameter values
 * @returns {Promise<{rows: any[], fields: any[]}>}
 */
async function query(sql, params = []) {
  const p = getPool();
  const [rows, fields] = await p.execute(sql, params);
  return { rows, fields };
}

/**
 * Execute a transaction with multiple queries
 * @param {(conn: mysql.PoolConnection) => Promise<any>} callback
 * @returns {Promise<any>}
 */
async function transaction(callback) {
  const p = getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { getPool, query, transaction };
