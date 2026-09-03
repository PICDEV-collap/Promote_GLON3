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

      // เข้าสู่หน้าค้นหาสลาก lotto-search เพียงครั้งเดียว เพื่อให้ทุกรายการรวมอยู่ในตะกร้าเดียวกัน
      const searchUrl = 'https://n3.glolotteryshop.com/lotto-search/?position=1';
      if (!page.url().includes('/lotto-search/')) {
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
      }

      if (page.url().includes('/login')) {
        return { success: false, error: 'Session หลุด กรุณาพิมพ์ qr ใน LINE เพื่อสแกนเป๋าตังใหม่' };
      }

      // 1. วนลูปค้นหาและเลือกแต่ละสลากรวมเข้าในตะกร้าเดียวกัน
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        console.log(`[N3 ORDER ITEM ${idx + 1}/${items.length}] กำลังค้นหาและเพิ่มเลข ${item.number} (จำนวน ${item.quantity} ใบ)...`);

        // หากเป็นรายการที่ 2 เป็นต้นไป ตรวจสอบว่ามีปุ่ม "เลือกเลขอื่น" หรือ "เพิ่มสลาก" หรือแท็บตำแหน่งถัดไปหรือไม่
        if (idx > 0) {
          const addMoreBtn = page.locator('button:has-text("เลือกเลขอื่น"), button:has-text("เพิ่มสลาก"), button:has-text("เลือกสลากเพิ่ม"), button:has-text("ค้นหาเพิ่ม")').first();
          if (await addMoreBtn.isVisible().catch(() => false)) {
            await addMoreBtn.click();
            await page.waitForTimeout(500);
          }
        }

        // กรอกตัวเลข 3 ตัว
        const digits = item.number.split('');
        let inputBoxes = page.locator('input[type="text"], input[type="tel"], input[maxlength="1"], input[inputmode="numeric"]');
        let boxCount = await inputBoxes.count();

        // กรณีช่องกรอกไม่ปรากฏในรายการถัดไป ลองสลับไปที่ position ถัดไป
        if (boxCount < 3 && idx > 0) {
          const posUrl = `https://n3.glolotteryshop.com/lotto-search/?position=${idx + 1}`;
          console.log(`[N3 ORDER] สลับไปช่องสลากตำแหน่งที่ ${idx + 1}: ${posUrl}`);
          await page.goto(posUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
          inputBoxes = page.locator('input[type="text"], input[type="tel"], input[maxlength="1"], input[inputmode="numeric"]');
          boxCount = await inputBoxes.count();
        }

        if (boxCount >= 3) {
          await inputBoxes.nth(0).fill('');
          await inputBoxes.nth(0).fill(digits[0]);
          await inputBoxes.nth(1).fill('');
          await inputBoxes.nth(1).fill(digits[1]);
          await inputBoxes.nth(2).fill('');
          await inputBoxes.nth(2).fill(digits[2]);
        } else {
          const mainInput = page.locator('input').first();
          if (await mainInput.isVisible()) {
            await mainInput.fill('');
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

        // คลิกปุ่ม "เลือก" สลากในแถวรายการที่เพิ่งค้นหา
        const selectedSuccess = await page.evaluate(() => {
          const allButtons = Array.from(document.querySelectorAll('button'));
          const exactPickBtn = allButtons.find(b => b.innerText.trim() === 'เลือก');
          if (exactPickBtn) {
            exactPickBtn.click();
            return true;
          } else {
            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
            const uncheck = checkboxes.find(c => !c.checked);
            if (uncheck) {
              uncheck.click();
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

        // ปรับจำนวนใบสำหรับรายการล่าสุดที่เพิ่งเพิ่มเข้าตะกร้า
        if (item.quantity > 1) {
          for (let q = 1; q < item.quantity; q++) {
            if (page.isClosed()) break;
            const plusButtons = page.locator('button:has-text("+")');
            const plusCount = await plusButtons.count();
            if (plusCount > 0) {
              await plusButtons.last().click();
            } else {
              await page.evaluate(() => {
                const pluses = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.trim() === '+');
                if (pluses.length > 0) pluses[pluses.length - 1].click();
              }).catch(() => {});
            }
            await page.waitForTimeout(200);
          }
        }

        fulfilledItems.push(item);
        console.log(`[N3 ORDER ITEM ${idx + 1} SUCCESS] บรรจุเลข ${item.number} x ${item.quantity} ใบ ลงตะกร้าเรียบร้อยแล้ว`);
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
      console.log('[N3 ORDER STEP 2] กำลังกดปุ่ม ตรวจสอบสลากฯ...');
      const inspectBtn = page.locator('button:has-text("ตรวจสอบสลากฯ")').first();
      await inspectBtn.waitFor({ state: 'visible', timeout: 15000 });
      await inspectBtn.click();

      // 3. รอหน้ายืนยันรายการ (/lotto-confirm/)
      console.log('[N3 ORDER STEP 3] รอนำทางสู่หน้า lotto-confirm...');
      await page.waitForURL(url => url.toString().includes('lotto-confirm'), { timeout: 15000 });

      // 4. กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ"
      console.log('[N3 ORDER STEP 4] กำลังกดปุ่ม สร้าง QR ซื้อ-ขายสลากฯ...');
      const createQrBtn = page.locator('button:has-text("สร้าง QR")').first();
      await createQrBtn.waitFor({ state: 'visible', timeout: 10000 });
      await createQrBtn.click();

      // 5. รอป๊อปอัปยืนยัน และกดปุ่ม "ยืนยัน"
      console.log('[N3 ORDER STEP 5] กำลังกดยืนยันป๊อปอัปสร้าง QR Code...');
      const confirmDialogBtn = page.locator('button:has-text("ยืนยัน")').last();
      await confirmDialogBtn.waitFor({ state: 'visible', timeout: 10000 });
      await confirmDialogBtn.click();

      // 6. รอหน้าแสดง QR Code (/qr/)
      console.log('[N3 ORDER STEP 6] รอหน้าแสดงผล QR Code ชำระเงิน (/qr/)...');
      await page.waitForURL(url => url.toString().includes('/qr/'), { timeout: 20000 });
      await page.waitForTimeout(2000); // รอรูป QR โหลดชัดเจน

      // 7. ดึงภาพการ์ดสลาก N3 พร้อม QR Code ชำระเงิน (คมชัดระดับ Retina ไม่คลิกปุ่มบันทึก เพื่อป้องกัน Chrome C++ Crash)
      const fileSummary = fulfilledItems.map(i => i.number).join('-');
      const qrFileName = `payment-${fileSummary}-${Date.now()}.png`;
      const qrFilePath = path.join(CONFIG.QR_OUTPUT_DIR, qrFileName);

      console.log('[N3 ORDER STEP 7] กำลังดึงภาพการ์ด QR Code ชำระเงิน...');
      let isCaptured = false;

      // ทางเลือกที่ 1: แคปเจอร์กล่องการ์ดสลาก N3 ทั้งใบโดยตรง (คมชัด ครบทั้งหัว GLO, QR และยอดเงินรวม)
      const candidateLocators = [
        page.locator('div:has-text("กรุณาสแกน QR"):has-text("ยอดชำระทั้งหมด")').last(),
        page.locator('div:has-text("กรุณาสแกน QR"):has-text("ธนกิจนำโชค")').last(),
        page.locator('div:has-text("กรุณาสแกน QR")').last(),
        page.locator('.card, [class*="card"], [class*="modal"]').filter({ hasText: 'กรุณาสแกน QR' }).first()
      ];

      for (const loc of candidateLocators) {
        if (await loc.isVisible().catch(() => false)) {
          const box = await loc.boundingBox().catch(() => null);
          if (box && box.width >= 280 && box.height >= 320) {
            console.log(`[QR CAPTURE SUCCESS] ตรวจพบการ์ดสลาก N3 ขนาด ${Math.round(box.width)}x${Math.round(box.height)}px -> บันทึกภาพเรียบร้อย`);
            await loc.screenshot({ path: qrFilePath });
            isCaptured = true;
            break;
          }
        }
      }

      // ทางเลือกที่ 2: หากตรวจจับการ์ดไม่ติด ให้แคปเจอร์รอบตัว QR Code (canvas หรือ img) พร้อม Padding ครบชุด
      if (!isCaptured) {
        const qrEl = page.locator('canvas, img[src*="data:image"], img[alt*="QR"]').first();
        if (await qrEl.isVisible().catch(() => false)) {
          const box = await qrEl.boundingBox().catch(() => null);
          if (box && box.width >= 100 && box.height >= 100) {
            console.log(`[QR CAPTURE SUCCESS] ตรวจพบ QR Code Element -> บันทึกภาพพร้อมกรอบการ์ด`);
            const padX = 60;
            const padTop = 130;
            const padBottom = 100;
            await page.screenshot({
              path: qrFilePath,
              clip: {
                x: Math.max(0, Math.round(box.x - padX)),
                y: Math.max(0, Math.round(box.y - padTop)),
                width: Math.round(box.width + padX * 2),
                height: Math.round(box.height + padTop + padBottom)
              }
            });
            isCaptured = true;
          }
        }
      }

      // ทางเลือกที่ 3: Fallback แคปเจอร์พื้นที่กึ่งกลางหน้าจอขนาดใหญ่ 720x800px
      if (!isCaptured) {
        console.log('[QR CAPTURE FALLBACK] ใช้พิกัดกึ่งกลางจอมาตรฐาน (720x800px)...');
        await page.screenshot({
          path: qrFilePath,
          clip: { x: 360, y: 80, width: 720, height: 800 }
        });
        console.log(`[QR CAPTURE SUCCESS] แคปเจอร์พิกัดกึ่งกลางจอสำเร็จ: ${qrFilePath}`);
      }

      // 8. กดปุ่ม "กลับหน้าหลัก"
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
