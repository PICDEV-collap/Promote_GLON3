const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('../bot-service/node_modules/playwright');

test('both LINE order entries hide the homepage while initializing and preserve order mode', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const reverse of [false, true]) {
      const page = await browser.newPage();
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'static.line-scdn.net') return route.fulfill({ contentType: 'application/javascript', body:
          'window.liff = { init: () => new Promise(resolve => window.resolveEntry = resolve) };' });
        if (url.hostname !== 'entry.test') return route.abort();
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync('index.html', 'utf8') });
        if (url.pathname === '/line') return route.fulfill({ contentType: 'text/html', body: '<h1>Order</h1>' });
        return route.abort();
      });
      const state = reverse ? '/line?mode=6pack' : '/line';
      await page.goto('https://entry.test/?liff.state=' + encodeURIComponent(state));
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).display), 'none');
      await page.evaluate(() => window.resolveEntry());
      await page.waitForURL('https://entry.test' + state);
      assert.equal(new URL(page.url()).searchParams.get('mode'), reverse ? '6pack' : null);
      await page.close();
    }
  } finally { await browser.close(); }
});
