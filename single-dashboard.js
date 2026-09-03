const { spawn, execSync } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');

console.clear();
console.log('===================================================================');
console.log('             N3 BOT SERVICE & TUNNEL (ALL-IN-ONE)                  ');
console.log('===================================================================');
console.log('\n[1/2] กำลังเริ่มระบบ N3 Bot Service (Port 3333)...');

// ฟังก์ชันล้างโปรเซสตกค้าง
function killLingering() {
  try {
    execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
    execSync('powershell -Command "Get-Process -Name *cloudflared* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  } catch (e) {}
}

killLingering();

// เริ่ม Bot Service
const bot = spawn('node', ['dist/index.js'], {
  cwd: path.join(__dirname, 'bot-service'),
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe']
});

bot.stdout.on('data', (data) => {
  const str = data.toString();
  if (str.includes('โควต้า') || str.includes('ORDER') || str.includes('SUCCESS') || str.includes('USER MESSAGE') || str.includes('Error')) {
    process.stdout.write(str);
  }
});

console.log('[2/2] กำลังเชื่อมต่อ Cloudflare Tunnel สำหรับ LINE Webhook...');

// เริ่ม Cloudflare Tunnel
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
    console.log('\n===================================================================');
    console.log('       🎉 บอทและระบบอุโมงค์เชื่อมต่อ LINE พร้อมทำงานแล้ว!          ');
    console.log('===================================================================');
    console.log('\n  >>> LINE WEBHOOK URL: <<<');
    console.log('  \x1b[32m\x1b[1m' + currentWebhookUrl + '\x1b[0m\n');
    console.log('===================================================================');
    console.log('  คำสั่งที่สามารถพิมพ์ได้ในหน้าจอนี้:');
    console.log('   - พิมพ์ \x1b[33mstop\x1b[0m หรือ \x1b[33mq\x1b[0m     : ปิดบอทและหยุดระบบทั้งหมด');
    console.log('   - พิมพ์ \x1b[36mclean\x1b[0m          : เคลียร์ไฟล์รูป QR เก่าเพื่อประหยัดพื้นที่');
    console.log('   - พิมพ์ \x1b[35murl\x1b[0m            : แสดง LINE Webhook URL อีกครั้ง');
    console.log('===================================================================\n');
  }
}

tunnel.stdout.on('data', handleTunnelOutput);
tunnel.stderr.on('data', handleTunnelOutput);

// จัดการปิดระบบ
function shutdown() {
  console.log('\n[SHUTDOWN] กำลังปิดระบบบอทและเคลียร์โปรเซสทั้งหมด...');
  try {
    bot.kill();
    tunnel.kill();
    killLingering();
  } catch (e) {}
  console.log('✅ ปิดระบบและเคลียร์พอร์ตเรียบร้อยแล้วครับ ขอบคุณครับ!');
  process.exit(0);
}

// รับคำสั่งแบบ Interactive ใน Console
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', (line) => {
  const cmd = line.trim().toLowerCase();
  if (cmd === 'q' || cmd === 'stop' || cmd === 'exit') {
    shutdown();
  } else if (cmd === 'url') {
    if (currentWebhookUrl) {
      console.log('\n  >>> LINE WEBHOOK URL: <<<');
      console.log('  \x1b[32m\x1b[1m' + currentWebhookUrl + '\x1b[0m\n');
    } else {
      console.log('กำลังเชื่อมต่ออุโมงค์ รอสักครู่...');
    }
  } else if (cmd === 'clean') {
    console.log('\nกำลังเคลียร์ไฟล์รูปภาพ QR Code เก่า...');
    const qrDir = path.join(__dirname, 'public', 'qrcodes');
    if (fs.existsSync(qrDir)) {
      const files = fs.readdirSync(qrDir);
      let count = 0;
      for (const f of files) {
        if (f.startsWith('payment-') || f.startsWith('error-')) {
          fs.unlinkSync(path.join(qrDir, f));
          count++;
        }
      }
      console.log(`✅ ลบไฟล์รูป QR ชั่วคราวไปแล้ว ${count} ไฟล์ สะอาดเรียบร้อย!\n`);
    }
  }
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
