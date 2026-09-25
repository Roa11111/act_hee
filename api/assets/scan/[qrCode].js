// ============================================================
//  📁 api/assets/scan/[qrCode].js
//  สแกน QR Code อุปกรณ์ — ค้นหาข้อมูลจาก qr_code_hash
//  GET /api/assets/scan/:qrCode
// ============================================================

const { query } = require('../../../lib/db');
const { sendSuccess, sendError, handleCors } = require('../../../lib/helpers');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  const { qrCode } = req.query;
  if (!qrCode) return sendError(res, 400, 'กรุณาระบุ QR Code อุปกรณ์');

  try {
    const { rows } = await query(
      `SELECT a.*, c.category_name, c.max_borrow_days, c.fine_per_day
       FROM assets a
       JOIN categories c ON a.category_id = c.category_id
       WHERE a.qr_code_hash = ? OR a.asset_code = ?`,
      [qrCode, qrCode]
    );

    if (rows.length === 0) {
      return sendError(res, 404, 'ไม่พบอุปกรณ์ที่ตรงกับ QR Code นี้');
    }

    const asset = rows[0];

    // ถ้ากำลังถูกยืม → หาข้อมูลผู้ยืมปัจจุบัน
    let currentBorrower = null;
    if (asset.status === 'Borrowed') {
      const { rows: txRows } = await query(
        `SELECT t.*, u.full_name, u.citizen_or_student_id, u.email
         FROM transactions t
         JOIN users u ON t.borrower_id = u.user_id
         WHERE t.asset_id = ? AND t.status IN ('Active', 'Overdue')
         ORDER BY t.borrow_date DESC
         LIMIT 1`,
        [asset.asset_id]
      );
      if (txRows.length > 0) {
        currentBorrower = {
          transactionId: txRows[0].transaction_id,
          borrowerName: txRows[0].full_name,
          borrowerId: txRows[0].citizen_or_student_id,
          borrowDate: txRows[0].borrow_date,
          dueDate: txRows[0].due_date,
          status: txRows[0].status,
        };
      }
    }

    sendSuccess(res, { ...asset, currentBorrower });
  } catch (err) {
    sendError(res, 500, 'เกิดข้อผิดพลาดในการค้นหาอุปกรณ์', err.message);
  }
};
