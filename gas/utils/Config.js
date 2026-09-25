// ============================================================
//  📁 gas/utils/Config.js
//  ตั้งค่าส่วนกลาง: Spreadsheet ID, ชื่อ Sheet, และค่าคงที่
//  ※ นำไฟล์นี้ไปวางใน Google Apps Script Project (Script Editor)
// ============================================================

/** @const {string} ID ของ Google Spreadsheet ที่ใช้เป็นฐานข้อมูล */
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← แทนด้วย ID จริงจาก URL ของ Spreadsheet

/** ชื่อ Sheet แต่ละแผ่นใน Spreadsheet */
const SHEET_NAMES = {
  USERS:        'Users',         // ข้อมูลผู้ใช้ / ผู้ยืม
  ASSETS:       'Assets',        // ข้อมูลอุปกรณ์
  CATEGORIES:   'Categories',    // หมวดหมู่อุปกรณ์
  TRANSACTIONS: 'Transactions',  // ประวัติการยืม-คืน
  LOGS:         'Logs',          // Log การทำงานของระบบ
};

/** สถานะของ Transaction */
const TX_STATUS = {
  ACTIVE:    'Active',
  RETURNED:  'Returned',
  OVERDUE:   'Overdue',
  DAMAGED:   'Damaged',
  LOST:      'Lost',
};

/** สถานะของ Asset */
const ASSET_STATUS = {
  AVAILABLE:   'Available',
  BORROWED:    'Borrowed',
  MAINTENANCE: 'Maintenance',
  LOST:        'Lost',
};

/** สถานะของ User */
const USER_STATUS = {
  ACTIVE:    'Active',
  SUSPENDED: 'Suspended',
  INACTIVE:  'Inactive',
};

/** ชั่วโมงกำหนดส่งคืน (17:00 น.) */
const DUE_HOUR = 17;

/** จำนวนวันยืมสูงสุดเริ่มต้น (ถ้าหมวดหมู่ไม่ได้กำหนด) */
const DEFAULT_BORROW_DAYS = 7;

/** ค่าปรับต่อวัน (บาท) เริ่มต้น */
const DEFAULT_FINE_PER_DAY = 20;
