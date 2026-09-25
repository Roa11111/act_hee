// ============================================================
//  📁 gas/controllers/BorrowReturnController.js
//  ฟังก์ชันหลักที่ HTML เรียกผ่าน google.script.run
//
//  Workflow ที่รองรับ:
//    borrowAssets()  → Workflow 2(A): ยืมอุปกรณ์ผ่านจุดบริการ
//    returnAsset()   → Workflow 3  : คืนอุปกรณ์
//    scanBorrower()  → Workflow 1  : สแกนตรวจสอบข้อมูลผู้ยืม
//
//  ※ นำไฟล์นี้ไปวางใน Google Apps Script Project
// ============================================================

// ─────────────────────────────────────────────
//  WORKFLOW 1: สแกนตรวจสอบข้อมูลผู้ยืม
// ─────────────────────────────────────────────

/**
 * ค้นหาข้อมูลผู้ยืมจาก QR Code ที่สแกนได้
 * เรียกจาก HTML: google.script.run.withSuccessHandler(fn).scanBorrower(qrCode)
 *
 * @param {string} userQrCode - ค่าที่อ่านได้จาก QR Code ของผู้ยืม
 * @returns {Object} { success, data } หรือ { success: false, message }
 */
function scanBorrower(userQrCode) {
  try {
    if (!userQrCode) {
      return { success: false, message: 'กรุณาระบุ QR Code ของผู้ยืม' };
    }

    // ── 1. ค้นหาผู้ยืมจาก Sheet "Users" ──
    const user = findRowBy(SHEET_NAMES.USERS, 'user_qr_code', userQrCode);
    if (!user) {
      return { success: false, message: 'ไม่พบข้อมูลผู้ยืมจาก QR Code นี้' };
    }

    // ── 2. นับจำนวนรายการยืมที่ยังค้างอยู่ (Active / Overdue) ──
    const allTx = getAllRows(SHEET_NAMES.TRANSACTIONS);
    const activeTx = allTx.filter(tx =>
      String(tx['borrower_id']) === String(user['user_id']) &&
      (tx['status'] === TX_STATUS.ACTIVE || tx['status'] === TX_STATUS.OVERDUE)
    );

    return {
      success: true,
      data: {
        userId:              user['user_id'],
        studentId:           user['student_id'],
        fullName:            user['full_name'],
        email:               user['email'],
        phone:               user['phone'],
        role:                user['role'],
        status:              user['status'],
        currentActiveBorrows: activeTx.length,
        maxBorrowLimit:      Number(user['max_borrow_limit']) || 3,
        canBorrow:           user['status'] === USER_STATUS.ACTIVE,
      }
    };

  } catch (e) {
    Logger.log('[scanBorrower] Error: ' + e.message);
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ─────────────────────────────────────────────
//  WORKFLOW 2(A): ยืมอุปกรณ์ผ่านจุดบริการ
// ─────────────────────────────────────────────

/**
 * บันทึกรายการยืมอุปกรณ์ (รองรับหลายชิ้นพร้อมกัน)
 * เรียกจาก HTML: google.script.run.withSuccessHandler(fn).borrowAssets(payload)
 *
 * @param {Object} payload
 * @param {string}   payload.borrowerQrCode  - QR Code ผู้ยืม
 * @param {string[]} payload.assetQrCodes    - Array ของ QR Code อุปกรณ์ที่จะยืม
 * @param {string}   [payload.staffId]       - ID เจ้าหน้าที่ที่ทำรายการ
 * @param {string}   [payload.notes]         - หมายเหตุ
 * @returns {Object} { success, message, data }
 */
function borrowAssets(payload) {
  try {
    const { borrowerQrCode, assetQrCodes, staffId, notes } = payload;

    // ── Validate Input ──
    if (!borrowerQrCode || !Array.isArray(assetQrCodes) || assetQrCodes.length === 0) {
      return {
        success: false,
        message: 'กรุณาระบุ QR Code ของผู้ยืม และ QR Code ของอุปกรณ์อย่างน้อย 1 ชิ้น'
      };
    }

    // ── 1. ตรวจสอบข้อมูลผู้ยืม ──
    const user = findRowBy(SHEET_NAMES.USERS, 'user_qr_code', borrowerQrCode);
    if (!user) {
      return { success: false, message: 'ไม่พบข้อมูลผู้ยืมจาก QR Code นี้' };
    }

    // ── ตรวจสอบสถานะ Suspended ──
    if (user['status'] === USER_STATUS.SUSPENDED) {
      return {
        success: false,
        code: 'USER_SUSPENDED',
        message: `ไม่สามารถทำรายการได้ ผู้ยืม (${user['full_name']}) ติดสถานะระงับการใช้งานเนื่องจากมีรายการค้างส่ง`
      };
    }

    // ── 2. ตรวจสอบสิทธิ์การยืม (Borrow Limit) ──
    const allTx = getAllRows(SHEET_NAMES.TRANSACTIONS);
    const activeTxCount = allTx.filter(tx =>
      String(tx['borrower_id']) === String(user['user_id']) &&
      (tx['status'] === TX_STATUS.ACTIVE || tx['status'] === TX_STATUS.OVERDUE)
    ).length;

    const maxLimit       = Number(user['max_borrow_limit']) || 3;
    const totalAfterBorrow = activeTxCount + assetQrCodes.length;

    if (totalAfterBorrow > maxLimit) {
      return {
        success: false,
        code: 'BORROW_LIMIT_EXCEEDED',
        message: `จำนวนการยืมเกินสิทธิ์สูงสุด (ยืมอยู่ ${activeTxCount} ชิ้น, ครั้งนี้ ${assetQrCodes.length} ชิ้น, สิทธิ์สูงสุด ${maxLimit} ชิ้น)`
      };
    }

    // ── 3. ตรวจสอบและบันทึกอุปกรณ์ทีละชิ้น ──
    const allCategories  = getAllRows(SHEET_NAMES.CATEGORIES);
    const borrowedDetails = [];
    const borrowDate     = new Date();

    for (const assetQr of assetQrCodes) {
      // หาอุปกรณ์จาก QR Code
      const asset = findRowBy(SHEET_NAMES.ASSETS, 'qr_code_hash', assetQr);
      if (!asset) {
        return { success: false, message: `ไม่พบอุปกรณ์รหัส QR: ${assetQr}` };
      }

      // ตรวจสอบสถานะ Available
      if (asset['status'] !== ASSET_STATUS.AVAILABLE) {
        return {
          success: false,
          code: 'ASSET_NOT_AVAILABLE',
          message: `อุปกรณ์ ${asset['asset_code']} (${asset['asset_name']}) อยู่ในสถานะ "${asset['status']}" ไม่พร้อมให้ยืม`
        };
      }

      // หาข้อมูลหมวดหมู่เพื่อคำนวณวันครบกำหนด
      const category = allCategories.find(c => String(c['category_id']) === String(asset['category_id']));
      const maxBorrowDays = category ? (Number(category['max_borrow_days']) || DEFAULT_BORROW_DAYS) : DEFAULT_BORROW_DAYS;

      const dueDate = new Date(borrowDate);
      dueDate.setDate(dueDate.getDate() + maxBorrowDays);
      dueDate.setHours(DUE_HOUR, 0, 0, 0); // กำหนดส่งคืน 17:00 น.

      const txId = generateId();

      // ── 4. เพิ่มแถวใหม่ใน Sheet "Transactions" ──
      // Column order: transaction_id, asset_id, borrower_id, staff_borrow_id,
      //               borrow_date, due_date, return_date, status, borrow_type,
      //               condition_status, late_fee, notes, created_at, updated_at
      appendRow(SHEET_NAMES.TRANSACTIONS, [
        txId,
        asset['asset_id'],
        user['user_id'],
        staffId || '',
        borrowDate.toISOString(),
        dueDate.toISOString(),
        '',                    // return_date (ว่างไว้ก่อน)
        TX_STATUS.ACTIVE,
        'StaffAssisted',
        '',                    // condition_status
        0,                     // late_fee
        notes || '',
        borrowDate.toISOString(),
        borrowDate.toISOString(),
      ]);

      // ── 5. อัปเดตสถานะอุปกรณ์ใน Sheet "Assets" เป็น "Borrowed" ──
      updateRowFields(SHEET_NAMES.ASSETS, asset['_rowIndex'], {
        'status':     ASSET_STATUS.BORROWED,
        'updated_at': borrowDate.toISOString(),
      });

      borrowedDetails.push({
        assetCode:  asset['asset_code'],
        assetName:  asset['asset_name'],
        category:   category ? category['category_name'] : '-',
        dueDate:    dueDate.toISOString(),
        txId:       txId,
      });
    }

    // ── 6. ส่งการแจ้งเตือน (ถ้าต้องการ) ──
    try {
      sendBorrowSuccessNotification({ user, items: borrowedDetails });
    } catch (notifErr) {
      Logger.log('[borrowAssets] Notification error: ' + notifErr.message);
    }

    return {
      success: true,
      message: `ทำรายการยืมสำเร็จ ${borrowedDetails.length} รายการ`,
      data: {
        borrower: {
          id:    user['user_id'],
          name:  user['full_name'],
          email: user['email'],
        },
        items: borrowedDetails,
      }
    };

  } catch (e) {
    Logger.log('[borrowAssets] Error: ' + e.message);
    return { success: false, message: 'เกิดข้อผิดพลาดภายในระบบ: ' + e.message };
  }
}


// ─────────────────────────────────────────────
//  WORKFLOW 3: คืนอุปกรณ์
// ─────────────────────────────────────────────

/**
 * บันทึกรายการคืนอุปกรณ์
 * เรียกจาก HTML: google.script.run.withSuccessHandler(fn).returnAsset(payload)
 *
 * @param {Object} payload
 * @param {string} payload.assetQrCode     - QR Code อุปกรณ์ที่คืน
 * @param {string} payload.conditionStatus - 'Normal' | 'Damaged' | 'Lost'
 * @param {string} [payload.staffId]       - ID เจ้าหน้าที่
 * @param {string} [payload.returnNotes]   - หมายเหตุการคืน
 * @returns {Object} { success, message, data }
 */
function returnAsset(payload) {
  try {
    const { assetQrCode, conditionStatus, staffId, returnNotes } = payload;

    // ── Validate Input ──
    if (!assetQrCode || !conditionStatus) {
      return {
        success: false,
        message: 'กรุณาระบุ QR Code อุปกรณ์ และสภาพอุปกรณ์ตอนคืน (Normal, Damaged, Lost)'
      };
    }

    // ── 1. ค้นหาอุปกรณ์จาก QR Code ──
    const asset = findRowBy(SHEET_NAMES.ASSETS, 'qr_code_hash', assetQrCode);
    if (!asset) {
      return { success: false, message: 'ไม่พบอุปกรณ์จาก QR Code นี้' };
    }

    // ── 2. ค้นหา Transaction ที่ยังค้างอยู่ล่าสุด (Active หรือ Overdue) ──
    const allTx = getAllRows(SHEET_NAMES.TRANSACTIONS);
    const openTx = allTx
      .filter(tx =>
        String(tx['asset_id']) === String(asset['asset_id']) &&
        (tx['status'] === TX_STATUS.ACTIVE || tx['status'] === TX_STATUS.OVERDUE)
      )
      .sort((a, b) => new Date(b['borrow_date']) - new Date(a['borrow_date']))[0];

    if (!openTx) {
      return {
        success: false,
        message: `อุปกรณ์ ${asset['asset_code']} ไม่มีประวัติการยืมที่ค้างอยู่ในระบบ (สถานะปัจจุบัน: ${asset['status']})`
      };
    }

    // ── 3. ตรวจสอบการคืนล่าช้าและคำนวณค่าปรับ ──
    const returnDate = new Date();
    const dueDate    = new Date(openTx['due_date']);
    let lateFee      = 0;

    if (returnDate > dueDate) {
      const diffMs   = Math.abs(returnDate.getTime() - dueDate.getTime());
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // หาค่าปรับต่อวันจากหมวดหมู่
      const allCategories = getAllRows(SHEET_NAMES.CATEGORIES);
      const category = allCategories.find(c => String(c['category_id']) === String(asset['category_id']));
      const finePerDay = category ? (Number(category['fine_per_day']) || DEFAULT_FINE_PER_DAY) : DEFAULT_FINE_PER_DAY;
      lateFee = diffDays * finePerDay;
    }

    // ── 4. กำหนด Transaction Status และ Asset Status ใหม่ ──
    let finalTxStatus  = TX_STATUS.RETURNED;
    let newAssetStatus = ASSET_STATUS.AVAILABLE;

    if (conditionStatus === 'Damaged') {
      finalTxStatus  = TX_STATUS.DAMAGED;
      newAssetStatus = ASSET_STATUS.MAINTENANCE;
    } else if (conditionStatus === 'Lost') {
      finalTxStatus  = TX_STATUS.LOST;
      newAssetStatus = ASSET_STATUS.LOST;
    }

    // ── 5. อัปเดต Transaction ใน Sheet "Transactions" ──
    updateRowFields(SHEET_NAMES.TRANSACTIONS, openTx['_rowIndex'], {
      'return_date':       returnDate.toISOString(),
      'staff_return_id':   staffId || '',
      'status':            finalTxStatus,
      'condition_status':  conditionStatus,
      'late_fee':          lateFee,
      'notes':             returnNotes || openTx['notes'] || '',
      'updated_at':        returnDate.toISOString(),
    });

    // ── 6. อัปเดตสถานะ Asset ใน Sheet "Assets" ──
    updateRowFields(SHEET_NAMES.ASSETS, asset['_rowIndex'], {
      'status':     newAssetStatus,
      'updated_at': returnDate.toISOString(),
    });

    // ── 7. ตรวจสอบว่าผู้ยืมยังมีรายการ Overdue ค้างอยู่ไหม → ถ้าไม่มีให้ปลด Suspended ──
    const borrower = findRowBy(SHEET_NAMES.USERS, 'user_id', openTx['borrower_id']);
    if (borrower) {
      const remainingOverdue = allTx.filter(tx =>
        String(tx['borrower_id']) === String(openTx['borrower_id']) &&
        tx['status'] === TX_STATUS.OVERDUE &&
        tx['_rowIndex'] !== openTx['_rowIndex'] // ยกเว้น tx ที่เพิ่งคืน
      );

      if (remainingOverdue.length === 0 && borrower['status'] === USER_STATUS.SUSPENDED) {
        updateRowFields(SHEET_NAMES.USERS, borrower['_rowIndex'], {
          'status':     USER_STATUS.ACTIVE,
          'updated_at': returnDate.toISOString(),
        });
      }
    }

    // ── 8. ส่งการแจ้งเตือน ──
    try {
      sendReturnSuccessNotification({
        borrowerName:    borrower ? borrower['full_name'] : '',
        borrowerEmail:   borrower ? borrower['email'] : '',
        assetCode:       asset['asset_code'],
        assetName:       asset['asset_name'],
        returnDate:      returnDate.toISOString(),
        lateFee,
        conditionStatus,
      });
    } catch (notifErr) {
      Logger.log('[returnAsset] Notification error: ' + notifErr.message);
    }

    return {
      success: true,
      message: `คืนอุปกรณ์ ${asset['asset_code']} เรียบร้อยแล้ว`,
      data: {
        assetCode:       asset['asset_code'],
        assetName:       asset['asset_name'],
        borrowerName:    borrower ? borrower['full_name'] : '-',
        returnDate:      returnDate.toISOString(),
        conditionStatus,
        lateFee,
        newAssetStatus,
      }
    };

  } catch (e) {
    Logger.log('[returnAsset] Error: ' + e.message);
    return { success: false, message: 'เกิดข้อผิดพลาดในการคืนอุปกรณ์: ' + e.message };
  }
}
