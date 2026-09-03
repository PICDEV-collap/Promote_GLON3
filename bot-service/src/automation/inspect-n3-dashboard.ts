import { chromium } from 'playwright';
import { SecurityGuard } from './security-guard';
import { CONFIG } from '../config';
import fs from 'fs';
import path from 'path';

async function inspectDashboard() {
  console.log('====================================================');
  console.log('    INSPECTING N3 DEALER DASHBOARD WITH REAL SESSION');
  console.log('====================================================');

  const security = new SecurityGuard();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: CONFIG.SESSION_STORAGE_PATH
  });

  const page = await context.newPage();
  security.attachToPage(page);

  try {
    console.log('กำลังนำทางไปที่ https://n3.glolotteryshop.com/ ...');
    await page.goto('https://n3.glolotteryshop.com/', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('URL ปัจจุบัน:', page.url());

    // แคปภาพหน้าจอ Dashboard ตัวแทน N3
    const ssPath = path.join(CONFIG.QR_OUTPUT_DIR, 'n3-dealer-dashboard.png');
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log('[SUCCESS] บันทึกภาพหน้าจอ Dashboard สำเร็จที่: ' + ssPath);

    // ดึงข้อมูล Inputs ทั้งหมด
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, button, select')).map(el => ({
        tagName: el.tagName,
        type: (el as HTMLInputElement).type,
        name: (el as HTMLInputElement).name,
        id: el.id,
        placeholder: (el as HTMLInputElement).placeholder,
        className: el.className,
        text: el.textContent?.trim().substring(0, 50)
      }));
    });

    console.log('Elements ที่พบบนหน้า Dashboard:', JSON.stringify(inputs, null, 2));

    // ข้อความบนหน้าจอ
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    console.log('ข้อความบนหน้า Dashboard:\n', pageText);

  } catch (err) {
    console.error('[ERROR]', err);
  } finally {
    await browser.close();
    console.log('====================================================');
  }
}

inspectDashboard();
