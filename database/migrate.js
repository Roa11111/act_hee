// ============================================================
//  📁 database/migrate.js
//  สคริปต์รัน schema.sql เข้า Aiven for MySQL โดยอัตโนมัติ
//  รันด้วย: node database/migrate.js
// ============================================================

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

try {
  require('dotenv').config();
} catch (e) {}

async function migrate() {
  console.log('🚀 กำลังเชื่อมต่อกับ Aiven for MySQL...');
  console.log(`📡 Host: ${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT}`);
  console.log(`👤 User: ${process.env.MYSQL_USER}`);
  console.log(`🗄️  Database: ${process.env.MYSQL_DATABASE || 'defaultdb'}`);

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'defaultdb',
      multipleStatements: true, // สำคัญ: รองรับการรัน SQL script ทั้งไฟล์
      ssl: {
        rejectUnauthorized: false,
      },
    });

    console.log('✅ เชื่อมต่อ MySQL สำเร็จแล้ว!');

    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log(`⏳ กำลังรัน schema.sql เพื่อสร้างตารางใน '${process.env.MYSQL_DATABASE || 'defaultdb'}'...`);
    await connection.query(sql);

    console.log('🎉 สร้างตารางและเพิ่มข้อมูลเริ่มต้นใน Aiven MySQL เรียบร้อยแล้ว!');
    console.log('ตารางที่ถูกสร้าง: users, categories, assets, transactions, system_settings');
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', err.message);
  } finally {
    if (connection) await connection.end();
  }
}

migrate();
