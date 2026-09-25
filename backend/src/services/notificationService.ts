import axios from 'axios';
import nodemailer from 'nodemailer';

export interface BorrowNotificationData {
  borrower: {
    full_name: string;
    email: string;
    line_user_id?: string;
  };
  items: Array<{
    assetCode: string;
    assetName: string;
    dueDate: string;
  }>;
}

export interface ReturnNotificationData {
  borrowerName: string;
  borrowerEmail: string;
  lineUserId?: string;
  assetCode: string;
  assetName: string;
  returnDate: string;
  lateFee: number;
  conditionStatus: string;
}

export class NotificationService {
  private lineChannelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  private mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });

  /**
   * ส่งการแจ้งเตือนยืนยันการยืมอุปกรณ์สำเร็จ
   */
  public async sendBorrowSuccessNotification(data: BorrowNotificationData): Promise<void> {
    const itemListText = data.items
      .map(item => `- [${item.assetCode}] ${item.assetName}\n  กำหนดคืน: ${new Date(item.dueDate).toLocaleDateString('th-TH')}`)
      .join('\n');

    const message = `📋 ยืนยันการยืมอุปกรณ์สำเร็จ\nคุณ: ${data.borrower.full_name}\n\nรายการอุปกรณ์:\n${itemListText}\n\n*โปรดส่งคืนอุปกรณ์ตามกำหนดเวลาเพื่อหลีกเลี่ยงค่าปรับ`;

    // 1. ส่งผ่าน LINE Messaging API หากผูก LINE ไว้
    if (data.borrower.line_user_id && this.lineChannelAccessToken) {
      await this.sendLinePush(data.borrower.line_user_id, message);
    }

    // 2. ส่งผ่าน Email
    if (data.borrower.email) {
      await this.mailTransporter.sendMail({
        from: '"Asset Lending System" <no-reply@school.ac.th>',
        to: data.borrower.email,
        subject: 'แจ้งยืนยันรายการยืมอุปกรณ์สำเร็จ',
        text: message
      }).catch(err => console.error('Email send error:', err));
    }
  }

  /**
   * ส่งการแจ้งเตือนยืนยันการคืนอุปกรณ์
   */
  public async sendReturnSuccessNotification(data: ReturnNotificationData): Promise<void> {
    const message = `✅ คืนอุปกรณ์เรียบร้อยแล้ว\nคุณ: ${data.borrowerName}\nอุปกรณ์: [${data.assetCode}] ${data.assetName}\nเวลาที่คืน: ${new Date(data.returnDate).toLocaleString('th-TH')}\nสภาพ: ${data.conditionStatus}${data.lateFee > 0 ? `\n⚠️ ค่าปรับเกินกำหนด: ${data.lateFee} บาท` : ''}\n\nขอบคุณที่ใช้บริการ`;

    if (data.lineUserId && this.lineChannelAccessToken) {
      await this.sendLinePush(data.lineUserId, message);
    }
  }

  /**
   * ส่งข้อความผ่าน LINE Messaging API Push
   */
  public async sendLinePush(toUserId: string, text: string): Promise<void> {
    try {
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: toUserId,
          messages: [{ type: 'text', text }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.lineChannelAccessToken}`
          }
        }
      );
    } catch (err: any) {
      console.error('Failed to send LINE push:', err?.response?.data || err.message);
    }
  }
}
