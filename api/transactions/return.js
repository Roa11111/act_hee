// ============================================================
//  📁 api/transactions/return.js
//  4.1 คืนอุปกรณ์ ณ จุดบริการ (Return Asset)
//  POST /api/transactions/return
// ============================================================

const { query, transaction } = require('../../lib/db');
const { sendSuccess, sendError, handleCors } = require('../../lib/helpers');
const { notifyReturn } = require('../../lib/line');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');

  const { assetQrCode, conditionStatus, returnNotes, staffId } = req.body;

  if (!assetQrCode) {
    return sendError(res, 400, 'กรุณาระบุ QR Code อุปกรณ์ที่ต้องการคืน');
  }

  const validConditions = ['Normal', 'Damaged', 'Lost'];
  const condition = conditionStatus || 'Normal';
  if (!validConditions.includes(condition)) {
    return sendError(res, 400, `สภาพอุปกรณ์ไม่ถูกต้อง: ต้องเป็น ${validConditions.join(', ')}`);
  }

  try {
    const result = await transaction(async (conn) => {
      // 1. ค้นหาอุปกรณ์
      const [assetRows] = await conn.execute(
        `SELECT a.*, c.category_name, c.fine_per_day
         FROM assets a
         JOIN categories c ON a.category_id = c.category_id
         WHERE a.qr_code_hash = ? OR a.asset_code = ?`,
        [assetQrCode, assetQrCode]
      );

      if (assetRows.length === 0) {
        throw { statusCode: 404, message: 'ไม่พบอุปกรณ์ที่ตรงกับ QR Code นี้' };
      }

      const asset = assetRows[0];

      // 2. หา transaction ที่ยังไม่คืน
      const [txRows] = await conn.execute(
        `SELECT t.*, u.full_name AS borrower_name, u.citizen_or_student_id, u.email
         FROM transactions t
         JOIN users u ON t.borrower_id = u.user_id
         WHERE t.asset_id = ? AND t.status IN ('Active', 'Overdue')
         ORDER BY t.borrow_date DESC
         LIMIT 1`,
        [asset.asset_id]
      );

      if (txRows.length === 0) {
        throw { statusCode: 400, message: `อุปกรณ์ ${asset.asset_code} ไม่มีรายการยืมค้างอยู่` };
      }

      const tx = txRows[0];
      const now = new Date();
      const dueDate = new Date(tx.due_date);

      // 3. คำนวณค่าปรับ (ถ้าคืนเกินกำหนด)
      let lateFee = 0;
      let daysLate = 0;
      if (now > dueDate) {
        const diffMs = now.getTime() - dueDate.getTime();
        daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        lateFee = daysLate * parseFloat(asset.fine_per_day);
      }

      // 4. กำหนดสถานะ transaction ตามสภาพอุปกรณ์
      let txStatus = 'Returned';
      let newAssetStatus = 'Available';
      if (condition === 'Damaged') {
        txStatus = 'Damaged';
        newAssetStatus = 'Maintenance';
      } else if (condition === 'Lost') {
        txStatus = 'Lost';
        newAssetStatus = 'Lost';
      }

      // 5. อัปเดต transaction
      await conn.execute(
        `UPDATE transactions
         SET status = ?, return_date = NOW(), late_fee = ?,
             staff_return_id = ?, notes = CONCAT(COALESCE(notes, ''), ?)
         WHERE transaction_id = ?`,
        [
          txStatus,
          lateFee,
          staffId || null,
          returnNotes ? `\n[คืน] ${returnNotes}` : '',
          tx.transaction_id,
        ]
      );

      // 6. อัปเดตสถานะอุปกรณ์
      await conn.execute(
        'UPDATE assets SET status = ? WHERE asset_id = ?',
        [newAssetStatus, asset.asset_id]
      );

      return {
        assetCode: asset.asset_code,
        assetName: asset.asset_name,
        category: asset.category_name,
        borrowerName: tx.borrower_name,
        borrowerId: tx.citizen_or_student_id,
        borrowDate: tx.borrow_date,
        dueDate: tx.due_date,
        returnDate: now.toISOString(),
        conditionStatus: condition,
        daysLate,
        lateFee,
        newAssetStatus,
      };
    });

    const msg = result.lateFee > 0
      ? `คืนอุปกรณ์ ${result.assetCode} เรียบร้อย — ค่าปรับล่าช้า ${result.daysLate} วัน: ${result.lateFee.toFixed(2)} บาท`
      : `คืนอุปกรณ์ ${result.assetCode} เรียบร้อยแล้ว`;

    // 📢 ส่งแจ้งเตือนเข้า LINE Group
    notifyReturn(result).catch((err) => console.error('[LINE Notify Error]:', err));

    sendSuccess(res, result, msg);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.message);
    }
    sendError(res, 500, 'เกิดข้อผิดพลาดในการทำรายการคืน', err.message);
  }
};
