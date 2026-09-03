import { chromium } from 'playwright';
import { SecurityGuard } from './security-guard';
import { CONFIG } from '../config';
import path from 'path';
import fs from 'fs';

async function run() {
  console.log('--- เริ่มต้นทดสอบเข้าสู่ระบบ N3 (Exploration Test) ---');
  console.log(`URL เป้าหมาย: ${CONFIG.N3_LOGIN_URL}`);
  
  const security = new SecurityGuard();
  
  // เปิดเบราว์เซอร์
  const browser = await chromium.launch({
    headless: true
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  // แนบระบบความปลอดภัย Whitelist
  security.attachToPage(page);
  
  try {
    console.log('กำลังโหลดหน้าเว็บ...');
    const response = await page.goto(CONFIG.N3_LOGIN_URL, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log(`สถานะ HTTP: ${response?.status()}`);
    console.log(`Title หน้าเว็บ: ${await page.title()}`);
    console.log(`Current URL: ${page.url()}`);
    
    // ตรวจสอบภาพ QR Code หรือ Element บนหน้าเว็บ
    const screenshotDir = path.join(__dirname, '../../public/qrcodes');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    const screenshotPath = path.join(screenshotDir, 'n3-login-page.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[SUCCESS] บันทึกภาพหน้าเว็บล็อกอินสำเร็จที่: ${screenshotPath}`);
    
    // ค้นหา Element ต่างๆ บนหน้าเว็บ เช่น แท็ก img, canvas, svg
    const images = await page.$$eval('img', imgs => imgs.map(img => ({
      src: img.src.substring(0, 100),
      alt: img.alt,
      className: img.className,
      id: img.id
    })));
    console.log('รายการรูปภาพที่พบบนหน้าเว็บ:', JSON.stringify(images, null, 2));

    const textContent = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('ข้อความบางส่วนบนหน้าเว็บ:\n', textContent);

  } catch (error) {
    console.error('[ERROR] เกิดข้อผิดพลาดในการเปิดหน้าเว็บ:', error);
  } finally {
    await browser.close();
    console.log('--- สิ้นสุดการทดสอบ ---');
  }
}

run();
