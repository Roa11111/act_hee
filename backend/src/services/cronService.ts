import cron from 'node-cron';
import { Pool } from 'pg';
import { NotificationService } from './notificationService';

declare const dbPool: Pool;
const notificationService = new NotificationService();

/**
 * Workflow 4: ระบบแจ้งเตือนอัตโนมัติและจัดการ Overdue อัตโนมัติ
 */
export class ScheduledTasksService {
  public static initJobs() {
    // 1. ส่งแจ้งเตือนล่วงหน้า 1 วัน (Pre-Due Reminder) ทำงานทุกวันเวลา 08:30 น.
    cron.schedule('30 8 * * *', async () => {
      console.log('[CRON] Running Pre-Due Reminder check...');
      await ScheduledTasksService.checkPreDueReminders();
    });

    // 2. ตรวจสอบรายการเกินกำหนดส่ง (Overdue Alert & Auto-Suspend) ทำงานทุกวันเวลา 18:00 น.
    cron.schedule('0 18 * * *', async () => {
      console.log('[CRON] Running Overdue and Auto-Suspend check...');
      await ScheduledTasksService.handleOverdueTransactions();
    });
  }

  /**
   * แจ้งเตือนก่อนครบกำหนดคืน 1 วัน
   */
  private static async checkPreDueReminders() {
    const client = await dbPool.connect();
    try {
      // ค้นหารายการที่จะครบกำหนดในอีก 24 ชั่วโมงข้างหน้า
      const res = await client.query(`
        SELECT t.transaction_id, t.due_date, a.asset_code, a.asset_name,
               u.full_name, u.email, u.line_user_id
        FROM transactions t
        JOIN assets a ON t.asset_id = a.asset_id
        JOIN users u ON t.borrower_id = u.user_id
        WHERE t.status = 'Active' 
          AND t.due_date BETWEEN CURRENT_TIMESTAMP AND (CURRENT_TIMESTAMP + INTERVAL '1 day')
      `);

      for (const item of res.rows) {
        const text = `⏰ แจ้งเตือนล่วงหน้า: อุปกรณ์ [${item.asset_code}] ${item.asset_name} ของคุณมีกำหนดคืนในวันพรุ่งนี้ (${new Date(item.due_date).toLocaleDateString('th-TH')}) กรุณาส่งคืนตามกำหนด`;
        if (item.line_user_id) {
          await notificationService.sendLinePush(item.line_user_id, text);
        }
      }
    } catch (err) {
      console.error('[CRON] Error in checkPreDueReminders:', err);
    } finally {
      client.release();
    }
  }

  /**
   * ปรับสถานะรายการที่เลยกำหนดเป็น Overdue และปรับผู้ใช้เป็น Suspended
   */
  private static async handleOverdueTransactions() {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      // 1. ปรับสถานะ Transaction ที่เลย due_date ให้เป็น Overdue
      const updateTxRes = await client.query(`
        UPDATE transactions
        SET status = 'Overdue', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'Active' AND due_date < CURRENT_TIMESTAMP
        RETURNING borrower_id, asset_id
      `);

      // 2. ปรับสถานะ Users ที่มีรายการค้างส่งให้เป็น 'Suspended'
      if (updateTxRes.rowCount > 0) {
        const userIds = Array.from(new Set(updateTxRes.rows.map(r => r.borrower_id)));
        await client.query(`
          UPDATE users
          SET status = 'Suspended', updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ANY($1::int[]) AND status != 'Suspended'
        `, [userIds]);

        console.log(`[CRON] Updated ${updateTxRes.rowCount} overdue items. Suspended ${userIds.length} users.`);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[CRON] Error in handleOverdueTransactions:', err);
    } finally {
      client.release();
    }
  }
}
