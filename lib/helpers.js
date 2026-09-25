// ============================================================
//  📁 lib/helpers.js
//  Utility functions สำหรับ Vercel API Routes
// ============================================================

/**
 * ส่ง JSON response พร้อม CORS headers
 */
function sendJson(res, statusCode, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(statusCode).json(body);
}

/**
 * ส่ง success response
 */
function sendSuccess(res, data, message = 'สำเร็จ', statusCode = 200) {
  sendJson(res, statusCode, { success: true, message, data });
}

/**
 * ส่ง error response
 */
function sendError(res, statusCode, message, details = null) {
  const body = { success: false, message };
  if (details) body.details = details;
  sendJson(res, statusCode, body);
}

/**
 * Parse JSON body จาก request (Vercel มี bodyParser ให้แต่เผื่อกรณี raw)
 */
function parseBody(req) {
  if (req.body) return req.body;
  return {};
}

/**
 * จัดการ CORS preflight (OPTIONS)
 * @returns {boolean} true ถ้าเป็น OPTIONS แล้ว handled ไปแล้ว
 */
function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { sendJson, sendSuccess, sendError, parseBody, handleCors };
