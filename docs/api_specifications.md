# RESTful API Specifications: ระบบยืม-คืนอุปกรณ์ด้วย QR Code

## Base URL
`/api/v1`

---

## 1. Authentication & User Identification

### 1.1 สแกนตรวจสอบข้อมูลผู้ยืม (Scan Borrower QR)
- **Endpoint:** `GET /users/scan/:userQrCode`
- **Headers:** `Authorization: Bearer <JWT_STAFF_TOKEN>`
- **Response 200 OK:**
```json
{
  "success": true,
  "data": {
    "userId": 101,
    "studentId": "STD-6501",
    "fullName": "กิตติศักดิ์ นักศึกษา",
    "email": "student1@school.ac.th",
    "phone": "0833333333",
    "role": "Borrower",
    "status": "Active",
    "currentActiveBorrows": 1,
    "maxBorrowLimit": 3,
    "canBorrow": true
  }
}
```

---

## 2. Asset Management (การจัดการอุปกรณ์ & QR)

### 2.1 ลงทะเบียนอุปกรณ์ใหม่และสร้าง QR Code (Asset Registration)
- **Endpoint:** `POST /assets`
- **Headers:** `Authorization: Bearer <JWT_STAFF_TOKEN>`
- **Request Body:**
```json
{
  "assetCode": "LAP-003",
  "assetName": "Lenovo ThinkPad X1 Carbon Gen 10",
  "categoryId": 1,
  "description": "Intel Core i7, RAM 16GB, SSD 512GB",
  "locationStored": "ตู้ IT-A2"
}
```
- **Response 201 Created:**
```json
{
  "success": true,
  "message": "สร้างอุปกรณ์และ QR Code เรียบร้อยแล้ว",
  "data": {
    "assetId": 45,
    "assetCode": "LAP-003",
    "qrCodeHash": "AST_QR_7f8a9e2c_LAP003",
    "qrPayload": {
      "asset_id": "LAP-003",
      "hash": "AST_QR_7f8a9e2c_LAP003"
    },
    "qrCodeDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "status": "Available"
  }
}
```

---

## 3. Borrowing Endpoints (การยืม)

### 3.1 ยืมผ่านจุดบริการ (Staff-Assisted Borrow Desk)
- **Endpoint:** `POST /transactions/borrow`
- **Headers:** `Authorization: Bearer <JWT_STAFF_TOKEN>`
- **Request Body:**
```json
{
  "borrowerQrCode": "USR_HASH_STD_6501_A7B2",
  "assetQrCodes": [
    "AST_QR_A1B2C3D4E5_LAP001",
    "AST_QR_K1L2M3N4O5_PRJ001"
  ],
  "notes": "ยืมไปจัดกิจกรรม Open House ตึก 3"
}
```
- **Response 201 Created:**
```json
{
  "success": true,
  "message": "ทำรายการยืมสำเร็จ 2 รายการ",
  "data": {
    "borrower": {
      "id": 3,
      "name": "กิตติศักดิ์ นักศึกษา",
      "email": "student1@school.ac.th"
    },
    "items": [
      {
        "assetCode": "LAP-001",
        "assetName": "MacBook Air M2 13 inch (Space Gray)",
        "category": "Notebook / Laptop",
        "dueDate": "2026-10-01T17:00:00.000Z"
      },
      {
        "assetCode": "PRJ-001",
        "assetName": "Epson EB-X06 Portable Projector",
        "category": "Projector & AV",
        "dueDate": "2026-09-27T17:00:00.000Z"
      }
    ]
  }
}
```

---

## 4. Returning Endpoints (การคืน)

### 4.1 คืนอุปกรณ์ ณ จุดบริการ (Return Asset)
- **Endpoint:** `POST /transactions/return`
- **Headers:** `Authorization: Bearer <JWT_STAFF_TOKEN>`
- **Request Body:**
```json
{
  "assetQrCode": "AST_QR_A1B2C3D4E5_LAP001",
  "conditionStatus": "Normal", 
  "returnNotes": "สภาพสมบูรณ์ ไม่มีรอยขีดข่วน พร้อมที่ชาร์จครบชุด"
}
```
- **Response 200 OK:**
```json
{
  "success": true,
  "message": "คืนอุปกรณ์ LAP-001 เรียบร้อยแล้ว",
  "data": {
    "assetCode": "LAP-001",
    "assetName": "MacBook Air M2 13 inch (Space Gray)",
    "borrowerName": "กิตติศักดิ์ นักศึกษา",
    "returnDate": "2026-09-26T14:30:00.000Z",
    "conditionStatus": "Normal",
    "lateFee": 0.00,
    "newAssetStatus": "Available"
  }
}
```
