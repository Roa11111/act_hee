// ============================================================
//  📁 api/cron-check.js
//  Cron Job ตรวจสอบรายการยืมที่เกินกำหนดส่งคืน และแจ้งเตือนเข้า LINE Group
//  GET /api/cron-check
// ============================================================

const { query } = require('../lib/db');
const { notifyOverdue } = require('../lib/line');
const { sendSuccess, sendError, handleCors } = require('../lib/helpers');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    // 1. ดึงรายการที่เกินกำหนด
    const { rows: overdueItems } = await query(`
      SELECT
        t.transaction_id, t.due_date,
        a.asset_code, a.asset_name,
        u.full_name AS borrower_name, u.citizen_or_student_id,
        DATEDIFF(NOW(), t.due_date) AS days_overdue,
        c.fine_per_day,
        (DATEDIFF(NOW(), t.due_date) * c.fine_per_day) AS estimated_fine
      FROM transactions t
      JOIN assets a ON t.asset_id = a.asset_id
      JOIN categories c ON a.category_id = c.category_id
      JOIN users u ON t.borrower_id = u.user_id
      WHERE t.status IN ('Active', 'Overdue') AND t.due_date < NOW()
      ORDER BY t.due_date ASC
    `);

    // 2. ปรับสถานะเป็น Overdue ในฐานข้อมูล
    if (overdueItems.length > 0) {
      await query(`
        UPDATE transactions
        SET status = 'Overdue'
        WHERE status = 'Active' AND due_date < NOW()
      `);

      // 3. ส่ง LINE Push แจ้งเตือนเข้ากลุ่ม
      await notifyOverdue(overdueItems);
    }

    sendSuccess(res, {
      count: overdueItems.length,
      overdueItems: overdueItems
    }, `ตรวจสอบรายการเกินกำหนดเรียบร้อยแล้ว (พบ ${overdueItems.length} รายการ)`);
  } catch (err) {
    console.error('[Cron Check Error]:', err.message);
    sendError(res, 500, 'เกิดข้อผิดพลาดในการตรวจสอบรายการเกินกำหนด', err.message);
  }
};
