// ============================================================
//  📁 gas/Code.js  ← จุดเข้าหลัก (Entry Point) ของ Apps Script
//
//  ไฟล์นี้ทำหน้าที่:
//    doGet()  → เสิร์ฟ index.html ให้ Browser
//
//  ฟังก์ชันทั้งหมดที่ HTML จะเรียกผ่าน google.script.run:
//    ✅ scanBorrower(userQrCode)       → BorrowReturnController.js
//    ✅ borrowAssets(payload)          → BorrowReturnController.js
//    ✅ returnAsset(payload)           → BorrowReturnController.js
//    ✅ checkPreDueReminders()         → ScheduledTasksService.js  (Trigger)
//    ✅ handleOverdueTransactions()    → ScheduledTasksService.js  (Trigger)
//
//  ※ Apps Script รวมไฟล์ทุกไฟล์ใน Project เป็น Scope เดียวกัน
//    จึงสามารถเรียก function ข้ามไฟล์ได้โดยตรง
// ============================================================

/**
 * Entry Point: เสิร์ฟ HTML Page ให้กับ Browser
 * เรียกเมื่อผู้ใช้เปิด URL ของ Web App
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('index') // ← สร้างจากไฟล์ index.html ใน Project
    .setTitle('ระบบยืม-คืนอุปกรณ์การเรียนและสำนักงาน')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
