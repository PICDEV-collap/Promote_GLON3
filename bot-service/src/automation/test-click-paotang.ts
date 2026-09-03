import { chromium } from 'playwright';
import { SecurityGuard } from './security-guard';
import { CONFIG } from '../config';
import path from 'path';

async function testClickPaotangLogin() {
  console.log('--- ทดสอบคลิกปุ่มเข้าสู่ระบบด้วยเป๋าตังเพื่อดู QR Code ---');
  
  const security = new SecurityGuard();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();
  security.attachToPage(page);

  try {
    await page.goto(CONFIG.N3_LOGIN_URL, { waitUntil: 'networkidle' });
    
    // หาปุ่มหรือองค์ประกอบที่มีข้อความ "เข้าสู่ระบบด้วยแอปฯ​ เป๋าตัง" หรือ #iconButtonLoginByPT
    console.log('กำลังคลิกปุ่ม "เข้าสู่ระบบด้วยแอปฯ​ เป๋าตัง"...');
    
    // ใช้ locator ที่ครอบคลุมทั้ง text และ id
    const paotangBtn = page.locator('text=เข้าสู่ระบบด้วยแอปฯ').first();
    await paotangBtn.click();
    
    // รอให้อัปเดตหน้าจอหรือมี QR Code แสดงขึ้นมา
    await page.waitForTimeout(3000);
    
    console.log(`URL ปัจจุบันหลังคลิก: ${page.url()}`);
    
    // บันทึกภาพหน้าจอหลังคลิก
    const qrScreenshotPath = path.join(CONFIG.QR_OUTPUT_DIR, 'n3-paotang-qr-login.png');
    await page.screenshot({ path: qrScreenshotPath, fullPage: true });
    console.log(`[SUCCESS] บันทึกภาพหน้า QR Code ล็อกอินที่: ${qrScreenshotPath}`);

    // ค้นหา element QR code (เช่น canvas, img, svg)
    const qrElements = await page.evaluate(() => {
      const results: any[] = [];
      document.querySelectorAll('canvas, svg, img').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 50) {
          results.push({
            tagName: el.tagName,
            id: el.id,
            className: el.className,
            width: rect.width,
            height: rect.height,
            src: (el as HTMLImageElement).src ? (el as HTMLImageElement).src.substring(0, 100) : undefined
          });
        }
      });
      return results;
    });

    console.log('Element ที่คาดว่าเป็น QR Code:', JSON.stringify(qrElements, null, 2));

    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 600));
    console.log('ข้อความในหน้าหลังคลิก:\n', bodyText);

  } catch (error) {
    console.error('[ERROR] เกิดข้อผิดพลาด:', error);
  } finally {
    await browser.close();
    console.log('--- สิ้นสุดการทดสอบ ---');
  }
}

testClickPaotangLogin();
