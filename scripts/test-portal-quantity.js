const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('../bot-service/node_modules/playwright');
const { N3OrderService } = require('../bot-service/dist/automation/n3-order');

test('quantity changes do not double-add, touch another number or exceed the portal maximum', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<section><div class="card"><p>8 2 9</p><input type="number" min="1" max="3" value="1" oninput="if(window.rejectFill)this.value=1"><button onclick="window.plusClicks=(window.plusClicks||0)+1; if(!window.rejectPlus)this.parentElement.querySelector('input').value++"><img src="plus-icon.webp" width="16" height="16"></button></div><div class="card"><p>999</p><input type="number" value="2"><img src="plus-icon.webp" width="16" height="16"></div></section>`);
    const input = page.locator('input').first();
    await N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 2 });
    assert.equal(await input.inputValue(), '2');
    assert.equal(await page.evaluate(() => window.plusClicks || 0), 0, 'Successful fill must not also press plus');
    assert.equal(await page.locator('input').last().inputValue(), '2');
    await assert.rejects(N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 101 }), /สูงสุด 3 ใบ.*101/);
    assert.equal(await input.inputValue(), '2', 'Over-limit requests must not mutate the portal input');
    await page.evaluate(() => { window.rejectFill = true; document.querySelector('input').value = 1; });
    await N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 3 });
    assert.equal(await input.inputValue(), '3');
    assert.equal(await page.evaluate(() => window.plusClicks), 2, 'Fallback must increment only the remaining quantity');
    await N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 3 });
    assert.equal(await page.evaluate(() => window.plusClicks), 2, 'Auditing an already-correct quantity must never increment it');
    await page.evaluate(() => { window.rejectPlus = true; document.querySelector('input').value = 1; });
    await assert.rejects(N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 2 }), /ไม่ตรงกับคำสั่งซื้อ/);
  } finally { await browser.close(); }
});
