import { messagingApi } from '@line/bot-sdk';
import { CONFIG } from '../config';

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
}
