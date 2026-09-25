// ============================================================
//  📁 api/dashboard.js
//  สรุปสถิติ Dashboard
//  GET /api/dashboard
// ============================================================

const { query } = require('../lib/db');
const { sendSuccess, sendError, handleCors } = require('../lib/helpers');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  try {
    // สถิติอุปกรณ์
    const { rows: assetStats } = await query(`
      SELECT
        COUNT(*) AS total_assets,
        SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN status = 'Borrowed' THEN 1 ELSE 0 END) AS borrowed,
        SUM(CASE WHEN status = 'Maintenance' THEN 1 ELSE 0 END) AS maintenance,
        SUM(CASE WHEN status = 'Lost' THEN 1 ELSE 0 END) AS lost
      FROM assets
    `);

    // สถิติผู้ใช้
    const { rows: userStats } = await query(`
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN role = 'Borrower' THEN 1 ELSE 0 END) AS borrowers,
        SUM(CASE WHEN role IN ('Staff', 'Admin', 'SuperAdmin') THEN 1 ELSE 0 END) AS staff,
        SUM(CASE WHEN status = 'Suspended' THEN 1 ELSE 0 END) AS suspended
      FROM users
    `);

    // รายการเกินกำหนด
    const { rows: overdueItems } = await query(`
      SELECT
        t.transaction_id, t.due_date,
        a.asset_code, a.asset_name,
        u.full_name AS borrower_name, u.citizen_or_student_id,
        DATEDIFF(NOW(), t.due_date) AS days_overdue,
        c.fine_per_day,
        DATEDIFF(NOW(), t.due_date) * c.fine_per_day AS estimated_fine
      FROM transactions t
      JOIN assets a ON t.asset_id = a.asset_id
      JOIN categories c ON a.category_id = c.category_id
      JOIN users u ON t.borrower_id = u.user_id
      WHERE t.status IN ('Active', 'Overdue') AND t.due_date < NOW()
      ORDER BY t.due_date ASC
      LIMIT 20
    `);

    // อัปเดตสถานะ overdue อัตโนมัติ
    if (overdueItems.length > 0) {
      await query(`
        UPDATE transactions
        SET status = 'Overdue'
        WHERE status = 'Active' AND due_date < NOW()
      `);
    }

    // สถิติการยืม-คืนวันนี้
    const { rows: todayStats } = await query(`
      SELECT
        SUM(CASE WHEN DATE(borrow_date) = CURDATE() THEN 1 ELSE 0 END) AS borrowed_today,
        SUM(CASE WHEN DATE(return_date) = CURDATE() THEN 1 ELSE 0 END) AS returned_today
      FROM transactions
    `);

    sendSuccess(res, {
      assets: assetStats[0],
      users: userStats[0],
      overdue: {
        count: overdueItems.length,
        items: overdueItems,
      },
      today: todayStats[0],
    }, 'ข้อมูล Dashboard');
  } catch (err) {
    sendError(res, 500, 'เกิดข้อผิดพลาดในการดึงข้อมูล Dashboard', err.message);
  }
};
