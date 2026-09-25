// ============================================================
//  📁 gas/services/NotificationService.js
//  บริการส่งการแจ้งเตือนผ่าน Email (GmailApp)
//
//  ※ Google Apps Script ใช้ GmailApp และ UrlFetchApp แทน nodemailer/axios
//  ※ นำไฟล์นี้ไปวางใน Google Apps Script Project
// ============================================================

/**
 * ส่งแจ้งเตือนยืนยันการยืมอุปกรณ์สำเร็จทาง Email
 * @param {Object} data
 * @param {Object}   data.user  - ข้อมูลผู้ยืม
 * @param {Array}    data.items - รายการอุปกรณ์ที่ยืม
 */
function sendBorrowSuccessNotification(data) {
  try {
    const { user, items } = data;
    if (!user['email']) return;

    const itemListHtml = items.map(item => `
      <tr>
        <td style="padding:6px 12px; border-bottom:1px solid #eee;">[${item.assetCode}] ${item.assetName}</td>
        <td style="padding:6px 12px; border-bottom:1px solid #eee; color:#e67e22;">
          ${new Date(item.dueDate).toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' })}
        </td>
      </tr>
    `).join('');

    const htmlBody = `
      <div style="font-family:Sarabun,sans-serif; max-width:560px; margin:auto; border:1px solid #ddd; border-radius:8px; overflow:hidden;">
        <div style="background:#1a73e8; color:#fff; padding:20px 24px;">
          <h2 style="margin:0;">📋 ยืนยันการยืมอุปกรณ์สำเร็จ</h2>
        </div>
        <div style="padding:20px 24px;">
          <p>เรียน คุณ<strong>${user['full_name']}</strong>,</p>
          <p>ระบบได้บันทึกรายการยืมอุปกรณ์ของท่านเรียบร้อยแล้ว ดังนี้:</p>
          <table style="width:100%; border-collapse:collapse; margin:12px 0;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="padding:8px 12px; text-align:left;">อุปกรณ์</th>
                <th style="padding:8px 12px; text-align:left;">กำหนดคืน</th>
              </tr>
            </thead>
            <tbody>${itemListHtml}</tbody>
          </table>
          <p style="color:#c0392b;">⚠️ โปรดส่งคืนอุปกรณ์ตามกำหนดเวลาเพื่อหลีกเลี่ยงค่าปรับ</p>
        </div>
        <div style="background:#f9f9f9; padding:12px 24px; font-size:12px; color:#888;">
          ระบบยืม-คืนอุปกรณ์อัตโนมัติ | อีเมลนี้ส่งจากระบบโดยอัตโนมัติ ไม่ต้องตอบกลับ
        </div>
      </div>
    `;

    GmailApp.sendEmail(
      user['email'],
      '✅ แจ้งยืนยันรายการยืมอุปกรณ์สำเร็จ',
      `คุณ ${user['full_name']} ได้ยืมอุปกรณ์ ${items.length} รายการ`,
      { htmlBody }
    );

  } catch (e) {
    Logger.log('[sendBorrowSuccessNotification] Error: ' + e.message);
  }
}

/**
 * ส่งแจ้งเตือนยืนยันการคืนอุปกรณ์ทาง Email
 * @param {Object} data
 * @param {string} data.borrowerName
 * @param {string} data.borrowerEmail
 * @param {string} data.assetCode
 * @param {string} data.assetName
 * @param {string} data.returnDate
 * @param {number} data.lateFee
 * @param {string} data.conditionStatus
 */
function sendReturnSuccessNotification(data) {
  try {
    if (!data.borrowerEmail) return;

    const lateFeeSection = data.lateFee > 0
      ? `<p style="color:#c0392b;">⚠️ มีค่าปรับเกินกำหนด: <strong>${data.lateFee.toFixed(2)} บาท</strong> (กรุณาชำระที่เจ้าหน้าที่)</p>`
      : `<p style="color:#27ae60;">✅ ส่งคืนตามกำหนด ไม่มีค่าปรับ</p>`;

    const htmlBody = `
      <div style="font-family:Sarabun,sans-serif; max-width:560px; margin:auto; border:1px solid #ddd; border-radius:8px; overflow:hidden;">
        <div style="background:#27ae60; color:#fff; padding:20px 24px;">
          <h2 style="margin:0;">✅ คืนอุปกรณ์เรียบร้อยแล้ว</h2>
        </div>
        <div style="padding:20px 24px;">
          <p>เรียน คุณ<strong>${data.borrowerName}</strong>,</p>
          <table style="width:100%; border-collapse:collapse; margin:12px 0;">
            <tr><td style="padding:6px; color:#666;">อุปกรณ์</td>
                <td style="padding:6px;"><strong>[${data.assetCode}] ${data.assetName}</strong></td></tr>
            <tr><td style="padding:6px; color:#666;">เวลาที่คืน</td>
                <td style="padding:6px;">${new Date(data.returnDate).toLocaleString('th-TH')}</td></tr>
            <tr><td style="padding:6px; color:#666;">สภาพอุปกรณ์</td>
                <td style="padding:6px;">${data.conditionStatus}</td></tr>
          </table>
          ${lateFeeSection}
          <p>ขอบคุณที่ใช้บริการ</p>
        </div>
        <div style="background:#f9f9f9; padding:12px 24px; font-size:12px; color:#888;">
          ระบบยืม-คืนอุปกรณ์อัตโนมัติ | อีเมลนี้ส่งจากระบบโดยอัตโนมัติ ไม่ต้องตอบกลับ
        </div>
      </div>
    `;

    GmailApp.sendEmail(
      data.borrowerEmail,
      `✅ แจ้งยืนยันการคืนอุปกรณ์ [${data.assetCode}]`,
      `คุณ ${data.borrowerName} ได้คืนอุปกรณ์ ${data.assetName} เรียบร้อยแล้ว`,
      { htmlBody }
    );

  } catch (e) {
    Logger.log('[sendReturnSuccessNotification] Error: ' + e.message);
  }
}
