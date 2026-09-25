// ============================================================
//  📁 api/categories/index.js
//  จัดการหมวดหมู่อุปกรณ์
//  GET  /api/categories     — ดึงรายการหมวดหมู่
//  POST /api/categories     — เพิ่มหมวดหมู่ใหม่
// ============================================================

const { query } = require('../../lib/db');
const { sendSuccess, sendError, handleCors } = require('../../lib/helpers');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  switch (req.method) {
    case 'GET':
      return handleGetCategories(req, res);
    case 'POST':
      return handleCreateCategory(req, res);
    default:
      return sendError(res, 405, 'Method Not Allowed');
  }
};

async function handleGetCategories(req, res) {
  try {
    const { rows } = await query(`
      SELECT c.*,
             COUNT(a.asset_id) AS total_assets,
             SUM(CASE WHEN a.status = 'Available' THEN 1 ELSE 0 END) AS available_assets,
             SUM(CASE WHEN a.status = 'Borrowed' THEN 1 ELSE 0 END) AS borrowed_assets
      FROM categories c
      LEFT JOIN assets a ON c.category_id = a.category_id
      GROUP BY c.category_id
      ORDER BY c.category_name ASC
    `);
    sendSuccess(res, rows, `พบ ${rows.length} หมวดหมู่`);
  } catch (err) {
    sendError(res, 500, 'เกิดข้อผิดพลาดในการดึงหมวดหมู่', err.message);
  }
}

async function handleCreateCategory(req, res) {
  try {
    const { categoryName, description, maxBorrowDays, finePerDay } = req.body;

    if (!categoryName) {
      return sendError(res, 400, 'กรุณาระบุชื่อหมวดหมู่');
    }

    const { rows: result } = await query(
      `INSERT INTO categories (category_name, description, max_borrow_days, fine_per_day)
       VALUES (?, ?, ?, ?)`,
      [categoryName, description || null, maxBorrowDays || 7, finePerDay || 0]
    );

    sendSuccess(res, {
      categoryId: result.insertId,
      categoryName,
      maxBorrowDays: maxBorrowDays || 7,
      finePerDay: finePerDay || 0,
    }, 'สร้างหมวดหมู่สำเร็จ', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return sendError(res, 409, 'ชื่อหมวดหมู่นี้มีในระบบแล้ว');
    }
    sendError(res, 500, 'เกิดข้อผิดพลาดในการสร้างหมวดหมู่', err.message);
  }
}
