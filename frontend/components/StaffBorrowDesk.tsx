import React, { useState } from 'react';
import { QRScannerModal } from './QRScannerModal';

interface BorrowerInfo {
  id: number;
  name: string;
  studentId: string;
  email: string;
  status: 'Active' | 'Suspended';
  currentBorrowedCount: number;
  maxLimit: number;
}

interface ScannedAsset {
  qrCode: string;
  assetCode: string;
  name: string;
  category: string;
  maxBorrowDays: number;
}

export const StaffBorrowDesk: React.FC = () => {
  const [borrower, setBorrower] = useState<BorrowerInfo | null>(null);
  const [scannedAssets, setScannedAssets] = useState<ScannedAsset[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'BORROWER' | 'ASSET'>('BORROWER');
  const [isLoading, setIsLoading] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // สแกน QR สำเร็จ
  const handleScanSuccess = async (qrText: string) => {
    setIsScannerOpen(false);

    if (scanMode === 'BORROWER') {
      // ดึงข้อมูลผู้ยืมจาก API
      try {
        setIsLoading(true);
        // จำลอง API Call: GET /api/v1/users/scan/:qrCode
        const mockBorrower: BorrowerInfo = {
          id: 101,
          name: 'กิตติศักดิ์ นักศึกษา',
          studentId: 'STD-6501',
          email: 'student1@school.ac.th',
          status: 'Active',
          currentBorrowedCount: 1,
          maxLimit: 3
        };
        setBorrower(mockBorrower);
        setAlertInfo(null);
      } catch (err) {
        setAlertInfo({ type: 'error', message: 'ไม่พบข้อมูลผู้ยืมจากรหัสนี้' });
      } finally {
        setIsLoading(false);
      }
    } else {
      // สแกนอุปกรณ์ (Asset)
      if (scannedAssets.some(a => a.qrCode === qrText)) {
        setAlertInfo({ type: 'error', message: 'อุปกรณ์ชิ้นนี้ถูกสแกนในรายการแล้ว' });
        return;
      }

      // ตรวจสอบโควตาการยืม
      const currentTotal = (borrower?.currentBorrowedCount || 0) + scannedAssets.length + 1;
      if (borrower && currentTotal > borrower.maxLimit) {
        setAlertInfo({
          type: 'error',
          message: `ไม่สามารถเพิ่มอุปกรณ์ได้ เกินสิทธิ์การยืมสูงสุด (${borrower.maxLimit} ชิ้น)`
        });
        return;
      }

      // จำลองดึงข้อมูล Asset จาก API
      const newAsset: ScannedAsset = {
        qrCode: qrText,
        assetCode: `AST-${Math.floor(100 + Math.random() * 900)}`,
        name: 'MacBook Air M2 13 inch',
        category: 'Notebook / Laptop',
        maxBorrowDays: 7
      };

      setScannedAssets(prev => [...prev, newAsset]);
      setAlertInfo({ type: 'success', message: `เพิ่มอุปกรณ์ ${newAsset.assetCode} สำเร็จ` });
    }
  };

  // ลบอุปกรณ์ออกจากรายการสแกน
  const handleRemoveAsset = (qrCode: string) => {
    setScannedAssets(prev => prev.filter(a => a.qrCode !== qrCode));
  };

  // ยืนยันการยืม
  const handleConfirmBorrow = async () => {
    if (!borrower || scannedAssets.length === 0) return;

    try {
      setIsLoading(true);
      // POST /api/v1/borrow
      // Body: { borrowerQrCode: borrower.qrCode, assetQrCodes: [...] }
      setAlertInfo({ 
        type: 'success', 
        message: `ทำรายการยืมสำเร็จทั้งหมด ${scannedAssets.length} ชิ้น และส่งแจ้งเตือนเรียบร้อยแล้ว` 
      });
      // Reset State
      setBorrower(null);
      setScannedAssets([]);
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกการยืม' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">จุดบริการยืม-คืนอุปกรณ์ (Staff Desk)</h1>
          <p className="text-sm text-slate-500">สแกนรหัสผู้ยืมและรหัสอุปกรณ์เพื่อบันทึกการยืม</p>
        </div>
        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold">
          System Ready
        </span>
      </div>

      {/* Alert Banner */}
      {alertInfo && (
        <div className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between ${
          alertInfo.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <span>{alertInfo.message}</span>
          <button onClick={() => setAlertInfo(null)} className="text-xs underline ml-4">ปิด</button>
        </div>
      )}

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Step 1: Borrower Card */}
        <div className="bg-white border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                ขั้นตอนที่ 1
              </span>
              {borrower && (
                <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                  borrower.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  สถานะ: {borrower.status}
                </span>
              )}
            </div>

            <h2 className="text-lg font-bold text-slate-800 mb-2">ข้อมูลผู้ยืม (Borrower)</h2>

            {borrower ? (
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl text-sm">
                <div><span className="text-slate-500">ชื่อ-สกุล:</span> <strong className="text-slate-800">{borrower.name}</strong></div>
                <div><span className="text-slate-500">รหัสประจำตัว:</span> <strong className="text-slate-800">{borrower.studentId}</strong></div>
                <div><span className="text-slate-500">อีเมล:</span> {borrower.email}</div>
                <div>
                  <span className="text-slate-500">สิทธิ์การยืม:</span>{' '}
                  <span className="font-semibold text-slate-800">
                    กำลังยืม {borrower.currentBorrowedCount} / {borrower.maxLimit} ชิ้น
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm">ยังไม่ได้ระบุตัวตนผู้ยืม</p>
                <p className="text-xs text-slate-400 mt-1">กดปุ่มด้านล่างเพื่อสแกน QR Code หรือ Barcode</p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <button
              onClick={() => { setScanMode('BORROWER'); setIsScannerOpen(true); }}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              📷 สแกน QR ผู้ยืม
            </button>
          </div>
        </div>

        {/* Step 2: Scanned Assets List */}
        <div className="bg-white border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                ขั้นตอนที่ 2
              </span>
              <span className="text-xs text-slate-500 font-medium">
                เลือกแล้ว {scannedAssets.length} ชิ้น
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-800 mb-2">รายการอุปกรณ์ที่จะยืม</h2>

            {scannedAssets.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {scannedAssets.map((asset, idx) => (
                  <div key={asset.qrCode} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                    <div>
                      <div className="font-bold text-slate-800">[{asset.assetCode}] {asset.name}</div>
                      <div className="text-xs text-slate-500">{asset.category} • ยืมได้ {asset.maxBorrowDays} วัน</div>
                    </div>
                    <button
                      onClick={() => handleRemoveAsset(asset.qrCode)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1"
                    >
                      ลบ
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm">ยังไม่มีอุปกรณ์ในรายการ</p>
                <p className="text-xs text-slate-400 mt-1">สแกน QR Code ที่ติดอยู่กับอุปกรณ์ทีละชิ้น</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              disabled={!borrower || borrower.status === 'Suspended'}
              onClick={() => { setScanMode('ASSET'); setIsScannerOpen(true); }}
              className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              ➕ สแกนเพิ่มอุปกรณ์
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Bar */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
        <div>
          <h3 className="font-bold text-lg">สรุปการทำรายการยืม</h3>
          <p className="text-slate-400 text-xs mt-1">
            ผู้ยืม: {borrower ? borrower.name : '-'} | รวมอุปกรณ์ทั้งสิ้น: {scannedAssets.length} รายการ
          </p>
        </div>

        <button
          disabled={!borrower || scannedAssets.length === 0 || isLoading}
          onClick={handleConfirmBorrow}
          className="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-md"
        >
          {isLoading ? 'กำลังประมวลผล...' : '✓ ยืนยันการยืมอุปกรณ์'}
        </button>
      </div>

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
        title={scanMode === 'BORROWER' ? 'สแกน QR Code ผู้ยืม' : 'สแกน QR Code บนตัวอุปกรณ์'}
        instructionText={scanMode === 'BORROWER' ? 'ส่องกล้องไปที่ QR Code ของนักศึกษา/พนักงาน' : 'ส่องกล้องไปที่สติ๊กเกอร์ QR บนตัวอุปกรณ์'}
      />
    </div>
  );
};
