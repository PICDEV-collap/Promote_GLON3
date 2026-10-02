const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('../bot-service/node_modules/playwright');

test('Done and Back clear order data and QR without skipping browser history', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const file of ['order.html', 'order-6pack.html', 'line.html', 'bot-service/public/order.html', 'bot-service/public/order-6pack.html', 'bot-service/public/line.html']) {
      const page = await browser.newPage();
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'order.test') return route.abort();
        return route.fulfill({ contentType: 'text/html', body: url.pathname === '/order' ? fs.readFileSync(file, 'utf8') : '<h1>Previous page</h1>' });
      });
      await page.goto('http://order.test/home');
      await page.goto('http://order.test/order?n=123&q=5');
      await page.evaluate(() => {
        localStorage.setItem('glo_line_user_id', 'existing-member');
        currentOrderData = { clientRequestId: 'old-request', aggregatedItems: [{ number: '123', quantity: 5 }] };
        window.currentQrData = 'data:image/png;base64,oldqr';
        document.getElementById('modal-qr-img').src = window.currentQrData;
        orderPollInterval = setInterval(() => {}, 10000);
        clearOrderBrowserData();
      });
      const clean = await page.evaluate(() => ({ order: currentOrderData, qr: window.currentQrData, image: document.getElementById('modal-qr-img').getAttribute('src'), rows: rowsData, sets: addedSets, quantities: permutationQuantities, timer: orderPollInterval, query: location.search, member: localStorage.getItem('glo_line_user_id') }));
      assert.equal(clean.order, null); assert.equal(clean.qr, null); assert.equal(clean.image, null);
      assert.equal(clean.rows[0].number, ''); assert.equal(clean.sets.length, 0); assert.deepEqual(clean.quantities, {});
      assert.equal(clean.timer, null); assert.equal(clean.query, ''); assert.equal(clean.member, 'existing-member');
      await page.evaluate(() => {
        modalConfirm.classList.add('active');
        document.getElementById('modal-qr-area').style.display = 'block';
        btnModalClose.textContent = 'เสร็จสิ้น / ออกจากหน้านี้';
      });
      await page.locator('#btn-modal-close').click();
      await page.waitForURL('http://order.test/home');
      await page.goForward();
      assert.equal(await page.evaluate(() => rowsData[0].number), '', 'Forward must not restore imported lottery data');
      await page.goto('http://order.test/middle');
      await page.goto('http://order.test/order');
      await page.goBack();
      assert.equal(page.url(), 'http://order.test/middle', 'Hardware Back must navigate only once');
      await page.close();
    }
  } finally { await browser.close(); }
});
