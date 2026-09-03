const { spawn, execSync } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const BOT_DIR = path.join(ROOT_DIR, 'bot-service');
const QR_DIR = path.join(ROOT_DIR, 'public', 'qrcodes');
const mode = process.argv[2] || 'menu';

/**
 * 1. Kill lingering processes on Port 3333, Cloudflare, and browser_profile
 */
function killLingering() {
  try {
    execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
  } catch (e) {}
  try {
    execSync('powershell -Command "Get-Process -Name *cloudflared* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  } catch (e) {}
  try {
    execSync('powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \'*browser_profile*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
  } catch (e) {}
  try {
    execSync('taskkill /F /IM cloudflared.exe', { stdio: 'ignore' });
  } catch (e) {}

  const pidFile = path.join(ROOT_DIR, 'bot.pid');
  if (fs.existsSync(pidFile)) {
    try {
      const pidData = JSON.parse(fs.readFileSync(pidFile, 'utf-8'));
      if (pidData.botPid) {
        try { execSync(`taskkill /F /PID ${pidData.botPid}`, { stdio: 'ignore' }); } catch {}
      }
      if (pidData.tunnelPid) {
        try { execSync(`taskkill /F /PID ${pidData.tunnelPid}`, { stdio: 'ignore' }); } catch {}
      }
      fs.unlinkSync(pidFile);
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
    const portCheck = execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"', { encoding: 'utf-8' }).trim();
    if (portCheck) {
      return { isRunning: true, pid: portCheck };
    }
  } catch {}

  // Fallback netstat
  try {
    const netstatOut = execSync('netstat -ano', { encoding: 'utf-8' });
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
      const remaining = qData.maxQuota - qData.usedQuota;
      console.log(`[QUOTA]    Remaining Quota: \x1b[36m${remaining.toLocaleString()} / ${qData.maxQuota.toLocaleString()} tickets\x1b[0m (Used: ${qData.usedQuota} tickets)`);
      console.log(`[ROUND]    Current Draw Round: ${qData.currentRoundId || '-'}`);
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
    execSync('npm run build', { cwd: BOT_DIR, stdio: 'ignore' });
  } catch (e) {
    console.warn('[BUILD WARNING] Using existing compiled build');
  }

  console.log('[3/3] Starting Bot Service (Port 3333) & Cloudflare Tunnel...');

  const bot = spawn('node', ['dist/index.js'], {
    cwd: BOT_DIR,
    shell: true,
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

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const tunnel = spawn(npxCmd, ['--yes', 'cloudflared', 'tunnel', '--url', 'http://localhost:3333'], {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let currentWebhookUrl = '';

  function handleTunnelOutput(data) {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !currentWebhookUrl) {
      currentWebhookUrl = match[0] + '/webhook';
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

  tunnel.stdout.on('data', handleTunnelOutput);
  tunnel.stderr.on('data', handleTunnelOutput);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', (line) => {
    const cmd = line.trim().toLowerCase();
    if (cmd === 'stop' || cmd === 'q' || cmd === 'exit') {
      console.log('\n[STOPPING] Stopping Bot Service & Cloudflare Tunnel...');
      try { bot.kill(); } catch (e) {}
      try { tunnel.kill(); } catch (e) {}
      killLingering();
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

  const shutdown = () => {
    try { bot.kill(); } catch (e) {}
    try { tunnel.kill(); } catch (e) {}
    killLingering();
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
    execSync(`explorer "${target}"`, { stdio: 'ignore' });
  } catch (e) {}
}

function openFile(target) {
  try {
    execSync(`start "" "${target}"`, { shell: true, stdio: 'ignore' });
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
 */
function startBackground() {
  console.clear();
  console.log('===============================================================================');
  console.log('     🚀 STARTING N3 BOT SERVICE IN BACKGROUND (SILENT / HIDDEN MODE)');
  console.log('===============================================================================');
  console.log('\n[1/3] Clearing lingering processes and memory...');
  killLingering();

  const distPath = path.join(BOT_DIR, 'dist', 'index.js');
  try {
    console.log('[2/3] Checking TypeScript build...');
    execSync('npm run build', { cwd: BOT_DIR, stdio: 'ignore' });
  } catch (e) {
    if (!fs.existsSync(distPath)) {
      console.error('[ERROR] Build failed and dist/index.js does not exist.');
      return;
    }
  }

  console.log('[3/3] Launching Bot Service and Tunnel in Background...');

  const botLogPath = path.join(ROOT_DIR, 'bot.log');
  const tunnelLogPath = path.join(ROOT_DIR, 'tunnel.log');

  const botOut = fs.openSync(botLogPath, 'a');
  const botErr = fs.openSync(botLogPath, 'a');

  // Launch node dist/index.js detached
  const bot = spawn('node', ['dist/index.js'], {
    cwd: BOT_DIR,
    detached: true,
    stdio: ['ignore', botOut, botErr]
  });
  bot.unref();

  // Launch cloudflared tunnel detached
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const tunnelOut = fs.openSync(tunnelLogPath, 'a');
  const tunnelErr = fs.openSync(tunnelLogPath, 'a');
  const tunnel = spawn(npxCmd, ['--yes', 'cloudflared', 'tunnel', '--url', 'http://localhost:3333'], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: ['ignore', tunnelOut, tunnelErr]
  });
  tunnel.unref();

  // Save PID metadata
  const pidFile = path.join(ROOT_DIR, 'bot.pid');
  try {
    fs.writeFileSync(pidFile, JSON.stringify({ botPid: bot.pid, tunnelPid: tunnel.pid, startedAt: new Date().toISOString() }, null, 2));
  } catch {}

  console.log('\n===============================================================================');
  console.log('   🎉 บอทสลาก N3 เริ่มทำงานในเบื้องหลังเรียบร้อยแล้ว (BACKGROUND RUNNING)');
  console.log('===============================================================================');
  console.log(`  - บอททำงานบนพอร์ต: 3333 (PID: ${bot.pid})`);
  console.log(`  - โหมดเบราว์เซอร์: Headless Chrome (ซ่อนหน้าต่าง 100% ไม่กวนหน้าจอ)`);
  console.log(`  - บันทึกการทำงาน: bot.log`);
  console.log(`  - บันทึก Tunnel: tunnel.log`);
  console.log('\n  คำแนะนำ:');
  console.log('  1. บอทจะคอยรับออเดอร์ทาง LINE ตลอด 24 ชม. แม้ปิดหน้าต่างนี้');
  console.log('  2. ตรวจสอบสถานะ / ดู Webhook URL ได้ที่ N3-MANAGER.bat (เมนู [3])');
  console.log('  3. สั่งหยุดบอทได้ที่ N3-MANAGER.bat (เมนู [7]) หรือดับเบิลคลิก STOP-BOT.bat');
  console.log('===============================================================================\n');

  // Check if tunnel log produces URL
  setTimeout(() => {
    try {
      if (fs.existsSync(tunnelLogPath)) {
        const content = fs.readFileSync(tunnelLogPath, 'utf-8');
        const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
        if (match && match.length > 0) {
          const latestUrl = match[match.length - 1] + '/webhook';
          fs.writeFileSync(path.join(ROOT_DIR, 'webhook-url.txt'), latestUrl, 'utf-8');
          console.log(`  >>> LINE WEBHOOK URL ล่าสุด: \x1b[32m\x1b[1m${latestUrl}\x1b[0m\n`);
        }
      }
    } catch {}
  }, 3000);
}

/**
 * 9. Stop Bot Service & Tunnel
 */
function stopBot() {
  console.clear();
  console.log('===============================================================================');
  console.log('              🛑 STOPPING N3 BOT SERVICE & CLOUDFLARE TUNNEL');
  console.log('===============================================================================');
  console.log('\nกำลังหยุดการทำงานของบอท, Cloudflare Tunnel และเบราว์เซอร์...');
  killLingering();
  console.log('\n\x1b[32m[SUCCESS] สั่งหยุดการทำงานของบอทและล้างพอร์ต 3333 เรียบร้อยแล้ว\x1b[0m');
  console.log('===============================================================================\n');
}

/**
 * 10. Interactive Main Menu
 */
function showMainMenu() {
  console.clear();
  const status = getBotStatus();
  const statusText = status.isRunning 
    ? `\x1b[32m● กำลังทำงาน (RUNNING - Port 3333, PID: ${status.pid})\x1b[0m`
    : '\x1b[33m○ หยุดทำงาน (STOPPED)\x1b[0m';

  let quotaText = '2,000 ใบ';
  const quotaPath = path.join(BOT_DIR, 'data', 'quota.json');
  if (fs.existsSync(quotaPath)) {
    try {
      const q = JSON.parse(fs.readFileSync(quotaPath, 'utf-8'));
      quotaText = `${(q.maxQuota - q.usedQuota).toLocaleString()} / ${q.maxQuota.toLocaleString()} ใบ`;
    } catch {}
  }

  const webhookUrl = getLatestWebhookUrl();

  console.log('===============================================================================');
  console.log('                         N3-MANAGER : CONTROL CENTER');
  console.log('               (Thanagit Namchok - N3 Digital Lottery Agent)');
  console.log('===============================================================================');
  console.log(`  สถานะบริการ:   ${statusText}`);
  console.log(`  โควต้าคงเหลือ: \x1b[36m${quotaText}\x1b[0m`);
  if (status.isRunning && webhookUrl) {
    console.log(`  LINE Webhook:  \x1b[35m${webhookUrl}\x1b[0m`);
  }
  console.log('===============================================================================');
  console.log('');
  console.log('  [1] Start Bot Service & LINE Tunnel (All-in-One Dashboard - โต้ตอบหน้าจอ)');
  console.log('  [2] Live Chrome Browser Login (Scan Paotang QR on Desktop)');
  console.log('  [3] Check System & Ticket Quota Status (Quota, Round, Port, Webhook)');
  console.log('  [4] Clean Temporary Files & Free Memory (Remove old QR images)');
  console.log('  [5] Build Project (Compile TypeScript to latest version)');
  console.log('  [6] Start Bot in Background (🚀 ซ่อนหน้าต่าง ไร้หน้าจอกวนใจ ทำงานเบื้องหลัง)');
  console.log('  [7] Stop Bot Service (🛑 สั่งหยุดการทำงานของบอท / ปิดบอทเบื้องหลัง)');
  console.log('  [8] Open QR Codes Folder (Open public/qrcodes in Explorer)');
  console.log('  [9] Open Website in Browser (Open index.html)');
  console.log('  [S] Create Desktop Shortcuts (สร้างไอคอนทางลัด 3 ตัวบนหน้าจอ Desktop)');
  console.log('  [0] Exit');
  console.log('');
  console.log('===============================================================================');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Please select an option [0-9 or S] (or type bg / stop): ', (choice) => {
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
      startBackground();
      setTimeout(() => {
        waitForKeypress();
      }, 3500);
    } else if (c === '7' || c === 'stop') {
      stopBot();
      waitForKeypress();
    } else if (c === '8') {
      openFolder(QR_DIR);
      showMainMenu();
    } else if (c === '9') {
      openFile(path.join(ROOT_DIR, 'index.html'));
      showMainMenu();
    } else if (c === 's' || c === 'shortcut' || c === 'shortcuts') {
      console.clear();
      console.log('Creating Desktop Shortcuts...');
      try {
        execSync('cscript //nologo scripts\\create-desktop-shortcuts.vbs', { cwd: ROOT_DIR, stdio: 'inherit' });
        console.log('\n\x1b[32m[SUCCESS] สร้างไอคอนทางลัดบน Desktop เรียบร้อยแล้ว!\x1b[0m');
      } catch (e) {
        console.error('[ERROR] ไม่สามารถสร้างทางลัดได้:', e.message);
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
if (mode === 'start') {
  startDashboard();
} else if (mode === 'bg' || mode === 'start-bg' || mode === 'silent') {
  startBackground();
} else if (mode === 'stop') {
  stopBot();
} else if (mode === 'clean') {
  console.log('Stopping lingering processes and cleaning files...');
  killLingering();
  const count = cleanFiles();
  console.log(`[SUCCESS] Cleaned temporary QR images successfully (${count} files)`);
} else if (mode === 'status') {
  checkStatus();
} else if (mode === 'login') {
  openLiveBrowser();
} else {
  showMainMenu();
}
