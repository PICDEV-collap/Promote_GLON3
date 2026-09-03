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

      // เข้าสู่หน้าค้นหาสลาก lotto-search เพื่อเริ่มต้นบิลใหม่ในตะกร้าเดียวกัน
      const searchUrl = 'https://n3.glolotteryshop.com/lotto-search/?position=1';
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

      if (page.url().includes('/login')) {
        return { success: false, error: 'Session หลุด กรุณาพิมพ์ qr ใน LINE เพื่อสแกนเป๋าตังใหม่' };
      }

      // 1. วนลูปค้นหาและเลือกแต่ละสลากรวมเข้าในตะกร้าเดียวกัน (ไม่รีโหลดหน้าเว็บเพื่อรักษาสลากทั้งหมดในตะกร้า)
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        console.log(`[N3 ORDER ITEM ${idx + 1}/${items.length}] กำลังค้นหาและเพิ่มเลข ${item.number} (จำนวน ${item.quantity} ใบ)...`);

        // หากเป็นรายการที่ 2 เป็นต้นไป ให้กดปุ่มเพิ่มสลาก/เลือกเลขอื่น หรือสลับแท็บตำแหน่งใน SPA โดยไม่รีโหลดหน้าเว็บเด็ดขาด
        if (idx > 0) {
          let tabOrBtnFound = false;

          // ลองคลิกปุ่มเพิ่มรายการหรือแท็บตำแหน่งถัดไปบนหน้าจอ
          const addMoreSelectors = [
            'button:has-text("เลือกเลขอื่น")',
            'button:has-text("เพิ่มสลาก")',
            'button:has-text("เลือกสลากเพิ่ม")',
            'button:has-text("ค้นหาเพิ่ม")',
            'button:has-text("เพิ่มรายการ")',
            `button:has-text("สลากใบที่ ${idx + 1}")`,
            `button:has-text("ใบที่ ${idx + 1}")`,
            `button:has-text("ตำแหน่งที่ ${idx + 1}")`,
            `button:has-text("ตำแหน่ง ${idx + 1}")`,
            `button:has-text("สลาก ${idx + 1}")`,
            `a[href*="position=${idx + 1}"]`,
            `[role="tab"]:has-text("${idx + 1}")`,
            `div[class*="tab"]:has-text("${idx + 1}")`,
            `div[class*="step"]:has-text("${idx + 1}")`
          ];

          for (const sel of addMoreSelectors) {
            const el = page.locator(sel).first();
            if (await el.isVisible().catch(() => false)) {
              console.log(`[N3 ORDER] กดปุ่มหรือแท็บเพิ่มรายการ: ${sel}`);
              await el.click().catch(() => {});
              await page.waitForTimeout(600);
              tabOrBtnFound = true;
              break;
            }
          }

          // หากยังไม่เจอ ลองสลับแท็บตำแหน่งผ่าน DOM Evaluate (Client-side Router / Tab Click) โดยไม่ใช้ page.goto
          if (!tabOrBtnFound) {
            await page.evaluate((pos) => {
              const elements = Array.from(document.querySelectorAll('a, button, [role="tab"], div[class*="tab"], div[class*="step"], li'));
              const target = elements.find(el => {
                const href = el.getAttribute('href') || '';
                const text = el.textContent?.trim() || '';
                return href.includes(`position=${pos}`) ||
                       text === `${pos}` ||
                       text.includes(`ตำแหน่ง ${pos}`) ||
                       text.includes(`ตำแหน่งที่ ${pos}`) ||
                       text.includes(`ใบที่ ${pos}`) ||
                       text.includes(`สลาก ${pos}`);
              }) as HTMLElement | undefined;
              if (target) {
                target.click();
              }
            }, idx + 1).catch(() => {});
            await page.waitForTimeout(500);
          }
        }

        // กรอกตัวเลข 3 ตัว
        const digits = item.number.split('');
        const visibleBoxes = page.locator('input[type="text"]:visible, input[type="tel"]:visible, input[maxlength="1"]:visible, input[inputmode="numeric"]:visible');
        const visibleCount = await visibleBoxes.count().catch(() => 0);

        if (visibleCount >= 3) {
          // หากมีกล่องกรอกตัวเลขที่มองเห็นได้อย่างน้อย 3 กล่อง ให้กรอก 3 กล่องแรกที่มองเห็น
          await visibleBoxes.nth(0).fill('');
          await visibleBoxes.nth(0).fill(digits[0]);
          await visibleBoxes.nth(1).fill('');
          await visibleBoxes.nth(1).fill(digits[1]);
          await visibleBoxes.nth(2).fill('');
          await visibleBoxes.nth(2).fill(digits[2]);
        } else if (visibleCount === 1) {
          await visibleBoxes.first().fill('');
          await visibleBoxes.first().fill(item.number);
        } else {
          // Fallback หากระบบตรวจไม่พบกล่องแบบ visible ให้ค้นหากล่องทั้งหมดใน DOM
          const allInputs = page.locator('input[type="text"], input[type="tel"], input[maxlength="1"], input[inputmode="numeric"]');
          const allCount = await allInputs.count().catch(() => 0);
          if (allCount >= 3) {
            const startIdx = allCount >= (idx + 1) * 3 ? idx * 3 : 0;
            await allInputs.nth(startIdx).fill(digits[0]);
            await allInputs.nth(startIdx + 1).fill(digits[1]);
            await allInputs.nth(startIdx + 2).fill(digits[2]);
          } else if (allCount > 0) {
            const targetInput = allCount > idx ? allInputs.nth(idx) : allInputs.first();
            await targetInput.fill(item.number);
          }
        }

        // กดปุ่ม "เลือกเลข" เพื่อค้นหาสลาก (เลือกปุ่มที่มองเห็นได้และตรงกับคำว่า เลือกเลข ชัดเจน)
        const selectBtn = page.locator('button:visible').filter({ hasText: /^เลือกเลข$/ }).first();
        if (await selectBtn.isVisible().catch(() => false)) {
          await selectBtn.click();
        } else {
          const fallbackBtn = page.locator('button:has-text("เลือกเลข"):visible, button:has-text("ค้นหา"):visible').first();
          if (await fallbackBtn.isVisible().catch(() => false)) {
            await fallbackBtn.click();
          } else {
            await page.evaluate(() => {
              const btns = Array.from(document.querySelectorAll('button'));
              const b = btns.find(btn => btn.innerText.trim() === 'เลือกเลข' || btn.innerText.trim().includes('เลือกเลข'));
              if (b) b.click();
            }).catch(() => {});
          }
        }
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

        // คลิกปุ่ม "เลือก" สลากในแถวรายการที่เพิ่งค้นหา (เจาะจงการ์ด/กล่องที่มีเลขสลากนี้)
        let selectedSuccess = await page.evaluate((targetNum) => {
          const allButtons = Array.from(document.querySelectorAll('button'));

          const isPickButton = (b: HTMLButtonElement) => {
            const t = b.innerText.replace(/\s+/g, ' ').trim();
            return (t === 'เลือก' || t === 'เลือกสลาก' || t === 'เลือกสลากฯ' || t === 'เลือกซื้อ' ||
                   (t.startsWith('เลือก') && !t.includes('เลือกเลข') && !t.includes('เลือกเลขอื่น'))) && !b.disabled;
          };

          // 1. หาปุ่ม "เลือก" ที่อยู่ในการ์ดหรือกล่องที่มีเลขสลากนี้โดยตรง
          const containers = Array.from(document.querySelectorAll('div, tr, li, [class*="card"], [class*="item"], [class*="result"], [class*="row"]'));
          const matchedContainers = containers.filter(c => {
            const text = (c as HTMLElement).innerText || '';
            return text.includes(targetNum);
          });
          matchedContainers.sort((a, b) => a.innerHTML.length - b.innerHTML.length);

          for (const container of matchedContainers) {
            const pickBtn = Array.from(container.querySelectorAll('button')).find(isPickButton);
            if (pickBtn) {
              pickBtn.click();
              return true;
            }
            const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
            if (cb && !cb.checked) {
              cb.click();
              return true;
            }
          }

          // 2. หากไม่พบคอนเทนเนอร์เฉพาะเจาะจง ให้หาปุ่ม "เลือก" ล่าสุดที่ไม่ disabled
          const pickButtons = allButtons.filter(isPickButton);
          if (pickButtons.length > 0) {
            pickButtons[pickButtons.length - 1].click();
            return true;
          }

          // 3. Fallback checkbox ที่ยังไม่ติ๊ก
          const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
          const uncheck = checkboxes.find(c => !c.checked);
          if (uncheck) {
            uncheck.click();
            return true;
          }

          return false;
        }, item.number).catch(() => false);

        // Fallback ผ่าน Playwright Locator หาก evaluate ไม่สำเร็จ
        if (!selectedSuccess) {
          const pickLoc = page.locator('button:visible')
            .filter({ hasText: /^เลือก$|^เลือกสลาก$|^เลือกสลากฯ$|^เลือกซื้อ$/ })
            .first();
          if (await pickLoc.isVisible().catch(() => false)) {
            await pickLoc.click().catch(() => {});
            selectedSuccess = true;
          }
        }

        if (!selectedSuccess) {
          console.warn(`[N3 ORDER] ไม่สามารถกดเลือกสลากเลข ${item.number} ได้`);
          outOfStockItems.push(item.number);
          continue;
        }
        await page.waitForTimeout(1000);

        // ปรับจำนวนใบสำหรับรายการสลากเลขนี้โดยเฉพาะ (เจาะจงกดปุ่ม + ของเลขนี้ ไม่ให้กระทบเลขอื่น)
        if (item.quantity > 1) {
          for (let q = 1; q < item.quantity; q++) {
            if (page.isClosed()) break;

            let clicked = false;

            // วิธีที่ 1: ค้นหาปุ่ม + ใน Container ที่แสดงตัวเลขของสลากรายการนี้โดยตรงผ่าน DOM Evaluate
            clicked = await page.evaluate((num) => {
              const isPlusBtn = (b: HTMLButtonElement) => {
                const t = b.innerText.trim();
                const aria = b.getAttribute('aria-label') || '';
                const title = b.getAttribute('title') || '';
                const cls = b.className || '';
                return t === '+' || t === '+1' ||
                       aria.includes('เพิ่ม') || aria.includes('plus') ||
                       title.includes('เพิ่ม') ||
                       cls.includes('plus') || cls.includes('increment') ||
                       !!b.querySelector('svg[data-icon="plus"], i[class*="plus"]');
              };

              const containers = Array.from(document.querySelectorAll('div, tr, li, section, [class*="card"], [class*="item"], [class*="row"]'));
              const matched = containers.filter(c => {
                const text = (c as HTMLElement).innerText || '';
                return text.includes(num) && Array.from(c.querySelectorAll('button')).some(isPlusBtn);
              });
              if (matched.length > 0) {
                // เลือกคอนเทนเนอร์ที่เล็กที่สุด (เฉพาะเจาะจงที่สุดของรายการนี้)
                matched.sort((a, b) => a.innerHTML.length - b.innerHTML.length);
                const plusBtn = Array.from(matched[0].querySelectorAll('button')).find(isPlusBtn);
                if (plusBtn) {
                  plusBtn.click();
                  return true;
                }
              }
              return false;
            }, item.number).catch(() => false);

            // วิธีที่ 2: ใช้ Playwright Locator กรองตามเลขสลากและปุ่ม +
            if (!clicked) {
              const specificPlus = page.locator('div, tr, li, section, [class*="card"], [class*="item"], [class*="row"]')
                .filter({ hasText: item.number })
                .filter({ has: page.locator('button:has-text("+"), button[aria-label*="เพิ่ม"], button[class*="plus"]') })
                .locator('button:has-text("+"), button[aria-label*="เพิ่ม"], button[class*="plus"]')
                .last();

              if (await specificPlus.isVisible().catch(() => false)) {
                await specificPlus.click().catch(() => {});
                clicked = true;
              }
            }

            // วิธีที่ 3: Fallback หากไม่พบคอนเทนเนอร์เฉพาะ ให้กดปุ่ม + ล่าสุดในตะกร้า
            if (!clicked) {
              const plusButtons = page.locator('button:has-text("+"), button[aria-label*="เพิ่ม"], button[class*="plus"]');
              const plusCount = await plusButtons.count().catch(() => 0);
              if (plusCount > 0) {
                await plusButtons.last().click().catch(() => {});
              }
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

      // 2. กดปุ่ม "ตรวจสอบสลากฯ" (รวมทุกรายการในตะกร้า)
      console.log('[N3 ORDER STEP 2] กำลังกดปุ่ม ตรวจสอบสลากฯ รวมทุกรายการในตะกร้า...');
      const inspectBtn = page.locator('button:has-text("ตรวจสอบสลากฯ"), button:has-text("ตรวจสอบสลาก")').first();
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
      const confirmDialogBtn = page.locator('[role="dialog"] button:has-text("ยืนยัน"), .modal button:has-text("ยืนยัน"), button:has-text("ยืนยัน")').last();
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
      const qrCardLocators = [
        page.locator('div').filter({ hasText: 'กรุณาสแกน QR' }).filter({ hasText: 'ยอดชำระทั้งหมด' }),
        page.locator('div').filter({ hasText: 'กรุณาสแกน QR' }).filter({ hasText: 'ยอดชำระ' }),
        page.locator('div').filter({ hasText: 'กรุณาสแกน QR' }).filter({ hasText: 'ธนกิจนำโชค' }),
        page.locator('[class*="card"], [class*="modal"], [class*="container"]').filter({ hasText: 'กรุณาสแกน QR' }),
        page.locator('div').filter({ hasText: 'กรุณาสแกน QR' })
      ];

      for (const locGroup of qrCardLocators) {
        const count = await locGroup.count().catch(() => 0);
        for (let i = count - 1; i >= 0; i--) {
          const el = locGroup.nth(i);
          if (await el.isVisible().catch(() => false)) {
            const box = await el.boundingBox().catch(() => null);
            if (box && box.width >= 260 && box.width <= 900 && box.height >= 300 && box.height <= 1200) {
              console.log(`[QR CAPTURE SUCCESS] ตรวจพบการ์ดสลาก N3 ขนาด ${Math.round(box.width)}x${Math.round(box.height)}px -> บันทึกภาพเรียบร้อย`);
              await el.screenshot({ path: qrFilePath });
              isCaptured = true;
              break;
            }
          }
        }
        if (isCaptured) break;
      }

      // ทางเลือกที่ 2: หากตรวจจับการ์ดไม่ติด ให้แคปเจอร์รอบตัว QR Code (canvas หรือ img) พร้อม Padding ครบชุด
      if (!isCaptured) {
        const qrEl = page.locator('canvas, img[src*="data:image"], img[alt*="QR"]').first();
        if (await qrEl.isVisible().catch(() => false)) {
          const box = await qrEl.boundingBox().catch(() => null);
          if (box && box.width >= 100 && box.height >= 100) {
            console.log(`[QR CAPTURE SUCCESS] ตรวจพบ QR Code Element -> บันทึกภาพพร้อมกรอบการ์ด`);
            const padX = 80;
            const padTop = 150;
            const padBottom = 130;
            const vp = page.viewportSize() || { width: 1440, height: 900 };
            const clipX = Math.max(0, Math.round(box.x - padX));
            const clipY = Math.max(0, Math.round(box.y - padTop));
            const clipW = Math.min(vp.width - clipX, Math.round(box.width + padX * 2));
            const clipH = Math.min(vp.height - clipY, Math.round(box.height + padTop + padBottom));
            await page.screenshot({
              path: qrFilePath,
              clip: { x: clipX, y: clipY, width: clipW, height: clipH }
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
          clip: { x: 360, y: 50, width: 720, height: 800 }
        });
        console.log(`[QR CAPTURE SUCCESS] แคปเจอร์พิกัดกึ่งกลางจอสำเร็จ: ${qrFilePath}`);
      }

      // 8. กดปุ่ม "กลับหน้าหลัก" เพื่อเตรียมความพร้อมสำหรับออเดอร์ถัดไป
      const backHomeBtn = page.locator('button:has-text("กลับหน้าหลัก")');
      if (await backHomeBtn.isVisible().catch(() => false)) {
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

      // หากเบราว์เซอร์ขัดข้องหรือหลุด ให้รีเซ็ต PersistentBrowserManager อัตโนมัติ
      if (err?.message?.includes('closed') || err?.message?.includes('crash') || (page && page.isClosed())) {
        console.warn('[N3 ORDER RECOVERY] เบราว์เซอร์ปิดตัวหรือขัดข้อง กำลังรีเซ็ต PersistentBrowserManager...');
        try {
          const { PersistentBrowserManager } = await import('./browser-context');
          await PersistentBrowserManager.close().catch(() => {});
        } catch {}
      }

      return {
        success: false,
        error: err?.message || 'เกิดข้อผิดพลาดในการสร้าง QR Code บนหน้าเว็บ'
      };
    }
  }
}
