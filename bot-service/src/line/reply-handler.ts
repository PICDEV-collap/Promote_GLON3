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

export class LineReplyHandler {
  private client: messagingApi.MessagingApiClient | null = null;

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
   * ส่งข้อความตอบกลับโดยใช้ replyToken (ฟรี ไม่เสียโควต้า Push Message 500 ข้อความ)
   */
  public async reply(replyToken: string, messages: messagingApi.Message[]): Promise<boolean> {
    if (!this.client) {
      console.log('[LINE SIMULATE REPLY] (จำลองการส่งเนื่องจากไม่มี Token):', JSON.stringify(messages, null, 2));
      return true;
    }

    try {
      await this.client.replyMessage({
        replyToken,
        messages
      });
      console.log('[LINE REPLY SUCCESS] ส่งข้อความผ่าน ReplyToken สำเร็จ (ไม่เสียโควต้าข้อความ)');
      return true;
    } catch (error) {
      console.error('[LINE REPLY ERROR] ไม่สามารถส่งข้อความผ่าน ReplyToken ได้:', error);
      return false;
    }
  }

  /**
   * ส่งภาพ QR Login หรือการแจ้งเตือนด่วนไปยัง Admin
   */
  public async pushToAdmin(messages: messagingApi.Message[]): Promise<boolean> {
    if (!this.client || !CONFIG.ADMIN_LINE_USER_ID) {
      console.log('[ADMIN SIMULATE ALERT] ส่งแจ้งเตือนแอดมิน:', JSON.stringify(messages, null, 2));
      return true;
    }

    try {
      await this.client.pushMessage({
        to: CONFIG.ADMIN_LINE_USER_ID,
        messages
      });
      console.log('[ADMIN PUSH SUCCESS] ส่งแจ้งเตือนเข้า LINE แอดมินสำเร็จ');
      return true;
    } catch (error) {
      console.error('[ADMIN PUSH ERROR] ไม่สามารถส่งแจ้งเตือนแอดมินได้:', error);
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
   * ส่งข้อความ Push โดยตรงไปยัง User ID ของลูกค้า (ใช้เมื่อคิวต้องรอนานจน replyToken หมดอายุ)
   */
  public async push(userId: string, messages: messagingApi.Message[]): Promise<boolean> {
    if (!this.client || !userId) {
      console.log(`[LINE SIMULATE PUSH] ส่งให้ ${userId}:`, JSON.stringify(messages, null, 2));
      return true;
    }

    try {
      await this.client.pushMessage({
        to: userId,
        messages
      });
      console.log(`[LINE PUSH SUCCESS] ส่งข้อความ Push ให้ลูกค้า ${userId} สำเร็จ`);
      return true;
    } catch (error) {
      console.error(`[LINE PUSH ERROR] ไม่สามารถส่งข้อความ Push ให้ลูกค้า ${userId} ได้:`, error);
      return false;
    }
  }

  /**
   * แสดงอนิเมชันจุด 3 จุดกำลังพิมพ์ในห้องแชท LINE (Native Loading Animation)
   * ฟังก์ชันทางการของ LINE: ไม่เปลือง ReplyToken และไม่คิดโควต้าข้อความ Push
   */
  public async showLoading(userId: string, seconds: number = 20): Promise<boolean> {
    if (!this.client || !userId || userId === 'anonymous') {
      return false;
    }

    try {
      const validSeconds = Math.min(Math.max(Math.round(seconds / 5) * 5, 5), 60);
      await this.client.showLoadingAnimation({
        chatId: userId,
        loadingSeconds: validSeconds
      });
      console.log(`[LINE LOADING ANIMATION] แสดงสถานะกำลังพิมพ์ให้ลูกค้า ${userId} (${validSeconds} วินาที)`);
      return true;
    } catch (error) {
      // ป้องกัน error ในกรณีที่บัญชีไลน์ผู้ใช้เวอร์ชันเก่าหรือเป็น Group Chat
      console.warn('[LINE LOADING NOTICE] ไม่สามารถแสดงสถานะกำลังพิมพ์ได้:', error);
      return false;
    }
  }
}
