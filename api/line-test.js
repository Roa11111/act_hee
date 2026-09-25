// ============================================================
//  📁 api/line-test.js
//  ทดสอบการส่งข้อความเข้ากลุ่ม LINE Group ผ่าน LINE Messaging API
//  GET /api/line-test
// ============================================================

const { sendLinePush, TARGET_GROUP_ID } = require('../lib/line');
const { sendSuccess, sendError, handleCors } = require('../lib/helpers');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const testMessage = 
`🔔 [ทดสอบระบบแจ้งเตือน LINE Messaging API]
━━━━━━━━━━━━━━━━
✅ ระบบเชื่อมต่อสำเร็จ!
🕒 เวลาทดสอบ: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
🎯 ปลายทาง Group ID: ${TARGET_GROUP_ID}
━━━━━━━━━━━━━━━━
ระบบยืม-คืนอุปกรณ์การเรียนและสำนักงาน (Node.js)`;

  try {
    const result = await sendLinePush(testMessage);
    if (result.success) {
      return sendSuccess(res, {
        targetGroupId: TARGET_GROUP_ID,
        statusCode: result.statusCode,
      }, 'ส่งข้อความทดสอบเข้า LINE Group สำเร็จ!');
    } else {
      return sendError(res, 400, 'ส่งข้อความไม่สำเร็จ', result.error);
    }
  } catch (err) {
    return sendError(res, 500, 'เกิดข้อผิดพลาดในการเชื่อมต่อ LINE API', err.message);
  }
};
