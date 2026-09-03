import { chromium } from 'playwright';
import { SecurityGuard } from './security-guard';
import { N3Auth } from './n3-auth';
import { CONFIG } from '../config';
import path from 'path';
import { exec } from 'child_process';

async function testClickPaotangLogin() {
  console.log('====================================================');
  console.log('    N3 PAOTANG LOGIN & SESSION GENERATOR (5 MINS)   ');
  console.log('====================================================');
  
  const security = new SecurityGuard();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();
  security.attachToPage(page);

  try {
    console.log('[1/4] Connecting to N3 Portal: ' + CONFIG.N3_LOGIN_URL);
    await page.goto(CONFIG.N3_LOGIN_URL, { waitUntil: 'networkidle' });
    
    console.log('[2/4] Clicking "Login with Paotang App"...');
    const paotangBtn = page.locator('text=เข้าสู่ระบบด้วยแอปฯ').first();
    await paotangBtn.click();
    
    // รอ QR Code แสดง
    console.log('[3/4] Waiting for Paotang Login QR Code...');
    const qrImageLocator = page.locator('img[src^="data:image/"]').first();
    await qrImageLocator.waitFor({ state: 'visible', timeout: 20000 });

    const qrScreenshotPath = path.join(CONFIG.QR_OUTPUT_DIR, 'n3-paotang-qr-login.png');
    await qrImageLocator.screenshot({ path: qrScreenshotPath });
    console.log('[SUCCESS] Saved Login QR Code to: ' + qrScreenshotPath);

    // เปิดรูป QR Code ขึ้นมาบนหน้าจอคอมทันที
    console.log('--> Opening QR Code on your screen now...');
    exec(`start "" "${qrScreenshotPath}"`);

    console.log('====================================================');
    console.log('>>> ACTION REQUIRED: <<<');
    console.log('1. Open your "Paotang" (เป๋าตัง) app on mobile.');
    console.log('2. Scan the QR Code that just popped up on your screen.');
    console.log('3. Waiting for scan confirmation (Timeout: 5 mins)...');
    console.log('====================================================');

    // รอให้แอดมินสแกนและบันทึก Session
    const scanSuccess = await N3Auth.waitForAdminScan(page, context, 300000);
    if (scanSuccess) {
      console.log('🎉 [SUCCESS] Login successful! Session has been saved to:');
      console.log('   ' + CONFIG.SESSION_STORAGE_PATH);
      console.log('--> You can now run the bot with "Session Saved: true"');
    } else {
      console.warn('⚠️ [TIMEOUT] No scan detected within 5 minutes. Please try again.');
    }

  } catch (error) {
    console.error('[ERROR]', error);
  } finally {
    await browser.close();
    console.log('====================================================');
  }
}

testClickPaotangLogin();
