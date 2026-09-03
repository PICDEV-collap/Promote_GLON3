const { spawn, execSync } = require('child_process');
const path = require('path');
const readline = require('readline');

console.clear();
console.log('===================================================================');
console.log('             N3 BOT SERVICE & TUNNEL (ALL-IN-ONE)                  ');
console.log('===================================================================');
console.log('\n[1/2] กำลังเริ่มระบบ N3 Bot Service (Port 3333)...');

// ปิดโปรเซสเก่าบนพอร์ต 3333 ก่อน
try {
  execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
  execSync('powershell -Command "Get-Process -Name *cloudflared* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
} catch (e) {}

// เริ่ม Bot Service ใน Process เดียวกัน
const bot = spawn('node', ['dist/index.js'], {
  cwd: path.join(__dirname, 'bot-service'),
  stdio: ['ignore', 'pipe', 'pipe']
});

bot.stdout.on('data', (data) => {
  const str = data.toString();
  if (str.includes('โควต้า') || str.includes('ORDER') || str.includes('SUCCESS') || str.includes('USER MESSAGE')) {
    process.stdout.write(str);
  }
});

bot.stderr.on('data', (data) => {
  const str = data.toString();
  if (!str.includes('DeprecationWarning')) {
    // กรอง log ทั่วไป
  }
});

console.log('[2/2] กำลังเชื่อมต่อ Cloudflare Tunnel สำหรับ LINE Webhook...');

// เริ่ม Cloudflare Tunnel
const tunnel = spawn('npx.cmd', ['--yes', 'cloudflared', 'tunnel', '--url', 'http://localhost:3333'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let urlFound = false;

function handleTunnelOutput(data) {
  const text = data.toString();
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && !urlFound) {
    urlFound = true;
    const webhookUrl = match[0] + '/webhook';
    console.log('\n===================================================================');
    console.log('       🎉 บอทและระบบอุโมงค์เชื่อมต่อ LINE พร้อมทำงานแล้ว!          ');
    console.log('===================================================================');
    console.log('\n  >>> ก๊อปปี้ LINE WEBHOOK URL นี้ไปใส่ใน LINE DEVELOPERS: <<<');
    console.log('  \x1b[32m\x1b[1m' + webhookUrl + '\x1b[0m\n');
    console.log('===================================================================');
    console.log('  - เมื่อมีลูกค้าพิมพ์สั่งซื้อใน LINE ข้อความจะเข้ามาที่หน้าต่างนี้ทันที');
    console.log('  - หากต้องการ "ปิดบอททั้งหมด" ให้กด [Ctrl + C] ในหน้าต่างนี้ได้เลย');
    console.log('===================================================================\n');
  }
}

tunnel.stdout.on('data', handleTunnelOutput);
tunnel.stderr.on('data', handleTunnelOutput);

// จัดการการปิดระบบเมื่อกด Ctrl+C
function cleanup() {
  console.log('\n\n[SHUTDOWN] กำลังปิดระบบบอทและอุโมงค์ทั้งหมด...');
  try {
    bot.kill();
    tunnel.kill();
    execSync('powershell -Command "Get-Process -Name *cloudflared* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  } catch (e) {}
  console.log('[SUCCESS] ปิดระบบเรียบร้อยแล้ว หน้าต่างไม่ค้างแน่นอนครับ');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
