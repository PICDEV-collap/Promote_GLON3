import { chromium } from 'playwright';
import { SecurityGuard } from './security-guard';
import { CONFIG } from '../config';
import path from 'path';

async function inspectN3Shop() {
  console.log('=== INSPECTING N3 SHOP PAGE ===');
  const security = new SecurityGuard();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: CONFIG.SESSION_STORAGE_PATH
  });
  const page = await context.newPage();
  security.attachToPage(page);

  try {
    await page.goto('https://n3.glolotteryshop.com/', { waitUntil: 'networkidle' });
    console.log('Current URL 1:', page.url());

    // คลิกกล่อง "สลากตัวเลข สามหลัก"
    console.log('กำลังคลิกกล่อง "สลากตัวเลข สามหลัก"...');
    const n3Btn = page.locator('text=สลากตัวเลข').or(page.locator('text=สามหลัก')).first();
    await n3Btn.click();

    await page.waitForTimeout(3000);
    console.log('Current URL 2 (หลังคลิก N3):', page.url());

    // แคปภาพหน้าจอในหน้า N3
    const n3ScreenPath = path.join(CONFIG.QR_OUTPUT_DIR, 'n3-step2-input-screen.png');
    await page.screenshot({ path: n3ScreenPath, fullPage: true });
    console.log('Saved screenshot to: ' + n3ScreenPath);

    // ดึง Elements ในหน้านี้
    const elements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, button, [role="button"], div[class*="key"], div[class*="number"]')).map(el => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type || '',
        id: el.id || '',
        className: el.className || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
        text: el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 30)
      }));
    });

    console.log('Elements in Step 2:', JSON.stringify(elements.slice(0, 30), null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

inspectN3Shop();
