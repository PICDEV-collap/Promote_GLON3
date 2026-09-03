const { spawn } = require('child_process');

console.clear();
console.log('===================================================================');
console.log('            STARTING SECURE LINE WEBHOOK TUNNEL...');
console.log('===================================================================');
console.log('Please wait 5-10 seconds while Cloudflare connects...\n');

// รัน cloudflared ผ่าน npx
const child = spawn('npx', ['--yes', 'cloudflared', 'tunnel', '--url', 'http://localhost:3333'], {
  shell: true
});

let found = false;

function checkOutput(data) {
  const text = data.toString();
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && !found) {
    found = true;
    const webhookUrl = match[0] + '/webhook';
    console.log('\n===================================================================');
    console.log('             >>> COPY THIS LINE WEBHOOK URL <<<');
    console.log('===================================================================');
    console.log('');
    console.log('   \x1b[32m' + webhookUrl + '\x1b[0m');
    console.log('');
    console.log('===================================================================');
    console.log('1. Copy the green URL above');
    console.log('2. Go to LINE Developers -> Messaging API -> Webhook URL');
    console.log('3. Paste it, click "Update" and then "Verify"');
    console.log('4. Keep this window OPEN while running your bot!');
    console.log('===================================================================\n');
  }
}

child.stdout.on('data', checkOutput);
child.stderr.on('data', checkOutput);

child.on('close', (code) => {
  console.log('Tunnel closed with code:', code);
});
