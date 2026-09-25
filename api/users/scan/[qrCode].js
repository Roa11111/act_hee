// ============================================================
//  📁 api/users/scan/[qrCode].js
//  1.1 สแกนตรวจสอบข้อมูลผู้ยืม (Scan Borrower QR)
//  GET /api/users/scan/:userQrCode
// ============================================================

const { query } = require('../../../lib/db');
const { sendSuccess, sendError, handleCors } = require('../../../lib/helpers');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  const { qrCode } = req.query;
  if (!qrCode) return sendError(res, 400, 'กรุณาระบุ QR Code ผู้ยืม');

  try {
    // ค้นหาผู้ใช้จาก QR Code
    const { rows: users } = await query(
      'SELECT * FROM users WHERE user_qr_code = ?',
      [qrCode]
    );

    if (users.length === 0) {
      return sendError(res, 404, 'ไม่พบผู้ใช้ที่ตรงกับ QR Code นี้');
    }

    const user = users[0];

    // นับจำนวนรายการยืมที่ยังไม่คืน
    const { rows: borrowCount } = await query(
      `SELECT COUNT(*) AS active_borrows
       FROM transactions
       WHERE borrower_id = ? AND status IN ('Active', 'Overdue')`,
      [user.user_id]
    );

    const activeBorrows = borrowCount[0].active_borrows;
    const canBorrow = user.status === 'Active' && activeBorrows < user.max_borrow_limit;

    sendSuccess(res, {
      userId: user.user_id,
      studentId: user.citizen_or_student_id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      currentActiveBorrows: activeBorrows,
      maxBorrowLimit: user.max_borrow_limit,
      canBorrow,
    });
  } catch (err) {
    sendError(res, 500, 'เกิดข้อผิดพลาดในการค้นหาผู้ยืม', err.message);
  }
};
