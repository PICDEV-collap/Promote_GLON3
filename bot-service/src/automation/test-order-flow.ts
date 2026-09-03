import { chromium } from 'playwright';
import { SecurityGuard } from './security-guard';
import { CONFIG } from '../config';
import fs from 'fs';
import path from 'path';

async function testOrderFlow() {
  console.log('--- ทดสอบเปิดหน้าเว็บ N3 ด้วย Session ที่บันทึกไว้ ---');
  console.log('StorageState exists:', fs.existsSync(CONFIG.SESSION_STORAGE_PATH));

  const security = new SecurityGuard();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: fs.existsSync(CONFIG.SESSION_STORAGE_PATH) ? CONFIG.SESSION_STORAGE_PATH : undefined
  });

  const page = await context.newPage();
  security.attachToPage(page);

  try {
    console.log('กำลังไปยัง:', CONFIG.N3_LOGIN_URL);
    await page.goto(CONFIG.N3_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('URL ปัจจุบัน:', page.url());

    // แคปภาพหน้าจอว่าเข้าไปหน้าใด
    const ssPath = path.join(CONFIG.QR_OUTPUT_DIR, 'session-test-screen.png');
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log('[SCREENSHOT] บันทึกภาพหน้าจอที่:', ssPath);

    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('ข้อความในหน้า:\n', bodyText);

  } catch (err) {
    console.error('[ERROR]', err);
  } finally {
    await browser.close();
    console.log('--- จบการทดสอบ ---');
  }
}

testOrderFlow();
