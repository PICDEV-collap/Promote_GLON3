import { Page } from 'playwright';
import { CONFIG } from '../config';
import path from 'path';

export class N3OrderService {
  /**
   * สั่งซื้อสลาก N3 ตาม Flow จริง:
   * 1. กรอกเลข 3 หลัก
   * 2. กดปุ่ม "เลือกเลข"
   * 3. คลิกปุ่ม "เลือก" (ตรงตัว ไม่ใช่ "เลือกเลข") หรือติ๊ก "เลือกทั้งหมด"
   * 4. ปรับจำนวนใบ (+) ถ้าต้องการมากกว่า 1 ใบ
   * 5. กดปุ่ม "ตรวจสอบสลากฯ"
   * 6. กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ"
   * 7. กดยืนยันในป๊อปอัป
   * 8. แคปเจอร์รูป QR Code ชำระเงิน ส่งให้ลูกค้า
   */
  public static async executeOrder(
    page: Page,
    lotteryNumber: string,
    quantity: number
  ): Promise<{ success: boolean; qrImageUrl?: string; error?: string }> {
    try {
      console.log(`[N3 ORDER] เริ่มสั่งซื้อเลข ${lotteryNumber} จำนวน ${quantity} ใบ...`);

      // 1. ไปยังหน้าค้นหาเลข
      const searchUrl = 'https://n3.glolotteryshop.com/lotto-search/?position=1';
      console.log(`[STEP 1] ไปยังหน้าค้นหา: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

      if (page.url().includes('/login')) {
        return { success: false, error: 'Session หลุด กรุณาพิมพ์ qr ใน LINE เพื่อสแกนเป๋าตังใหม่' };
      }

      // 2. กรอกตัวเลข 3 ตัวลงใน 3 ช่อง
      console.log(`[STEP 2] กำลังกรอกเลข 3 ตัว: ${lotteryNumber}`);
      const digits = lotteryNumber.split('');
      const inputBoxes = page.locator('input[type="text"], input[type="tel"], input[maxlength="1"], input[inputmode="numeric"]');
      const boxCount = await inputBoxes.count();

      if (boxCount >= 3) {
        await inputBoxes.nth(0).fill(digits[0]);
        await inputBoxes.nth(1).fill(digits[1]);
        await inputBoxes.nth(2).fill(digits[2]);
      } else {
        const mainInput = page.locator('input').first();
        if (await mainInput.isVisible()) {
          await mainInput.fill(lotteryNumber);
        }
      }

      // 3. กดปุ่ม "เลือกเลข"
      console.log('[STEP 3] กดปุ่ม "เลือกเลข"...');
      const selectNumberBtn = page.locator('button:has-text("เลือกเลข")').first();
      await selectNumberBtn.click();
      await page.waitForTimeout(1500); // รอผลการค้นหาแสดง

      // 4. คลิกเลือกสลากในแถวรายการ (ใช้ DOM evaluate เพื่อความแม่นยำ ไม่สับสนกับ "เลือกเลข")
      console.log('[STEP 4] กำลังคลิกเลือกสลากในรายการ...');
      const clicked = await page.evaluate(() => {
        // หาปุ่มที่มีข้อความว่า "เลือก" ตัวเดียวโดดๆ
        const allButtons = Array.from(document.querySelectorAll('button'));
        const exactPickBtn = allButtons.find(b => b.innerText.trim() === 'เลือก');
        if (exactPickBtn) {
          exactPickBtn.click();
          return 'clicked_button';
        }
        // ถ้าไม่เจอปุ่ม ให้ติ๊ก checkbox "เลือกทั้งหมด"
        const checkbox = document.querySelector('input[type="checkbox"]');
        if (checkbox) {
          (checkbox as HTMLInputElement).click();
          return 'clicked_checkbox';
        }
        return 'not_found';
      });

      console.log(`[STEP 4 RESULT] การเลือกสลาก: ${clicked}`);
      await page.waitForTimeout(1000);

      // 5. ปรับจำนวนใบ (ถ้าสั่งมากกว่า 1 ใบ)
      if (quantity > 1) {
        console.log(`[STEP 5] กำลังเพิ่มจำนวนใบเป็น ${quantity} ใบ...`);
        for (let i = 1; i < quantity; i++) {
          await page.evaluate(() => {
            const plusBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '+');
            if (plusBtn) plusBtn.click();
          });
          await page.waitForTimeout(300);
        }
      }

      // 6. กดปุ่ม "ตรวจสอบสลากฯ" (ปุ่มสีฟ้ามุมขวาล่าง)
      console.log('[STEP 6] กดปุ่ม "ตรวจสอบสลากฯ"...');
      const inspectBtn = page.locator('button:has-text("ตรวจสอบสลากฯ")').first();
      await inspectBtn.waitFor({ state: 'visible', timeout: 15000 });
      await inspectBtn.click();

      // 7. รอหน้ายืนยันรายการ (/lotto-confirm/)
      console.log('[STEP 7] รอหน้ายืนยันรายการ (/lotto-confirm/)...');
      await page.waitForURL(url => url.toString().includes('lotto-confirm'), { timeout: 15000 });

      // 8. กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ"
      console.log('[STEP 8] กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ"...');
      const createQrBtn = page.locator('button:has-text("สร้าง QR")').first();
      await createQrBtn.waitFor({ state: 'visible', timeout: 10000 });
      await createQrBtn.click();

      // 9. รอป๊อปอัปยืนยัน และกดปุ่ม "ยืนยัน"
      console.log('[STEP 9] รอป๊อปอัปยืนยัน และกดปุ่ม "ยืนยัน"...');
      const confirmDialogBtn = page.locator('button:has-text("ยืนยัน")').last();
      await confirmDialogBtn.waitFor({ state: 'visible', timeout: 10000 });
      await confirmDialogBtn.click();

      // 10. รอหน้าแสดง QR Code (/qr/)
      console.log('[STEP 10] รอหน้าแสดง QR Code (/qr/)...');
      await page.waitForURL(url => url.toString().includes('/qr/'), { timeout: 20000 });
      await page.waitForTimeout(2000); // รอรูป QR ชัดเจน

      // 11. แคปเจอร์ภาพ QR Code ชำระเงิน
      const qrFileName = `payment-${lotteryNumber}-${Date.now()}.png`;
      const qrFilePath = path.join(CONFIG.QR_OUTPUT_DIR, qrFileName);

      // แคปเจอร์เฉพาะส่วน QR Code ชำระเงินตรงกลาง
      const qrCodeImg = page.locator('img[src*="data:image"], img[alt*="QR"], .qr-container, canvas').first();
      if (await qrCodeImg.isVisible()) {
        await qrCodeImg.screenshot({ path: qrFilePath });
      } else {
        await page.screenshot({ path: qrFilePath, clip: { x: 300, y: 150, width: 840, height: 600 } });
      }

      console.log(`[SUCCESS] บันทึกภาพ QR Code ชำระเงินสำเร็จ: ${qrFilePath}`);

      // 12. กดปุ่ม "กลับหน้าหลัก"
      const backHomeBtn = page.locator('button:has-text("กลับหน้าหลัก")');
      if (await backHomeBtn.isVisible()) {
        await backHomeBtn.click().catch(() => {});
      }

      return {
        success: true,
        qrImageUrl: `${CONFIG.BASE_URL}/qrcodes/${qrFileName}`
      };

    } catch (err: any) {
      console.error('[N3 ORDER ERROR]', err);
      const errShot = path.join(CONFIG.QR_OUTPUT_DIR, `error-${Date.now()}.png`);
      await page.screenshot({ path: errShot }).catch(() => {});
      return {
        success: false,
        error: err?.message || 'เกิดข้อผิดพลาดในการสร้าง QR Code บนหน้าเว็บ'
      };
    }
  }
}
