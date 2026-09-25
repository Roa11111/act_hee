// ============================================================
//  📁 api/transactions/borrow.js
//  3.1 ยืมอุปกรณ์ผ่านจุดบริการ (Staff-Assisted Borrow)
//  POST /api/transactions/borrow
// ============================================================

const { query, transaction } = require('../../lib/db');
const { sendSuccess, sendError, handleCors } = require('../../lib/helpers');
const { notifyBorrow } = require('../../lib/line');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');

  const { borrowerQrCode, assetQrCodes, staffId, notes } = req.body;

  // ─── Validation ──────────────────────────────────────────
  if (!borrowerQrCode) {
    return sendError(res, 400, 'กรุณาระบุ QR Code ผู้ยืม');
  }
  if (!assetQrCodes || !Array.isArray(assetQrCodes) || assetQrCodes.length === 0) {
    return sendError(res, 400, 'กรุณาระบุ QR Code อุปกรณ์อย่างน้อย 1 รายการ');
  }

  try {
    const result = await transaction(async (conn) => {
      // 1. ค้นหาผู้ยืม
      const [borrowerRows] = await conn.execute(
        'SELECT * FROM users WHERE user_qr_code = ?',
        [borrowerQrCode]
      );
      if (borrowerRows.length === 0) {
        throw { statusCode: 404, message: 'ไม่พบผู้ยืมที่ตรงกับ QR Code นี้' };
      }
      const borrower = borrowerRows[0];

      if (borrower.status !== 'Active') {
        throw { statusCode: 403, message: `ผู้ยืมถูกระงับสิทธิ์ (สถานะ: ${borrower.status})` };
      }

      // 2. ตรวจจำนวนยืมค้าง
      const [countRows] = await conn.execute(
        `SELECT COUNT(*) AS cnt FROM transactions
         WHERE borrower_id = ? AND status IN ('Active', 'Overdue')`,
        [borrower.user_id]
      );
      const currentBorrows = countRows[0].cnt;
      const remaining = borrower.max_borrow_limit - currentBorrows;

      if (remaining < assetQrCodes.length) {
        throw {
          statusCode: 400,
          message: `โควตายืมไม่เพียงพอ: ยืมได้อีก ${remaining} ชิ้น แต่ขอยืม ${assetQrCodes.length} ชิ้น`,
        };
      }

      // 3. ค้นหาเจ้าหน้าที่ (ถ้าระบุ staffId มา)
      let staffUserId = borrower.user_id; // fallback: ผู้ยืมเอง (self-service)
      if (staffId) {
        const [staffRows] = await conn.execute(
          'SELECT user_id FROM users WHERE user_id = ? AND role IN (?, ?, ?)',
          [staffId, 'Staff', 'Admin', 'SuperAdmin']
        );
        if (staffRows.length > 0) {
          staffUserId = staffRows[0].user_id;
        }
      }

      // 4. ดึงข้อมูลอุปกรณ์แต่ละชิ้น + สร้าง transaction
      const borrowedItems = [];

      for (const qr of assetQrCodes) {
        // ค้นหาอุปกรณ์
        const [assetRows] = await conn.execute(
          `SELECT a.*, c.max_borrow_days, c.fine_per_day, c.category_name
           FROM assets a
           JOIN categories c ON a.category_id = c.category_id
           WHERE a.qr_code_hash = ? OR a.asset_code = ?`,
          [qr, qr]
        );

        if (assetRows.length === 0) {
          throw { statusCode: 404, message: `ไม่พบอุปกรณ์: ${qr}` };
        }

        const asset = assetRows[0];

        if (asset.status !== 'Available') {
          throw {
            statusCode: 400,
            message: `อุปกรณ์ ${asset.asset_code} (${asset.asset_name}) ไม่พร้อมให้ยืม (สถานะ: ${asset.status})`,
          };
        }

        // คำนวณวันกำหนดส่ง
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + asset.max_borrow_days);
        dueDate.setHours(17, 0, 0, 0); // กำหนดคืนภายใน 17:00 น.

        // สร้าง transaction record
        const [txResult] = await conn.execute(
          `INSERT INTO transactions (asset_id, borrower_id, staff_borrow_id, due_date, borrow_type, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            asset.asset_id,
            borrower.user_id,
            staffUserId,
            dueDate,
            staffId ? 'StaffAssisted' : 'SelfService',
            notes || null,
          ]
        );

        // อัปเดตสถานะอุปกรณ์เป็น 'Borrowed'
        await conn.execute(
          'UPDATE assets SET status = ? WHERE asset_id = ?',
          ['Borrowed', asset.asset_id]
        );

        borrowedItems.push({
          transactionId: txResult.insertId,
          assetCode: asset.asset_code,
          assetName: asset.asset_name,
          category: asset.category_name,
          dueDate: dueDate.toISOString(),
          maxBorrowDays: asset.max_borrow_days,
        });
      }

      return {
        borrower: {
          id: borrower.user_id,
          name: borrower.full_name,
          studentId: borrower.citizen_or_student_id,
          email: borrower.email,
        },
        items: borrowedItems,
      };
    });

    // 📢 ส่งแจ้งเตือนเข้า LINE Group
    notifyBorrow(result).catch((err) => console.error('[LINE Notify Error]:', err));

    sendSuccess(
      res,
      result,
      `ทำรายการยืมสำเร็จ ${result.items.length} รายการ`,
      201
    );
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.message);
    }
    sendError(res, 500, 'เกิดข้อผิดพลาดในการทำรายการยืม', err.message);
  }
};
