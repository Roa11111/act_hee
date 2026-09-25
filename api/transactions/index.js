// ============================================================
//  📁 api/transactions/index.js
//  ดึงประวัติการยืม-คืน พร้อม filter
//  GET /api/transactions
// ============================================================

const { query } = require('../../lib/db');
const { sendSuccess, sendError, handleCors } = require('../../lib/helpers');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  try {
    const { status, borrowerId, assetId, limit } = req.query;

    let sql = `
      SELECT
        t.*,
        a.asset_code, a.asset_name,
        c.category_name,
        ub.full_name AS borrower_name,
        ub.citizen_or_student_id AS borrower_student_id,
        us.full_name AS staff_borrow_name,
        ur.full_name AS staff_return_name
      FROM transactions t
      JOIN assets a ON t.asset_id = a.asset_id
      JOIN categories c ON a.category_id = c.category_id
      JOIN users ub ON t.borrower_id = ub.user_id
      JOIN users us ON t.staff_borrow_id = us.user_id
      LEFT JOIN users ur ON t.staff_return_id = ur.user_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND t.status = ?';
      params.push(status);
    }
    if (borrowerId) {
      sql += ' AND t.borrower_id = ?';
      params.push(parseInt(borrowerId));
    }
    if (assetId) {
      sql += ' AND t.asset_id = ?';
      params.push(parseInt(assetId));
    }

    sql += ' ORDER BY t.created_at DESC';
    sql += ` LIMIT ${parseInt(limit) || 100}`;

    const { rows } = await query(sql, params);
    sendSuccess(res, rows, `พบรายการ ${rows.length} รายการ`);
  } catch (err) {
    sendError(res, 500, 'เกิดข้อผิดพลาดในการดึงประวัติ', err.message);
  }
};
