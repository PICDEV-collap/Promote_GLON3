const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('../bot-service/node_modules/playwright');
const { N3OrderService } = require('../bot-service/dist/automation/n3-order');

test('quantity accepts 60 despite max=3, without double-adds or touching other numbers', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<section><div class="card"><p>8 2 9</p><input type="number" min="1" max="3" value="1" oninput="if(window.rejectFill)this.value=1"><button onclick="window.plusClicks=(window.plusClicks||0)+1; if(!window.rejectPlus)this.parentElement.querySelector('input').value++"><img src="plus-icon.webp" width="16" height="16"></button></div><div class="card"><p>999</p><input type="number" value="2"><img src="plus-icon.webp" width="16" height="16"></div></section>`);
    const input = page.locator('input').first();
    await N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 2 });
    assert.equal(await input.inputValue(), '2');
    assert.equal(await page.evaluate(() => window.plusClicks || 0), 0, 'Successful fill must not also press plus');
    assert.equal(await page.locator('input').last().inputValue(), '2');
    await N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 60 });
    assert.equal(await input.inputValue(), '60', 'GLO max=3 attribute must not be interpreted as a three-ticket limit');
    assert.equal(await page.evaluate(() => window.plusClicks || 0), 0);
    assert.equal(await page.locator('input').last().inputValue(), '2');
    await page.evaluate(() => { window.rejectFill = true; document.querySelector('input').value = 1; });
    await N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 3 });
    assert.equal(await input.inputValue(), '3');
    assert.equal(await page.evaluate(() => window.plusClicks), 2, 'Fallback must increment only the remaining quantity');
    await N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 3 });
    assert.equal(await page.evaluate(() => window.plusClicks), 2, 'Auditing an already-correct quantity must never increment it');
    await page.evaluate(() => { window.rejectPlus = true; document.querySelector('input').value = 1; });
    await assert.rejects(N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 2 }), /ไม่ตรงกับคำสั่งซื้อ/);
    await page.evaluate(() => {
      window.rejectFill = false;
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog'); modal.textContent = 'ซื้อได้สูงสุด 100 ใบ';
      document.body.appendChild(modal);
    });
    await assert.rejects(N3OrderService.ensureItemQuantity(page, { number: '829', quantity: 101 }), /GLO รองรับสูงสุด 100 ใบ/);
  } finally { await browser.close(); }
});
