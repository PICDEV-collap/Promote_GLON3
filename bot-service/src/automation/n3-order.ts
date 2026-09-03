import { Page } from 'playwright';
import { CONFIG } from '../config';
import path from 'path';
import fs from 'fs';

export class N3OrderService {
  /**
   * สั่งซื้อสลาก N3 บนหน้าเว็บตัวแทน และดึงรูปภาพ QR Code ชำระเงิน
   */
  public static async executeOrder(
    page: Page,
    lotteryNumber: string,
    quantity: number
  ): Promise<{ success: boolean; qrImageUrl?: string; error?: string }> {
    try {
      console.log(`[N3 ORDER] เริ่มสั่งซื้อเลข ${lotteryNumber} จำนวน ${quantity} ใบ...`);

      // 1. ตรวจสอบว่าอยู่ในหน้าขายสลากหรือไม่ หากยังอยู่หน้า login ให้แจ้งเตือน
      if (page.url().includes('/login')) {
        return { success: false, error: 'Session หมดอายุ ต้องล็อกอินใหม่ผ่านเป๋าตัง' };
      }

      // 2. ดำเนินการค้นหาเลข 3 ตัว
      // (รองรับทั้ง input selector ทั่วไป หรือ text selector)
      const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="เลข"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill(lotteryNumber);
        await page.keyboard.press('Enter');
      }

      // 3. ปรับจำนวนใบ (ถ้ามีปุ่มบวกหรือช่องกรอกจำนวน)
      // ตัวอย่าง: หาปุ่มเพิ่มจำนวน หรือ input quantity
      const qtyInput = page.locator('input[type="number"], input[name*="qty"]').first();
      if (await qtyInput.isVisible()) {
        await qtyInput.fill(quantity.toString());
      }

      // 4. กดปุ่มยืนยันคำสั่งซื้อ / สร้าง QR Code
      const confirmBtn = page.locator('button:has-text("ยืนยัน"), button:has-text("สั่งซื้อ"), button:has-text("ชำระเงิน")').first();
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }

      // 5. รอให้รูปภาพ QR Code ชำระเงินแสดงขึ้นมา
      const qrLocator = page.locator('img[src^="data:image/"], canvas, .qr-code, #qr-code').first();
      await qrLocator.waitFor({ state: 'visible', timeout: 15000 });

      // 6. บันทึกรูปภาพ QR Code ชำระเงิน
      const qrFileName = `payment-${lotteryNumber}-${Date.now()}.png`;
      const qrFilePath = path.join(CONFIG.QR_OUTPUT_DIR, qrFileName);
      
      await qrLocator.screenshot({ path: qrFilePath });
      console.log(`[N3 ORDER] แคปเจอร์ QR ชำระเงินสำเร็จ: ${qrFilePath}`);

      const publicQrUrl = `${CONFIG.BASE_URL}/qrcodes/${qrFileName}`;

      // 7. รีเซ็ตหน้าจอเพื่อเตรียมพร้อมสำหรับออเดอร์ถัดไป
      await page.keyboard.press('Escape');

      return {
        success: true,
        qrImageUrl: publicQrUrl
      };

    } catch (err: any) {
      console.error('[N3 ORDER ERROR] เกิดข้อผิดพลาดขณะสั่งซื้อ:', err);
      return {
        success: false,
        error: err?.message || 'ระบบไม่สามารถดึง QR ชำระเงินได้'
      };
    }
  }
}
