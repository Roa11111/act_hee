// ============================================================
//  📁 api/health.js
//  Health Check — ทดสอบว่า API และ MySQL เชื่อมต่อได้
//  GET /api/health
// ============================================================

const { query } = require('../lib/db');
const { sendSuccess, sendError, handleCors } = require('../lib/helpers');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const result = await query('SELECT 1 AS ok, NOW() AS server_time');
    sendSuccess(res, {
      status: 'healthy',
      database: 'connected',
      serverTime: result.rows[0].server_time,
      environment: process.env.VERCEL ? 'vercel' : 'local',
    }, 'ระบบทำงานปกติ');
  } catch (err) {
    sendError(res, 500, 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้', err.message);
  }
};
