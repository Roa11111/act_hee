// ============================================================
//  📁 lib/line.js
//  LINE Messaging API Push Service
//  รองรับการส่งแจ้งเตือนเข้ากลุ่ม (Group ID) หรือ User ID โดยตรง
// ============================================================

const https = require('https');

// Token & Group ID ที่ผู้ใช้กำหนด (อ่านจาก process.env ก่อน หากไม่มีจะใช้ค่าเริ่มต้น)
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN || "GFSQb9RjRHsIbr9RNFjoQ/ivb9uHPsEHS8kfxm5YycaetmZTIewrfDdYxKFGuhzBiEaQOx50O5ojxY9hYkBoNd8ZePtkhAAvjJxCZBXf2K7SuRf3vxMMdP2TQw2/b2DjCPfMZMkiTsj5OLChoWumQwdB04t89/1O/w1cDnyilFU=";
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID || process.env.LINE_TARGET_GROUP_ID || "C4aceef9fc4a2e95f6d26722d869b344d";

/**
 * ส่งข้อความผ่าน LINE Messaging API Push (ใช้ https ของ Node.js ไม่ต้องลง library เพิ่ม)
 * @param {string|Array<Object>} messages - ข้อความ String หรือ Array ของ LINE Message Objects
 * @param {string} [to] - ปลายทาง Group ID หรือ User ID (ค่าเริ่มต้นคือ TARGET_GROUP_ID)
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
function sendLinePush(messages, to = TARGET_GROUP_ID) {
  return new Promise((resolve) => {
    if (!LINE_ACCESS_TOKEN || !to) {
      console.warn('[LINE] Token หรือ Target ID ไม่ถูกต้อง');
      return resolve({ success: false, error: 'Missing token or target ID' });
    }

    // แปลง String เป็น Array of Text Message
    let messagePayload = [];
    if (typeof messages === 'string') {
      messagePayload = [{ type: 'text', text: messages }];
    } else if (Array.isArray(messages)) {
      messagePayload = messages.map(m => typeof m === 'string' ? { type: 'text', text: m } : m);
    } else if (typeof messages === 'object') {
      messagePayload = [messages];
    }

    const payload = JSON.stringify({
      to: to,
      messages: messagePayload
    });

    const options = {
      hostname: 'api.line.me',
      port: 443,
      path: '/v2/bot/message/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000 // 10 วินาที
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[LINE] ส่งแจ้งเตือนสำเร็จ (HTTP ' + res.statusCode + ')');
          resolve({ success: true, statusCode: res.statusCode });
        } else {
          console.error('[LINE] ส่งแจ้งเตือนไม่สำเร็จ (HTTP ' + res.statusCode + '):', data);
          resolve({ success: false, statusCode: res.statusCode, error: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[LINE] Request error:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('[LINE] Request timeout');
      resolve({ success: false, error: 'Timeout' });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * ฟังก์ชันช่วยจัดรูปแบบวันที่ภาษาไทย
 */
function formatThaiDateTime(dateInput) {
  try {
    const d = new Date(dateInput);
    return d.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bangkok'
    });
  } catch (e) {
    return String(dateInput);
  }
}

/**
 * ฟังก์ชันช่วยจัดรูปแบบวันกำหนดส่งภาษาไทย
 */
function formatThaiDate(dateInput) {
  try {
    const d = new Date(dateInput);
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Bangkok'
    });
  } catch (e) {
    return String(dateInput);
  }
}

/**
 * 📢 แจ้งเตือนเมื่อมีการยืมอุปกรณ์สำเร็จ
 * @param {Object} data
 * @param {Object} data.borrower - ข้อมูลผู้ยืม { name, studentId, email }
 * @param {Array}  data.items - รายการอุปกรณ์ [{ assetCode, assetName, dueDate }]
 * @param {string} [targetId] - ส่งเข้ากลุ่มหรือ User (default = TARGET_GROUP_ID)
 */
async function notifyBorrow({ borrower, items }, targetId = TARGET_GROUP_ID) {
  const itemListText = items
    .map((item, idx) => `${idx + 1}. [${item.assetCode}] ${item.assetName}\n   📅 กำหนดคืน: ${formatThaiDate(item.dueDate)}`)
    .join('\n');

  const text = 
`📋 [แจ้งเตือน: ทำรายการยืมสำเร็จ]
━━━━━━━━━━━━━━━━
👤 ผู้ยืม: คุณ ${borrower.name || '-'}
🆔 รหัส: ${borrower.studentId || borrower.id || '-'}
📦 อุปกรณ์ที่ยืม (${items.length} รายการ):
${itemListText}
⏰ วันที่ยืม: ${formatThaiDateTime(new Date())}
━━━━━━━━━━━━━━━━
💡 กรุณาส่งคืนตามกำหนดเวลาเพื่อหลีกเลี่ยงค่าปรับ`;

  return sendLinePush(text, targetId);
}

/**
 * 📢 แจ้งเตือนเมื่อมีการคืนอุปกรณ์สำเร็จ
 * @param {Object} data
 * @param {string} data.borrowerName
 * @param {string} data.assetCode
 * @param {string} data.assetName
 * @param {string} data.conditionStatus
 * @param {number} data.lateFee
 * @param {number} data.daysLate
 * @param {string} [targetId]
 */
async function notifyReturn(data, targetId = TARGET_GROUP_ID) {
  const conditionLabel = {
    'Normal': '✅ ปกติ (สมบูรณ์)',
    'Damaged': '⚠️ ชำรุด (ต้องส่งซ่อม)',
    'Lost': '❌ สูญหาย'
  }[data.conditionStatus] || data.conditionStatus || 'ปกติ';

  let feeText = '✨ ส่งคืนตามกำหนด (ไม่มีค่าปรับ)';
  if (data.lateFee && data.lateFee > 0) {
    feeText = `⚠️ เกินกำหนด ${data.daysLate || 1} วัน: ค่าปรับ ${Number(data.lateFee).toFixed(2)} บาท`;
  }

  const text = 
`✅ [แจ้งเตือน: คืนอุปกรณ์เรียบร้อย]
━━━━━━━━━━━━━━━━
👤 ผู้คืน: คุณ ${data.borrowerName || '-'}
📦 อุปกรณ์: [${data.assetCode}] ${data.assetName}
🔍 สภาพอุปกรณ์: ${conditionLabel}
💰 ค่าปรับ: ${feeText}
🕒 เวลาคืน: ${formatThaiDateTime(new Date())}
━━━━━━━━━━━━━━━━
ขอบคุณที่นำอุปกรณ์มาส่งคืนครับ/ค่ะ`;

  return sendLinePush(text, targetId);
}

/**
 * 📢 แจ้งเตือนรายการค้างส่ง / เกินกำหนด (Overdue Alert)
 * @param {Array} overdueItems - รายการที่เกินกำหนด
 * @param {string} [targetId]
 */
async function notifyOverdue(overdueItems, targetId = TARGET_GROUP_ID) {
  if (!overdueItems || overdueItems.length === 0) return { success: true };

  const listText = overdueItems.slice(0, 10).map((item, idx) => 
    `${idx + 1}. [${item.asset_code}] ${item.asset_name}\n   ผู้ยืม: ${item.borrower_name} (เกิน ${item.days_overdue} วัน)`
  ).join('\n');

  const text = 
`🚨 [แจ้งเตือน: อุปกรณ์เกินกำหนดส่งคืน]
━━━━━━━━━━━━━━━━
พบรายการค้างส่งทั้งหมด ${overdueItems.length} รายการ:
${listText}
${overdueItems.length > 10 ? `...และอีก ${overdueItems.length - 10} รายการ\n` : ''}━━━━━━━━━━━━━━━━
กรุณาประสานงานเพื่อติดตามอุปกรณ์ส่งคืนโดยด่วน`;

  return sendLinePush(text, targetId);
}

module.exports = {
  LINE_ACCESS_TOKEN,
  TARGET_GROUP_ID,
  sendLinePush,
  notifyBorrow,
  notifyReturn,
  notifyOverdue
};
