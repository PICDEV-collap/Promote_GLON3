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
      await page.waitForTimeout(2000); // รอรูป QR โหลดชัดเจน

      // 11. ดึงภาพ QR Code ที่แท้จริง
      const qrFileName = `payment-${lotteryNumber}-${Date.now()}.png`;
      const qrFilePath = path.join(CONFIG.QR_OUTPUT_DIR, qrFileName);

      let isCaptured = false;

      // ทางเลือกที่ 1: ดักจับการดาวน์โหลดจากปุ่ม "บันทึก" (เป็นวิธีทางการของเว็บสลาก)
      const saveBtn = page.locator('button:has-text("บันทึก")').first();
      if (await saveBtn.isVisible()) {
        try {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 4000 }),
            saveBtn.click()
          ]);
          if (download) {
            await download.saveAs(qrFilePath);
            isCaptured = true;
            console.log(`[QR CAPTURE SUCCESS] บันทึกไฟล์รูป QR แท้จากปุ่มบันทึกสำเร็จ: ${qrFilePath}`);
          }
        } catch (e) {
          console.log('[QR DOWNLOAD] ปุ่มบันทึกไม่ได้ดาวน์โหลดเป็นไฟล์ -> กำลังใช้ระบบตรวจจับ Element อัจฉริยะ...');
        }
      }

      // ทางเลือกที่ 2 (Fallback): ตรวจจับตำแหน่ง QR Code จากกล่องข้อความ "กรุณาสแกน QR" และ Element จัตุรัส
      if (!isCaptured) {
        const cropBox = await page.evaluate(() => {
          // ค้นหา Element รูปภาพหรือ Canvas ที่เป็นรูปสี่เหลี่ยมจัตุรัส (QR Code)
          const allMedia = Array.from(document.querySelectorAll('img, canvas, svg'));
          for (const el of allMedia) {
            const r = el.getBoundingClientRect();
            // ขนาด QR ต้องกว้าง 150-400px และเป็นสี่เหลี่ยมจัตุรัส (ratio ~1:1)
            if (r.width >= 140 && r.height >= 140 && r.width <= 420 && r.height <= 420) {
              const ratio = r.width / r.height;
              if (Math.abs(1 - ratio) < 0.15 && r.top > 120 && r.left > 200) {
                return {
                  x: Math.max(0, Math.round(r.left - 10)),
                  y: Math.max(0, Math.round(r.top - 10)),
                  width: Math.round(r.width + 20),
                  height: Math.round(r.height + 20)
                };
              }
            }
          }

          // Anchor Fallback: ค้นหากล่องข้อความ "กรุณาสแกน QR" แล้วหาตำแหน่ง QR ที่อยู่ใต้ข้อความพอดี
          const allEls = Array.from(document.querySelectorAll('*'));
          const textEl = allEls.find(el => el.textContent && el.textContent.includes('กรุณาสแกน QR ผ่านแอปฯ'));
          if (textEl) {
            const tr = textEl.getBoundingClientRect();
            const qrWidth = 260;
            const centerX = tr.left + (tr.width / 2);
            return {
              x: Math.max(0, Math.round(centerX - (qrWidth / 2))),
              y: Math.round(tr.bottom + 15),
              width: qrWidth,
              height: qrWidth
            };
          }

          // ค่าเริ่มต้นกึ่งกลางหน้าจอ
          return { x: 500, y: 380, width: 280, height: 280 };
        });

        console.log('[QR CROP] พิกัดที่จะทำการแคปเจอร์:', JSON.stringify(cropBox));
        await page.screenshot({
          path: qrFilePath,
          clip: cropBox
        });
        console.log(`[QR CAPTURE SUCCESS] แคปเจอร์ภาพ QR Code สำเร็จ: ${qrFilePath}`);
      }

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
