import { BrowserContext, Page } from 'playwright';
import { CONFIG } from '../config';
import fs from 'fs';
import path from 'path';

export class N3Auth {
  /**
   * ตรวจสอบว่า Session ที่บันทึกไว้ยังใช้งานได้อยู่หรือไม่
   */
  public static async isSessionValid(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url();
      // หากอยู่ในหน้าค้นหาสลากหรือหน้าหลักอยู่แล้ว แสดงว่า Session ยังสมบูรณ์ 100%
      if (currentUrl.includes('/lotto-search/') || currentUrl.includes('/home/') || currentUrl.includes('/lotto-confirm/')) {
        return true;
      }

      console.log('[N3 AUTH] กำลังตรวจสอบ Session ผ่านหน้าค้นหาสลาก...');
      await page.goto('https://n3.glolotteryshop.com/lotto-search/?position=1', { waitUntil: 'networkidle', timeout: 15000 });
      const newUrl = page.url();

      // หากถูกดีดกลับมาที่หน้า /login แสดงว่ายังไม่ได้ล็อกอินหรือ Session หมดอายุ
      return !newUrl.includes('/login');
    } catch {
      return false;
    }
  }

  /**
   * กดสร้าง QR Code สำหรับให้แอดมินสแกนผ่านแอปเป๋าตัง
   * คืนค่าเป็น Path ของไฟล์รูปภาพ QR Code
   */
  public static async generatePaotangLoginQR(page: Page): Promise<{ qrImagePath: string; qrBase64?: string }> {
    console.log('[N3 AUTH] กำลังนำทางไปหน้าเข้าสู่ระบบ N3...');
    await page.goto(CONFIG.N3_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });

    console.log('[N3 AUTH] กำลังคลิกปุ่ม "เข้าสู่ระบบด้วยแอปฯ เป๋าตัง"...');
    const paotangBtn = page.locator('text=เข้าสู่ระบบด้วยแอปฯ').first();
    await paotangBtn.click();

    // รอดักจับรูปภาพ QR Code (src ขึ้นต้นด้วย data:image/jpeg;base64)
    console.log('[N3 AUTH] กำลังรอให้ QR Code เป๋าตังปรากฏบนหน้าจอ...');
    const qrImageLocator = page.locator('img[src^="data:image/"]').first();
    await qrImageLocator.waitFor({ state: 'visible', timeout: 20000 });

    // ดึง base64 data
    const src = await qrImageLocator.getAttribute('src');
    const qrFileName = `paotang-login-qr-${Date.now()}.png`;
    const qrImagePath = path.join(CONFIG.QR_OUTPUT_DIR, qrFileName);

    if (src && src.startsWith('data:image/')) {
      const base64Data = src.split(',')[1];
      fs.writeFileSync(qrImagePath, Buffer.from(base64Data, 'base64'));
      console.log(`[N3 AUTH] บันทึกภาพ QR Login จาก Data URI สำเร็จ: ${qrImagePath}`);
      return { qrImagePath, qrBase64: src };
    } else {
      // Fallback: แคปเจอร์เฉพาะส่วน element QR
      await qrImageLocator.screenshot({ path: qrImagePath });
      console.log(`[N3 AUTH] แคปเจอร์รูปภาพ QR Login สำเร็จ: ${qrImagePath}`);
      return { qrImagePath };
    }
  }

  /**
   * รอให้แอดมินสแกนด้วยแอปเป๋าตัง และระบบเปลี่ยนหน้ากลับมาที่แดชบอร์ด N3
   */
  public static async waitForAdminScan(page: Page, context: BrowserContext, timeoutMs: number = 300000): Promise<boolean> {
    console.log('[N3 AUTH] กำลังรอการสแกนจากแอปเป๋าตัง (Timeout: 5 นาที)...');
    try {
      // รอจน URL เปลี่ยนกลับมาที่ n3.glolotteryshop.com และไม่อยู่ใน /login
      await page.waitForURL(url => {
        const u = url.toString();
        return u.includes('n3.glolotteryshop.com') && !u.includes('/login');
      }, { timeout: timeoutMs });

      console.log(`[N3 AUTH SUCCESS] ล็อกอินสำเร็จ! URL ปัจจุบัน: ${page.url()}`);

      // บันทึก StorageState (Cookies, LocalStorage) ไว้ใช้ในครั้งถัดไป
      await context.storageState({ path: CONFIG.SESSION_STORAGE_PATH });
      console.log(`[N3 AUTH] บันทึก Session StorageState สำเร็จที่: ${CONFIG.SESSION_STORAGE_PATH}`);
      return true;
    } catch (err) {
      console.error('[N3 AUTH TIMEOUT] หมดเวลารอการสแกนจากแอปเป๋าตัง:', err);
      return false;
    }
  }
}
