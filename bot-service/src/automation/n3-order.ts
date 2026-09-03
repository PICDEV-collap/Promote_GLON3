import { Page } from 'playwright';
import { CONFIG } from '../config';
import path from 'path';

export class N3OrderService {
  /**
   * สั่งซื้อสลาก N3 ตาม Flow จริง 4 ขั้นตอน:
   * 1. กรอกเลข 3 หลักในหน้า lotto-search
   * 2. ปรับจำนวนใบ และกด "ตรวจสอบสลากฯ"
   * 3. กด "สร้าง QR ซื้อ-ขายสลากฯ" ในหน้า lotto-confirm
   * 4. กดยืนยันในป๊อปอัป และแคปเจอร์รูป QR Code ส่งให้ลูกค้า
   */
  public static async executeOrder(
    page: Page,
    lotteryNumber: string,
    quantity: number
  ): Promise<{ success: boolean; qrImageUrl?: string; error?: string }> {
    try {
      console.log(`[N3 ORDER] เริ่มกระบวนการสั่งซื้อเลข ${lotteryNumber} จำนวน ${quantity} ใบ...`);

      // 1. นำทางไปยังหน้าค้นหาเลข N3 โดยตรง
      const searchUrl = 'https://n3.glolotteryshop.com/lotto-search/?position=1';
      console.log(`[STEP 1] ไปยังหน้าค้นหา: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // ตรวจสอบว่าหลุดไปหน้า login หรือไม่
      if (page.url().includes('/login')) {
        return { success: false, error: 'Session หลุด กรุณาพิมพ์ qr ใน LINE เพื่อสแกนเป๋าตังใหม่' };
      }

      // 2. กรอกตัวเลข 3 ตัวลงในช่อง 1, 2, 3
      console.log(`[STEP 2] กำลังกรอกเลข 3 ตัว: ${lotteryNumber}`);
      const digits = lotteryNumber.split('');
      
      // ค้นหาช่องกรอกตัวเลข 3 ช่อง
      const inputBoxes = page.locator('input[type="text"], input[type="tel"], input[maxlength="1"], input[inputmode="numeric"]');
      const boxCount = await inputBoxes.count();

      if (boxCount >= 3) {
        await inputBoxes.nth(0).fill(digits[0]);
        await inputBoxes.nth(1).fill(digits[1]);
        await inputBoxes.nth(2).fill(digits[2]);
      } else {
        // Fallback: หากช่องเป็น input เดียว หรือใช้ keyboard
        const mainInput = page.locator('input').first();
        if (await mainInput.isVisible()) {
          await mainInput.fill(lotteryNumber);
        }
      }

      // กดปุ่ม "เลือกเลข" (ถ้ามี)
      const selectBtn = page.locator('button:has-text("เลือกเลข")');
      if (await selectBtn.isVisible()) {
        await selectBtn.click();
        await page.waitForTimeout(1000);
      }

      // 3. ปรับจำนวนใบ (ถ้าสั่งมากกว่า 1 ใบ ให้กดปุ่ม +)
      if (quantity > 1) {
        console.log(`[STEP 3] กำลังปรับจำนวนใบเป็น ${quantity} ใบ...`);
        const plusBtn = page.locator('button:has-text("+"), [aria-label*="plus"], button:right-of(:text("ใบ"))').first();
        for (let i = 1; i < quantity; i++) {
          if (await plusBtn.isVisible()) {
            await plusBtn.click();
            await page.waitForTimeout(300);
          }
        }
      }

      // 4. กดปุ่ม "ตรวจสอบสลากฯ" (ปุ่มสีฟ้ามุมขวาล่าง)
      console.log('[STEP 4] กดปุ่ม "ตรวจสอบสลากฯ"...');
      const inspectBtn = page.locator('button:has-text("ตรวจสอบสลากฯ")');
      await inspectBtn.waitFor({ state: 'visible', timeout: 10000 });
      await inspectBtn.click();

      // 5. รอหน้าเว็บเปลี่ยนไปที่ /lotto-confirm/
      console.log('[STEP 5] กำลังรอหน้ายืนยันรายการ (/lotto-confirm/)...');
      await page.waitForURL(url => url.toString().includes('lotto-confirm'), { timeout: 15000 });

      // 6. กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ" (ปุ่มสีฟ้ามุมขวาล่าง)
      console.log('[STEP 6] กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ"...');
      const createQrBtn = page.locator('button:has-text("สร้าง QR")');
      await createQrBtn.waitFor({ state: 'visible', timeout: 10000 });
      await createQrBtn.click();

      // 7. รอป๊อปอัป "คุณต้องการสร้าง QR ซื้อ-ขายสลากฯ นี้หรือไม่" แล้วกดปุ่ม "ยืนยัน"
      console.log('[STEP 7] รอป๊อปอัปยืนยัน และกดปุ่ม "ยืนยัน"...');
      const confirmDialogBtn = page.locator('button:has-text("ยืนยัน")').last();
      await confirmDialogBtn.waitFor({ state: 'visible', timeout: 10000 });
      await confirmDialogBtn.click();

      // 8. รอหน้าเว็บเปลี่ยนไปที่หน้า QR (/qr/)
      console.log('[STEP 8] รอหน้าแสดง QR Code (/qr/)...');
      await page.waitForURL(url => url.toString().includes('/qr/'), { timeout: 15000 });

      // 9. แคปเจอร์ภาพ QR Code ชำระเงิน
      console.log('[STEP 9] กำลังแคปเจอร์รูปภาพ QR Code ชำระเงิน...');
      await page.waitForTimeout(1500); // รอรูปโหลดชัดเจน

      const qrFileName = `payment-${lotteryNumber}-${Date.now()}.png`;
      const qrFilePath = path.join(CONFIG.QR_OUTPUT_DIR, qrFileName);

      // หา element QR Code ที่อยู่ตรงกลาง
      const qrImageEl = page.locator('img[src*="data:image"], img[alt*="QR"], .qr-container img, svg').first();
      if (await qrImageEl.isVisible()) {
        await qrImageEl.screenshot({ path: qrFilePath });
      } else {
        // ถ้าหา element เฉพาะไม่เจอ ให้แคปเจอร์ทั้งหน้าจอส่วนบน
        await page.screenshot({ path: qrFilePath, clip: { x: 400, y: 250, width: 640, height: 600 } });
      }

      console.log(`[SUCCESS] บันทึกภาพ QR Code ชำระเงินสำเร็จ: ${qrFilePath}`);

      // 10. กดปุ่ม "กลับหน้าหลัก" เพื่อเตรียมพร้อมสำหรับคำสั่งซื้อถัดไป
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
      // แคปภาพหน้าจอตอนเกิด error เพื่อใช้วิเคราะห์
      const errShot = path.join(CONFIG.QR_OUTPUT_DIR, `error-${Date.now()}.png`);
      await page.screenshot({ path: errShot }).catch(() => {});
      return {
        success: false,
        error: err?.message || 'เกิดข้อผิดพลาดในการสร้าง QR Code บนหน้าเว็บ'
      };
    }
  }
}
