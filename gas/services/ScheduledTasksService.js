// ============================================================
//  📁 gas/services/ScheduledTasksService.js
//  งาน Cron อัตโนมัติ: แจ้งเตือนล่วงหน้า & จัดการ Overdue
//
//  วิธีตั้ง Trigger ใน Apps Script:
//    Extensions → Apps Script → Triggers → + Add Trigger
//    checkPreDueReminders    → Time-driven → Day timer → 8:00–9:00 AM
//    handleOverdueTransactions → Time-driven → Day timer → 6:00–7:00 PM
//
//  ※ นำไฟล์นี้ไปวางใน Google Apps Script Project
// ============================================================

/**
 * WORKFLOW 4 (A): แจ้งเตือนล่วงหน้า 1 วันก่อนครบกำหนดคืน
 * ตั้ง Time-driven Trigger: ทุกวัน เวลา 08:00–09:00 น.
 */
function checkPreDueReminders() {
  Logger.log('[CRON] เริ่มตรวจสอบ Pre-Due Reminders...');
  try {
    const now       = new Date();
    const tomorrow  = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999); // ครอบคลุมทั้งวันพรุ่งนี้

    const allTx     = getAllRows(SHEET_NAMES.TRANSACTIONS);
    const allAssets = getAllRows(SHEET_NAMES.ASSETS);
    const allUsers  = getAllRows(SHEET_NAMES.USERS);

    const dueTomorrow = allTx.filter(tx => {
      if (tx['status'] !== TX_STATUS.ACTIVE) return false;
      const due = new Date(tx['due_date']);
      return due >= now && due <= tomorrow;
    });

    Logger.log(`[CRON] พบรายการที่จะครบกำหนดพรุ่งนี้ ${dueTomorrow.length} รายการ`);

    for (const tx of dueTomorrow) {
      const asset = allAssets.find(a => String(a['asset_id']) === String(tx['asset_id']));
      const user  = allUsers.find(u => String(u['user_id']) === String(tx['borrower_id']));

      if (!asset || !user) continue;

      const dueFormatted = new Date(tx['due_date']).toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      // ส่ง Email แจ้งเตือน
      if (user['email']) {
        try {
          GmailApp.sendEmail(
            user['email'],
            `⏰ แจ้งเตือน: อุปกรณ์ [${asset['asset_code']}] ครบกำหนดคืนพรุ่งนี้`,
            '',
            {
              htmlBody: `
                <div style="font-family:Sarabun,sans-serif; padding:20px;">
                  <h3>⏰ แจ้งเตือนการส่งคืนอุปกรณ์</h3>
                  <p>เรียน คุณ<strong>${user['full_name']}</strong>,</p>
                  <p>อุปกรณ์ <strong>[${asset['asset_code']}] ${asset['asset_name']}</strong> 
                     ของท่านมีกำหนดคืนในวันพรุ่งนี้ <strong style="color:#e67e22;">(${dueFormatted})</strong></p>
                  <p>กรุณานำมาส่งคืนก่อนเวลา 17:00 น. เพื่อหลีกเลี่ยงค่าปรับ</p>
                  <p>ขอบคุณ</p>
                </div>
              `
            }
          );
        } catch (emailErr) {
          Logger.log(`[CRON] ส่ง Email ล้มเหลวสำหรับ user ${user['user_id']}: ${emailErr.message}`);
        }
      }
    }

    Logger.log('[CRON] Pre-Due Reminders เสร็จสิ้น');
  } catch (e) {
    Logger.log('[CRON] Error in checkPreDueReminders: ' + e.message);
  }
}

/**
 * WORKFLOW 4 (B): ปรับสถานะ Overdue และ Auto-Suspend ผู้ยืมที่เกินกำหนด
 * ตั้ง Time-driven Trigger: ทุกวัน เวลา 18:00–19:00 น.
 */
function handleOverdueTransactions() {
  Logger.log('[CRON] เริ่มตรวจสอบ Overdue Transactions...');
  try {
    const now = new Date();

    // ── 1. ค้นหา Transaction ที่เลย due_date และยังเป็น Active ──
    const allTx = getAllRows(SHEET_NAMES.TRANSACTIONS);
    const overdueList = allTx.filter(tx =>
      tx['status'] === TX_STATUS.ACTIVE &&
      new Date(tx['due_date']) < now
    );

    Logger.log(`[CRON] พบรายการ Overdue ${overdueList.length} รายการ`);

    const overdueUserIds = new Set();

    for (const tx of overdueList) {
      // อัปเดต Transaction เป็น Overdue
      updateRowFields(SHEET_NAMES.TRANSACTIONS, tx['_rowIndex'], {
        'status':     TX_STATUS.OVERDUE,
        'updated_at': now.toISOString(),
      });
      overdueUserIds.add(String(tx['borrower_id']));
    }

    // ── 2. ปรับสถานะ Users ที่มี Overdue เป็น Suspended ──
    if (overdueUserIds.size > 0) {
      const allUsers = getAllRows(SHEET_NAMES.USERS);
      let suspendedCount = 0;

      for (const user of allUsers) {
        if (overdueUserIds.has(String(user['user_id'])) && user['status'] !== USER_STATUS.SUSPENDED) {
          updateRowFields(SHEET_NAMES.USERS, user['_rowIndex'], {
            'status':     USER_STATUS.SUSPENDED,
            'updated_at': now.toISOString(),
          });
          suspendedCount++;
        }
      }

      Logger.log(`[CRON] ระงับ (Suspended) ${suspendedCount} ผู้ใช้ที่มีรายการค้างส่ง`);
    }

    Logger.log('[CRON] handleOverdueTransactions เสร็จสิ้น');
  } catch (e) {
    Logger.log('[CRON] Error in handleOverdueTransactions: ' + e.message);
  }
}
