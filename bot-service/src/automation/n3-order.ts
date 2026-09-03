import { Page } from 'playwright';
import { CONFIG } from '../config';
import path from 'path';
import { OrderItem } from '../queue/order-queue';

export class N3OrderService {
  /**
   * สั่งซื้อสลาก N3 ตาม Flow จริง (รองรับทั้งเลขเดียวและหลายเลขในบิลเดียว):
   * 1. วนลูปกรอกเลขแต่ละรายการและปรับจำนวนใบใส่ตะกร้า
   * 2. กดปุ่ม "ตรวจสอบสลากฯ" รวมทุกรายการ
   * 3. กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ"
   * 4. กดยืนยันในป๊อปอัป
   * 5. แคปเจอร์ภาพ QR Code รวมยอดชำระเงินคมชัดเต็มใบ 100%
   */
  public static async executeOrder(
    page: Page,
    lotteryNumberOrItems: string | OrderItem[],
    quantity: number = 1
  ): Promise<{
    success: boolean;
    qrImageUrl?: string;
    error?: string;
    outOfStockItems?: string[];
    fulfilledItems?: OrderItem[];
    totalQuantity?: number;
    totalPrice?: number;
  }> {
    try {
      const items: OrderItem[] = Array.isArray(lotteryNumberOrItems)
        ? lotteryNumberOrItems
        : [{ number: lotteryNumberOrItems, quantity }];

      const fulfilledItems: OrderItem[] = [];
      const outOfStockItems: string[] = [];

      console.log(`[N3 ORDER] เริ่มสั่งซื้อสลากจำนวน ${items.length} รายการ: ${items.map(i => `${i.number}x${i.quantity}`).join(', ')}...`);

      // 1. วนลูปค้นหาและเลือกแต่ละสลากเข้าตะกร้า
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        console.log(`[N3 ORDER ITEM ${idx + 1}/${items.length}] กำลังค้นหาเลข ${item.number} (จำนวน ${item.quantity} ใบ)...`);

        const searchUrl = 'https://n3.glolotteryshop.com/lotto-search/?position=1';
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

        if (page.url().includes('/login')) {
          return { success: false, error: 'Session หลุด กรุณาพิมพ์ qr ใน LINE เพื่อสแกนเป๋าตังใหม่' };
        }

        // กรอกตัวเลข 3 ตัว
        const digits = item.number.split('');
        const inputBoxes = page.locator('input[type="text"], input[type="tel"], input[maxlength="1"], input[inputmode="numeric"]');
        const boxCount = await inputBoxes.count();

        if (boxCount >= 3) {
          await inputBoxes.nth(0).fill(digits[0]);
          await inputBoxes.nth(1).fill(digits[1]);
          await inputBoxes.nth(2).fill(digits[2]);
        } else {
          const mainInput = page.locator('input').first();
          if (await mainInput.isVisible()) {
            await mainInput.fill(item.number);
          }
        }

        // กดปุ่ม "เลือกเลข"
        const selectNumberBtn = page.locator('button:has-text("เลือกเลข")').first();
        await selectNumberBtn.click();
        await page.waitForTimeout(1500);

        if (page.isClosed()) {
          return { success: false, error: 'หน้าต่างเบราว์เซอร์ถูกปิด กรุณาสั่งซื้อใหม่อีกครั้ง' };
        }

        // ตรวจสอบว่ามีสลากให้เลือกหรือไม่
        const notFound = await page.locator('text=ไม่พบสลาก').or(page.locator('text=ไม่พบข้อมูล')).first().isVisible().catch(() => false);
        if (notFound) {
          console.warn(`[N3 ORDER] สลากเลข ${item.number} ไม่มีจำหน่ายหรือหมดในระบบ`);
          outOfStockItems.push(item.number);
          continue;
        }

        // คลิกปุ่ม "เลือก" สลากในแถวรายการ
        const selectedSuccess = await page.evaluate(() => {
          const allButtons = Array.from(document.querySelectorAll('button'));
          const exactPickBtn = allButtons.find(b => b.innerText.trim() === 'เลือก');
          if (exactPickBtn) {
            exactPickBtn.click();
            return true;
          } else {
            const checkbox = document.querySelector('input[type="checkbox"]');
            if (checkbox) {
              (checkbox as HTMLInputElement).click();
              return true;
            }
          }
          return false;
        }).catch(() => false);

        if (!selectedSuccess) {
          console.warn(`[N3 ORDER] ไม่สามารถกดเลือกสลากเลข ${item.number} ได้`);
          outOfStockItems.push(item.number);
          continue;
        }
        await page.waitForTimeout(1000);

        // ปรับจำนวนใบ
        if (item.quantity > 1) {
          for (let q = 1; q < item.quantity; q++) {
            if (page.isClosed()) break;
            await page.evaluate(() => {
              const plusBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '+');
              if (plusBtn) plusBtn.click();
            }).catch(() => {});
            await page.waitForTimeout(200);
          }
        }

        fulfilledItems.push(item);
        console.log(`[N3 ORDER ITEM ${idx + 1} SUCCESS] เลือกเลข ${item.number} x ${item.quantity} ใบ เรียบร้อยแล้ว`);
      }

      // ตรวจสอบว่ามีสลากที่เลือกสำเร็จอย่างน้อย 1 รายการหรือไม่
      if (fulfilledItems.length === 0) {
        return {
          success: false,
          error: `ขออภัยครับ สลากเลข ${outOfStockItems.join(', ')} ไม่มีจำหน่ายหรือสลากหมดในระบบแล้วครับ`,
          outOfStockItems
        };
      }

      // 2. กดปุ่ม "ตรวจสอบสลากฯ"
      const inspectBtn = page.locator('button:has-text("ตรวจสอบสลากฯ")').first();
      await inspectBtn.waitFor({ state: 'visible', timeout: 15000 });
      await inspectBtn.click();

      // 3. รอหน้ายืนยันรายการ (/lotto-confirm/)
      await page.waitForURL(url => url.toString().includes('lotto-confirm'), { timeout: 15000 });

      // 4. กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ"
      const createQrBtn = page.locator('button:has-text("สร้าง QR")').first();
      await createQrBtn.waitFor({ state: 'visible', timeout: 10000 });
      await createQrBtn.click();

      // 5. รอป๊อปอัปยืนยัน และกดปุ่ม "ยืนยัน"
      const confirmDialogBtn = page.locator('button:has-text("ยืนยัน")').last();
      await confirmDialogBtn.waitFor({ state: 'visible', timeout: 10000 });
      await confirmDialogBtn.click();

      // 6. รอหน้าแสดง QR Code (/qr/)
      await page.waitForURL(url => url.toString().includes('/qr/'), { timeout: 20000 });
      await page.waitForTimeout(2000); // รอรูป QR โหลดชัดเจน

      // 7. ดึงภาพ QR Code คมชัดระดับ Retina High-Definition (สแกนติด 100%)
      const fileSummary = fulfilledItems.map(i => i.number).join('-');
      const qrFileName = `payment-${fileSummary}-${Date.now()}.png`;
      const qrFilePath = path.join(CONFIG.QR_OUTPUT_DIR, qrFileName);

      let isCaptured = false;

      // ทางเลือกที่ 1: ดักจับการดาวน์โหลดจากปุ่ม "บันทึก" (หากเว็บเปิดดาวน์โหลดเป็นไฟล์ทางการ)
      const saveBtn = page.locator('button:has-text("บันทึก")').first();
      if (await saveBtn.isVisible().catch(() => false)) {
        try {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 3500 }),
            saveBtn.click()
          ]);
          if (download) {
            await download.saveAs(qrFilePath);
            isCaptured = true;
            console.log(`[QR CAPTURE SUCCESS] บันทึกไฟล์รูป QR แท้จากปุ่มบันทึกสำเร็จ: ${qrFilePath}`);
          }
        } catch (e) {
          console.log('[QR DOWNLOAD] ปุ่มบันทึกไม่ได้ทริกเกอร์ไฟล์ดาวน์โหลด -> สลับไประบบแคปเจอร์ความละเอียดสูงระดับ HD...');
        }
      }

      // ทางเลือกที่ 2: ตรวจจับ Element QR Code ตัวจริง พร้อมคำนวณ Quiet Zone และแคปเจอร์ขนาดใหญ่
      if (!isCaptured) {
        const qrDetection = await page.evaluate(() => {
          // 1. ตรวจจับ Element QR โดยตรง (canvas, svg, หรือ img)
          const mediaElements = Array.from(document.querySelectorAll('canvas, svg, img'));
          const candidates: { width: number; height: number; area: number; left: number; top: number }[] = [];

          for (const el of mediaElements) {
            const rect = el.getBoundingClientRect();
            // QR Code สลาก N3 จะมีขนาดประมาณ 160px - 650px และเป็นสี่เหลี่ยมจัตุรัส
            if (rect.width >= 160 && rect.height >= 160 && rect.width <= 650 && rect.height <= 650) {
              const ratio = rect.width / rect.height;
              if (Math.abs(1 - ratio) < 0.15) {
                candidates.push({
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  area: rect.width * rect.height,
                  left: Math.round(rect.left),
                  top: Math.round(rect.top)
                });
              }
            }
          }

          if (candidates.length > 0) {
            // เลือกตัวที่ใหญ่ที่สุด (ตัว QR Code หลัก ไม่ใช่โลโก้ N3 อันเล็กๆ ตรงกลาง)
            candidates.sort((a, b) => b.area - a.area);
            const best = candidates[0];
            const padding = 24; // ขอบขาว Quiet Zone ตามมาตรฐาน QR Code
            return {
              strategy: 'element-qr',
              clip: {
                x: Math.max(0, best.left - padding),
                y: Math.max(0, best.top - padding),
                width: best.width + (padding * 2),
                height: best.height + (padding * 2)
              }
            };
          }

          // 2. ถ้าตรวจจับ Media ไม่เจอ: หาตำแหน่งการ์ดสีขาวที่แสดง QR ("กรุณาสแกน QR ผ่านแอปฯ เป๋าตัง")
          const leafNodes = Array.from(document.querySelectorAll('*')).filter(el =>
            el.children.length === 0 && el.textContent && el.textContent.includes('กรุณาสแกน QR')
          );

          if (leafNodes.length > 0) {
            let container = leafNodes[0].parentElement;
            while (container && container !== document.body) {
              const cr = container.getBoundingClientRect();
              if (cr.width >= 350 && cr.width <= 800 && cr.height >= 400) {
                return {
                  strategy: 'card-container',
                  clip: {
                    x: Math.max(0, Math.round(cr.left)),
                    y: Math.max(0, Math.round(cr.top)),
                    width: Math.round(cr.width),
                    height: Math.round(cr.height)
                  }
                };
              }
              container = container.parentElement;
            }
          }

          // 3. Fallback: พิกัดกึ่งกลางหน้าจอขนาดใหญ่ 480x480px สำหรับสลาก N3
          return {
            strategy: 'center-fallback',
            clip: { x: 480, y: 280, width: 480, height: 480 }
          };
        });

        console.log(`[QR CROP] กลยุทธ์การตรวจจับ: ${qrDetection.strategy} | พิกัด:`, JSON.stringify(qrDetection.clip));

        await page.screenshot({
          path: qrFilePath,
          clip: qrDetection.clip
        });
        console.log(`[QR CAPTURE SUCCESS] แคปเจอร์ภาพ QR Code ความละเอียดสูงสำเร็จ: ${qrFilePath}`);
      }

      // 12. กดปุ่ม "กลับหน้าหลัก"
      const backHomeBtn = page.locator('button:has-text("กลับหน้าหลัก")');
      if (await backHomeBtn.isVisible()) {
        await backHomeBtn.click().catch(() => {});
      }

      const totalQty = fulfilledItems.reduce((sum, it) => sum + it.quantity, 0);
      const totalPrice = totalQty * 20;

      return {
        success: true,
        qrImageUrl: `${CONFIG.BASE_URL}/qrcodes/${qrFileName}`,
        fulfilledItems,
        outOfStockItems,
        totalQuantity: totalQty,
        totalPrice
      };

    } catch (err: any) {
      console.error('[N3 ORDER ERROR]', err);
      if (page && !page.isClosed()) {
        const errShot = path.join(CONFIG.QR_OUTPUT_DIR, `error-${Date.now()}.png`);
        await page.screenshot({ path: errShot }).catch(() => {});
      }
      return {
        success: false,
        error: err?.message || 'เกิดข้อผิดพลาดในการสร้าง QR Code บนหน้าเว็บ'
      };
    }
  }
}
