const { spawn, execSync } = require('child_process');
const path = require('path');

console.clear();
console.log('===================================================================');
console.log('             N3 BOT SERVICE & TUNNEL (ALL-IN-ONE)                  ');
console.log('===================================================================');
console.log('\n[1/2] กำลังเริ่มระบบ N3 Bot Service (Port 3333)...');

// ปิดโปรเซสตกค้างเดิมก่อน
try {
  execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
  execSync('powershell -Command "Get-Process -Name *cloudflared* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
} catch (e) {}

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
    console.log('  - เมื่อลูกค้าสั่งซื้อใน LINE ข้อความจะประมวลผลในหน้าต่างนี้ทันที');
    console.log('  - หากต้องการปิดระบบ ให้กด [Ctrl + C] หรือปิดหน้าต่างนี้ได้เลย');
    console.log('===================================================================\n');
  }
}

tunnel.stdout.on('data', handleTunnelOutput);
tunnel.stderr.on('data', handleTunnelOutput);

// ล้างระบบเมื่อปิด
function cleanup() {
  console.log('\n[SHUTDOWN] กำลังปิดระบบ...');
  try {
    bot.kill();
    tunnel.kill();
    execSync('powershell -Command "Get-Process -Name *cloudflared* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
