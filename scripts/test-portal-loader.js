const { chromium } = require('../bot-service/node_modules/playwright');
const { N3OrderService } = require('../bot-service/dist/automation/n3-order');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div class="absolute" style="position:fixed;inset:0"><span class="loader"></span></div>');
    let ready = false;
    const pending = N3OrderService.waitForPortalReady(page, 2000).then(() => { ready = true; });
    await page.waitForTimeout(150);
    assert.equal(ready, false, 'Visible loading layer must block order actions');
    await page.locator('div').evaluate(element => { element.style.display = 'none'; });
    await pending;
    assert.equal(ready, true);
    await page.locator('div').evaluate(element => { element.style.display = 'block'; });
    await assert.rejects(N3OrderService.waitForPortalReady(page, 150), /GLO/);
    await page.setContent('<div class="absolute" style="display:none"><span class="loader"></span></div>');
    await N3OrderService.waitForPortalReady(page, 150);
    await page.setContent('<button onclick="this.dataset.clicked = true">เลือกเลข</button>');
    const search = page.getByRole('button', { name: 'เลือกเลข', exact: true });
    await N3OrderService.clickSearchControl(page, search);
    assert.equal(await search.getAttribute('data-clicked'), 'true');
    await search.evaluate(element => { element.disabled = true; element.removeAttribute('data-clicked'); });
    await assert.rejects(N3OrderService.clickSearchControl(page, search), /ยังไม่พร้อมใช้งาน/);
    assert.equal(await search.getAttribute('data-clicked'), null, 'Disabled search must never be clicked');
    console.log('PASS: visible loader waits, hidden loader proceeds, stuck loader returns accurate error');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
