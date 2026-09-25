// ============================================================
//  📁 api/assets/index.js
//  จัดการอุปกรณ์: ดึงรายการ / ลงทะเบียนอุปกรณ์ใหม่
//  GET  /api/assets        — ดึงรายการอุปกรณ์
//  POST /api/assets        — ลงทะเบียนอุปกรณ์ใหม่ + สร้าง QR Code hash
// ============================================================

const { query } = require('../../lib/db');
const { sendSuccess, sendError, handleCors } = require('../../lib/helpers');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  switch (req.method) {
    case 'GET':
      return handleGetAssets(req, res);
    case 'POST':
      return handleCreateAsset(req, res);
    default:
      return sendError(res, 405, 'Method Not Allowed');
  }
};

// ─── GET: ดึงรายการอุปกรณ์ ─────────────────────────────────
async function handleGetAssets(req, res) {
  try {
    const { status, categoryId, search } = req.query;
    let sql = `
      SELECT a.*, c.category_name, c.max_borrow_days, c.fine_per_day
      FROM assets a
      JOIN categories c ON a.category_id = c.category_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }
    if (categoryId) {
      sql += ' AND a.category_id = ?';
      params.push(parseInt(categoryId));
    }
    if (search) {
      sql += ' AND (a.asset_name LIKE ? OR a.asset_code LIKE ? OR a.serial_number LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY a.asset_code ASC';

    const { rows } = await query(sql, params);
    sendSuccess(res, rows, `พบอุปกรณ์ ${rows.length} รายการ`);
  } catch (err) {
    sendError(res, 500, 'เกิดข้อผิดพลาดในการดึงข้อมูลอุปกรณ์', err.message);
  }
}

// ─── POST: ลงทะเบียนอุปกรณ์ใหม่ ────────────────────────────
async function handleCreateAsset(req, res) {
  try {
    const { assetCode, assetName, categoryId, description, locationStored, serialNumber } = req.body;

    if (!assetCode || !assetName || !categoryId || !locationStored) {
      return sendError(res, 400, 'กรุณากรอก รหัสอุปกรณ์, ชื่ออุปกรณ์, หมวดหมู่ และตำแหน่งจัดเก็บ');
    }

    // ตรวจสอบว่าหมวดหมู่มีอยู่จริง
    const { rows: cats } = await query(
      'SELECT category_id FROM categories WHERE category_id = ?',
      [categoryId]
    );
    if (cats.length === 0) {
      return sendError(res, 404, `ไม่พบหมวดหมู่ ID: ${categoryId}`);
    }

    // สร้าง QR Code hash ที่ปลอดภัย
    const qrHash = 'AST_QR_' + crypto.randomBytes(16).toString('hex').toUpperCase() + '_' + assetCode.replace(/[^A-Za-z0-9]/g, '');

    const sql = `
      INSERT INTO assets (asset_code, asset_name, category_id, description, qr_code_hash, location_stored, serial_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      assetCode,
      assetName,
      categoryId,
      description || null,
      qrHash,
      locationStored,
      serialNumber || null,
    ];

    const { rows: result } = await query(sql, params);

    sendSuccess(res, {
      assetId: result.insertId,
      assetCode,
      qrCodeHash: qrHash,
      qrPayload: {
        asset_id: assetCode,
        hash: qrHash,
      },
      status: 'Available',
    }, 'สร้างอุปกรณ์และ QR Code เรียบร้อยแล้ว', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return sendError(res, 409, 'รหัสอุปกรณ์หรือ QR Code นี้มีในระบบแล้ว');
    }
    sendError(res, 500, 'เกิดข้อผิดพลาดในการสร้างอุปกรณ์', err.message);
  }
}
