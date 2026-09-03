const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CF_LOG = path.join(__dirname, 'tunnel.log');
const BOT_LOG = path.join(__dirname, 'bot.log');

function stopServices() {
  console.log('\n[STOP] Stopping all background services...');
  try {
    execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
    execSync('powershell -Command "Get-Process -Name *cloudflared* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  } catch (e) {}

  console.log('[SUCCESS] All bot services stopped clean. Taskbar is clear!\n');
}

function startServices() {
  stopServices();

  console.log('[1/3] Starting N3 Bot Engine in Background...');
  const botOut = fs.openSync(BOT_LOG, 'a');
  const botProc = spawn('node', ['dist/index.js'], {
    cwd: path.join(__dirname, 'bot-service'),
    detached: true,
    stdio: ['ignore', botOut, botOut],
    windowsHide: true
  });
  botProc.unref();

  console.log('[2/3] Starting Cloudflare Tunnel in Background...');
  const cfOut = fs.openSync(CF_LOG, 'w');
  const npxExecutable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const cfProc = spawn(npxExecutable, ['--yes', 'cloudflared', 'tunnel', '--url', 'http://localhost:3333'], {
    detached: true,
    stdio: ['ignore', cfOut, cfOut],
    windowsHide: true
  });
  cfProc.unref();

  console.log('[3/3] Waiting for Public Webhook URL (5-10 seconds)...');

  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (fs.existsSync(CF_LOG)) {
      try {
        const content = fs.readFileSync(CF_LOG, 'utf-8');
        const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match) {
          clearInterval(interval);
          const webhookUrl = match[0] + '/webhook';
          console.log('\n===================================================================');
          console.log('       🎉 N3 BOT RUNNING IN BACKGROUND (NO TASKBAR ICONS)          ');
          console.log('===================================================================');
          console.log('\n  >>> COPY THIS LINE WEBHOOK URL: <<<');
          console.log('  \x1b[32m' + webhookUrl + '\x1b[0m\n');
          console.log('===================================================================');
          console.log('1. Copy the green URL above');
          console.log('2. Paste into LINE Developers -> Messaging API -> Webhook URL');
          console.log('3. Click Update and Verify');
          console.log('===================================================================\n');
          showMenu();
          return;
        }
      } catch (e) {}
    }

    if (attempts >= 30) {
      clearInterval(interval);
      console.log('\nServices are running! If URL does not show yet, choose option [3] in a moment.');
      showMenu();
    }
  }, 1000);
}

function checkStatus() {
  try {
    const portCheck = execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"', { encoding: 'utf-8' }).trim();
    if (portCheck) {
      console.log('\n[STATUS] N3 Bot is RUNNING in background (Port 3333, PID: ' + portCheck + ')');
      if (fs.existsSync(CF_LOG)) {
        try {
          const content = fs.readFileSync(CF_LOG, 'utf-8');
          const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
          if (match) {
            console.log('[STATUS] Current Webhook URL: \x1b[32m' + match[0] + '/webhook\x1b[0m');
          }
        } catch (e) {}
      }
    } else {
      console.log('\n[STATUS] Bot is STOPPED (Inactive)');
    }
  } catch {
    console.log('\n[STATUS] Bot is STOPPED (Inactive)');
  }
}

function showMenu() {
  console.log('-------------------------------------------------------------------');
  console.log('  [1] START Bot System (Starts Bot & Tunnel - Hidden from Taskbar)');
  console.log('  [2] STOP Bot System (Completely Stops all & Clears Taskbar)');
  console.log('  [3] Check System Status / View Current Webhook URL');
  console.log('  [4] Open Live Chrome (for Paotang Login)');
  console.log('  [0] Exit Menu (Background services keep running)');
  console.log('-------------------------------------------------------------------');

  rl.question('Select option [0-4]: ', (ans) => {
    const choice = ans.trim();
    if (choice === '1') {
      startServices();
    } else if (choice === '2') {
      stopServices();
      showMenu();
    } else if (choice === '3') {
      checkStatus();
      showMenu();
    } else if (choice === '4') {
      console.log('Launching live login...');
      const p = spawn('npx.cmd', ['ts-node', 'src/automation/open-live-browser.ts'], {
        cwd: path.join(__dirname, 'bot-service'),
        shell: true,
        stdio: 'inherit'
      });
      p.on('close', () => {
        showMenu();
      });
    } else if (choice === '0') {
      console.log('Goodbye!');
      rl.close();
      process.exit(0);
    } else {
      showMenu();
    }
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.clear();
console.log('===================================================================');
console.log('                 N3 BOT MASTER CONTROL MANAGER                     ');
console.log('===================================================================');
checkStatus();
showMenu();
