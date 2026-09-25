import { Request, Response } from 'express';
import { Pool, PoolClient } from 'pg';
import { NotificationService } from '../services/notificationService';

// เชื่อมต่อ Database Pool (PostgreSQL หรือ MySQL Pool)
declare const dbPool: Pool;
const notificationService = new NotificationService();

export class BorrowReturnController {

  /**
   * Workflow 2 (A): ยืมอุปกรณ์ผ่านจุดบริการ (Staff-Assisted Borrow Desk)
   * รองรับการสแกนยืมทีละชิ้น หรือสแกนต่อเนื่องหลายชิ้นพร้อมกันในคราวเดียว
   */
  public static async borrowAssets(req: Request, res: Response): Promise<Response> {
    const { borrowerQrCode, assetQrCodes, notes } = req.body;
    // req.user ถูก decode มาจาก JWT Auth Middleware (Staff / Admin ที่กำลังใช้งานระบบ)
    const staffId = (req as any).user?.user_id;

    if (!borrowerQrCode || !assetQrCodes || !Array.isArray(assetQrCodes) || assetQrCodes.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'กรุณาระบุ QR Code ของผู้ยืม และ QR Code ของอุปกรณ์อย่างน้อย 1 ชิ้น' 
      });
    }

    const client: PoolClient = await dbPool.connect();

    try {
      // 1. เริ่ม Transaction (ACID) เพื่อความถูกต้องของคลังข้อมูลและป้องกัน Race Condition
      await client.query('BEGIN');

      // 2. ตรวจสอบข้อมูลผู้ยืม (Borrower Verification) พร้อม Lock แถวข้อมูล
      const userRes = await client.query(
        `SELECT user_id, full_name, email, role, status, max_borrow_limit, line_user_id 
         FROM users 
         WHERE user_qr_code = $1 FOR UPDATE`,
        [borrowerQrCode]
      );

      if (userRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ยืมจาก QR Code นี้' });
      }

      const borrower = userRes.rows[0];

      // ตรวจสอบเงื่อนไขข้อ 1: ผู้ยืมติดสถานะ Suspended หรือไม่?
      if (borrower.status === 'Suspended') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          code: 'USER_SUSPENDED',
          message: `ไม่สามารถทำรายการได้ ผู้ยืม (${borrower.full_name}) ติดสถานะระงับการใช้งานเนื่องจากมีรายการค้างส่ง`
        });
      }

      // ตรวจสอบจำนวนอุปกรณ์ที่ผู้ยืมถือครองอยู่ ณ ปัจจุบัน
      const activeBorrowCountRes = await client.query(
        `SELECT COUNT(*) as current_borrowed 
         FROM transactions 
         WHERE borrower_id = $1 AND status IN ('Active', 'Overdue')`,
        [borrower.user_id]
      );

      const currentBorrowed = parseInt(activeBorrowCountRes.rows[0].current_borrowed, 10);
      const totalAfterBorrow = currentBorrowed + assetQrCodes.length;

      // ตรวจสอบเงื่อนไขข้อ 2: จำนวนยืมรวมเกินสิทธิ์สูงสุด (max_borrow_limit) หรือไม่?
      if (totalAfterBorrow > borrower.max_borrow_limit) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          code: 'BORROW_LIMIT_EXCEEDED',
          message: `จำนวนการยืมเกินสิทธิ์สูงสุด (ยืมอยู่ ${currentBorrowed} ชิ้น, ครั้งนี้ ${assetQrCodes.length} ชิ้น, สิทธิ์สูงสุด ${borrower.max_borrow_limit} ชิ้น)`
        });
      }

      // 3. ตรวจสอบและประมวลผลอุปกรณ์แต่ละชิ้น
      const createdTransactions = [];
      const borrowedAssetDetails = [];

      for (const assetQr of assetQrCodes) {
        // Query ค้นหาอุปกรณ์พร้อม Lock Row ป้องกันคนอื่นแย่งยืมพร้อมกัน (FOR UPDATE)
        const assetRes = await client.query(
          `SELECT a.asset_id, a.asset_code, a.asset_name, a.status, c.max_borrow_days, c.category_name
           FROM assets a
           JOIN categories c ON a.category_id = c.category_id
           WHERE a.qr_code_hash = $1 FOR UPDATE`,
          [assetQr]
        );

        if (assetRes.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: `ไม่พบอุปกรณ์รหัส QR: ${assetQr}` });
        }

        const asset = assetRes.rows[0];

        // ตรวจสอบเงื่อนไขข้อ 3: สถานะต้องเป็น 'Available' เท่านั้น
        if (asset.status !== 'Available') {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            code: 'ASSET_NOT_AVAILABLE',
            message: `อุปกรณ์ ${asset.asset_code} (${asset.asset_name}) อยู่ในสถานะ "${asset.status}" ไม่พร้อมให้ยืม`
          });
        }

        // คำนวณวันกำหนดส่งคืน (Due Date) ตาม max_borrow_days ของหมวดหมู่อุปกรณ์
        const borrowDate = new Date();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + asset.max_borrow_days);
        dueDate.setHours(17, 0, 0, 0); // กำหนดส่งคืนไม่เกิน 17:00 น. ของวันครบกำหนด

        // สร้าง Transaction
        const txRes = await client.query(
          `INSERT INTO transactions 
           (asset_id, borrower_id, staff_borrow_id, borrow_date, due_date, status, borrow_type, notes)
           VALUES ($1, $2, $3, $4, $5, 'Active', 'StaffAssisted', $6)
           RETURNING transaction_id, due_date`,
          [asset.asset_id, borrower.user_id, staffId, borrowDate, dueDate, notes || null]
        );

        // อัปเดตสถานะของตัวอุปกรณ์เป็น 'Borrowed'
        await client.query(
          `UPDATE assets 
           SET status = 'Borrowed', updated_at = CURRENT_TIMESTAMP 
           WHERE asset_id = $1`,
          [asset.asset_id]
        );

        createdTransactions.push(txRes.rows[0]);
        borrowedAssetDetails.push({
          assetCode: asset.asset_code,
          assetName: asset.asset_name,
          category: asset.category_name,
          dueDate: dueDate.toISOString()
        });
      }

      // 4. Commit Transaction
      await client.query('COMMIT');

      // 5. ส่งการแจ้งเตือน (Async Non-blocking Notification)
      notificationService.sendBorrowSuccessNotification({
        borrower,
        items: borrowedAssetDetails
      }).catch(err => console.error('Notification error:', err));

      return res.status(201).json({
        success: true,
        message: `ทำรายการยืมสำเร็จ ${createdTransactions.length} รายการ`,
        data: {
          borrower: {
            id: borrower.user_id,
            name: borrower.full_name,
            email: borrower.email
          },
          items: borrowedAssetDetails
        }
      });

    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Error during borrowing:', error);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์', error: error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Workflow 3: กระบวนการคืนอุปกรณ์ (Return Process)
   * เจ้าหน้าที่สแกน QR Code อุปกรณ์ ตรวจสอบสภาพ และปิดยอด Transaction
   */
  public static async returnAsset(req: Request, res: Response): Promise<Response> {
    const { assetQrCode, conditionStatus, returnNotes } = req.body;
    // conditionStatus: 'Normal' | 'Damaged' | 'Lost'
    const staffId = (req as any).user?.user_id;

    if (!assetQrCode || !conditionStatus) {
      return res.status(400).json({ 
        success: false, 
        message: 'กรุณาระบุ QR Code อุปกรณ์ และสภาพอุปกรณ์ตอนคืน (Normal, Damaged, Lost)' 
      });
    }

    const client: PoolClient = await dbPool.connect();

    try {
      await client.query('BEGIN');

      // 1. ค้นหาอุปกรณ์ตาม QR Code
      const assetRes = await client.query(
        `SELECT a.asset_id, a.asset_code, a.asset_name, a.status, c.fine_per_day
         FROM assets a
         JOIN categories c ON a.category_id = c.category_id
         WHERE a.qr_code_hash = $1 FOR UPDATE`,
        [assetQrCode]
      );

      if (assetRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'ไม่พบอุปกรณ์จาก QR Code นี้' });
      }

      const asset = assetRes.rows[0];

      // 2. ค้นหารายการ Transaction ล่าสุดที่ยังไม่ปิดยอด (Active หรือ Overdue)
      const txRes = await client.query(
        `SELECT t.transaction_id, t.borrower_id, t.due_date, t.borrow_date,
                u.full_name as borrower_name, u.email as borrower_email, u.line_user_id
         FROM transactions t
         JOIN users u ON t.borrower_id = u.user_id
         WHERE t.asset_id = $1 AND t.status IN ('Active', 'Overdue')
         ORDER BY t.transaction_id DESC
         LIMIT 1 FOR UPDATE`,
        [asset.asset_id]
      );

      if (txRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: `อุปกรณ์ ${asset.asset_code} ไม่มีประวัติการยืมที่ค้างอยู่ในระบบ (สถานะปัจจุบัน: ${asset.status})` 
        });
      }

      const tx = txRes.rows[0];
      const returnDate = new Date();
      const dueDate = new Date(tx.due_date);

      // 3. ตรวจสอบการส่งคืนล่าช้า (Overdue) และคำนวณค่าปรับ
      let lateFee = 0;
      let finalTxStatus = 'Returned';

      if (returnDate > dueDate) {
        const diffTime = Math.abs(returnDate.getTime() - dueDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        lateFee = diffDays * parseFloat(asset.fine_per_day);
      }

      // ปรับ Transaction Status ตามสภาพอุปกรณ์
      if (conditionStatus === 'Damaged') finalTxStatus = 'Damaged';
      if (conditionStatus === 'Lost') finalTxStatus = 'Lost';

      // 4. กำหนดสถานะใหม่ของ Asset
      let newAssetStatus = 'Available';
      if (conditionStatus === 'Damaged') newAssetStatus = 'Maintenance';
      if (conditionStatus === 'Lost') newAssetStatus = 'Lost';

      // 5. บันทึกปิด Transaction
      await client.query(
        `UPDATE transactions
         SET return_date = $1,
             staff_return_id = $2,
             status = $3,
             late_fee = $4,
             notes = COALESCE($5, notes),
             updated_at = CURRENT_TIMESTAMP
         WHERE transaction_id = $6`,
        [returnDate, staffId, finalTxStatus, lateFee, returnNotes, tx.transaction_id]
      );

      // 6. อัปเดตสถานะ Asset
      await client.query(
        `UPDATE assets
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE asset_id = $2`,
        [newAssetStatus, asset.asset_id]
      );

      // 7. ตรวจสอบว่าผู้ยืมยังมีรายการค้างส่งอื่นๆ ที่ Overdue อยู่อีกหรือไม่
      // หากไม่มีแล้ว ให้ปลดล็อกสถานะ Suspended เป็น Active อัตโนมัติ
      const remainingOverdueRes = await client.query(
        `SELECT COUNT(*) as overdue_count 
         FROM transactions 
         WHERE borrower_id = $1 AND status = 'Overdue'`,
        [tx.borrower_id]
      );

      if (parseInt(remainingOverdueRes.rows[0].overdue_count, 10) === 0) {
        await client.query(
          `UPDATE users SET status = 'Active', updated_at = CURRENT_TIMESTAMP 
           WHERE user_id = $1 AND status = 'Suspended'`,
          [tx.borrower_id]
        );
      }

      await client.query('COMMIT');

      // 8. ส่ง Notification แจ้งผู้ยืมว่าการคืนเสร็จสมบูรณ์
      notificationService.sendReturnSuccessNotification({
        borrowerName: tx.borrower_name,
        borrowerEmail: tx.borrower_email,
        lineUserId: tx.line_user_id,
        assetCode: asset.asset_code,
        assetName: asset.asset_name,
        returnDate: returnDate.toISOString(),
        lateFee,
        conditionStatus
      }).catch(err => console.error('Notification error:', err));

      return res.status(200).json({
        success: true,
        message: `คืนอุปกรณ์ ${asset.asset_code} เรียบร้อยแล้ว`,
        data: {
          assetCode: asset.asset_code,
          assetName: asset.asset_name,
          borrowerName: tx.borrower_name,
          returnDate: returnDate.toISOString(),
          conditionStatus,
          lateFee,
          newAssetStatus
        }
      });

    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Error during return:', error);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการคืนอุปกรณ์', error: error.message });
    } finally {
      client.release();
    }
  }
}
