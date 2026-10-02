const { spawn, execSync, execFileSync } = require('child_process');
const { createProcessController, sameProcess } = require('./project-processes');
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..');
const BOT_DIR = path.join(ROOT_DIR, 'bot-service');
const QR_DIR = path.join(ROOT_DIR, 'public', 'qrcodes');
const mode = process.argv[2] || 'menu';
const PID_FILE = path.join(ROOT_DIR, 'bot.pid');
const BOT_ENTRY = path.join(BOT_DIR, 'dist', 'index.js');
function configuredPort() {
  let value = process.env.PORT;
  if (!value) {
    try { value = require(path.join(BOT_DIR, 'node_modules', 'dotenv')).parse(fs.readFileSync(path.join(BOT_DIR, '.env'))).PORT; } catch {}
  }
  const port = Number(value || 3333);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid bot PORT configuration');
  return port;
}
const BOT_PORT = configuredPort();
const processControl = createProcessController({ rootDir: ROOT_DIR, port: BOT_PORT });
function readPidMetadata() {
  return fs.existsSync(PID_FILE) ? JSON.parse(fs.readFileSync(PID_FILE, 'utf8')) : {};
}
function writePidMetadata(metadata) {
  const temporary = `${PID_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(metadata, null, 2), 'utf8');
  fs.renameSync(temporary, PID_FILE);
}
function compileBot() {
  execFileSync(process.execPath, [path.join(BOT_DIR, 'node_modules', 'typescript', 'bin', 'tsc')], {
    cwd: BOT_DIR, stdio: 'inherit', windowsHide: true, shell: false
  });
}
async function recordSpawn(child, kind) {
  let launchError;
  child.on('error', error => { launchError = error; });
  for (let attempt = 0; attempt < 20; attempt++) {
    if (launchError) throw launchError;
    if (child.exitCode !== null || child.signalCode) throw new Error(`${kind} exited during startup`);
    const info = processControl.listProcesses().find(item => item.pid === child.pid);
    if (info && processControl.classify(info) === kind) return info;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Unable to prove ownership of the new ${kind} process`);
}


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
 * ดึงการตั้งค่า Telegram จาก bot-service/.env
 */
function getTelegramConfig() {
  const envPath = path.join(BOT_DIR, '.env');
  let botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  let chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';
  let enabled = process.env.TELEGRAM_NOTIFY_ENABLED !== 'false';
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
        if (k === 'TELEGRAM_BOT_TOKEN' && !botToken) botToken = val;
        if ((k === 'TELEGRAM_ADMIN_CHAT_ID' || k === 'TELEGRAM_CHAT_ID') && !chatId) chatId = val;
        if (k === 'TELEGRAM_NOTIFY_ENABLED') enabled = val !== 'false';
      }
    } catch {}
  }
  return { botToken, chatId, enabled: enabled && !!botToken && !!chatId };
}

/**
 * ส่งแจ้งเตือนไปยัง Telegram Admin (ฟรี 100% ไม่จำกัดโควต้า)
 */
function sendTelegramAdminAlert(messageText) {
  return new Promise((resolve) => {
    const { botToken, chatId, enabled } = getTelegramConfig();
    if (!enabled || !botToken || !chatId) {
      return resolve(false);
    }
    const payload = JSON.stringify({
      chat_id: chatId,
      text: messageText
    });
    const req = https.request(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('[TELEGRAM ALERT SUCCESS] ส่งแจ้งเตือนเข้า Telegram แอดมินสำเร็จ');
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
async function notifyBotStarted(webhookUrl) {
  const text = `🚀 [ระบบเปิดใช้งาน] บอทสลาก N3 เริ่มทำงานเรียบร้อยแล้ว พร้อมรับออเดอร์ตลอด 24 ชม. (Webhook: ${webhookUrl})`;
  await Promise.allSettled([
    sendTelegramAdminAlert(text),
    sendLineAdminAlert(text)
  ]);
  return true;
}

/**
 * แจ้งเตือนด่วนเมื่อบอทหยุดทำงาน / แครช (On Stop / Shutdown / Crash)
 */
async function notifyBotStopped(timeStr, reason) {
  const time = timeStr || getThaiTime();
  let text = `⚠️ [แจ้งเตือนด่วน] บอทสลาก N3 หยุดทำงานแล้ว (Bot Service Stopped) เมื่อเวลา ${time} กรุณาตรวจสอบหรือเปิดบอทใหม่`;
  if (reason) {
    text += `\n(สาเหตุ: ${reason})`;
  }
  await Promise.allSettled([
    sendTelegramAdminAlert(text),
    sendLineAdminAlert(text)
  ]);
  return true;
}

/**
 * แจ้งเตือนเมื่อแอดมินสั่งหยุดบอทเองอย่างถูกต้อง
 */
async function notifyBotStoppedByAdmin() {
  const text = '🛑 [แจ้งเตือน] แอดมินได้สั่งหยุดการทำงานของบอทสลาก N3 เรียบร้อยแล้ว';
  await Promise.allSettled([
    sendTelegramAdminAlert(text),
    sendLineAdminAlert(text)
  ]);
  return true;
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
    if (!processControl.ownedProcesses('tunnel').length) return false;
    const urlFile = path.join(ROOT_DIR, 'webhook-url.txt');
    return fs.existsSync(urlFile) && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com(?:\/webhook)?$/i.test(fs.readFileSync(urlFile, 'utf8').trim());
  } catch { return false; }
}

/** Stop only processes carrying an exact absolute path belonging to this checkout. */
function killLingering(options = {}) {
  const { processes } = processControl.assertBotPortOwnership();
  const metadata = readPidMetadata();
  const kinds = ['bot', ...(options.keepTunnel === true ? [] : ['tunnel']), ...(options.keepBrowser === true ? [] : ['browser'])];
  // A stale PID file is never permission to terminate a PID that was reused.
  for (const kind of kinds) {
    const recorded = metadata.processes && metadata.processes[kind];
    const pid = recorded ? recorded.pid : metadata[`${kind}Pid`];
    if (!pid) continue;
    const current = processes.find(info => info.pid === pid);
    if (current && (processControl.classify(current) !== kind || (recorded && !sameProcess(current, recorded)))) {
      throw new Error(`Recorded ${kind} PID ${pid} cannot be verified; preserving it and aborting`);
    }
  }
  for (const kind of kinds) {
    for (const info of processControl.ownedProcesses(kind, processes)) processControl.stopOwnedProcess(info, kind);
    delete metadata[`${kind}Pid`];
    if (metadata.processes) delete metadata.processes[kind];
  }
  processControl.assertPortAvailable();
  writePidMetadata(metadata);
}

/**
 * 2. Clean temporary QR Code files and logs
 */
function cleanFiles() {
  let count = 0;
  if (fs.existsSync(QR_DIR)) {
    const files = fs.readdirSync(QR_DIR);
    for (const f of files) {
      if (
        f.startsWith('payment-') ||
        f.startsWith('error-') ||
        f.startsWith('login-') ||
        f.startsWith('n3-dealer-') ||
        f.startsWith('n3-live-') ||
        f.startsWith('n3-step') ||
        f.startsWith('n3-real-') ||
        f.startsWith('geolocation-') ||
        f.startsWith('multi-test-') ||
        f.startsWith('session-test-') ||
        f.startsWith('paotang-login-')
      ) {
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
    const { owners } = processControl.assertBotPortOwnership();
    return { isRunning: owners.length > 0, pid: owners.join(', ') };
  } catch (error) {
    return { isRunning: false, pid: '', error: error.message };
  }
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

  try {
    const browsers = processControl.ownedProcesses('browser');
    console.log(`[BROWSER] Project Chrome: ${browsers.length ? browsers.map(info => info.pid).join(', ') : 'not running'}`);
  } catch (error) { console.warn('[BROWSER] Ownership inspection failed:', error.message); }

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
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const whereOut = execFileSync(cmd, ['cloudflared'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
    if (whereOut) {
      const firstLine = whereOut.split(/\r?\n/)[0].trim();
      if (fs.existsSync(firstLine)) {
        return { command: firstLine, args: [], shell: false };
      }
    }
  } catch {}

  throw new Error('No cloudflared executable found; install a binary before starting the project tunnel');
}

/**
 * 4. Start All-in-One Dashboard (Bot + Cloudflare Tunnel)
 */
async function startDashboard() {
  // Delegate to startBackground with windowsHide: true
  await startBackground();
  console.log('Project services are running in the background. Use the menu to inspect or stop them.');
  waitForKeypress();
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
    execSync('npx ts-node src/automation/open-live-browser.ts', { cwd: BOT_DIR, stdio: 'inherit', windowsHide: true });
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
    compileBot();
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
  const keepBrowser = options.keepBrowser !== false;
  // Compile and inspect ownership before stopping the currently running bot.
  compileBot();
  const before = processControl.assertBotPortOwnership();
  const metadataBefore = readPidMetadata();
  const knownTunnel = processControl.ownedProcesses('tunnel', before.processes)[0];
  const recordedTunnelPid = metadataBefore.tunnelPid;
  if (recordedTunnelPid && before.processes.some(info => info.pid === recordedTunnelPid && processControl.classify(info) !== 'tunnel')) {
    throw new Error('Recorded tunnel belongs to an unverified process; preserving it and aborting restart');
  }
  const tunnelAlreadyRunning = !forceNewTunnel && !!knownTunnel && isTunnelAlive();
  const cf = tunnelAlreadyRunning ? null : getCloudflaredCommand();
  killLingering({ keepTunnel: tunnelAlreadyRunning, keepBrowser });
  processControl.assertPortAvailable();

  const urlFile = path.join(ROOT_DIR, 'webhook-url.txt');
  const tunnelLogPath = path.join(ROOT_DIR, 'tunnel.log');
  const logFd = fs.openSync(path.join(ROOT_DIR, 'bot.log'), 'a');
  let bot;
  try {
    bot = spawn(process.execPath, [BOT_ENTRY], {
      cwd: BOT_DIR, detached: true, shell: false, windowsHide: true,
      env: Object.assign({}, process.env, { ENGINE_NOTIFIES_START: 'true' }),
      stdio: ['ignore', logFd, logFd]
    });
    bot.unref();
  } finally { fs.closeSync(logFd); }
  const botSnapshot = await recordSpawn(bot, 'bot');
  const metadata = readPidMetadata();
  metadata.botPid = botSnapshot.pid;
  metadata.startedAt = new Date().toISOString();
  metadata.processes = Object.assign({}, metadata.processes, { bot: botSnapshot });
  writePidMetadata(metadata);
  try {
    await processControl.waitForBotPort(botSnapshot);
  } catch (error) {
    processControl.stopOwnedProcess(botSnapshot, 'bot');
    delete metadata.botPid;
    delete metadata.processes.bot;
    writePidMetadata(metadata);
    throw error;
  }

  let webhookUrl;
  if (tunnelAlreadyRunning) {
    webhookUrl = fs.readFileSync(urlFile, 'utf8').trim();
    metadata.tunnelPid = knownTunnel.pid;
    metadata.processes.tunnel = knownTunnel;
  } else {
    fs.writeFileSync(tunnelLogPath, '', 'utf8');
    const tunnel = spawn(cf.command, [...cf.args, 'tunnel', '--url', `http://localhost:${BOT_PORT}`, '--logfile', tunnelLogPath], {
      cwd: ROOT_DIR, detached: true, shell: false, windowsHide: true, stdio: 'ignore'
    });
    tunnel.unref();
    const tunnelSnapshot = await recordSpawn(tunnel, 'tunnel');
    metadata.tunnelPid = tunnelSnapshot.pid;
    metadata.processes.tunnel = tunnelSnapshot;
    writePidMetadata(metadata);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const current = processControl.listProcesses().find(info => info.pid === tunnelSnapshot.pid);
      if (!sameProcess(current, tunnelSnapshot)) throw new Error('Project tunnel exited during startup');
      const matches = fs.readFileSync(tunnelLogPath, 'utf8').match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
      if (matches && matches.length) {
        webhookUrl = matches[matches.length - 1] + '/webhook';
        fs.writeFileSync(urlFile, webhookUrl, 'utf8');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!webhookUrl) throw new Error('Project tunnel did not produce a public URL; startup is incomplete');
  }
  metadata.tunnelReused = tunnelAlreadyRunning;
  writePidMetadata(metadata);
  // Do not claim success until this exact bot owns its configured listener.
  await processControl.waitForBotPort(botSnapshot, 5000);
  console.log(`[SUCCESS] Project bot is listening on port ${BOT_PORT} (PID ${botSnapshot.pid}); ${tunnelAlreadyRunning ? 'existing' : 'new'} project tunnel: ${webhookUrl}`);
  const alert = `🚀 [ระบบเปิดใช้งาน] บอทสลาก N3 เริ่มทำงานเรียบร้อยแล้ว (Webhook: ${webhookUrl})`;
  await Promise.allSettled([sendTelegramAdminAlert(alert), sendLineAdminAlert(alert),
    ...(tunnelAlreadyRunning ? [] : [updateLineWebhookEndpoint(webhookUrl)])]);
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
  killLingering({ keepTunnel: !stopTunnel, keepBrowser: false });

  // ล้างไฟล์ flag หลังโปรเซสปิดตัว
  setTimeout(() => {
    try { if (fs.existsSync(intentionalStopFile)) fs.unlinkSync(intentionalStopFile); } catch {}
  }, 2000);

  console.log('\n\x1b[32m[SUCCESS] สั่งหยุดการทำงานเรียบร้อยแล้ว\x1b[0m');
  console.log('===============================================================================\n');
}

/**
 * 10. Restart Bot Service Only (Preserve Webhook URL & Browser)
 */
async function restartBotOnly() {
  await startBackground({ forceNewTunnel: false, keepBrowser: true });
}

/**
 * 11. Update Code & Restart Bot (Preserve Webhook URL & Browser)
 */
async function updateAndRestart() {
  await startBackground({ forceNewTunnel: false, keepBrowser: true });
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
  console.log('  [U] Update & Restart Bot (⚡ Build ใหม่ + รีสตาร์ทบอท โดยไม่เปลี่ยน Webhook และไม่ปิดเบราว์เซอร์)');
  console.log('  [B] Restart Bot Only (🔄 รีสตาร์ทเฉพาะบอท คง Webhook URL & เบราว์เซอร์เดิม 100%)');
  console.log('  [7] Stop Bot Service (🛑 สั่งหยุดการทำงานของบอท / ปิดเบราว์เซอร์และคืน RAM ทั้งหมด)');
  console.log('  [8] Open QR Codes Folder (Open public/qrcodes in Explorer)');
  console.log('  [9] Open Website in Browser (Open index.html)');
  console.log('  [R] Setup / Sync LINE Rich Menu (🎨 อัปเดตริชเมนู 6 ปุ่มด้านล่างหน้าจอแชท LINE)');
  console.log('  [D] Deploy System (🚀 Build + Test + Git Push โดยคงเซสชันร้านค้าไว้ 100%)');
  console.log('  [L] Session Watchdog (🛡️ ตรวจสอบ Session GLO N3 ทุก 500ms + แจ้งเตือน Telegram เมื่อหลุด)');
  console.log('  [S] Create Desktop Shortcuts (สร้างไอคอนทางลัด 3 ตัวบนหน้าจอ Desktop)');
  console.log('  [0] Exit');
  console.log('');
  console.log('===============================================================================');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Please select an option [0-9, U, B, T, D, L, or S] (or type bg / stop): ', async (choice) => {
    rl.close();
    const c = choice.trim().toLowerCase();
    if (c === '1' || c === 'start') {
      await startDashboard();
    } else if (c === '2' || c === 'login') {
      openLiveBrowser();
    } else if (c === '3' || c === 'status') {
      console.clear();
      checkStatus();
      waitForKeypress();
    } else if (c === '4' || c === 'clean') {
      console.clear();
      console.log('Stopping lingering processes and cleaning temporary files...');
      killLingering({ keepTunnel: false, keepBrowser: false });
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
        execSync('node scripts/setup-richmenu.js', { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true });
      } catch (e) {
        console.error('[ERROR] Failed to setup rich menu:', e.message);
      }
      waitForKeypress();
    } else if (c === 't' || c === 'test' || c === 'test-all' || c === 'e2e') {
      console.clear();
      console.log('Running End-to-End System Tests across All 6 Scenarios...');
      try {
        execSync('node scripts/test-all-scenarios.js', { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true });
      } catch (e) {
        console.error('\n\x1b[31m[ERROR] มีบางฉากทัศน์ไม่ผ่านการทดสอบ กรุณาตรวจสอบรายละเอียดด้านบน\x1b[0m');
      }
      waitForKeypress();
    } else if (c === 'd' || c === 'deploy') {
      console.clear();
      console.log('Deploying System (Auto Logoff GLO N3 + Build + Test + Git Push)...');
      try {
        execSync('node scripts/deploy.js', { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true });
      } catch (e) {
        console.error('\n\x1b[31m[ERROR] การ Deploy ไม่สำเร็จ\x1b[0m');
      }
      waitForKeypress();
    } else if (c === 'l' || c === 'logoff' || c === 'watch' || c === 'session') {
      console.clear();
      console.log('Starting Real-Time GLO N3 Session Watchdog (500 ms + Telegram Alert)...');
      try {
        execSync('node scripts/watch-session.js', { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true });
      } catch (e) {
        // User exit with Ctrl+C
      }
      waitForKeypress();
    } else if (c === 's' || c === 'shortcut' || c === 'shortcuts') {
      console.clear();
      console.log('Creating Desktop Shortcuts...');
      try {
        execSync('powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\\create-desktop-shortcuts.ps1', { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true });
        console.log('\n\x1b[32m[SUCCESS] สร้างไอคอนทางลัดบน Desktop เรียบร้อยแล้ว!\x1b[0m');
      } catch (e) {
        try {
          execSync('cscript //nologo scripts\\create-desktop-shortcuts.vbs', { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true });
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
    await startDashboard();
  } else if (mode === 'bg' || mode === 'start-bg' || mode === 'silent' || mode === 'background') {
    await startBackground();
  } else if (mode === 'restart' || mode === 'restart-bot') {
    await restartBotOnly();
  } else if (mode === 'update' || mode === 'hot-reload' || mode === 'u') {
    await updateAndRestart();
  } else if (mode === 'stop-bot') {
    await stopBot({ stopTunnel: false });
  } else if (mode === 'force-tunnel') {
    await startBackground({ forceNewTunnel: true });
  } else if (mode === 'stop' || mode === 'stop-all') {
    await stopBot({ stopTunnel: true });
  } else if (mode === 'clean') {
    console.log('Stopping lingering processes and cleaning files...');
    killLingering({ keepTunnel: false, keepBrowser: false });
    const count = cleanFiles();
    console.log(`[SUCCESS] Cleaned temporary QR images successfully (${count} files)`);
  } else if (mode === 'status') {
    checkStatus();
  } else if (mode === 'login') {
    openLiveBrowser();
  } else if (mode === 'deploy') {
    try {
      execSync('node scripts/deploy.js', { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true });
    } catch (e) {
      process.exit(1);
    }
  } else if (mode === 'logoff' || mode === 'watch-session' || mode === 'session-watch') {
    try {
      execSync('node scripts/watch-session.js', { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true });
    } catch (e) {
      process.exit(0);
    }
  } else if (mode === 'richmenu' || mode === 'menu-setup') {
    try {
      execSync('node scripts/setup-richmenu.js', { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true });
    } catch (e) {
      console.error('[ERROR]', e.message);
    }
  } else if (mode === 'test-all' || mode === 'test' || mode === 'e2e') {
    try {
      execSync('node scripts/test-all-scenarios.js', { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true });
    } catch (e) {
      process.exit(1);
    }
  } else {
    showMainMenu();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
}
