const { spawn, execSync } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..');
const BOT_DIR = path.join(ROOT_DIR, 'bot-service');
const QR_DIR = path.join(ROOT_DIR, 'public', 'qrcodes');
const mode = process.argv[2] || 'menu';

/**
 * ดึงการตั้งค่า LINE จาก bot-service/.env
 */
function getLineConfig() {
  const envPath = path.join(BOT_DIR, '.env');
  let token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  let adminId = process.env.ADMIN_LINE_USER_ID || process.env.LINE_ADMIN_USER_ID || '';
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const k = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (k === 'LINE_CHANNEL_ACCESS_TOKEN' && !token) token = val;
        if ((k === 'ADMIN_LINE_USER_ID' || k === 'LINE_ADMIN_USER_ID') && !adminId) adminId = val;
      }
    } catch {}
  }
  return { token, adminId };
}

/**
 * ส่งแจ้งเตือน Push Message ไปยัง LINE Admin
 */
function sendLineAdminAlert(messageText) {
  return new Promise((resolve) => {
    const { token, adminId } = getLineConfig();
    if (!token || !adminId) {
      console.log('[ADMIN SIMULATE ALERT] (No token/adminId):', messageText);
      return resolve(true);
    }
    const payload = JSON.stringify({
      to: adminId,
      messages: [{ type: 'text', text: messageText }]
    });
    const req = https.request('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[LINE ALERT SUCCESS] ส่งแจ้งเตือนแอดมินสำเร็จ');
          resolve(true);
        } else {
          console.error(`[LINE ALERT ERROR] HTTP ${res.statusCode}: ${data}`);
          resolve(false);
        }
      });
    });
    req.on('error', (err) => {
      console.error('[LINE ALERT ERROR]', err.message);
      resolve(false);
    });
    req.on('timeout', () => {
      req.destroy();
      console.warn('[LINE ALERT TIMEOUT]');
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

/**
 * อัปเดต Webhook URL ไปยัง LINE Developers Console อัตโนมัติ (ไม่ต้องคอยก๊อปปี้ไปวางเอง)
 */
async function updateLineWebhookEndpoint(webhookUrl, maxRetries = 3) {
  const { token } = getLineConfig();
  if (!token || !webhookUrl || !webhookUrl.startsWith('https://')) return false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const success = await new Promise((resolve) => {
      const payload = JSON.stringify({ endpoint: webhookUrl });
      const req = https.request('https://api.line.me/v2/bot/channel/webhook/endpoint', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 8000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('\x1b[32m[LINE AUTO-SYNC] อัปเดต Webhook URL ไปยัง LINE Developers Console สำเร็จอัตโนมัติ!\x1b[0m');
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.write(payload);
      req.end();
    });

    if (success) return true;
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return false;
}

/**
 * ดึงเวลาปัจจุบันในรูปแบบภาษาไทย
 */
function getThaiTime(date = new Date()) {
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

/**
 * ตรวจสอบว่าแอดมินเป็นผู้สั่งหยุดบอทอย่างตั้งใจหรือไม่
 */
function isStopIntentional() {
  const intentionalStopFile = path.join(ROOT_DIR, '.stop_intentional');
  try {
    if (fs.existsSync(intentionalStopFile)) {
      const stats = fs.statSync(intentionalStopFile);
      if (Date.now() - stats.mtimeMs < 60000) return true;
    }
  } catch {}
  return false;
}

/**
 * แจ้งเตือนเมื่อบอทเปิดใช้งาน (On Start)
 */
function notifyBotStarted(webhookUrl) {
  return sendLineAdminAlert(`🚀 [ระบบเปิดใช้งาน] บอทสลาก N3 เริ่มทำงานเรียบร้อยแล้ว พร้อมรับออเดอร์ตลอด 24 ชม. (Webhook: ${webhookUrl})`);
}

/**
 * แจ้งเตือนด่วนเมื่อบอทหยุดทำงาน / แครช (On Stop / Shutdown / Crash)
 */
function notifyBotStopped(timeStr, reason) {
  const time = timeStr || getThaiTime();
  let text = `⚠️ [แจ้งเตือนด่วน] บอทสลาก N3 หยุดทำงานแล้ว (Bot Service Stopped) เมื่อเวลา ${time} กรุณาตรวจสอบหรือเปิดบอทใหม่`;
  if (reason) {
    text += `\n(สาเหตุ: ${reason})`;
  }
  return sendLineAdminAlert(text);
}

/**
 * แจ้งเตือนเมื่อแอดมินสั่งหยุดบอทเองอย่างถูกต้อง
 */
function notifyBotStoppedByAdmin() {
  return sendLineAdminAlert('🛑 [แจ้งเตือน] แอดมินได้สั่งหยุดการทำงานของบอทสลาก N3 เรียบร้อยแล้ว');
}

let hasEngineAlerted = false;

function setupEngineLifecycle() {
  process.on('uncaughtException', async (err) => {
    console.error('[ENGINE CRASH] Uncaught Exception:', err);
    if (!hasEngineAlerted && !isStopIntentional() && (mode === 'start' || mode === 'menu')) {
      hasEngineAlerted = true;
      const timeStr = getThaiTime();
      await notifyBotStopped(timeStr, err.message || 'Engine crash');
    }
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[ENGINE UNHANDLED REJECTION]', reason);
  });

  process.on('beforeExit', async (_code) => {
    if (!hasEngineAlerted && !isStopIntentional() && mode === 'start') {
      hasEngineAlerted = true;
      const timeStr = getThaiTime();
      await notifyBotStopped(timeStr, 'Dashboard process ended');
    }
  });
}

/**
 * ตรวจสอบว่า Cloudflare Tunnel กำลังทำงานอยู่ และมี URL สาธารณะที่พร้อมใช้งานหรือไม่
 */
function isTunnelAlive() {
  try {
    const psCmd = 'Get-Process -Name *cloudflared* -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id';
    const out = execSync(`powershell -NoProfile -Command "${psCmd}"`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    }).trim();
    if (!out) return false;

    const urlFile = path.join(ROOT_DIR, 'webhook-url.txt');
    if (!fs.existsSync(urlFile)) return false;
    const u = fs.readFileSync(urlFile, 'utf-8').trim();
    return u.startsWith('https://') && u.includes('.trycloudflare.com');
  } catch {
    return false;
  }
}

/**
 * 1. Kill lingering processes on Port 3333, Cloudflare, dist/index.js, and browser_profile
 * @param {Object} options - { keepTunnel: boolean }
 */
function killLingering(options = {}) {
  const keepTunnel = options.keepTunnel === true;
  try {
    const psParts = [
      'Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }'
    ];
    if (!keepTunnel) {
      psParts.unshift('Get-Process -Name *cloudflared* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue');
      psParts.push('Get-CimInstance Win32_Process | Where-Object { ($_.CommandLine -like "*dist/index.js*" -or $_.CommandLine -like "*dist\\\\index.js*" -or $_.CommandLine -like "*cloudflared*" -or $_.CommandLine -like "*browser_profile*") -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }');
    } else {
      psParts.push('Get-CimInstance Win32_Process | Where-Object { ($_.CommandLine -like "*dist/index.js*" -or $_.CommandLine -like "*dist\\\\index.js*" -or $_.CommandLine -like "*browser_profile*") -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }');
    }
    const psCmd = psParts.join('; ');
    execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'ignore', windowsHide: true });
  } catch (e) {}

  if (!keepTunnel) {
    try {
      execSync('taskkill /F /IM cloudflared.exe', { stdio: 'ignore', windowsHide: true });
    } catch (e) {}
  }

  const pidFile = path.join(ROOT_DIR, 'bot.pid');
  if (fs.existsSync(pidFile)) {
    try {
      const pidData = JSON.parse(fs.readFileSync(pidFile, 'utf-8'));
      if (pidData.botPid) {
        try { execSync(`taskkill /F /T /PID ${pidData.botPid}`, { stdio: 'ignore', windowsHide: true }); } catch {}
      }
      if (!keepTunnel) {
        if (pidData.tunnelPid) {
          try { execSync(`taskkill /F /T /PID ${pidData.tunnelPid}`, { stdio: 'ignore', windowsHide: true }); } catch {}
        }
        fs.unlinkSync(pidFile);
      } else {
        delete pidData.botPid;
        fs.writeFileSync(pidFile, JSON.stringify(pidData, null, 2), 'utf-8');
      }
    } catch {}
  }
}

/**
 * 2. Clean temporary QR Code files and logs
 */
function cleanFiles() {
  let count = 0;
  if (fs.existsSync(QR_DIR)) {
    const files = fs.readdirSync(QR_DIR);
    for (const f of files) {
      if (f.startsWith('payment-') || f.startsWith('error-') || f.startsWith('login-') || f.startsWith('n3-dealer-')) {
        try {
          fs.unlinkSync(path.join(QR_DIR, f));
          count++;
        } catch (e) {}
      }
    }
  }

  const oldLogs = ['cf-log.txt', 'tunnel.log', 'bot.log', 'Webhook'];
  for (const log of oldLogs) {
    const logPath = path.join(ROOT_DIR, log);
    if (fs.existsSync(logPath)) {
      try { fs.unlinkSync(logPath); } catch (e) {}
    }
  }

  return count;
}

/**
 * Helper: ตรวจสอบสถานะการทำงานของบอทและพอร์ต 3333
 */
function getBotStatus() {
  try {
    const portCheck = execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"', { encoding: 'utf-8', windowsHide: true }).trim();
    if (portCheck) {
      return { isRunning: true, pid: portCheck };
    }
  } catch {}

  // Fallback netstat
  try {
    const netstatOut = execSync('netstat -ano', { encoding: 'utf-8', windowsHide: true });
    const match = netstatOut.match(/:3333\s+.*LISTENING\s+(\d+)/i);
    if (match && match[1]) {
      return { isRunning: true, pid: match[1] };
    }
  } catch {}

  return { isRunning: false, pid: '' };
}

/**
 * Helper: ดึง URL สาธารณะของ LINE Webhook ล่าสุด
 */
function getLatestWebhookUrl() {
  const urlFile = path.join(ROOT_DIR, 'webhook-url.txt');
  if (fs.existsSync(urlFile)) {
    try {
      const u = fs.readFileSync(urlFile, 'utf-8').trim();
      if (u) return u;
    } catch {}
  }

  const tunnelLogPath = path.join(ROOT_DIR, 'tunnel.log');
  if (fs.existsSync(tunnelLogPath)) {
    try {
      const content = fs.readFileSync(tunnelLogPath, 'utf-8');
      const matches = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
      if (matches && matches.length > 0) {
        return matches[matches.length - 1] + '/webhook';
      }
    } catch {}
  }
  return '';
}

/**
 * 3. Check system & quota status
 */
function checkStatus() {
  console.log('===============================================================================');
  console.log('                    N3 SYSTEM STATUS INSPECTION');
  console.log('===============================================================================');

  const status = getBotStatus();
  if (status.isRunning) {
    console.log(`[SERVICE]  Status: \x1b[32m● RUNNING\x1b[0m (Port 3333, PID: ${status.pid})`);
  } else {
    console.log('[SERVICE]  Status: \x1b[33m○ STOPPED\x1b[0m (Port 3333 is free)');
  }

  const webhookUrl = getLatestWebhookUrl();
  if (webhookUrl) {
    console.log(`[WEBHOOK]  LINE Webhook URL: \x1b[36m\x1b[1m${webhookUrl}\x1b[0m`);
  } else {
    console.log('[WEBHOOK]  LINE Webhook URL: Not active (start bot to generate)');
  }

  const quotaPath = path.join(BOT_DIR, 'data', 'quota.json');
  if (fs.existsSync(quotaPath)) {
    try {
      const qData = JSON.parse(fs.readFileSync(quotaPath, 'utf-8'));
      const remaining = qData.remainingQuota !== undefined ? qData.remainingQuota : (qData.maxQuota - qData.usedQuota);
      console.log(`[QUOTA]    Remaining Quota: \x1b[36m${remaining.toLocaleString()} / ${qData.maxQuota.toLocaleString()} tickets\x1b[0m (Used: ${qData.usedQuota} tickets)`);
      console.log(`[ROUND]    Current Draw Round: ${qData.round || qData.currentRoundId || '-'}`);
      if (qData.syncedAt) {
        console.log(`[SYNC]     Live Portal Synced: \x1b[32m${new Date(qData.syncedAt).toLocaleString('th-TH')}\x1b[0m`);
      }
    } catch (e) {}
  } else {
    console.log('[QUOTA]    Default Quota: 2,000 tickets');
  }

  if (fs.existsSync(QR_DIR)) {
    const qrFiles = fs.readdirSync(QR_DIR).filter(f => f.endsWith('.png'));
    console.log(`[STORAGE]  Stored QR Code Images: ${qrFiles.length} files`);
  }

  const browserProfileDir = path.join(BOT_DIR, 'data', 'browser_profile');
  if (fs.existsSync(browserProfileDir)) {
    console.log('[SESSION]  Chrome Profile: Present (Persistent login session active in data/browser_profile)');
  }

  const logPath = path.join(ROOT_DIR, 'bot.log');
  if (fs.existsSync(logPath)) {
    const stats = fs.statSync(logPath);
    console.log(`[LOG]      bot.log size: ${(stats.size / 1024).toFixed(1)} KB`);
  }

  console.log('===============================================================================\n');
}

/**
 * Helper: ค้นหา binary cloudflared หรือรันผ่าน node npx-cli โดยเลี่ยง cmd.exe
 */
function getCloudflaredCommand() {
  // 1. ตรวจสอบ bin/ ของโปรเจกต์
  const localBin = path.join(ROOT_DIR, 'bin', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(localBin)) {
    return { command: localBin, args: [], shell: false };
  }

  // 2. ตรวจสอบ npm cache บน Windows (pre-downloaded cloudflared binary)
  if (process.platform === 'win32') {
    const userProfile = process.env.USERPROFILE || process.env.HOME || '';
    const npxCacheDir = path.join(userProfile, 'AppData', 'Local', 'npm-cache', '_npx');
    if (fs.existsSync(npxCacheDir)) {
      try {
        const dirs = fs.readdirSync(npxCacheDir);
        for (const d of dirs) {
          const candidate = path.join(npxCacheDir, d, 'node_modules', 'cloudflared', 'bin', 'cloudflared.exe');
          if (fs.existsSync(candidate)) {
            return { command: candidate, args: [], shell: false };
          }
        }
      } catch {}
    }
  }

  // 3. ตรวจสอบ PATH ของระบบ
  try {
    const cmd = process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared';
    const whereOut = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
    if (whereOut) {
      const firstLine = whereOut.split(/\r?\n/)[0].trim();
      if (fs.existsSync(firstLine)) {
        return { command: firstLine, args: [], shell: false };
      }
    }
  } catch {}

  // 4. รันผ่าน node npx-cli.js โดยตรง (เลี่ยง cmd.exe)
  const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (fs.existsSync(npxCli)) {
    return { command: process.execPath, args: [npxCli, '--yes', 'cloudflared'], shell: false };
  }

  // 5. Fallback
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return { command: npxCmd, args: ['--yes', 'cloudflared'], shell: true };
}

/**
 * 4. Start All-in-One Dashboard (Bot + Cloudflare Tunnel)
 */
function startDashboard() {
  console.clear();
  console.log('===============================================================================');
  console.log('          N3-MANAGER : BOT SERVICE & LINE TUNNEL (ALL-IN-ONE)');
  console.log('===============================================================================');
  console.log('\n[1/3] Clearing lingering processes and memory...');
  killLingering();

  try {
    console.log('[2/3] Compiling latest TypeScript Build...');
    execSync('npm run build', { cwd: BOT_DIR, stdio: 'ignore', windowsHide: true });
  } catch (e) {
    console.warn('[BUILD WARNING] Using existing compiled build');
  }

  console.log('[3/3] Starting Bot Service (Port 3333) & Cloudflare Tunnel...');

  let isStopping = false;

  const bot = spawn(process.execPath, ['dist/index.js'], {
    cwd: BOT_DIR,
    windowsHide: true,
    env: Object.assign({}, process.env, { ENGINE_NOTIFIES_START: 'true' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  bot.stdout.on('data', (data) => {
    const str = data.toString();
    if (str.includes('QUOTA') || str.includes('ORDER') || str.includes('SUCCESS') || str.includes('USER MESSAGE') || str.includes('Error') || str.includes('AUTH') || str.includes('BROWSER') || str.includes('LOGIN') || str.includes('QR') || str.includes('SERVICE') || str.includes('SALES')) {
      process.stdout.write(str);
    }
  });

  bot.stderr.on('data', (data) => {
    process.stderr.write(data.toString());
  });

  bot.on('exit', async (code, signal) => {
    if (!isStopping && !isStopIntentional()) {
      console.warn(`\n[BOT CRASH] Bot process exited unexpectedly (code: ${code}, signal: ${signal})`);
      const timeStr = getThaiTime();
      await notifyBotStopped(timeStr, `Bot process exited with code ${code}`);
    }
  });

  const cf = getCloudflaredCommand();
  const tunnelArgs = [...cf.args, 'tunnel', '--url', 'http://localhost:3333'];
  const tunnel = spawn(cf.command, tunnelArgs, {
    cwd: ROOT_DIR,
    shell: cf.shell || false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  tunnel.on('exit', async (code, signal) => {
    if (!isStopping && !isStopIntentional()) {
      console.warn(`\n[TUNNEL CRASH] Cloudflare tunnel exited unexpectedly (code: ${code}, signal: ${signal})`);
      const timeStr = getThaiTime();
      await notifyBotStopped(timeStr, 'Cloudflare tunnel exited');
    }
  });

  let currentWebhookUrl = '';

  function handleTunnelOutput(data) {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !currentWebhookUrl) {
      currentWebhookUrl = match[0] + '/webhook';
      try {
        fs.writeFileSync(path.join(ROOT_DIR, 'webhook-url.txt'), currentWebhookUrl, 'utf-8');
      } catch {}

      // ส่งแจ้งเตือน Admin ผ่าน LINE ทันทีที่เชื่อมต่อ Webhook สำเร็จ
      notifyBotStarted(currentWebhookUrl);

      // ซิงค์ Webhook URL ไปยัง LINE Developers Console อัตโนมัติทันที
      updateLineWebhookEndpoint(currentWebhookUrl);

      console.log('\n===============================================================================');
      console.log('       🎉 LINE BOT SERVICE & CLOUDFLARE TUNNEL ARE ONLINE!');
      console.log('===============================================================================');
      console.log('\n  >>> LINE WEBHOOK URL: <<<');
      console.log('  \x1b[32m\x1b[1m' + currentWebhookUrl + '\x1b[0m\n');
      console.log('===============================================================================');
      console.log('  Interactive Console Commands:');
      console.log('   - Type \x1b[33mstop\x1b[0m or \x1b[33mq\x1b[0m      : Stop bot and return to main menu');
      console.log('   - Type \x1b[36mclean\x1b[0m           : Delete temporary QR images to free disk space');
      console.log('   - Type \x1b[32murl\x1b[0m             : Display current LINE Webhook URL again');
      console.log('   - Type \x1b[35mstatus\x1b[0m          : Check current ticket quota & service status');
      console.log('===============================================================================\n');
    }
  }

  // Fallback: หาก Tunnel ไม่คืน URL ใน 15 วินาที ให้ส่งแจ้งเตือนเปิดบอทพร้อม URL สำรอง
  setTimeout(() => {
    if (!currentWebhookUrl && !isStopping) {
      currentWebhookUrl = getLatestWebhookUrl() || 'http://localhost:3333/webhook';
      notifyBotStarted(currentWebhookUrl);
    }
  }, 15000);

  tunnel.stdout.on('data', handleTunnelOutput);
  tunnel.stderr.on('data', handleTunnelOutput);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', async (line) => {
    const cmd = line.trim().toLowerCase();
    if (cmd === 'stop' || cmd === 'q' || cmd === 'exit') {
      isStopping = true;
      console.log('\n[STOPPING] Stopping Bot Service & Cloudflare Tunnel...');
      const intentionalStopFile = path.join(ROOT_DIR, '.stop_intentional');
      try { fs.writeFileSync(intentionalStopFile, Date.now().toString(), 'utf-8'); } catch {}
      await notifyBotStoppedByAdmin();
      try { bot.kill(); } catch (e) {}
      try { tunnel.kill(); } catch (e) {}
      killLingering();
      setTimeout(() => {
        try { if (fs.existsSync(intentionalStopFile)) fs.unlinkSync(intentionalStopFile); } catch {}
      }, 2000);
      console.log('[SUCCESS] Services stopped cleanly.');
      rl.close();
      showMainMenu();
    } else if (cmd === 'clean') {
      const removed = cleanFiles();
      console.log(`\n[CLEAN] Temporary QR files deleted successfully (${removed} files)\n`);
    } else if (cmd === 'url') {
      if (currentWebhookUrl) {
        console.log('\n>>> LINE WEBHOOK URL: \x1b[32m\x1b[1m' + currentWebhookUrl + '\x1b[0m\n');
      } else {
        console.log('\n[WAIT] Waiting for public URL from Cloudflare...\n');
      }
    } else if (cmd === 'status') {
      checkStatus();
    }
  });

  const shutdown = async () => {
    isStopping = true;
    const intentionalStopFile = path.join(ROOT_DIR, '.stop_intentional');
    try { fs.writeFileSync(intentionalStopFile, Date.now().toString(), 'utf-8'); } catch {}
    try {
      await notifyBotStoppedByAdmin();
    } catch {}
    try { bot.kill(); } catch (e) {}
    try { tunnel.kill(); } catch (e) {}
    killLingering();
    setTimeout(() => {
      try { if (fs.existsSync(intentionalStopFile)) fs.unlinkSync(intentionalStopFile); } catch {}
    }, 2000);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * 5. Open live Chrome browser for N3 dealer login
 */
function openLiveBrowser() {
  console.clear();
  console.log('===============================================================================');
  console.log('  [2] Opening live Chrome browser on desktop for Paotang scan...');
  console.log('===============================================================================');
  try {
    execSync('npx ts-node src/automation/open-live-browser.ts', { cwd: BOT_DIR, stdio: 'inherit' });
  } catch (e) {}
  waitForKeypress();
}

/**
 * 6. Build TypeScript project
 */
function buildProject() {
  console.clear();
  console.log('===============================================================================');
  console.log('  [5] Compiling latest TypeScript Build...');
  console.log('===============================================================================');
  try {
    execSync('npm run build', { cwd: BOT_DIR, stdio: 'inherit' });
    console.log('\n\x1b[32m[SUCCESS] TypeScript compiled successfully!\x1b[0m');
  } catch (e) {
    console.error('\n\x1b[31m[ERROR] TypeScript compilation failed\x1b[0m');
  }
  waitForKeypress();
}

/**
 * 7. Open folder or file in Windows
 */
function openFolder(target) {
  try {
    execSync(`explorer "${target}"`, { stdio: 'ignore', windowsHide: true });
  } catch (e) {}
}

function openFile(target) {
  try {
    execSync(`start "" "${target}"`, { shell: true, stdio: 'ignore', windowsHide: true });
  } catch (e) {}
}

function waitForKeypress() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('\nPress [Enter] to return to main menu...', () => {
    rl.close();
    showMainMenu();
  });
}

/**
 * 8. Start Bot Service & LINE Tunnel in Background (Silent / Hidden Mode)
 * @param {Object} options - { forceNewTunnel: boolean }
 */
async function startBackground(options = {}) {
  const forceNewTunnel = options.forceNewTunnel === true;
  const tunnelAlreadyRunning = !forceNewTunnel && isTunnelAlive();

  console.clear();
  console.log('===============================================================================');
  console.log('     🚀 STARTING N3 BOT SERVICE IN BACKGROUND (SILENT / HIDDEN MODE)');
  console.log('===============================================================================');

  if (tunnelAlreadyRunning) {
    console.log('\n[1/3] คงสถานะ Cloudflare Tunnel เดิม (Webhook URL จะไม่เปลี่ยน)...');
    killLingering({ keepTunnel: true });
  } else {
    console.log('\n[1/3] ล้างโปรเซสเก่าและเตรียมเปิด Tunnel ใหม่...');
    killLingering({ keepTunnel: false });
  }

  const urlFile = path.join(ROOT_DIR, 'webhook-url.txt');
  const tunnelLogPath = path.join(ROOT_DIR, 'tunnel.log');
  const botLogPath = path.join(ROOT_DIR, 'bot.log');

  if (!tunnelAlreadyRunning) {
    try { if (fs.existsSync(urlFile)) fs.unlinkSync(urlFile); } catch {}
    try { if (fs.existsSync(tunnelLogPath)) fs.unlinkSync(tunnelLogPath); } catch {}
  }

  const distPath = path.join(BOT_DIR, 'dist', 'index.js');
  try {
    console.log('[2/3] Checking TypeScript build...');
    execSync('npm run build', { cwd: BOT_DIR, stdio: 'ignore', windowsHide: true });
  } catch (e) {
    if (!fs.existsSync(distPath)) {
      console.error('[ERROR] Build failed and dist/index.js does not exist.');
      return;
    }
  }

  console.log('[3/3] Launching Bot Service on Port 3333 in Background...');

  const botOut = fs.openSync(botLogPath, 'a');
  const botErr = fs.openSync(botLogPath, 'a');

  // Launch node dist/index.js detached on Windows directly without cmd.exe shell to guarantee zero visible console window
  const bot = spawn(process.execPath, ['dist/index.js'], {
    cwd: BOT_DIR,
    detached: true,
    windowsHide: true,
    env: Object.assign({}, process.env, { ENGINE_NOTIFIES_START: 'true' }),
    stdio: ['ignore', botOut, botErr]
  });
  bot.unref();
  try { fs.closeSync(botOut); } catch {}
  try { fs.closeSync(botErr); } catch {}

  let webhookUrl = '';
  let tunnelPid = null;

  if (tunnelAlreadyRunning) {
    // ดึง URL เดิมที่มีอยู่แล้ว
    try {
      webhookUrl = fs.readFileSync(urlFile, 'utf-8').trim();
    } catch {}
    if (!webhookUrl) {
      webhookUrl = getLatestWebhookUrl() || 'http://localhost:3333/webhook';
    }

    const pidFile = path.join(ROOT_DIR, 'bot.pid');
    if (fs.existsSync(pidFile)) {
      try {
        const prev = JSON.parse(fs.readFileSync(pidFile, 'utf-8'));
        tunnelPid = prev.tunnelPid || null;
      } catch {}
    }

    console.log('\n===============================================================================');
    console.log('   🎉 บอทสลาก N3 รีสตาร์ทในเบื้องหลังเรียบร้อยแล้ว (TUNNEL REUSED)');
    console.log('===============================================================================');
    console.log(`  - บอททำงานบนพอร์ต: 3333 (PID: ${bot.pid})`);
    console.log(`  - สถานะ Tunnel: \x1b[32m● เชื่อมต่อต่อเนื่อง (ไม่เปลี่ยน URL)\x1b[0m`);
    console.log(`  - LINE Webhook URL: \x1b[36m\x1b[1m${webhookUrl}\x1b[0m`);
    console.log(`  - บันทึกการทำงาน: bot.log`);
    console.log('===============================================================================\n');

    // แจ้งเตือนแอดมินทาง LINE ว่ารีสตาร์ทบอทสำเร็จโดยใช้ Webhook เดิม
    console.log('[NOTIFY] กำลังส่งแจ้งเตือนการรีสตาร์ทไปยัง LINE แอดมิน...');
    try {
      await sendLineAdminAlert(`🚀 [รีสตาร์ทบอทสำเร็จ] บอทสลาก N3 อัปเดตและเริ่มทำงานใหม่เรียบร้อยแล้ว (ใช้ Webhook เดิม: ${webhookUrl})`);
    } catch (e) {
      console.warn('[NOTIFY WARNING] ส่งแจ้งเตือนรีสตาร์ทไม่สำเร็จ:', e.message);
    }
  } else {
    // Launch cloudflared tunnel detached with direct binary or npx-cli (avoiding cmd.exe)
    console.log('กำลังเริ่มต้น Cloudflare Tunnel ใหม่...');
    const cf = getCloudflaredCommand();
    const tunnelArgs = [...cf.args, 'tunnel', '--url', 'http://localhost:3333', '--logfile', tunnelLogPath];
    const tunnel = spawn(cf.command, tunnelArgs, {
      cwd: ROOT_DIR,
      detached: true,
      shell: cf.shell || false,
      windowsHide: true,
      stdio: 'ignore'
    });
    tunnel.unref();
    tunnelPid = tunnel.pid;

    console.log('\n[WAIT] กำลังรอ URL สาธารณะจาก Cloudflare Tunnel...');

    // ดึง URL สาธารณะจาก tunnel.log (รอสูงสุด 15 วินาที)
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
      await new Promise(r => setTimeout(r, 600));
      if (fs.existsSync(tunnelLogPath)) {
        try {
          const content = fs.readFileSync(tunnelLogPath, 'utf-8');
          const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
          if (match && match.length > 0) {
            webhookUrl = match[match.length - 1] + '/webhook';
            fs.writeFileSync(urlFile, webhookUrl, 'utf-8');
            break;
          }
        } catch {}
      }
    }

    if (!webhookUrl) {
      webhookUrl = getLatestWebhookUrl() || 'http://localhost:3333/webhook';
    }

    console.log(`\n  >>> LINE WEBHOOK URL ใหม่: \x1b[32m\x1b[1m${webhookUrl}\x1b[0m\n`);

    // ส่งแจ้งเตือนเปิดบอทเข้า LINE Admin
    console.log('[NOTIFY] กำลังส่งแจ้งเตือนการเปิดบอทไปยัง LINE แอดมิน...');
    try {
      await sendLineAdminAlert(`🚀 [ระบบเปิดใช้งาน] บอทสลาก N3 เริ่มทำงานเรียบร้อยแล้ว พร้อมรับออเดอร์ตลอด 24 ชม. (Webhook: ${webhookUrl})`);
      await updateLineWebhookEndpoint(webhookUrl);
    } catch (e) {
      console.warn('[NOTIFY WARNING] ส่งแจ้งเตือนเปิดบอทไม่สำเร็จ:', e.message);
    }

    console.log('\n===============================================================================');
    console.log('   🎉 บอทสลาก N3 เริ่มทำงานในเบื้องหลังเรียบร้อยแล้ว (BACKGROUND RUNNING)');
    console.log('===============================================================================');
    console.log(`  - บอททำงานบนพอร์ต: 3333 (PID: ${bot.pid})`);
    console.log(`  - โหมดเบราว์เซอร์: Headless Chrome (ซ่อนหน้าต่าง 100% ไม่กวนหน้าจอ)`);
    console.log(`  - LINE Webhook URL: ${webhookUrl}`);
    console.log(`  - บันทึกการทำงาน: bot.log`);
    console.log(`  - บันทึก Tunnel: tunnel.log`);
    console.log('===============================================================================\n');
  }

  // Save PID metadata
  const pidFile = path.join(ROOT_DIR, 'bot.pid');
  try {
    fs.writeFileSync(pidFile, JSON.stringify({
      botPid: bot.pid,
      tunnelPid: tunnelPid,
      tunnelReused: tunnelAlreadyRunning,
      startedAt: new Date().toISOString()
    }, null, 2));
  } catch {}

  console.log('  คำแนะนำ:');
  console.log('  1. บอทจะคอยรับออเดอร์ทาง LINE ตลอด 24 ชม. แม้ปิดหน้าต่างนี้');
  console.log('  2. ตรวจสอบสถานะ / ดู Webhook URL ได้ที่ N3-MANAGER.bat (เมนู [3])');
  console.log('  3. สั่งหยุดบอทได้ที่ N3-MANAGER.bat (เมนู [7]) หรือดับเบิลคลิก STOP-BOT.bat');
  console.log('  4. รีสตาร์ทเฉพาะบอทโดยไม่เปลี่ยน Webhook URL ได้ด้วยเมนู [B] หรือ [U]');
  console.log('===============================================================================\n');
}

/**
 * 9. Stop Bot Service & Tunnel
 * @param {Object} options - { stopTunnel: boolean }
 */
async function stopBot(options = {}) {
  const stopTunnel = options.stopTunnel !== false; // default true for full stop
  console.clear();
  console.log('===============================================================================');
  console.log(stopTunnel 
    ? '              🛑 STOPPING N3 BOT SERVICE & CLOUDFLARE TUNNEL' 
    : '                  🛑 STOPPING BOT SERVICE ONLY (KEEP TUNNEL)');
  console.log('===============================================================================');
  
  if (stopTunnel) {
    console.log('\nกำลังหยุดการทำงานของบอท, Cloudflare Tunnel และเบราว์เซอร์...');
  } else {
    console.log('\nกำลังหยุดการทำงานของบอท (คง Cloudflare Tunnel ไว้)...');
  }

  // 1. บันทึก flag ว่าเป็นการหยุดอย่างตั้งใจโดยแอดมิน เพื่อป้องกัน index.ts ส่ง crash alert ซ้ำซ้อน
  const intentionalStopFile = path.join(ROOT_DIR, '.stop_intentional');
  try { fs.writeFileSync(intentionalStopFile, Date.now().toString(), 'utf-8'); } catch {}

  // 2. ส่งแจ้งเตือนแอดมินทาง LINE ทันที
  console.log('[NOTIFY] กำลังส่งแจ้งเตือนการหยุดทำงานไปยัง LINE แอดมิน...');
  try {
    if (stopTunnel) {
      await sendLineAdminAlert('🛑 [แจ้งเตือน] แอดมินได้สั่งหยุดการทำงานของบอทสลาก N3 เรียบร้อยแล้ว (ปิดทั้งระบบ)');
    } else {
      await sendLineAdminAlert('🛑 [แจ้งเตือน] แอดมินได้สั่งหยุดเฉพาะตัวบอทสลาก N3 (คง Webhook URL ไว้)');
    }
  } catch (e) {
    console.warn('[NOTIFY WARNING] ไม่สามารถส่งแจ้งเตือนแอดมินได้:', e.message);
  }

  // 3. จัดการปิดโปรเซส
  killLingering({ keepTunnel: !stopTunnel });

  // ล้างไฟล์ flag หลังโปรเซสปิดตัว
  setTimeout(() => {
    try { if (fs.existsSync(intentionalStopFile)) fs.unlinkSync(intentionalStopFile); } catch {}
  }, 2000);

  console.log('\n\x1b[32m[SUCCESS] สั่งหยุดการทำงานเรียบร้อยแล้ว\x1b[0m');
  console.log('===============================================================================\n');
}

/**
 * 10. Restart Bot Service Only (Preserve Webhook URL)
 */
async function restartBotOnly() {
  await startBackground({ forceNewTunnel: false });
}

/**
 * 11. Update Code & Restart Bot (Preserve Webhook URL)
 */
async function updateAndRestart() {
  await startBackground({ forceNewTunnel: false });
}

/**
 * 12. Interactive Main Menu
 */
function showMainMenu() {
  console.clear();
  const status = getBotStatus();
  const statusText = status.isRunning 
    ? `\x1b[32m● กำลังทำงาน (RUNNING - Port 3333, PID: ${status.pid})\x1b[0m`
    : '\x1b[33m○ หยุดทำงาน (STOPPED)\x1b[0m';

  const tunnelAlive = isTunnelAlive();
  const tunnelText = tunnelAlive
    ? '\x1b[32m● กำลังเชื่อมต่อ (ACTIVE - คงที่)\x1b[0m'
    : '\x1b[33m○ หยุดทำงาน (INACTIVE)\x1b[0m';

  let quotaText = '2,000 ใบ';
  const quotaPath = path.join(BOT_DIR, 'data', 'quota.json');
  if (fs.existsSync(quotaPath)) {
    try {
      const q = JSON.parse(fs.readFileSync(quotaPath, 'utf-8'));
      const rem = q.remainingQuota !== undefined ? q.remainingQuota : (q.maxQuota - q.usedQuota);
      quotaText = `${rem.toLocaleString()} / ${q.maxQuota.toLocaleString()} ใบ`;
    } catch {}
  }

  const webhookUrl = getLatestWebhookUrl();

  console.log('===============================================================================');
  console.log('                         N3-MANAGER : CONTROL CENTER');
  console.log('               (Thanagit Namchok - N3 Digital Lottery Agent)');
  console.log('===============================================================================');
  console.log(`  สถานะบริการ:   ${statusText}`);
  console.log(`  สถานะ Tunnel:  ${tunnelText}`);
  console.log(`  โควต้าคงเหลือ: \x1b[36m${quotaText}\x1b[0m`);
  if (webhookUrl) {
    console.log(`  LINE Webhook:  \x1b[35m${webhookUrl}\x1b[0m`);
  }
  console.log('===============================================================================');
  console.log('');
  console.log('  [1] Start Bot Service & LINE Tunnel (All-in-One Dashboard - โต้ตอบหน้าจอ)');
  console.log('  [2] Live Chrome Browser Login (Scan Paotang QR on Desktop)');
  console.log('  [3] Check System & Ticket Quota Status (Quota, Round, Port, Webhook)');
  console.log('  [4] Clean Temporary Files & Free Memory (Remove old QR images)');
  console.log('  [5] Build Project (Compile TypeScript to latest version)');
  console.log('  [6] Start Bot in Background (🚀 ซ่อนหน้าต่าง ไร้หน้าจอ - Reuse Tunnel อัตโนมัติ)');
  console.log('  [U] Update & Restart Bot (⚡ Build ใหม่ + รีสตาร์ทบอท โดยไม่เปลี่ยน Webhook URL)');
  console.log('  [B] Restart Bot Only (🔄 รีสตาร์ทเฉพาะบอท คง Webhook URL เดิม 100%)');
  console.log('  [7] Stop Bot Service (🛑 สั่งหยุดการทำงานของบอท / ปิดบอทเบื้องหลัง)');
  console.log('  [8] Open QR Codes Folder (Open public/qrcodes in Explorer)');
  console.log('  [9] Open Website in Browser (Open index.html)');
  console.log('  [R] Setup / Sync LINE Rich Menu (🎨 อัปเดตริชเมนู 6 ปุ่มด้านล่างหน้าจอแชท LINE)');
  console.log('  [S] Create Desktop Shortcuts (สร้างไอคอนทางลัด 3 ตัวบนหน้าจอ Desktop)');
  console.log('  [0] Exit');
  console.log('');
  console.log('===============================================================================');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Please select an option [0-9, U, B, or S] (or type bg / stop): ', async (choice) => {
    rl.close();
    const c = choice.trim().toLowerCase();
    if (c === '1' || c === 'start') {
      startDashboard();
    } else if (c === '2' || c === 'login') {
      openLiveBrowser();
    } else if (c === '3' || c === 'status') {
      console.clear();
      checkStatus();
      waitForKeypress();
    } else if (c === '4' || c === 'clean') {
      console.clear();
      console.log('Stopping lingering processes and cleaning temporary files...');
      killLingering();
      const count = cleanFiles();
      console.log(`\x1b[32m[SUCCESS] Cleaned temporary QR images successfully (${count} files)\x1b[0m`);
      waitForKeypress();
    } else if (c === '5' || c === 'build') {
      buildProject();
    } else if (c === '6' || c === 'bg' || c === 'silent') {
      await startBackground();
      waitForKeypress();
    } else if (c === 'u' || c === 'update' || c === 'hot-reload') {
      await updateAndRestart();
      waitForKeypress();
    } else if (c === 'b' || c === 'restart' || c === 'restart-bot') {
      await restartBotOnly();
      waitForKeypress();
    } else if (c === '7' || c === 'stop') {
      await stopBot({ stopTunnel: true });
      waitForKeypress();
    } else if (c === '8') {
      openFolder(QR_DIR);
      showMainMenu();
    } else if (c === '9') {
      openFile(path.join(ROOT_DIR, 'index.html'));
      showMainMenu();
    } else if (c === 'r' || c === 'richmenu' || c === 'menu-setup') {
      console.clear();
      console.log('Setting up LINE Rich Menu...');
      try {
        execSync('node scripts/setup-richmenu.js', { cwd: ROOT_DIR, stdio: 'inherit' });
      } catch (e) {
        console.error('[ERROR] Failed to setup rich menu:', e.message);
      }
      waitForKeypress();
    } else if (c === 's' || c === 'shortcut' || c === 'shortcuts') {
      console.clear();
      console.log('Creating Desktop Shortcuts...');
      try {
        execSync('powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\\create-desktop-shortcuts.ps1', { cwd: ROOT_DIR, stdio: 'inherit' });
        console.log('\n\x1b[32m[SUCCESS] สร้างไอคอนทางลัดบน Desktop เรียบร้อยแล้ว!\x1b[0m');
      } catch (e) {
        try {
          execSync('cscript //nologo scripts\\create-desktop-shortcuts.vbs', { cwd: ROOT_DIR, stdio: 'inherit' });
          console.log('\n\x1b[32m[SUCCESS] สร้างไอคอนทางลัดบน Desktop เรียบร้อยแล้ว!\x1b[0m');
        } catch (err) {
          console.error('[ERROR] ไม่สามารถสร้างทางลัดได้:', err.message);
        }
      }
      waitForKeypress();
    } else if (c === '0') {
      console.log('Thank you for using N3-MANAGER. Goodbye!');
      process.exit(0);
    } else {
      showMainMenu();
    }
  });
}

// Router
async function main() {
  setupEngineLifecycle();

  if (mode === 'start') {
    startDashboard();
  } else if (mode === 'bg' || mode === 'start-bg' || mode === 'silent' || mode === 'background') {
    await startBackground();
  } else if (mode === 'restart' || mode === 'restart-bot') {
    await restartBotOnly();
  } else if (mode === 'update' || mode === 'hot-reload') {
    await updateAndRestart();
  } else if (mode === 'stop-bot') {
    await stopBot({ stopTunnel: false });
  } else if (mode === 'force-tunnel') {
    await startBackground({ forceNewTunnel: true });
  } else if (mode === 'stop' || mode === 'stop-all') {
    await stopBot({ stopTunnel: true });
  } else if (mode === 'clean') {
    console.log('Stopping lingering processes and cleaning files...');
    killLingering();
    const count = cleanFiles();
    console.log(`[SUCCESS] Cleaned temporary QR images successfully (${count} files)`);
  } else if (mode === 'status') {
    checkStatus();
  } else if (mode === 'login') {
    openLiveBrowser();
  } else if (mode === 'richmenu' || mode === 'menu-setup') {
    try {
      execSync('node scripts/setup-richmenu.js', { cwd: ROOT_DIR, stdio: 'inherit' });
    } catch (e) {
      console.error('[ERROR]', e.message);
    }
  } else {
    showMainMenu();
  }
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
