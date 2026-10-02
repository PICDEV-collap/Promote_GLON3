const { chromium } = require('../bot-service/node_modules/playwright');
const { enforceHighDpiSession } = require('../bot-service/dist/automation/browser-context');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['geolocation'], { origin: 'https://n3.glolotteryshop.com' });
    await context.route('https://n3.glolotteryshop.com/**', route => route.fulfill({ body: '<html>Location test</html>', contentType: 'text/html' }));
    const page = await context.newPage();
    await page.goto('https://n3.glolotteryshop.com/');
    await enforceHighDpiSession(page);
    const readLocation = () => page.evaluate(() => new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(position => resolve({
        latitude: position.coords.latitude, longitude: position.coords.longitude,
      }), error => reject(new Error(error.message)), { timeout: 2000 });
    }));
    assert.deepEqual(await readLocation(), { latitude: 13.7563, longitude: 100.5018 });
    await page.reload();
    await enforceHighDpiSession(page);
    assert.deepEqual(await readLocation(), { latitude: 13.7563, longitude: 100.5018 });
    await page.close();
    console.log('PASS: managed page location survives setup, reload and repeated setup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
