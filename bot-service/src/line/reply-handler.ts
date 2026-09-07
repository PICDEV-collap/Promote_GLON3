import { messagingApi } from '@line/bot-sdk';
import { CONFIG } from '../config';

export function getThaiTime(date: Date = new Date()): string {
  try {
    return date.toLocaleTimeString('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) + ' น.';
  } catch {
    const h = String((date.getUTCHours() + 7) % 24).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m} น.`;
  }
}

export interface LineQuotaStatus {
  type: string; // 'none' | 'limited' | 'unlimited' | 'unknown'
  value?: number;
  totalUsage?: number;
  remaining?: number;
  isExhausted: boolean;
  checkedAt: number;
}

export class LineReplyHandler {
  private client: messagingApi.MessagingApiClient | null = null;
  private cachedQuotaStatus: LineQuotaStatus | null = null;
  private lastQuotaCheckTime: number = 0;

  constructor() {
    if (CONFIG.LINE_CHANNEL_ACCESS_TOKEN) {
      this.client = new messagingApi.MessagingApiClient({
        channelAccessToken: CONFIG.LINE_CHANNEL_ACCESS_TOKEN
      });
    } else {
      console.warn('[LINE] ยังไม่ได้ระบุ LINE_CHANNEL_ACCESS_TOKEN ในระบบ');
    }
  }

  /**
   * ดึงข้อมูลยอดโควต้าข้อความ Push ประจำเดือนจาก LINE Messaging API
   */
  public async getQuotaStatus(forceRefresh: boolean = false): Promise<LineQuotaStatus> {
    const now = Date.now();
    if (!forceRefresh && this.cachedQuotaStatus && (now - this.lastQuotaCheckTime < 60000)) {
      return this.cachedQuotaStatus;
    }

    if (!CONFIG.LINE_CHANNEL_ACCESS_TOKEN) {
      return {
        type: 'none',
        value: 0,
        totalUsage: 0,
        remaining: 0,
        isExhausted: true,
        checkedAt: now
      };
    }

    try {
      const headers = { Authorization: `Bearer ${CONFIG.LINE_CHANNEL_ACCESS_TOKEN}` };

      // 1. ตรวจสอบขีดจำกัดโควต้าประจำเดือน (Quota Limit)
      const quotaRes = await fetch('https://api.line.me/v2/bot/message/quota', {
        headers,
        signal: AbortSignal.timeout(3000)
      });
      let quotaData: any = {};
      if (quotaRes.ok) {
        quotaData = await quotaRes.json();
      }

      // 2. ตรวจสอบยอดการใช้งานจริงในเดือนปัจจุบัน (Consumption)
      const consRes = await fetch('https://api.line.me/v2/bot/message/quota/consumption', {
        headers,
        signal: AbortSignal.timeout(3000)
      });
      let consData: any = {};
      if (consRes.ok) {
        consData = await consRes.json();
      }

      const type = quotaData.type || 'limited';
      const value = typeof quotaData.value === 'number' ? quotaData.value : (type === 'unlimited' ? Infinity : 300);
      const totalUsage = typeof consData.totalUsage === 'number' ? consData.totalUsage : 0;
      const remaining = type === 'unlimited' ? Infinity : Math.max(0, value - totalUsage);
      const isExhausted = type === 'limited' && remaining <= 0;

      this.cachedQuotaStatus = {
        type,
        value,
        totalUsage,
        remaining,
        isExhausted,
        checkedAt: now
      };
      this.lastQuotaCheckTime = now;

      return this.cachedQuotaStatus;
    } catch (err) {
      console.warn('[LINE QUOTA API WARNING] ไม่สามารถดึงข้อมูลโควต้า LINE ได้:', err);
      return this.cachedQuotaStatus || {
        type: 'unknown',
        value: 300,
        totalUsage: 300,
        remaining: 0,
        isExhausted: true,
        checkedAt: now
      };
    }
  }

  /**
   * ตรวจสอบว่าสามารถส่งข้อความ Push ได้หรือไม่ (หากโควต้าหมดจะแนะนำให้ใช้ ReplyToken)
   */
  public isPushAvailable(): boolean {
    if (this.cachedQuotaStatus && this.cachedQuotaStatus.isExhausted) {
      return false;
    }
    return true;
  }

  /**
   * ป้องกันข้อผิดพลาด HTTP 400 Bad Request จาก LINE Messaging API:
   * 1. ตรวจสอบข้อความ Text ไม่ให้ยาวเกิน 4,000 ตัวอักษร (LINE กำหนดไม่เกิน 5,000)
   * 2. ป้องกันข้อความว่างเปล่าหรือมีแต่ Whitespace
   */
  public static sanitizeMessages(messages: messagingApi.Message[]): messagingApi.Message[] {
    if (!Array.isArray(messages)) return [];
    return messages.map(msg => {
      if (msg && msg.type === 'text') {
        let t = (msg as messagingApi.TextMessage).text;
        if (typeof t !== 'string') t = String(t || '');
        if (t.length > 4000) {
          t = t.slice(0, 3950) + '\n... [ข้อความถูกตัดทอนเพื่อให้อยู่ในเกณฑ์ LINE API]';
        }
        if (!t.trim()) {
          t = ' ';
        }
        return { ...msg, text: t };
      }
      return msg;
    });
  }

  /**
   * ส่งข้อความตอบกลับโดยใช้ replyToken (ฟรี ไม่เสียโควต้า Push Message ตลอดชีพ)
   */
  public async reply(replyToken: string, messages: messagingApi.Message[]): Promise<boolean> {
    const safeMessages = LineReplyHandler.sanitizeMessages(messages);
    if (!this.client) {
      console.log('[LINE SIMULATE REPLY] (จำลองการส่งเนื่องจากไม่มี Token):', JSON.stringify(safeMessages, null, 2));
      return true;
    }

    try {
      await this.client.replyMessage({
        replyToken,
        messages: safeMessages
      });
      console.log('[LINE REPLY SUCCESS] ส่งข้อความผ่าน ReplyToken สำเร็จ (ฟรี 100% ไม่เสียโควต้า)');
      return true;
    } catch (error: any) {
      console.error('[LINE REPLY ERROR] ไม่สามารถส่งข้อความผ่าน ReplyToken ได้:', error?.message || error);
      return false;
    }
  }

  /**
   * ส่งภาพ QR Login หรือการแจ้งเตือนด่วนไปยัง Admin
   */
  public async pushToAdmin(messages: messagingApi.Message[]): Promise<boolean> {
    const safeMessages = LineReplyHandler.sanitizeMessages(messages);
    if (!this.client || !CONFIG.ADMIN_LINE_USER_ID) {
      console.log('[ADMIN SIMULATE ALERT] ส่งแจ้งเตือนแอดมิน:', JSON.stringify(safeMessages, null, 2));
      return true;
    }

    try {
      await this.client.pushMessage({
        to: CONFIG.ADMIN_LINE_USER_ID,
        messages: safeMessages
      });
      console.log('[ADMIN PUSH SUCCESS] ส่งแจ้งเตือนเข้า LINE แอดมินสำเร็จ');
      return true;
    } catch (error: any) {
      if (error?.status === 429 || (error?.message && error.message.includes('monthly limit'))) {
        console.warn('[ADMIN PUSH NOTICE] โควต้า Push Message ประจำเดือนหมดลงแล้ว (HTTP 429) — แอดมินสามารถดู QR ผ่าน Webhook URL / Console');
        if (this.cachedQuotaStatus) {
          this.cachedQuotaStatus.isExhausted = true;
          this.cachedQuotaStatus.remaining = 0;
        }
      } else {
        console.error('[ADMIN PUSH ERROR] ไม่สามารถส่งแจ้งเตือนแอดมินได้:', error?.message || error);
      }
      return false;
    }
  }

  /**
   * แจ้งเตือนเมื่อบอทเปิดใช้งาน (On Start)
   */
  public async notifyBotStarted(webhookUrl: string): Promise<boolean> {
    const text = `🚀 [ระบบเปิดใช้งาน] บอทสลาก N3 เริ่มทำงานเรียบร้อยแล้ว พร้อมรับออเดอร์ตลอด 24 ชม. (Webhook: ${webhookUrl})`;
    return this.pushToAdmin([{ type: 'text', text }]);
  }

  /**
   * แจ้งเตือนด่วนเมื่อบอทหยุดทำงาน / แครช (On Stop / Shutdown / Crash)
   */
  public async notifyBotStopped(timeStr?: string, reason?: string): Promise<boolean> {
    const time = timeStr || getThaiTime();
    let text = `⚠️ [แจ้งเตือนด่วน] บอทสลาก N3 หยุดทำงานแล้ว (Bot Service Stopped) เมื่อเวลา ${time} กรุณาตรวจสอบหรือเปิดบอทใหม่`;
    if (reason) {
      text += `\n(สาเหตุ: ${reason})`;
    }
    return this.pushToAdmin([{ type: 'text', text }]);
  }

  /**
   * แจ้งเตือนเมื่อแอดมินสั่งหยุดบอทเองอย่างถูกต้อง
   */
  public async notifyBotStoppedByAdmin(): Promise<boolean> {
    const text = `🛑 [แจ้งเตือน] แอดมินได้สั่งหยุดการทำงานของบอทสลาก N3 เรียบร้อยแล้ว`;
    return this.pushToAdmin([{ type: 'text', text }]);
  }

  /**
   * แจ้งเตือนเมื่อระบบปิดทำการประจำวันและ Logoff สำเร็จ (เวลา 23:00 น.)
   */
  public async notifyNightlyLogoff(timeStr?: string): Promise<boolean> {
    const time = timeStr || getThaiTime();
    try {
      const { FlexMessageBuilder } = await import('./flex-message');
      const flexMsg = FlexMessageBuilder.buildNightlyLogoffMessage(time);
      return await this.pushToAdmin([flexMsg]);
    } catch {
      const text = `🌙 [แจ้งเตือน] ปิดระบบจำหน่ายสลาก N3 ประจำวัน (${time})\n\n🔒 บอทได้ทำการ Logoff ออกจากระบบตัวแทนจำหน่าย GLO เรียบร้อยแล้ว\n🔔 ระบบจะแจ้งเตือนอีกครั้งในเวลา 06:00 น. ครับ`;
      return this.pushToAdmin([{ type: 'text', text }]);
    }
  }

  /**
   * แจ้งเตือนเมื่อระบบเปิดทำการจำหน่ายประจำวัน (เวลา 06:00 น.)
   */
  public async notifyMorningStoreOpen(timeStr?: string): Promise<boolean> {
    const time = timeStr || getThaiTime();
    try {
      const { FlexMessageBuilder } = await import('./flex-message');
      const flexMsg = FlexMessageBuilder.buildMorningStoreOpenMessage(time);
      return await this.pushToAdmin([flexMsg]);
    } catch {
      const text = `☀️ [แจ้งเตือน] เปิดระบบจำหน่ายสลาก N3 ประจำวัน (${time})\n\n🟢 สำนักงานสลากฯ เปิดระบบแล้ว ขอให้แอดมินเข้าสู่ระบบด้วยแอปเป๋าตังเพื่อเริ่มขาย\n📲 พิมพ์ "login" ในห้องแชทเพื่อขอรับ QR เข้าสู่ระบบได้เลยครับ`;
      return this.pushToAdmin([{ type: 'text', text }]);
    }
  }

  /**
   * ส่งข้อความ Push โดยตรงไปยัง User ID ของลูกค้า (ใช้เมื่อไม่มี ReplyToken หรือคำสั่งซื้อจากภายนอก)
   */
  public async push(userId: string, messages: messagingApi.Message[]): Promise<boolean> {
    const safeMessages = LineReplyHandler.sanitizeMessages(messages);
    if (!this.client || !userId || userId === 'anonymous') {
      console.log(`[LINE SIMULATE PUSH] ส่งให้ ${userId}:`, JSON.stringify(safeMessages, null, 2));
      return true;
    }

    try {
      await this.client.pushMessage({
        to: userId,
        messages: safeMessages
      });
      console.log(`[LINE PUSH SUCCESS] ส่งข้อความ Push ให้ลูกค้า ${userId} สำเร็จ`);
      return true;
    } catch (error: any) {
      if (error?.status === 429 || (error?.message && error.message.includes('monthly limit'))) {
        console.warn(`[LINE PUSH 429] โควต้า Push Message ฟรี 300 ข้อความหมดแล้วสำหรับเดือนนี้ -> แนะนำให้ลูกค้าส่งข้อความในห้องแชทเพื่อให้ระบบตอบกลับฟรีผ่าน ReplyToken`);
        if (this.cachedQuotaStatus) {
          this.cachedQuotaStatus.isExhausted = true;
          this.cachedQuotaStatus.remaining = 0;
        }
      } else {
        console.error(`[LINE PUSH ERROR] ไม่สามารถส่งข้อความ Push ให้ลูกค้า ${userId} ได้:`, error?.message || error);
      }
      return false;
    }
  }

  /**
   * แสดงอนิเมชันจุด 3 จุดกำลังพิมพ์ในห้องแชท LINE (Native Loading Animation)
   * ฟังก์ชันทางการของ LINE: ฟรี 100% ไม่เปลือง ReplyToken และไม่คิดโควต้าข้อความ Push
   */
  public async showLoading(userId: string, seconds: number = 30): Promise<boolean> {
    if (!this.client || !userId || userId === 'anonymous') {
      return false;
    }

    try {
      const validSeconds = Math.min(Math.max(Math.round(seconds / 5) * 5, 5), 60);
      await this.client.showLoadingAnimation({
        chatId: userId,
        loadingSeconds: validSeconds
      });
      console.log(`[LINE LOADING ANIMATION] แสดงสถานะกำลังพิมพ์ให้ลูกค้า ${userId} (${validSeconds} วินาที - ฟรี 100%)`);
      return true;
    } catch (error: any) {
      console.warn('[LINE LOADING NOTICE] ไม่สามารถแสดงสถานะกำลังพิมพ์ได้:', error?.message || error);
      return false;
    }
  }
}
