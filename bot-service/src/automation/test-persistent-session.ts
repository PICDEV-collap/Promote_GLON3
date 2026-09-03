import { PersistentBrowserManager } from './browser-context';
import { SecurityGuard } from './security-guard';
import { CONFIG } from '../config';
import path from 'path';

async function testPersistent() {
  console.log('=== VERIFYING PERSISTENT SESSION & N3 ORDER PAGE ===');
  const { page } = await PersistentBrowserManager.getPage(true);
  const security = new SecurityGuard();
  security.attachToPage(page);

  try {
    console.log('1. Loading portal: https://n3.glolotteryshop.com/ ...');
    await page.goto('https://n3.glolotteryshop.com/', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('URL 1:', page.url());

    // แคปหน้าจอ 1
    const p1 = path.join(CONFIG.QR_OUTPUT_DIR, 'n3-live-verify-1.png');
    await page.screenshot({ path: p1, fullPage: true });
    console.log('Saved Screenshot 1:', p1);

    // ตรวจสอบว่าเจอกล่อง N3 หรือไม่
    const n3Card = page.locator('text=สลากตัวเลข').or(page.locator('text=สามหลัก')).first();
    if (await n3Card.isVisible()) {
      console.log('2. Found N3 Card! Clicking into N3 Order Page...');
      await n3Card.click();
      await page.waitForTimeout(3000);
      console.log('URL 2 (After clicking N3):', page.url());

      // แคปหน้าจอในหน้า N3
      const p2 = path.join(CONFIG.QR_OUTPUT_DIR, 'n3-live-verify-2.png');
      await page.screenshot({ path: p2, fullPage: true });
      console.log('Saved Screenshot 2 (N3 Page):', p2);

      // ดึงข้อมูล Elements ทั้งหมดในหน้า N3
      const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input, button, [role="button"], div[class*="key"], div[class*="num"], span')).map(el => ({
          tag: el.tagName,
          id: el.id,
          name: (el as HTMLInputElement).name || '',
          className: el.className,
          placeholder: (el as HTMLInputElement).placeholder || '',
          text: el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 40)
        })).filter(x => x.text || x.placeholder || x.id);
      });

      console.log('Found Elements in N3 Page:', JSON.stringify(inputs.slice(0, 40), null, 2));
    } else {
      console.log('N3 Card not found directly, checking body text...');
      const txt = await page.evaluate(() => document.body.innerText.substring(0, 500));
      console.log('Page Text:', txt);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await PersistentBrowserManager.close();
    console.log('=== VERIFICATION COMPLETED ===');
  }
}

testPersistent();
