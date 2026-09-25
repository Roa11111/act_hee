import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
  title?: string;
  instructionText?: string;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'สแกน QR Code',
  instructionText = 'ส่องกล้องไปที่ QR Code ของผู้ยืมหรืออุปกรณ์'
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrRegionId = 'qr-reader-viewport';

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    const initScanner = async () => {
      try {
        setErrorMessage(null);
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameras(devices);
          // เลือกล้องหลัง (Back Camera/Environment) เป็นค่าเริ่มต้นสำหรับอุปกรณ์เคลื่อนที่
          const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
          const defaultCamId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(defaultCamId);
          startScanning(defaultCamId);
        } else {
          setErrorMessage('ไม่พบอุปกรณ์กล้องบนอุปกรณ์นี้');
        }
      } catch (err: any) {
        console.error('Camera Init Error:', err);
        setErrorMessage('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบสิทธิ์การใช้งาน (Camera Permission)');
      }
    };

    initScanner();

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const startScanning = async (cameraId: string) => {
    try {
      if (scannerRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode(qrRegionId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13
        ],
        verbose: false
      });

      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        cameraId,
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // Play audio feedback / Vibration
          playBeep();
          if (navigator.vibrate) navigator.vibrate(100);

          onScanSuccess(decodedText);
        },
        (error) => {
          // Frame-by-frame scanning errors can be ignored safely
        }
      );

      setIsScanning(true);
    } catch (err: any) {
      console.error('Start Scanner Error:', err);
      setErrorMessage('เกิดข้อผิดพลาดในการเปิดกล้องสแกน');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error('Stop Scanner Error:', err);
      }
    }
    setIsScanning(false);
  };

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // Pitch A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      // Audio context might be restricted before user gesture
    }
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    startScanning(newId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">{title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{instructionText}</p>
          </div>
          <button
            onClick={() => { stopScanner(); onClose(); }}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Viewport & Laser Animation */}
        <div className="relative bg-black flex flex-col items-center justify-center min-h-[320px]">
          <div id={qrRegionId} className="w-full h-full" />

          {/* Animated Scanning Line */}
          {isScanning && (
            <div className="absolute inset-x-8 top-1/4 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse pointer-events-none" />
          )}

          {errorMessage && (
            <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center">
              <span className="text-rose-500 text-3xl mb-2">⚠️</span>
              <p className="text-rose-400 text-sm font-medium">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Camera Selector & Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 flex flex-col gap-3">
          {cameras.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">เลือกกล้อง:</label>
              <select
                value={selectedCameraId}
                onChange={handleCameraChange}
                className="flex-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200"
              >
                {cameras.map(c => (
                  <option key={c.id} value={c.id}>{c.label || `Camera ${c.id}`}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => { stopScanner(); onClose(); }}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm transition-all"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
