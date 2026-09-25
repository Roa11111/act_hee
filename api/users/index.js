// ============================================================
//  📁 api/users/index.js
//  จัดการผู้ใช้: ดึงรายชื่อ / สร้างผู้ใช้ใหม่
//  GET  /api/users         — ดึงรายชื่อผู้ใช้ทั้งหมด
//  POST /api/users         — สร้างผู้ใช้ใหม่
// ============================================================

const { query } = require('../../lib/db');
const { sendSuccess, sendError, handleCors } = require('../../lib/helpers');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  switch (req.method) {
    case 'GET':
      return handleGetUsers(req, res);
    case 'POST':
      return handleCreateUser(req, res);
    default:
      return sendError(res, 405, 'Method Not Allowed');
  }
};

// ─── GET: ดึงรายชื่อผู้ใช้ ────────────────────────────────
async function handleGetUsers(req, res) {
  try {
    const { role, status, search } = req.query;
    let sql = 'SELECT * FROM users WHERE 1=1';
    const params = [];

    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (full_name LIKE ? OR citizen_or_student_id LIKE ? OR email LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await query(sql, params);
    sendSuccess(res, rows, `พบผู้ใช้ ${rows.length} คน`);
  } catch (err) {
    sendError(res, 500, 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้', err.message);
  }
}

// ─── POST: สร้างผู้ใช้ใหม่ ──────────────────────────────────
async function handleCreateUser(req, res) {
  try {
    const { citizenOrStudentId, fullName, email, phone, role, maxBorrowLimit } = req.body;

    if (!citizenOrStudentId || !fullName || !email) {
      return sendError(res, 400, 'กรุณากรอก รหัสนักศึกษา/พนักงาน, ชื่อ-นามสกุล และอีเมล');
    }

    // สร้าง QR Code hash สำหรับผู้ใช้ใหม่
    const qrHash = 'USR_' + crypto.randomBytes(12).toString('hex').toUpperCase();

    const sql = `
      INSERT INTO users (citizen_or_student_id, full_name, email, phone, user_qr_code, role, max_borrow_limit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      citizenOrStudentId,
      fullName,
      email,
      phone || null,
      qrHash,
      role || 'Borrower',
      maxBorrowLimit || 3,
    ];

    const { rows: result } = await query(sql, params);

    sendSuccess(res, {
      userId: result.insertId,
      citizenOrStudentId,
      fullName,
      userQrCode: qrHash,
      role: role || 'Borrower',
    }, 'สร้างผู้ใช้ใหม่สำเร็จ', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return sendError(res, 409, 'ข้อมูลซ้ำ: รหัสนักศึกษา, อีเมล หรือ QR Code นี้มีในระบบแล้ว');
    }
    sendError(res, 500, 'เกิดข้อผิดพลาดในการสร้างผู้ใช้', err.message);
  }
}
