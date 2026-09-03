import { messagingApi } from '@line/bot-sdk';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const adminId = process.env.ADMIN_LINE_USER_ID || '';

console.log('Testing LINE Token...');
console.log('Token length:', token.length);
console.log('Target Admin ID:', adminId);

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: token
});

async function test() {
  try {
    const res = await client.pushMessage({
      to: adminId,
      messages: [
        {
          type: 'text',
          text: '✅ ทดสอบเชื่อมต่อ LINE Messaging API สำเร็จแล้ว! ระบบบอท N3 พร้อมทำงานแล้วครับ 🎉'
        }
      ]
    });
    console.log('[SUCCESS] ส่งข้อความเข้า LINE สำเร็จแล้ว!', res);
  } catch (err: any) {
    console.error('[ERROR] ส่งข้อความไม่สำเร็จ:', err?.message || err);
    if (err?.body) {
      console.error('Details:', JSON.stringify(err.body));
    }
  }
}

test();
