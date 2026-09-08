import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';

export interface TelegramTestResult {
  ok: boolean;
  botName?: string;
  username?: string;
  chatId?: string;
  error?: string;
}

export class TelegramService {
  private static instance: TelegramService;
  private botToken: string;
  private chatId: string;
  private enabled: boolean;

  private constructor() {
    this.botToken = CONFIG.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = CONFIG.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';
    this.enabled = CONFIG.TELEGRAM_NOTIFY_ENABLED !== false && !!this.botToken && !!this.chatId;
  }

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  /**
   * รีเฟรชค่า Config จาก Environment ใหม่
   */
  public refreshConfig(): void {
    this.botToken = CONFIG.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = CONFIG.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';
    this.enabled = CONFIG.TELEGRAM_NOTIFY_ENABLED !== false && !!this.botToken && !!this.chatId;
  }

  /**
   * ตรวจสอบว่าระบบ Telegram ได้รับการตั้งค่า Token และ Chat ID ครบถ้วนหรือไม่
   */
  public isConfigured(): boolean {
    this.refreshConfig();
    return !!(this.botToken && this.chatId);
  }

  /**
   * ตรวจสอบว่าระบบเปิดใช้งานการส่งแจ้งเตือนหรือไม่
   */
  public isEnabled(): boolean {
    this.refreshConfig();
    return this.enabled;
  }

  /**
   * ส่งข้อความตัวอักษรไปยัง Telegram ของแอดมิน
   */
  public async sendText(
    text: string,
    options: { parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'; disableNotification?: boolean } = {}
  ): Promise<boolean> {
    if (!this.isConfigured() || !this.isEnabled()) {
      console.log(`[TELEGRAM NOTICE] Telegram ไม่ได้เปิดใช้งานหรือยังไม่ระบุ Token/ChatID (ข้อความ: ${text.slice(0, 60)}...)`);
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const bodyPayload: any = {
        chat_id: this.chatId,
        text,
        disable_notification: options.disableNotification || false
      };

      if (options.parseMode) {
        bodyPayload.parse_mode = options.parseMode;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(10000)
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        console.log('[TELEGRAM SUCCESS] ส่งข้อความแจ้งเตือนเข้า Telegram แอดมินสำเร็จ');
        return true;
      } else {
        console.error(`[TELEGRAM ERROR] ส่งข้อความไม่สำเร็จ (${response.status}):`, data?.description || data);
        return false;
      }
    } catch (err: any) {
      console.error('[TELEGRAM ERROR] ขัดข้องในการเชื่อมต่อ Telegram API:', err?.message || err);
      return false;
    }
  }

  /**
   * ส่งรูปภาพ (พร้อมคำบรรยาย) ไปยัง Telegram ของแอดมิน
   * รองรับทั้ง Local File Path, URL, และ Buffer
   */
  public async sendPhoto(
    photoSource: string | Buffer,
    caption?: string,
    options: { parseMode?: 'HTML' | 'Markdown'; disableNotification?: boolean } = {}
  ): Promise<boolean> {
    if (!this.isConfigured() || !this.isEnabled()) {
      console.log(`[TELEGRAM NOTICE] Telegram ไม่ได้เปิดใช้งานหรือยังไม่ระบุ Token/ChatID (ภาพ: ${caption?.slice(0, 50) || 'Photo'})`);
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendPhoto`;

      // กรณีที่ 1: photoSource เป็น URL ภายนอก (https://...)
      if (typeof photoSource === 'string' && (photoSource.startsWith('http://') || photoSource.startsWith('https://'))) {
        const bodyPayload: any = {
          chat_id: this.chatId,
          photo: photoSource,
          caption: caption || '',
          disable_notification: options.disableNotification || false
        };
        if (options.parseMode) bodyPayload.parse_mode = options.parseMode;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload),
          signal: AbortSignal.timeout(15000)
        });

        const data = await response.json().catch(() => ({}));
        if (response.ok && data.ok) {
          console.log('[TELEGRAM SUCCESS] ส่งรูปภาพผ่าน URL เข้า Telegram สำเร็จ');
          return true;
        } else {
          console.error(`[TELEGRAM ERROR] ส่งรูปภาพ URL ไม่สำเร็จ (${response.status}):`, data?.description || data);
          return false;
        }
      }

      // กรณีที่ 2: photoSource เป็น Local File Path หรือ Buffer -> ใช้ multipart/form-data
      const formData = new FormData();
      formData.append('chat_id', this.chatId);
      if (caption) formData.append('caption', caption);
      if (options.parseMode) formData.append('parse_mode', options.parseMode);
      if (options.disableNotification) formData.append('disable_notification', 'true');

      if (typeof photoSource === 'string') {
        const absPath = path.isAbsolute(photoSource) ? photoSource : path.resolve(process.cwd(), photoSource);
        if (!fs.existsSync(absPath)) {
          console.error(`[TELEGRAM ERROR] ไม่พบไฟล์รูปภาพตามที่ระบุ: ${absPath}`);
          return false;
        }
        const fileBuffer = fs.readFileSync(absPath);
        const fileName = path.basename(absPath);
        const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'image/png' });
        formData.append('photo', blob, fileName);
      } else if (Buffer.isBuffer(photoSource)) {
        const blob = new Blob([new Uint8Array(photoSource)], { type: 'image/png' });
        formData.append('photo', blob, `telegram-photo-${Date.now()}.png`);
      }

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(20000)
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        console.log('[TELEGRAM SUCCESS] อัปโหลดและส่งรูปภาพเข้า Telegram สำเร็จ');
        return true;
      } else {
        console.error(`[TELEGRAM ERROR] ส่งรูปภาพ File ไม่สำเร็จ (${response.status}):`, data?.description || data);
        return false;
      }
    } catch (err: any) {
      console.error('[TELEGRAM ERROR] ขัดข้องในการส่งรูปภาพ Telegram:', err?.message || err);
      return false;
    }
  }

  /**
   * ส่งภาพ QR Code เข้าสู่ระบบเป๋าตังสำหรับแอดมิน
   */
  public async notifyAdminLoginQR(qrImagePathOrUrl: string, reason: string = 'เข้าสู่ระบบร้านค้า'): Promise<boolean> {
    const caption = `🔐 [QR Code เข้าสู่ระบบ GLO N3 สำหรับแอดมิน]\n\n` +
      `📌 สาเหตุ: ${reason}\n` +
      `📲 กรุณาเปิดแอป "เป๋าตัง" แล้วเลือก "สแกน QR" เพื่อเข้าสู่ระบบร้านค้าภายใน 5 นาทีครับ\n` +
      `⏱️ ส่งเมื่อ: ${new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })} น.`;

    return this.sendPhoto(qrImagePathOrUrl, caption);
  }

  /**
   * ส่งแจ้งเตือนเมื่อแอดมินล็อกอินเข้าสู่ระบบ N3 สำเร็จ
   */
  public async notifyLoginSuccess(quotaInfo: { remainingQuota: number; maxQuota: number; usedQuota: number }): Promise<boolean> {
    const text = `🎉 [เข้าสู่ระบบ GLO N3 สำเร็จ]\n\n` +
      `🟢 ระบบตัวแทนจำหน่ายเชื่อมต่อกับแอปเป๋าตังเรียบร้อยแล้ว (Session Active)\n` +
      `📊 โควต้าคงเหลือจริง: ${quotaInfo.remainingQuota.toLocaleString()} / ${quotaInfo.maxQuota.toLocaleString()} ใบ\n` +
      `🛒 ขายแล้ว: ${quotaInfo.usedQuota.toLocaleString()} ใบ\n` +
      `✨ ระบบพร้อมรับและสั่งซื้อสลาก N3 ให้ลูกค้าอัตโนมัติ 24 ชม.`;

    return this.sendText(text);
  }

  /**
   * ส่งแจ้งเตือนเมื่อมีออเดอร์ใหม่เข้ามาในคิว
   */
  public async notifyOrderCreated(orderSummary: string, totalPrice: number, queuePos: number, customerId?: string): Promise<boolean> {
    const customerTag = customerId ? `\n👤 ลูกค้า: ${customerId.slice(0, 10)}...` : '';
    const text = `🛒 [มีคำสั่งซื้อสลาก N3 ใหม่] (คิวที่ ${queuePos})\n\n` +
      `🎯 รายการ: ${orderSummary}\n` +
      `💰 ยอดรวม: ${totalPrice.toLocaleString()} บาท${customerTag}\n` +
      `⚡ บอทกำลังดำเนินการสั่งซื้อกับระบบ GLO อัตโนมัติ...`;

    return this.sendText(text);
  }

  /**
   * ส่งแจ้งเตือนเมื่อประมวลผลออเดอร์สำเร็จและได้ภาพ QR Code ชำระเงิน
   */
  public async notifyOrderCompleted(orderSummary: string, totalPrice: number, qrImageUrl?: string, customerId?: string): Promise<boolean> {
    const customerTag = customerId ? `\n👤 ลูกค้า: ${customerId.slice(0, 10)}...` : '';
    const caption = `✅ [ออก QR Code ชำระเงินสำเร็จ]\n\n` +
      `🎯 รายการ: ${orderSummary}\n` +
      `💰 ยอดชำระ: ${totalPrice.toLocaleString()} บาท${customerTag}\n` +
      `👛 ส่ง QR Code ให้ลูกค้าสแกนจ่ายผ่านเป๋าตังเรียบร้อยแล้ว`;

    if (qrImageUrl) {
      return this.sendPhoto(qrImageUrl, caption);
    } else {
      return this.sendText(caption);
    }
  }

  /**
   * ส่งแจ้งเตือนกำหนดเวลาทำการประจำวัน (เปิดร้าน 06:00 น. / ปิดร้าน 23:00 น.)
   */
  public async notifyDailySchedule(type: 'OPEN' | 'CLOSE', timeStr: string): Promise<boolean> {
    let text = '';
    if (type === 'OPEN') {
      text = `☀️ [แจ้งเตือนเปิดร้าน N3 ประจำวัน] (${timeStr})\n\n` +
        `🟢 สำนักงานสลากฯ เปิดระบบจำหน่ายประจำวันแล้ว\n` +
        `📲 หากระบบยังไม่ได้ล็อกอิน กรุณาส่ง 'qr' ใน LINE เพื่อสแกนเป๋าตังเริ่มต้นขายครับ`;
    } else {
      text = `🌙 [แจ้งเตือนปิดร้าน N3 ประจำวัน] (${timeStr})\n\n` +
        `🔒 ถึงเวลาปิดระบบจำหน่ายสลากประจำวัน (23:00 น.)\n` +
        `บอทได้ทำการ Logoff และรีเซ็ตเซสชันเพื่อความปลอดภัยเรียบร้อยแล้วครับ`;
    }
    return this.sendText(text);
  }

  /**
   * ส่งแจ้งเตือนสถานะทั่วไป หรือเหตุฉุกเฉิน
   */
  public async notifySystemStatus(title: string, message: string, emoji: string = '📢'): Promise<boolean> {
    const text = `${emoji} [${title}]\n\n${message}\n⏱️ เวลา: ${new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })} น.`;
    return this.sendText(text);
  }

  /**
   * ทดสอบการเชื่อมต่อ Telegram Bot API (ดึงข้อมูลบอทและส่งข้อความทดสอบ)
   */
  public async testConnection(): Promise<TelegramTestResult> {
    this.refreshConfig();

    if (!this.botToken) {
      return { ok: false, error: 'ยังไม่ได้ระบุ TELEGRAM_BOT_TOKEN ใน .env' };
    }
    if (!this.chatId) {
      return { ok: false, error: 'ยังไม่ได้ระบุ TELEGRAM_ADMIN_CHAT_ID ใน .env' };
    }

    try {
      // 1. ตรวจสอบ Token ผ่าน getMe
      const meRes = await fetch(`https://api.telegram.org/bot${this.botToken}/getMe`, {
        signal: AbortSignal.timeout(8000)
      });
      const meData = await meRes.json().catch(() => ({}));

      if (!meRes.ok || !meData.ok) {
        return {
          ok: false,
          error: `Token ไม่ถูกต้อง (${meRes.status}): ${meData.description || 'Invalid Token'}`
        };
      }

      const botInfo = meData.result;
      const botName = botInfo.first_name || 'GLO N3 Bot';
      const username = botInfo.username ? `@${botInfo.username}` : '';

      // 2. ทดสอบส่งข้อความไปยัง Chat ID
      const testMsg = `🤖 [ทดสอบระบบแจ้งเตือน Telegram]\n\n` +
        `✅ เชื่อมต่อบอท "${botName}" (${username}) สำเร็จสมบูรณ์!\n` +
        `📱 Chat ID ของแอดมิน: ${this.chatId}\n` +
        `⚡ ระบบพร้อมส่งแจ้งเตือนออเดอร์และ QR Login แบบ Realtime ฟรี 100% เรียบร้อยแล้วครับ 🎉`;

      const sendOk = await this.sendText(testMsg);
      if (!sendOk) {
        return {
          ok: false,
          botName,
          username,
          chatId: this.chatId,
          error: 'บอทเชื่อมต่อได้ แต่ไม่สามารถส่งข้อความหา Chat ID นี้ได้ (กรุณากด Start บอทใน Telegram ก่อน)'
        };
      }

      return {
        ok: true,
        botName,
        username,
        chatId: this.chatId
      };
    } catch (err: any) {
      return {
        ok: false,
        error: `เชื่อมต่อ Telegram API ล้มเหลว: ${err?.message || err}`
      };
    }
  }
}
