// ============================================================
//  📁 server.js
//  Node.js Local Development & Production Server
//  รันด้วย: node server.js
//  รองรับ:
//    - การเสิร์ฟหน้าเว็บ index.html (Frontend)
//    - การเรียก API Routes ในโฟลเดอร์ api/
//    - เชื่อมต่อ Aiven MySQL + ส่ง LINE Messaging API
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// โหลด Environment Variables จาก .env
try {
  require('dotenv').config();
} catch (e) {}

const PORT = process.env.PORT || 3000;

// แผนที่เส้นทาง API ที่เจาะจง
const API_ROUTES = {
  '/api/health': './api/health.js',
  '/api/dashboard': './api/dashboard.js',
  '/api/line-test': './api/line-test.js',
  '/api/cron-check': './api/cron-check.js',
  '/api/assets': './api/assets/index.js',
  '/api/assets/scan': './api/assets/scan/index.js',
  '/api/users': './api/users/index.js',
  '/api/users/scan': './api/users/scan/index.js',
  '/api/categories': './api/categories/index.js',
  '/api/transactions': './api/transactions/index.js',
  '/api/transactions/borrow': './api/transactions/borrow.js',
  '/api/transactions/return': './api/transactions/return.js'
};

/**
 * เติม Helper Functions ให้กับ req และ res เพื่อให้เข้ากันได้กับ Vercel Serverless Function
 */
function enhanceReqRes(req, res, parsedUrl) {
  req.query = parsedUrl.query;

  // res.status(code)
  res.status = function(code) {
    res.statusCode = code;
    return res;
  };

  // res.json(data)
  res.json = function(data) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };
}

/**
 * อ่าน Body ของ Request
 */
function parseRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // ป้องกัน payload ขนาดใหญ่เกิน 5MB
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve(body);
      }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname.replace(/\/$/, '') || '/';

  // ตั้งค่า CORS เบื้องต้น
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // 1. ตรวจสอบว่าเป็นคำขอ API หรือไม่
  if (pathname.startsWith('/api')) {
    enhanceReqRes(req, res, parsedUrl);
    req.body = await parseRequestBody(req);

    const routeFile = API_ROUTES[pathname];
    if (routeFile && fs.existsSync(path.resolve(__dirname, routeFile))) {
      try {
        const handler = require(path.resolve(__dirname, routeFile));
        await handler(req, res);
      } catch (err) {
        console.error(`[API Error] ${pathname}:`, err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
      }
      return;
    } else {
      res.status(404).json({ success: false, message: `Route ${pathname} not found` });
      return;
    }
  }

  // 2. เสิร์ฟ Static Files (index.html เป็นหลัก)
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // ถ้าไฟล์ไม่มี ให้ fallback ไปที่ index.html (SPA routing)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.statusCode = 500;
      res.end('Error loading ' + pathname);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 Smart QR Asset System (Node.js Server) พร้อมทำงาน!`);
  console.log(`🌐 เข้าใช้งานได้ที่: http://localhost:${PORT}`);
  console.log(`📡 MySQL: ${process.env.MYSQL_HOST || 'Aiven MySQL'}`);
  console.log(`💬 LINE Target Group: ${process.env.TARGET_GROUP_ID || 'C4aceef9fc4a2e95f6d26722d869b344d'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
