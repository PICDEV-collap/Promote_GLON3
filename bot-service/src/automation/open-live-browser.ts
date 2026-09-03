import { chromium } from 'playwright';
import { CONFIG } from '../config';
import path from 'path';

async function openLiveBrowserForDealer() {
  console.log('===================================================================');
  console.log('       OPENING LIVE BROWSER FOR N3 DEALER LOGIN & INSPECT          ');
  console.log('===================================================================');
  console.log('กำลังเปิดหน้าต่าง Chrome ขึ้นมาบนหน้าจอคอมของคุณ...');

  // เปิดแบบ Headed (เห็นหน้าต่างบนจอ)
  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  try {
    console.log('กำลังเปิดหน้าเว็บ N3: https://n3.glolotteryshop.com/login/');
    await page.goto(CONFIG.N3_LOGIN_URL, { waitUntil: 'networkidle' });

    console.log('\n>>> คำแนะนำ: <<<');
    console.log('1. คลิกปุ่ม "เข้าสู่ระบบด้วยแอปฯ เป๋าตัง" บนหน้าต่าง Chrome ที่เปิดขึ้นมา');
    console.log('2. นำแอปเป๋าตังในมือถือมาสแกน QR Code');
    console.log('3. เมื่อเข้าสู่ระบบตัวแทนสำเร็จแล้ว ให้รอสักครู่ ระบบจะบันทึกโครงสร้างหน้าจออัตโนมัติ!');
    console.log('4. มีเวลาทำรายการ 5 นาที...\n');

    // รอดักจับเมื่อ URL เปลี่ยนเข้าสู่หน้าขายสลาก
    await page.waitForURL(url => {
      const u = url.toString();
      return u.includes('n3.glolotteryshop.com') && !u.includes('/login');
    }, { timeout: 300000 });

    console.log('🎉 ล็อกอินสำเร็จแล้ว! URL ปัจจุบัน: ' + page.url());
    await page.waitForTimeout(3000);

    // บันทึก Session คุกกี้จริง
    await context.storageState({ path: CONFIG.SESSION_STORAGE_PATH });
    console.log('✅ บันทึก Session StorageState สำเร็จ!');

    // แคปภาพหน้าจอ Dashboard ขายสลากจริง
    const dashScreenshot = path.join(CONFIG.QR_OUTPUT_DIR, 'n3-real-shop-screen.png');
    await page.screenshot({ path: dashScreenshot, fullPage: true });
    console.log('📸 แคปเจอร์ภาพหน้าขายสลากจริงบันทึกไว้ที่: ' + dashScreenshot);

    // วิเคราะห์ Element ทั้งหมดในหน้าขายสลากจริง
    const elements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, button, a, [role="button"]')).map(el => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type || '',
        id: el.id || '',
        name: (el as HTMLInputElement).name || '',
        className: el.className || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
        text: el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 40)
      }));
    });

    console.log('\n=== รายการปุ่มและช่องกรอกในหน้าขายสลากจริง ===');
    console.log(JSON.stringify(elements, null, 2));

    console.log('\nกด Enter ในหน้านี้เพื่อปิดเบราว์เซอร์...');

  } catch (err) {
    console.error('[ERROR]', err);
  } finally {
    // ปิดเบราว์เซอร์
    await browser.close();
  }
}

openLiveBrowserForDealer();
