/**
 * เครื่องมือทดสอบการแจ้งเตือน Telegram Bot สำหรับแอดมินร้านสลาก N3
 * ใช้งาน: node scripts/test-telegram.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..');
const BOT_ENV_PATH = path.join(ROOT_DIR, 'bot-service', '.env');
const ROOT_ENV_PATH = path.join(ROOT_DIR, '.env');

function loadEnv() {
  const envPaths = [BOT_ENV_PATH, ROOT_ENV_PATH];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) continue;
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[k]) {
            process.env[k] = v;
          }
        }
      } catch {}
    }
  }
}

loadEnv();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';

async function testTelegram() {
  console.log('\n===============================================================================');
  console.log('       🔍 ระบบทดสอบการแจ้งเตือนแอดมินผ่าน TELEGRAM BOT (N3 DEALER)');
  console.log('===============================================================================');

  console.log(`\n[1/3] ตรวจสอบค่าคอนฟิกใน .env:`);
  console.log(`  - TELEGRAM_BOT_TOKEN:     ${BOT_TOKEN ? `\x1b[32m● ตั้งค่าแล้ว (${BOT_TOKEN.slice(0, 10)}...)\x1b[0m` : '\x1b[31m✕ ยังไม่ได้ตั้งค่า\x1b[0m'}`);
  console.log(`  - TELEGRAM_ADMIN_CHAT_ID: ${CHAT_ID ? `\x1b[32m● ตั้งค่าแล้ว (${CHAT_ID})\x1b[0m` : '\x1b[31m✕ ยังไม่ได้ตั้งค่า\x1b[0m'}`);

  if (!BOT_TOKEN) {
    console.log('\n\x1b[33m⚠️ [วิธีรับ TELEGRAM_BOT_TOKEN]:\x1b[0m');
    console.log('  1. เปิดแอป Telegram แล้วค้นหาบอทชื่อ \x1b[36m@BotFather\x1b[0m');
    console.log('  2. พิมพ์คำสั่ง \x1b[32m/newbot\x1b[0m แล้วตั้งชื่อบอทของคุณ เช่น "GLO N3 Admin Bot"');
    console.log('  3. คัดลอก HTTP API Token ที่ได้ (เช่น 123456789:ABCdefGhI...)');
    console.log('  4. นำไปวางในไฟล์ \x1b[36mbot-service/.env\x1b[0m ที่บรรทัด:');
    console.log('     TELEGRAM_BOT_TOKEN=123456789:ABCdefGhI...\n');
  }

  if (!CHAT_ID) {
    console.log('\x1b[33m⚠️ [วิธีรับ TELEGRAM_ADMIN_CHAT_ID ของคุณ]:\x1b[0m');
    console.log('  1. ค้นหาบอท \x1b[36m@userinfobot\x1b[0m หรือ \x1b[36m@getidsbot\x1b[0m ใน Telegram');
    console.log('  2. กดปุ่ม \x1b[32mStart\x1b[0m บอทจะแสดงเลข Id ของคุณ (เช่น 987654321)');
    console.log('  3. นำไปวางในไฟล์ \x1b[36mbot-service/.env\x1b[0m ที่บรรทัด:');
    console.log('     TELEGRAM_ADMIN_CHAT_ID=987654321\n');
    console.log('  * สำคัญ: ต้องเปิดบอทที่คุณสร้างในข้อ 1 แล้วกด Start คุยกับบอทอย่างน้อย 1 ครั้งก่อนด้วยครับ!\n');
  }

  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('-------------------------------------------------------------------------------');
    console.log('\x1b[31m✕ การทดสอบหยุดชั่วคราว: กรุณากรอก TOKEN และ CHAT_ID ใน bot-service/.env ให้เรียบร้อย แล้วรันคำสั่งนี้ใหม่อีกครั้งครับ\x1b[0m');
    console.log('===============================================================================\n');
    return;
  }

  // 2. ตรวจสอบ Bot Token ผ่าน getMe
  console.log(`\n[2/3] ตรวจสอบความถูกต้องของ Bot Token กับ Telegram Server...`);
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      console.log(`\x1b[31m✕ Token ไม่ถูกต้อง (${res.status}): ${data.description || 'Unknown error'}\x1b[0m\n`);
      return;
    }

    const bot = data.result;
    console.log(`  \x1b[32m✓ เชื่อมต่อสำเร็จ!\x1b[0m`);
    console.log(`  - ชื่อบอท:    \x1b[36m${bot.first_name}\x1b[0m`);
    console.log(`  - Username:   \x1b[36m@${bot.username}\x1b[0m`);
    console.log(`  - Can Join:   ${bot.can_join_groups ? 'Yes' : 'No'}`);
  } catch (err) {
    console.log(`\x1b[31m✕ ไม่สามารถเชื่อมต่อ Telegram API ได้: ${err.message}\x1b[0m\n`);
    return;
  }

  // 3. ส่งข้อความทดสอบ
  console.log(`\n[3/3] ทดสอบส่งข้อความแจ้งเตือนเข้า Telegram แอดมิน (Chat ID: ${CHAT_ID})...`);
  const testMsg = `🤖 <b>[ทดสอบระบบแจ้งเตือน Telegram]</b>\n\n` +
    `✅ เชื่อมต่อบอทสำเร็จสมบูรณ์!\n` +
    `📱 <b>Chat ID:</b> <code>${CHAT_ID}</code>\n` +
    `⏱️ <b>เวลาทดสอบ:</b> ${new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })} น.\n\n` +
    `🎉 <b>ระบบแจ้งเตือนแอดมินผ่าน Telegram Bot พร้อมใช้งาน 100%:</b>\n` +
    `  • ภาพ QR Code ล็อกอินเป๋าตังสำหรับแอดมิน\n` +
    `  • แจ้งเตือนออเดอร์ใหม่และสลิป QR Code ชำระเงิน\n` +
    `  • แจ้งเตือนเวลาเปิด-ปิดร้านประจำวัน (06:00 / 23:00 น.)\n` +
    `  • ฟรี 100% ไม่จำกัดโควต้าข้อความตลอดชีพ ✨`;

  try {
    const sendRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: testMsg,
        parse_mode: 'HTML'
      }),
      signal: AbortSignal.timeout(10000)
    });

    const sendData = await sendRes.json().catch(() => ({}));
    if (sendRes.ok && sendData.ok) {
      console.log(`  \x1b[32m✓ ส่งข้อความเข้า Telegram แอดมินสำเร็จเรียบร้อย! 🎉\x1b[0m`);
      console.log(`  (กรุณาเปิดแอป Telegram เพื่อดูข้อความทดสอบที่ได้รับ)`);
    } else {
      console.log(`  \x1b[31m✕ ส่งข้อความไม่สำเร็จ (${sendRes.status}): ${sendData.description || 'Unknown error'}\x1b[0m`);
      if (sendData.description && sendData.description.includes('chat not found')) {
        console.log(`\n\x1b[33m💡 คำแนะนำ: แอดมินต้องเปิดบอทใน Telegram แล้วกดปุ่ม "Start" ก่อน 1 ครั้ง เพื่อให้บอทสามารถส่งข้อความหาท่านได้ครับ\x1b[0m`);
      }
    }
  } catch (err) {
    console.log(`  \x1b[31m✕ ขัดข้องในการส่งข้อความ: ${err.message}\x1b[0m`);
  }

  console.log('\n===============================================================================\n');
}

testTelegram().catch(err => {
  console.error('[FATAL]', err);
});
