/**
 * scripts/watch-session.js
 * 
 * เครื่องมือเฝ้าระวังเซสชัน GLO N3 แบบเรียลไทม์ (ตรวจสอบทุก 500 ms)
 * เมื่อตรวจพบว่าเซสชันหลุด จะส่งแจ้งเตือนด่วนเข้า Telegram แอดมินทันที
 * 
 * ใช้งาน:
 *   node scripts/watch-session.js
 *   npm run logoff
 *   npm run session:watch
 */

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const BOT_DIR = path.join(ROOT_DIR, 'bot-service');

// ดึงค่าคอนฟิก Telegram จาก bot-service/.env
function getTelegramConfig() {
  const envPath = path.join(BOT_DIR, '.env');
  let botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  let chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';
  let enabled = process.env.TELEGRAM_NOTIFY_ENABLED !== 'false';

  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (k === 'TELEGRAM_BOT_TOKEN' && !botToken) botToken = v;
        if ((k === 'TELEGRAM_ADMIN_CHAT_ID' || k === 'TELEGRAM_CHAT_ID') && !chatId) chatId = v;
        if (k === 'TELEGRAM_NOTIFY_ENABLED') enabled = v !== 'false';
      }
    } catch {}
  }
  return { botToken, chatId, enabled: enabled && !!botToken && !!chatId };
}

// ส่งข้อความแจ้งเตือนเข้า Telegram แอดมิน
function sendTelegramAlert(text) {
  return new Promise((resolve) => {
    const { botToken, chatId, enabled } = getTelegramConfig();
    if (!enabled) {
      console.log('[WATCHDOG TELEGRAM] ไม่ได้เปิดใช้งาน Telegram หรือข้อมูลไม่ครบถ้วน');
      return resolve(false);
    }

    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });

    const req = https.request(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('\x1b[32m[TELEGRAM ALERT SENT] ส่งแจ้งเตือนเข้า Telegram แอดมินสำเร็จเรียบร้อย\x1b[0m');
          resolve(true);
        } else {
          console.warn(`[TELEGRAM ALERT WARNING] HTTP ${res.statusCode}: ${data}`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.warn('[TELEGRAM ALERT ERROR]', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.warn('[TELEGRAM ALERT TIMEOUT]');
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

// ตรวจสอบสถานะผ่าน Bot API (พอร์ต 3333)
function queryBotWatchdogApi() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3333,
      path: '/api/admin/session/status',
      method: 'GET',
      timeout: 400
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: true, data: json.data });
        } catch {
          resolve({ ok: false });
        }
      });
    });

    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.end();
  });
}

// ตรวจสอบผ่าน Chrome CDP (พอร์ต 9222) โดยตรง
function queryCdpStatus() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9222,
      path: '/json/list',
      method: 'GET',
      timeout: 400
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const pages = JSON.parse(data);
          const n3Page = pages.find(p => p.url && p.url.includes('glolotteryshop.com'));
          if (n3Page) {
            const isLogin = n3Page.url.includes('/login');
            resolve({
              cdpAlive: true,
              hasPage: true,
              url: n3Page.url,
              title: n3Page.title,
              isLogin
            });
          } else {
            resolve({
              cdpAlive: true,
              hasPage: false,
              pagesCount: pages.length
            });
          }
        } catch {
          resolve({ cdpAlive: false });
        }
      });
    });

    req.on('error', () => resolve({ cdpAlive: false }));
    req.on('timeout', () => { req.destroy(); resolve({ cdpAlive: false }); });
    req.end();
  });
}

// State Machine
let isRunning = true;
let checkCount = 0;
let hasAlerted = false;
let lastStatus = 'UNKNOWN';
let lastUrl = '-';
let lastDropReason = '-';
const tgConfig = getTelegramConfig();

async function runWatchdogLoop() {
  console.clear();
  console.log('===============================================================================');
  console.log('         🛡️ GLO N3 REAL-TIME SESSION WATCHDOG & TELEGRAM ALERT');
  console.log('               (Thanagit Namchok - N3 Digital Lottery Agent)');
  console.log('===============================================================================');
  console.log(`  ความถี่การตรวจสอบ:  \x1b[36mทุก 500 ms (Real-time)\x1b[0m`);
  console.log(`  ระบบแจ้งเตือน Telegram: ${tgConfig.enabled ? `\x1b[32m● เปิดใช้งาน (Chat ID: ${tgConfig.chatId})\x1b[0m` : '\x1b[31m✕ ยังไม่ได้ตั้งค่า Token/Chat ID\x1b[0m'}`);
  console.log(`  กด Ctrl+C เพื่อออกจากโปรแกรม`);
  console.log('===============================================================================\n');

  const timer = setInterval(async () => {
    if (!isRunning) {
      clearInterval(timer);
      return;
    }

    checkCount++;
    const nowStr = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }) + ' น.';
    let isHealthy = false;
    let currentReason = '';
    let currentUrl = '';

    // 1. ลองสอบถามผ่าน Bot Service API (ถ้าบอทเปิดอยู่)
    const botRes = await queryBotWatchdogApi();
    if (botRes.ok && botRes.data) {
      const bStatus = botRes.data.status;
      currentUrl = botRes.data.detectedUrl || '';
      if (bStatus === 'LOGGED_IN') {
        isHealthy = true;
      } else if (bStatus === 'DISCONNECTED') {
        isHealthy = false;
        currentReason = botRes.data.lastDropReason || 'เซสชันหลุดหรือหมดอายุ';
      }
    } else {
      // 2. ถ้าไม่ได้เปิด Bot Service หรือ API ยังไม่ตอบสนอง ให้ตรวจสอบผ่าน Chrome CDP โดยตรง
      const cdpRes = await queryCdpStatus();
      if (!cdpRes.cdpAlive) {
        isHealthy = false;
        currentReason = 'Chrome Browser หรือการเชื่อมต่อ CDP (พอร์ต 9222) ปิดตัวลง';
        currentUrl = 'cdp://localhost:9222 (Offline)';
      } else if (!cdpRes.hasPage) {
        isHealthy = false;
        currentReason = 'ไม่พบแท็บระบบตัวแทนจำหน่าย GLO N3 ในเบราว์เซอร์';
        currentUrl = 'about:blank';
      } else if (cdpRes.isLogin) {
        isHealthy = false;
        currentReason = 'หน้าเว็บถูกดีดกลับมาที่หน้าเข้าสู่ระบบ (Redirected to /login/)';
        currentUrl = cdpRes.url;
      } else {
        isHealthy = true;
        currentUrl = cdpRes.url;
      }
    }

    lastUrl = currentUrl || lastUrl;

    // ประมวลผลสถานะและการแจ้งเตือน Telegram
    if (isHealthy) {
      if (lastStatus === 'DISCONNECTED' && hasAlerted) {
        hasAlerted = false;
        const restoreMsg = `🟢 <b>[แจ้งเตือน] เซสชัน GLO N3 กลับมาออนไลน์แล้ว!</b>\n\n` +
          `✅ ร้านสลาก N3 ธนกิจนำโชค เข้าสู่ระบบสำเร็จพร้อมรับออเดอร์ตามปกติ\n` +
          `⏱️ <b>เวลา:</b> ${nowStr}\n` +
          `🛡️ ระบบเฝ้าระวังเซสชันทำงานต่อเนื่อง (ทุก 500 ms)`;
        await sendTelegramAlert(restoreMsg);
      }
      lastStatus = 'LOGGED_IN';
      lastDropReason = '-';
    } else {
      lastStatus = 'DISCONNECTED';
      lastDropReason = currentReason;

      // Anti-Spam Latch: ส่งเตือน Telegram ทันทีเฉพาะครั้งแรกที่หลุด
      if (!hasAlerted) {
        hasAlerted = true;
        const alertMsg = `🚨 <b>[แจ้งเตือนด่วน] เซสชัน GLO N3 หลุด!</b>\n\n` +
          `⚠️ <b>สถานะ:</b> ตรวจพบเซสชันตัวแทนจำหน่าย GLO N3 หลุดการเชื่อมต่อ\n` +
          `🔍 <b>สาเหตุ:</b> ${currentReason}\n` +
          `🌐 <b>URL:</b> ${lastUrl}\n` +
          `⏱️ <b>เวลาที่ตรวจพบ:</b> ${nowStr}\n` +
          `🔄 <b>รอบการตรวจ:</b> ทุก 500 ms (Real-time Watchdog)\n\n` +
          `📲 <b>คำแนะนำ:</b> กรุณาเปิดแอปเป๋าตังเพื่อสแกน QR ล็อกอินใหม่ โดยพิมพ์คำว่า "qr" ในแชท LINE ร้านค้าครับ`;
        await sendTelegramAlert(alertMsg);
      }
    }

    // แสดงผลสถานะสดบนหน้าต่าง Terminal (บรรทัดเดิมแบบ In-Place Status)
    const statusBadge = isHealthy
      ? '\x1b[32m● ONLINE (Session Active)\x1b[0m'
      : '\x1b[31m✕ DISCONNECTED (Alert Sent)\x1b[0m';

    const reasonLine = isHealthy ? '' : ` | \x1b[33mสาเหตุ: ${lastDropReason}\x1b[0m`;
    process.stdout.write(
      `\r[รอบตรวจ: ${checkCount}] สถานะ: ${statusBadge} | เวลา: ${nowStr} | URL: ${lastUrl.slice(0, 42)}...${reasonLine}   `
    );

  }, 500);
}

process.on('SIGINT', () => {
  isRunning = false;
  console.log('\n\n[EXIT] ยุติการทำงานของ GLO N3 Session Watchdog เรียบร้อยแล้ว');
  process.exit(0);
});

process.on('SIGTERM', () => {
  isRunning = false;
  process.exit(0);
});

runWatchdogLoop().catch((err) => {
  console.error('[WATCHDOG ERROR]', err);
  process.exit(1);
});
