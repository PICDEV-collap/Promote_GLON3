import { PersistentBrowserManager } from './browser-context';
import { SecurityGuard } from './security-guard';

async function testSelectButton() {
  const { page } = await PersistentBrowserManager.getPage(true);
  const security = new SecurityGuard();
  security.attachToPage(page);

  try {
    await page.goto('https://n3.glolotteryshop.com/lotto-search/?position=1', { waitUntil: 'networkidle' });

    // กรอก 4 5 1
    const inputs = page.locator('input[type="text"], input[type="tel"], input[maxlength="1"], input[inputmode="numeric"]');
    if (await inputs.count() >= 3) {
      await inputs.nth(0).fill('4');
      await inputs.nth(1).fill('5');
      await inputs.nth(2).fill('1');
      await page.locator('button:has-text("เลือกเลข")').first().click();
      await page.waitForTimeout(2000);
    }

    // วิเคราะห์ปุ่มทั้งหมดในตารางผลลัพธ์
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map((b, idx) => ({
        index: idx,
        text: b.innerText.trim(),
        className: b.className,
        outerHTML: b.outerHTML.substring(0, 150)
      }));
    });

    console.log('Buttons found:', JSON.stringify(buttons, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await PersistentBrowserManager.close();
  }
}

testSelectButton();
