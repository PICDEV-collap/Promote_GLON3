const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('../bot-service/node_modules/playwright');

test('all order pages disable excess-number confirmation and preserve chosen permutations through checkout', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const file of ['order.html', 'order-6pack.html', 'line.html', 'bot-service/public/order.html', 'bot-service/public/order-6pack.html', 'bot-service/public/line.html']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.route('**/*', route => route.abort());
      await page.setContent(fs.readFileSync(file, 'utf8'), { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        rowsData = Array.from({ length: 101 }, (_, i) => createRow(String(i).padStart(3, '0'), 1));
        renderTable();
      });
      assert.equal(await page.locator('#btn-submit-order').isDisabled(), true, file);
      await page.evaluate(() => { rowsData.pop(); renderTable(); });
      assert.equal(await page.locator('#btn-submit-order').isDisabled(), false, file);
      assert.equal(await page.locator('#normal-selection-limit').isVisible(), false);
      await page.evaluate(() => {
        switchOrderMode('6pack', false);
        selectedDigits = ['9', '4', '3']; updateDigitDisplay();
      });
      assert.equal(await page.locator('.perm-card[aria-pressed="true"]').count(), 6);
      await page.getByRole('button', { name: 'เลข 943', exact: true }).click();
      await page.getByRole('button', { name: 'เลข 934', exact: true }).click();
      assert.equal(await page.locator('.perm-card[aria-pressed="true"]').count(), 4);
      await page.locator('#set-qty-val').fill('25');
      await page.locator('#set-qty-val').dispatchEvent('change');
      assert.equal(await page.locator('.perm-card[aria-pressed="true"]').count(), 4);
      assert.match(await page.locator('#grand-total-qty').textContent(), /100 ใบ/);
      await page.evaluate(() => addCurrentSetToList());
      const saved = await page.evaluate(() => addedSets[0]);
      assert.equal(saved.perms.length, 4);
      assert.equal(saved.qty, 25);
      assert.equal(saved.perms.includes('943'), false);
      await page.evaluate(() => {
        dispatchAggregatedOrder = (command, items) => { window.testCheckout = items; };
        submitSixPackOrder();
      });
      assert.deepEqual(await page.evaluate(() => window.testCheckout), saved.perms.map(number => ({ number, quantity: 25 })));
      await page.evaluate(() => {
        addedSets = [{ digits: ['0','0','0'], perms: Array.from({ length: 101 }, (_, i) => String(i).padStart(3,'0')), qty: 1 }];
        updateGrandTotal();
      });
      assert.equal(await page.locator('#btn-submit-sixpack').isDisabled(), true);
      await page.evaluate(() => { addedSets = []; selectedDigits = ['0','0','1']; updateDigitDisplay(); });
      assert.equal(await page.locator('#btn-submit-sixpack').isDisabled(), false);
      assert.equal(await page.locator('.perm-card[aria-pressed="true"]').count(), 3);
      assert.deepEqual(await page.evaluate(() => getSelectedPermutations()), ['001', '010', '100']);
      await page.close();
    }
  } finally { await browser.close(); }
});
