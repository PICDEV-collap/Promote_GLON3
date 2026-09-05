import { BrowserContext, Page } from 'playwright';
import { CONFIG } from '../config';
import fs from 'fs';
import path from 'path';

export class N3Auth {
  /**
   * ตรวจสอบว่ามีป๊อปอัปแจ้งเตือนเซสชันหมดอายุ ("ไม่สามารถทำรายการได้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง") หรือไม่
   * หากมี ให้คลิก "ตกลง" เพื่อนำทางไปยังหน้า /login/ และคืนค่า true (แสดงว่าเซสชันหมดอายุจริง)
   */
  public static async checkAndDismissSessionModal(page: Page): Promise<boolean> {
    try {
      if (page.isClosed()) return false;
      const modalPattern = /ไม่สามารถทำรายการได้|เข้าสู่ระบบใหม่อีกครั้ง|เซสชันหมดอายุ|หมดอายุการใช้งาน|กรุณาเข้าสู่ระบบ/i;
      
      const modalLoc = page.locator('div.fixed, div[class*="inset-0"], [role="dialog"], .modal')
        .filter({ hasText: modalPattern })
        .first();

      if (await modalLoc.isVisible().catch(() => false)) {
        console.warn('[N3 AUTH] ตรวจพบป๊อปอัปเซสชันหมดอายุ ("ไม่สามารถทำรายการได้ เข้าสู่ระบบใหม่อีกครั้ง")');
        const okBtn = modalLoc.locator('button:visible').filter({ hasText: /^ตกลง$|^ยืนยัน$/ }).first();
        if (await okBtn.isVisible().catch(() => false)) {
          await okBtn.click().catch(() => {});
          await page.waitForURL(u => u.toString().includes('/login'), { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(500);
        }
        return true;
      }

      // ตรวจจับ Overlay สีดำระดับ z-[200] ที่ดัก Pointer Events
      const overlayKick = page.locator('div.fixed.inset-0[class*="z-"]').first();
      if (await overlayKick.isVisible().catch(() => false)) {
        const overlayText = await overlayKick.innerText().catch(() => '');
        if (modalPattern.test(overlayText)) {
          console.warn('[N3 AUTH] ตรวจพบ Overlay สีดำเซสชันหมดอายุ:', overlayText.slice(0, 100));
          const okBtn = overlayKick.locator('button:visible').filter({ hasText: /^ตกลง$|^ยืนยัน$/ }).first();
          if (await okBtn.isVisible().catch(() => false)) {
            await okBtn.click().catch(() => {});
            await page.waitForURL(u => u.toString().includes('/login'), { timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(500);
          }
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * ตรวจสอบว่า Session ที่บันทึกไว้ยังใช้งานได้อยู่หรือไม่
   */
  public static async isSessionValid(page: Page): Promise<boolean> {
    try {
      if (page.isClosed()) return false;

      // 1. ตรวจสอบว่ามีป๊อปอัปแจ้งเตือนเซสชันหมดอายุหรือไม่
      const isModalKicked = await this.checkAndDismissSessionModal(page);
      if (isModalKicked) {
        return false;
      }

      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/geolocation')) {
        return false;
      }

      // หากอยู่ในหน้าค้นหาสลากหรือยืนยัน ให้ตรวจสอบว่าปุ่มเลือกเลขหรือช่องกรอกใช้งานได้จริง
      if (currentUrl.includes('/lotto-search/') || currentUrl.includes('/lotto-confirm/')) {
        const hasInputs = await page.locator('input[type="text"]:visible, input[type="tel"]:visible, input[maxlength="1"]:visible, input[inputmode="numeric"]:visible').count().catch(() => 0);
        const hasSelectBtn = await page.locator('button:visible').filter({ hasText: /^เลือกเลข$/ }).count().catch(() => 0);
        if (hasInputs >= 1 && hasSelectBtn >= 1) {
          // ตรวจสอบอีกครั้งว่าไม่มี Backdrop สีดำบังอยู่
          const isBlocked = await page.locator('div.fixed.inset-0.bg-black, div.fixed.inset-0[class*="z-"]').first().isVisible().catch(() => false);
          if (!isBlocked) return true;
        }
      }

      // หากอยู่ที่หน้า Landing หรือหน้าหลักของตัวแทน และไม่มีป๊อปอัปหลุดเซสชัน ถือว่า Session ยังใช้งานได้ทันที (ประหยัดเวลา ~3-5 วินาที)
      if (currentUrl.includes('/landing') || currentUrl.includes('/home') || currentUrl.replace(/\/+$/, '') === 'https://n3.glolotteryshop.com') {
        const isBlocked = await page.locator('div.fixed.inset-0.bg-black, div.fixed.inset-0[class*="z-"]').first().isVisible().catch(() => false);
        if (!isBlocked) return true;
      }

      console.log('[N3 AUTH] กำลังตรวจสอบ Session ผ่านหน้าค้นหาสลาก...');
      await page.goto('https://n3.glolotteryshop.com/lotto-search/?position=1', { waitUntil: 'domcontentloaded', timeout: 15000 });

      // ตรวจจับป๊อปอัปเซสชันหมดอายุหลังโหลดหน้าใหม่
      if (await this.checkAndDismissSessionModal(page)) {
        return false;
      }

      // ตรวจสอบหากติดหน้า Geolocation ให้ลองคลิกปุ่มอนุญาต/ยืนยัน
      if (page.url().includes('/geolocation')) {
        console.warn('[N3 AUTH] หน้าเว็บติด Geolocation Guard กำลังลองกู้คืนตำแหน่งที่ตั้ง...');
        const allowBtn = page.locator('button:visible, [role="button"]:visible')
          .filter({ hasText: /อนุญาต|ยินยอม|เปิดตำแหน่ง|ตกลง|ลองใหม่|ต่อไป/ })
          .first();
        if (await allowBtn.isVisible().catch(() => false)) {
          await allowBtn.click().catch(() => {});
          await page.waitForTimeout(2000);
        }
      }

      const newUrl = page.url();

      // หากถูกดีดกลับมาที่หน้า /login หรือยังคงติดที่ /geolocation แสดงว่าเซสชันไม่พร้อมขาย
      if (newUrl.includes('/login') || newUrl.includes('/geolocation')) {
        console.warn(`[N3 AUTH] Session ไม่พร้อมใช้งานหรือติดหน้า Geolocation (URL: ${newUrl})`);
        return false;
      }

      // ตรวจจับป๊อปอัปเซสชันหมดอายุอีกครั้ง
      if (await this.checkAndDismissSessionModal(page)) {
        return false;
      }

      // ตรวจสอบว่าหน้าเว็บมีองค์ประกอบของระบบค้นหาหรือหน้าหลัก N3 จริง
      const isSearchPage = newUrl.includes('/lotto-search') || newUrl.includes('/landing') || newUrl.includes('/home');
      if (!isSearchPage) return false;

      // ตรวจสอบความพร้อมของอินพุตหรือองค์ประกอบร้านค้า
      const readyInputs = await page.locator('input[type="text"]:visible, input[type="tel"]:visible, input[inputmode="numeric"]:visible').count().catch(() => 0);
      const isShopOpen = await page.locator('text=เลือกเลขสลากฯ ในร้าน, text=บริการจำหน่ายสลาก, text=ยอดขายร้านค้า').first().isVisible().catch(() => false);
      return readyInputs > 0 || isShopOpen;
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

      // รอให้หน้าเว็บโหลดสมบูรณ์
      await page.waitForTimeout(1500);

      // หากอยู่ที่หน้า /home ให้คลิกเข้าสู่ระบบจำหน่ายสลากสามหลัก ("สลากตัวเลข สามหลัก")
      if (page.url().includes('/home')) {
        console.log('[N3 AUTH] อยู่ที่หน้า /home กำลังตรวจสอบปุ่ม "สลากตัวเลข สามหลัก" เพื่อเข้าสู่ร้านค้า...');
        const n3Card = page.locator('text=สลากตัวเลข').or(page.locator('text=สามหลัก')).first();
        if (await n3Card.isVisible().catch(() => false)) {
          console.log('[N3 AUTH] พบบล็อก "สลากตัวเลข สามหลัก" กำลังคลิก...');
          await n3Card.click().catch(() => {});
          await page.waitForTimeout(2500);
        }
      }

      // ตรวจสอบว่าติดหน้า Geolocation หรือไม่
      if (page.url().includes('/geolocation')) {
        console.log('[N3 AUTH] พบบล็อก Geolocation กำลังคลิกอนุญาตตำแหน่ง...');
        const allowBtn = page.locator('button:visible, [role="button"]:visible')
          .filter({ hasText: /อนุญาต|ยินยอม|เปิดตำแหน่ง|ตกลง|ลองใหม่|ต่อไป/ })
          .first();
        if (await allowBtn.isVisible().catch(() => false)) {
          await allowBtn.click().catch(() => {});
          await page.waitForTimeout(2000);
        }
      }

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
