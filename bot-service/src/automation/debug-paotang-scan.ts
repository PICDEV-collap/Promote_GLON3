import { chromium } from 'playwright';
import { SecurityGuard } from './security-guard';
import { CONFIG } from '../config';
import path from 'path';

async function debugScan() {
  console.log('=== DEBUG PAOTANG SCAN & REDIRECT FLOW ===');
  const security = new SecurityGuard();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  security.attachToPage(page);

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log('[NAVIGATED] -> ' + frame.url());
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('n3.glolotteryshop.com') || url.includes('krungthai.com')) {
      if (res.status() >= 300 && res.status() < 400) {
        console.log(`[REDIRECT ${res.status()}] ${url} -> ${res.headers()['location']}`);
      } else if (url.includes('auth') || url.includes('token') || url.includes('callback')) {
        console.log(`[API RESPONSE ${res.status()}] ${url}`);
      }
    }
  });

  await page.goto(CONFIG.N3_LOGIN_URL, { waitUntil: 'networkidle' });
  await page.locator('text=เข้าสู่ระบบด้วยแอปฯ').first().click();

  const qrLocator = page.locator('img[src^="data:image/"]').first();
  await qrLocator.waitFor({ state: 'visible', timeout: 20000 });
  const qrPath = path.join(CONFIG.QR_OUTPUT_DIR, 'debug-qr.png');
  await qrLocator.screenshot({ path: qrPath });
  console.log('QR Saved. Please scan debug-qr.png within 2 minutes...');

  // รอจนกว่าจะเกิดการเปลี่ยนหน้าจาก paotang-auth.krungthai.com
  let scanned = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(2000);
    const currUrl = page.url();
    if (!currUrl.includes('paotang-auth.krungthai.com')) {
      console.log('Detected URL change away from paotang-auth: ' + currUrl);
      scanned = true;
      break;
    }
    // ตรวจสอบดูว่ามีปุ่ม "กรุณากดที่นี่" หรือไม่
    const clickHere = page.locator('text=กรุณากดที่นี่');
    if (await clickHere.isVisible()) {
      console.log('Found "กรุณากดที่นี่" button, checking status...');
    }
  }

  if (scanned) {
    await page.waitForTimeout(5000); // รอให้ cookie และ token ทำงานเสร็จ
    console.log('Final URL after scan: ' + page.url());
    const cookies = await context.cookies();
    console.log('Cookies after scan:', JSON.stringify(cookies, null, 2));
    await context.storageState({ path: CONFIG.SESSION_STORAGE_PATH });
    console.log('Saved updated storageState!');
  }

  await browser.close();
}

debugScan();
