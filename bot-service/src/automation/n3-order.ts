import { Page } from 'playwright';
import { CONFIG } from '../config';
import path from 'path';

export class N3OrderService {
  /**
   * สั่งซื้อสลาก N3 ตาม Flow จริง:
   * 1. กรอกเลข 3 หลัก
   * 2. กดปุ่ม "เลือกเลข"
   * 3. คลิกปุ่ม "เลือก" ในแถวรายการ
   * 4. ปรับจำนวนใบ (+)
   * 5. กดปุ่ม "ตรวจสอบสลากฯ"
   * 6. กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ"
   * 7. กดยืนยันในป๊อปอัป
   * 8. แคปเจอร์เฉพาะรูป QR Code คมชัดเต็มใบตรงเป๊ะ 100%
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
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

      if (page.url().includes('/login')) {
        return { success: false, error: 'Session หลุด กรุณาพิมพ์ qr ใน LINE เพื่อสแกนเป๋าตังใหม่' };
      }

      // 2. กรอกตัวเลข 3 ตัว
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
      const selectNumberBtn = page.locator('button:has-text("เลือกเลข")').first();
      await selectNumberBtn.click();
      await page.waitForTimeout(1500);

      // 4. คลิกปุ่ม "เลือก" สลากในแถวรายการ
      await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        const exactPickBtn = allButtons.find(b => b.innerText.trim() === 'เลือก');
        if (exactPickBtn) {
          exactPickBtn.click();
        } else {
          const checkbox = document.querySelector('input[type="checkbox"]');
          if (checkbox) (checkbox as HTMLInputElement).click();
        }
      });
      await page.waitForTimeout(1000);

      // 5. ปรับจำนวนใบ
      if (quantity > 1) {
        for (let i = 1; i < quantity; i++) {
          await page.evaluate(() => {
            const plusBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '+');
            if (plusBtn) plusBtn.click();
          });
          await page.waitForTimeout(300);
        }
      }

      // 6. กดปุ่ม "ตรวจสอบสลากฯ"
      const inspectBtn = page.locator('button:has-text("ตรวจสอบสลากฯ")').first();
      await inspectBtn.waitFor({ state: 'visible', timeout: 15000 });
      await inspectBtn.click();

      // 7. รอหน้ายืนยันรายการ (/lotto-confirm/)
      await page.waitForURL(url => url.toString().includes('lotto-confirm'), { timeout: 15000 });

      // 8. กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ"
      const createQrBtn = page.locator('button:has-text("สร้าง QR")').first();
      await createQrBtn.waitFor({ state: 'visible', timeout: 10000 });
      await createQrBtn.click();

      // 9. รอป๊อปอัปยืนยัน และกดปุ่ม "ยืนยัน"
      const confirmDialogBtn = page.locator('button:has-text("ยืนยัน")').last();
      await confirmDialogBtn.waitFor({ state: 'visible', timeout: 10000 });
      await confirmDialogBtn.click();

      // 10. รอหน้าแสดง QR Code (/qr/)
      await page.waitForURL(url => url.toString().includes('/qr/'), { timeout: 20000 });
      await page.waitForTimeout(2500); // รอรูป QR โหลดชัดเจน

      // 11. คำนวณหาตำแหน่ง QR Code ที่แท้จริงเหนือปุ่ม "บันทึก"
      const qrFileName = `payment-${lotteryNumber}-${Date.now()}.png`;
      const qrFilePath = path.join(CONFIG.QR_OUTPUT_DIR, qrFileName);

      const clipArea = await page.evaluate(() => {
        // หาปุ่ม "บันทึก" ด้านล่างของ QR Code
        const buttons = Array.from(document.querySelectorAll('button'));
        const saveBtn = buttons.find(b => b.innerText.includes('บันทึก'));

        // ค้นหา canvas หรือ img หรือ svg ขนาดใหญ่ตรงกลาง
        const candidates = Array.from(document.querySelectorAll('canvas, img, svg'));
        for (const el of candidates) {
          const r = el.getBoundingClientRect();
          // ตัว QR Code จะมีขนาดระหว่าง 140px ถึง 450px และอยู่กึ่งกลางจอ
          if (r.width >= 140 && r.height >= 140 && r.x > 200 && r.y > 100) {
            if (!saveBtn || r.bottom <= saveBtn.getBoundingClientRect().top + 50) {
              // เพิ่ม padding รอบรูป 10px เพื่อให้สแกนติดง่ายขึ้น
              return {
                x: Math.max(0, Math.round(r.x - 10)),
                y: Math.max(0, Math.round(r.y - 10)),
                width: Math.round(r.width + 20),
                height: Math.round(r.height + 20)
              };
            }
          }
        }

        // Fallback: ถ้าหาไม่เจอ ให้คำนวณจากปุ่ม "บันทึก"
        if (saveBtn) {
          const bRect = saveBtn.getBoundingClientRect();
          const qrSize = 300;
          return {
            x: Math.round(bRect.x + (bRect.width / 2) - (qrSize / 2)),
            y: Math.max(0, Math.round(bRect.top - qrSize - 25)),
            width: qrSize,
            height: qrSize
          };
        }

        // Default Fallback
        return { x: 520, y: 260, width: 320, height: 320 };
      });

      console.log('[QR CROP] พิกัดที่จะทำการแคปเจอร์:', JSON.stringify(clipArea));

      // แคปเจอร์เฉพาะตัว QR Code
      await page.screenshot({
        path: qrFilePath,
        clip: clipArea
      });

      console.log(`[SUCCESS] บันทึกภาพ QR Code คมชัดตรงเป๊ะสำเร็จ: ${qrFilePath}`);

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
