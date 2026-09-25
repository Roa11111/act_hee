-- ============================================================================
-- ระบบยืม-คืนอุปกรณ์การเรียน / สำนักงาน ด้วย QR Code (Asset Lending System)
-- Database: MySQL 8.0+ (Aiven for MySQL)
-- Charset: utf8mb4 เพื่อรองรับภาษาไทยและ Emoji
-- ============================================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- (ใช้กับ database ที่เปิดอยู่ เช่น 'a' หรือ 'defaultdb' ได้ทันที)

-- ============================================================================
-- DROP TABLES (ลำดับสำคัญ: ลบตารางที่มี FK ก่อน)
-- ============================================================================
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS system_settings;

-- ============================================================================
-- TABLE: users (ผู้ใช้งานในระบบ)
-- ============================================================================
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    citizen_or_student_id VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(20) DEFAULT NULL,
    user_qr_code VARCHAR(100) NOT NULL UNIQUE COMMENT 'Unique token/hash สำหรับสแกนบัตรผู้ใช้',
    role ENUM('Borrower', 'Staff', 'Admin', 'SuperAdmin') NOT NULL DEFAULT 'Borrower',
    status ENUM('Active', 'Suspended', 'Inactive') NOT NULL DEFAULT 'Active',
    line_user_id VARCHAR(100) DEFAULT NULL COMMENT 'สำหรับส่ง Notification ผ่าน LINE',
    max_borrow_limit INT NOT NULL DEFAULT 3 COMMENT 'จำนวนชิ้นสูงสุดที่ยืมพร้อมกันได้',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLE: categories (หมวดหมู่อุปกรณ์และกำหนดเวลายืม)
-- ============================================================================
CREATE TABLE categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT DEFAULT NULL,
    max_borrow_days INT NOT NULL DEFAULT 7 COMMENT 'กำหนดยืมได้สูงสุดกี่วัน',
    fine_per_day DECIMAL(8, 2) NOT NULL DEFAULT 0.00 COMMENT 'ค่าปรับต่อวันเมื่อคืนล่าช้า (บาท)',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLE: assets (รายการอุปกรณ์)
-- ============================================================================
CREATE TABLE assets (
    asset_id INT AUTO_INCREMENT PRIMARY KEY,
    asset_code VARCHAR(50) NOT NULL UNIQUE COMMENT 'รหัสอุปกรณ์ เช่น LAP-001, PRJ-002',
    asset_name VARCHAR(200) NOT NULL,
    category_id INT NOT NULL,
    description TEXT DEFAULT NULL,
    qr_code_hash VARCHAR(128) NOT NULL UNIQUE COMMENT 'Hash ปลอดภัยที่ฝังใน QR Code',
    status ENUM('Available', 'Borrowed', 'Maintenance', 'Lost', 'Reserved') NOT NULL DEFAULT 'Available',
    location_stored VARCHAR(100) NOT NULL COMMENT 'เช่น ตู้ A2, ห้อง Lab 301',
    serial_number VARCHAR(100) DEFAULT NULL,
    image_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_assets_category
        FOREIGN KEY (category_id) REFERENCES categories(category_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLE: transactions (ประวัติและสถานะการยืม-คืน)
-- ============================================================================
CREATE TABLE transactions (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id INT NOT NULL,
    borrower_id INT NOT NULL,
    staff_borrow_id INT NOT NULL,
    borrow_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    due_date TIMESTAMP NOT NULL,
    return_date TIMESTAMP NULL DEFAULT NULL,
    staff_return_id INT DEFAULT NULL,
    status ENUM('Active', 'Returned', 'Overdue', 'Damaged', 'Lost') NOT NULL DEFAULT 'Active',
    borrow_type ENUM('StaffAssisted', 'SelfService') NOT NULL DEFAULT 'StaffAssisted',
    late_fee DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    notes TEXT DEFAULT NULL COMMENT 'รายละเอียดสภาพอุปกรณ์ บันทึกตำหนิ',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_tx_asset
        FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_tx_borrower
        FOREIGN KEY (borrower_id) REFERENCES users(user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_tx_staff_borrow
        FOREIGN KEY (staff_borrow_id) REFERENCES users(user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_tx_staff_return
        FOREIGN KEY (staff_return_id) REFERENCES users(user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLE: system_settings (การตั้งค่าระบบส่วนกลาง)
-- ============================================================================
CREATE TABLE system_settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- INDEXES & PERFORMANCE OPTIMIZATION
-- ============================================================================

-- ดัชนีสำหรับการสแกน QR Code ที่รวดเร็ว (< 10ms)
-- (user_qr_code, qr_code_hash, asset_code มี UNIQUE แล้ว จะสร้าง index อัตโนมัติ)

-- ดัชนีสำหรับการตรวจสอบสถานะยืมปัจจุบัน และรายการค้างส่ง (Overdue)
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_borrower_status ON transactions(borrower_id, status);
CREATE INDEX idx_transactions_due_date ON transactions(due_date);
CREATE INDEX idx_transactions_asset_status ON transactions(asset_id, status);

-- ============================================================================
-- SAMPLE SEED DATA
-- ============================================================================

-- 1. เพิ่มหมวดหมู่
INSERT INTO categories (category_name, description, max_borrow_days, fine_per_day) VALUES
('Notebook / Laptop', 'คอมพิวเตอร์พกพาสำหรับการเรียนและการสอน', 7, 50.00),
('Projector & AV', 'เครื่องฉายโปรเจกเตอร์และอุปกรณ์ต่อพ่วง', 3, 100.00),
('Tablet / iPad', 'แท็บเล็ตและปากกาสไตลัสสำหรับเวิร์กช็อป', 5, 40.00),
('Office Stationery & Tools', 'อุปกรณ์เครื่องเขียน เครื่องเย็บ เครื่องตัด', 1, 10.00);

-- 2. เพิ่มผู้ใช้ตัวอย่าง (Admin, Staff, Borrower)
INSERT INTO users (citizen_or_student_id, full_name, email, phone, user_qr_code, role, status, max_borrow_limit) VALUES
('EMP-001', 'สมชาย ผู้ดูแลระบบ (Super Admin)', 'admin@school.ac.th', '0811111111', 'USR_HASH_SUPER_ADMIN_001', 'SuperAdmin', 'Active', 10),
('EMP-002', 'วิภา เจ้าหน้าที่พัสดุ (Staff)', 'staff1@school.ac.th', '0822222222', 'USR_HASH_STAFF_002', 'Staff', 'Active', 5),
('STD-6501', 'กิตติศักดิ์ นักศึกษา (Borrower A)', 'student1@school.ac.th', '0833333333', 'USR_HASH_STD_6501_A7B2', 'Borrower', 'Active', 3),
('STD-6502', 'ชลธิชา นักศึกษา (Borrower B)', 'student2@school.ac.th', '0844444444', 'USR_HASH_STD_6502_F9C1', 'Borrower', 'Suspended', 2);

-- 3. เพิ่มอุปกรณ์ตัวอย่าง
INSERT INTO assets (asset_code, asset_name, category_id, description, qr_code_hash, status, location_stored) VALUES
('LAP-001', 'MacBook Air M2 13 inch (Space Gray)', 1, 'RAM 16GB, SSD 512GB พร้อมที่ชาร์จ 35W', 'AST_QR_A1B2C3D4E5_LAP001', 'Available', 'ตู้ IT-A1'),
('LAP-002', 'Dell Latitude 5430', 1, 'Core i5 12th Gen, RAM 16GB, สายชาร์จ Type-C', 'AST_QR_F6G7H8I9J0_LAP002', 'Available', 'ตู้ IT-A1'),
('PRJ-001', 'Epson EB-X06 Portable Projector', 2, 'ความสว่าง 3,600 ANSI พร้อมสาย HDMI และกระเป๋า', 'AST_QR_K1L2M3N4O5_PRJ001', 'Available', 'ห้องพัสดุ ตู้ B2'),
('TAB-001', 'iPad Air 5 64GB Wi-Fi + Apple Pencil 2', 3, 'ติดฟิล์มกระดาษ มีเคสกันกระแทก', 'AST_QR_P6Q7R8S9T0_TAB001', 'Available', 'ตู้ Media-C1');

-- 4. ตั้งค่าระบบเริ่มต้น
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('AUTO_APPROVE_SELF_SERVICE', 'false', 'อนุมัติการยืมด้วยตนเองอัตโนมัติหรือไม่ (true/false)'),
('NOTIFY_LINE_ENABLED', 'true', 'เปิดใช้งานระบบแจ้งเตือนผ่าน LINE (true/false)'),
('SYSTEM_NAME', 'ระบบบริหารจัดการยืม-คืนอุปกรณ์ QR Smart Inventory', 'ชื่อระบบ'),
('AIVEN_MYSQL_HOST', '', 'Hostname ของ Aiven for MySQL'),
('AIVEN_MYSQL_PORT', '3306', 'Port ของ Aiven for MySQL');
