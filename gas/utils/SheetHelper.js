// ============================================================
//  📁 gas/utils/SheetHelper.js
//  Helper Functions สำหรับอ่าน/เขียน Google Sheets
//  ※ นำไฟล์นี้ไปวางใน Google Apps Script Project
// ============================================================

/**
 * เปิด Spreadsheet และคืน Sheet ตามชื่อที่ระบุ
 * @param {string} sheetName - ชื่อ Sheet ใน Spreadsheet
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`ไม่พบ Sheet ชื่อ "${sheetName}" ใน Spreadsheet`);
  return sheet;
}

/**
 * อ่านข้อมูลทั้งหมดจาก Sheet แล้วแปลงเป็น Array of Objects
 * (แถวแรกถือเป็น Header)
 * @param {string} sheetName
 * @returns {Array<Object>}
 */
function getAllRows(sheetName) {
  const sheet = getSheet(sheetName);
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  return data.slice(1).map((row, rowIndex) => {
    const obj = { _rowIndex: rowIndex + 2 }; // +2 เพราะ index 0-based + header row
    headers.forEach((header, colIndex) => {
      obj[header] = row[colIndex];
    });
    return obj;
  });
}

/**
 * ค้นหาแถวเดียวโดย Field และค่าที่ต้องการ (case-insensitive)
 * @param {string} sheetName
 * @param {string} field  - ชื่อ Column (Header)
 * @param {*}      value  - ค่าที่ต้องการค้นหา
 * @returns {Object|null}
 */
function findRowBy(sheetName, field, value) {
  const rows = getAllRows(sheetName);
  return rows.find(row => String(row[field]).toLowerCase() === String(value).toLowerCase()) || null;
}

/**
 * เพิ่มแถวใหม่ต่อท้าย Sheet
 * @param {string}   sheetName
 * @param {Array<*>} rowData - ข้อมูลในแต่ละ Column ตามลำดับ Header
 * @returns {number} หมายเลขแถวที่เพิ่ม
 */
function appendRow(sheetName, rowData) {
  const sheet    = getSheet(sheetName);
  const lastRow  = sheet.getLastRow() + 1;
  sheet.getRange(lastRow, 1, 1, rowData.length).setValues([rowData]);
  return lastRow;
}

/**
 * แก้ไขค่าใน Cell เดียว
 * @param {string} sheetName
 * @param {number} rowIndex  - หมายเลขแถว (1-based)
 * @param {string} colHeader - ชื่อ Column (Header)
 * @param {*}      newValue
 */
function updateCell(sheetName, rowIndex, colHeader, newValue) {
  const sheet   = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = headers.indexOf(colHeader) + 1;
  if (colIndex === 0) throw new Error(`ไม่พบ Column "${colHeader}" ใน Sheet "${sheetName}"`);
  sheet.getRange(rowIndex, colIndex).setValue(newValue);
}

/**
 * แก้ไขหลาย Field พร้อมกันในแถวเดียว
 * @param {string} sheetName
 * @param {number} rowIndex
 * @param {Object} updates - { columnHeader: newValue, ... }
 */
function updateRowFields(sheetName, rowIndex, updates) {
  const sheet   = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Object.entries(updates).forEach(([colHeader, newValue]) => {
    const colIndex = headers.indexOf(colHeader) + 1;
    if (colIndex > 0) {
      sheet.getRange(rowIndex, colIndex).setValue(newValue);
    }
  });
}

/**
 * สร้าง Timestamp ปัจจุบันในรูปแบบ ISO 8601 (ภาษาไทย UTC+7)
 * @returns {string}
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * สร้าง ID แบบ UUID v4 (อย่างง่าย)
 * @returns {string}
 */
function generateId() {
  return Utilities.getUuid();
}
