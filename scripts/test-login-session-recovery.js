const { chromium } = require('../bot-service/node_modules/playwright');
const { N3Auth } = require('../bot-service/dist/automation/n3-auth');
const { CONFIG } = require('../bot-service/dist/config');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const output = fs.mkdtempSync(path.join(require('os').tmpdir(), 'n3-login-test-'));
  const oldOutput = CONFIG.QR_OUTPUT_DIR;
  CONFIG.QR_OUTPUT_DIR = output;
  try {
    for (const expired of [true, false]) {
      const page = await browser.newPage();
      let checks = 0;
      await page.route('https://n3.glolotteryshop.com/**', async route => {
        const url = route.request().url();
        if (url.includes('/lotto-search')) {
          checks++;
          if (expired) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<script>location.href = '+JSON.stringify('/login/?expired=1')+'</script>' });
          return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<input type="text"><button>เลือกเลข</button>' });
        }
        if (url.includes('expired=1')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<button onclick="document.querySelector(\'img\').style.display=\'block\'">เข้าสู่ระบบด้วยแอปฯ เป๋าตัง</button><img style="display:none" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==">' });
        if (url.includes('/login')) {
          if (expired && checks > 0) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<script>location.href = '+JSON.stringify('/login/?expired=1')+'</script>' });
          return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<script>location.href = '+JSON.stringify('/home/')+'</script>' });
        }
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<div>บริการจำหน่ายสลากตัวเลขสามหลัก</div>' });
      });
      const result = await N3Auth.generatePaotangLoginQR(page);
      assert(checks > 0, 'Home must be verified through protected search');
      if (expired) {
        assert(!result.alreadyLoggedIn);
        assert(fs.existsSync(result.qrImagePath), 'Expired session must produce login QR');
      } else assert.equal(result.alreadyLoggedIn, true);
      await page.close();
    }
    console.log('PASS: expired home produces QR; valid session avoids unnecessary login');
  } finally {
    CONFIG.QR_OUTPUT_DIR = oldOutput;
    await browser.close();
    for (const file of fs.readdirSync(output)) fs.unlinkSync(path.join(output, file));
    fs.rmdirSync(output);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
