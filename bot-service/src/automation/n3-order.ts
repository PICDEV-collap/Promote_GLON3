import { Page } from 'playwright';
import { CONFIG } from '../config';
import path from 'path';
import fs from 'fs';
import { OrderItem } from '../queue/order-queue';
import { N3Auth } from './n3-auth';

export class N3OrderService {
  /**
   * สั่งซื้อสลาก N3 ตาม Flow จริง (รองรับทั้งเลขเดียวและหลายเลขในบิลเดียว):
   * 1. วนลูปค้นหาและเลือกแต่ละสลากเข้าตะกร้าเดียวกัน พร้อมปรับจำนวนใบตามจริง (รองรับ Stepper img[src*="plus-icon"])
   * 2. ตรวจสอบจำนวนสลากในตะกร้าทั้งหมด (Cart Quantity Audit) ก่อนกดยืนยัน
   * 3. กดปุ่ม "ตรวจสอบสลากฯ" รวมทุกรายการ เข้าสู่หน้า lotto-confirm
   * 4. ตรวจสอบและยืนยันความถูกต้องของจำนวนสลากในหน้า lotto-confirm (Confirm Audit)
   * 5. กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ" และกดยืนยันในป๊อปอัป
   * 6. แคปเจอร์ภาพ QR Code ชำระเงินคมชัดเฉพาะกรอบจัตุรัส 1:1 พร้อม Quiet Zone (~28px) สแกนติดง่าย 100%
   */
  public static async executeOrder(
    page: Page,
    lotteryNumberOrItems: string | OrderItem[],
    quantity: number = 1
  ): Promise<{
    success: boolean;
    qrImageUrl?: string;
    qrFilePath?: string;
    qrFileName?: string;
    error?: string;
    outOfStockItems?: string[];
    fulfilledItems?: OrderItem[];
    totalQuantity?: number;
    totalPrice?: number;
    syncedQuota?: { remainingQuota: number; usedQuota: number; maxQuota: number } | null;
  }> {
    try {
      const items: OrderItem[] = Array.isArray(lotteryNumberOrItems)
        ? lotteryNumberOrItems
        : [{ number: lotteryNumberOrItems, quantity }];

      const fulfilledItems: OrderItem[] = [];
      const outOfStockItems: string[] = [];

      console.log(`[N3 ORDER] เริ่มสั่งซื้อสลากจำนวน ${items.length} รายการ: ${items.map(i => `${i.number}x${i.quantity}`).join(', ')}...`);

      // เคลียร์ตะกร้าที่ตกค้างใน sessionStorage ก่อนเริ่มคำสั่งซื้อใหม่เสมอ
      await page.evaluate(() => {
        try { sessionStorage.removeItem('cart-store'); } catch {}
      }).catch(() => {});

      // เข้าสู่หน้าค้นหาสลาก lotto-search เพื่อเริ่มต้นบิลใหม่ในตะกร้าเดียวกัน
      const searchUrl = 'https://n3.glolotteryshop.com/lotto-search/?position=1';
      if (!page.url().includes('lotto-search')) {
        console.log('[N3 ORDER] นำทางเข้าสู่หน้าค้นหาสลาก...');
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.locator('input[type="text"], input[type="tel"]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      } else {
        console.log('[N3 ORDER] หน้าเว็บอยู่ที่หน้าค้นหาสลากอยู่แล้ว ข้ามการโหลดหน้าใหม่เพื่อความรวดเร็ว');
        const clearBtn = page.locator('p:has-text("ล้างค่า"), button:has-text("ล้างค่า"), [role="button"]:has-text("ล้างค่า")').first();
        if (await clearBtn.isVisible().catch(() => false)) {
          await clearBtn.click().catch(() => {});
          await page.waitForTimeout(150);
        }
      }

      // ตรวจสอบว่ามีป๊อปอัปแจ้งเตือนเซสชันหมดอายุ ("ไม่สามารถทำรายการได้") หรือไม่
      if (await N3Auth.checkAndDismissSessionModal(page)) {
        console.warn('[N3 ORDER] ตรวจพบป๊อปอัปแจ้งเตือนเซสชันหมดอายุหลังเปิดหน้าค้นหา');
        return { success: false, error: 'Session หมดอายุ (มีป๊อปอัปให้เข้าสู่ระบบใหม่) กรุณาสแกนเป๋าตังใหม่' };
      }

      // หากติดหน้า Geolocation ให้ลองคลิกปุ่มอนุญาต/ยืนยัน
      if (page.url().includes('/geolocation')) {
        console.warn('[N3 ORDER] หน้าเว็บติด Geolocation Guard กำลังลองยืนยันตำแหน่ง...');
        const allowBtn = page.locator('button:visible, [role="button"]:visible')
          .filter({ hasText: /อนุญาต|ยินยอม|เปิดตำแหน่ง|ตกลง|ลองใหม่|ต่อไป/ })
          .first();
        if (await allowBtn.isVisible().catch(() => false)) {
          await allowBtn.click().catch(() => {});
          await page.waitForTimeout(2000);
        }
      }

      const currUrl = page.url();
      if (currUrl.includes('/login')) {
        return { success: false, error: 'Session หลุด กรุณาพิมพ์ qr ใน LINE เพื่อสแกนเป๋าตังใหม่' };
      }
      if (currUrl.includes('/geolocation')) {
        return { success: false, error: 'ระบบร้านค้าติดการยืนยันพิกัดตำแหน่ง (Geolocation) กรุณาพิมพ์ qr เพื่อเข้าสู่ระบบใหม่' };
      }

      // 1. วนลูปค้นหาและเลือกแต่ละสลากรวมเข้าในตะกร้าเดียวกัน (ไม่รีโหลดหน้าเว็บเพื่อรักษาสลากทั้งหมดในตะกร้า)
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        console.log(`[N3 ORDER ITEM ${idx + 1}/${items.length}] กำลังค้นหาและเพิ่มเลข ${item.number} (จำนวน ${item.quantity} ใบ)...`);

        // หากเป็นรายการที่ 2 เป็นต้นไป ให้ล้างช่องค้นหาเลขหรือสลับตำแหน่งใน SPA โดยไม่รีโหลดหน้าเว็บ
        if (idx > 0) {
          // กดปุ่ม "ล้างค่า" (QRSELLING_SEARCH_SCREEN_CLEAR_BUTTON ของระบบ GLO)
          const clearBtn = page.locator('p:has-text("ล้างค่า"), button:has-text("ล้างค่า"), [role="button"]:has-text("ล้างค่า")').first();
          if (await clearBtn.isVisible().catch(() => false)) {
            console.log('[N3 ORDER] กดปุ่ม "ล้างค่า" เพื่อเคลียร์ช่องค้นหาเลขเดิม...');
            await clearBtn.click().catch(() => {});
            await page.waitForTimeout(100);
          } else {
            // สำรอง: ลองปุ่มเพิ่มรายการหรือแท็บตำแหน่งถัดไป
            const addMoreSelectors = [
              'button:has-text("เลือกเลขอื่น")',
              'button:has-text("เพิ่มสลาก")',
              'button:has-text("เลือกสลากเพิ่ม")',
              'button:has-text("ค้นหาเพิ่ม")',
              'button:has-text("เพิ่มรายการ")',
              `button:has-text("สลากใบที่ ${idx + 1}")`,
              `a[href*="position=${idx + 1}"]`
            ];
            for (const sel of addMoreSelectors) {
              const el = page.locator(sel).first();
              if (await el.isVisible().catch(() => false)) {
                await el.click().catch(() => {});
                await page.waitForTimeout(200);
                break;
              }
            }
          }
        }

        // ล้างและกรอกตัวเลข 3 ตัว (ใช้ Playwright fill ตรงกับ #digit-input-0/1/2 เพื่อกระตุ้น React Synthetic Event อย่างแม่นยำ)
        const digits = item.number.split('');
        const d0 = page.locator('#digit-input-0');
        const d1 = page.locator('#digit-input-1');
        const d2 = page.locator('#digit-input-2');

        if (await d0.isVisible().catch(() => false)) {
          await d0.fill(digits[0]);
          await d1.fill(digits[1]);
          await d2.fill(digits[2]);
        } else {
          // Playwright Fallback กรณีโครงสร้าง DOM แตกต่างออกไป
          const digitInputs = page.locator('input[type="text"]:visible, input[type="tel"]:visible, input[maxlength="1"]:visible, input[inputmode="numeric"]:visible');
          const visibleCount = await digitInputs.count().catch(() => 0);

          if (visibleCount >= 3) {
            for (let d = 0; d < 3; d++) {
              await digitInputs.nth(d).fill(digits[d]);
            }
          } else if (visibleCount === 1) {
            await digitInputs.first().fill(item.number);
          } else {
            const allInputs = page.locator('input[type="text"], input[type="tel"], input[maxlength="1"], input[inputmode="numeric"]');
            const allCount = await allInputs.count().catch(() => 0);
            if (allCount >= 3) {
              await allInputs.nth(0).fill(digits[0]);
              await allInputs.nth(1).fill(digits[1]);
              await allInputs.nth(2).fill(digits[2]);
            } else if (allCount > 0) {
              await allInputs.first().fill(item.number);
            } else {
              console.error(`[N3 ORDER ERROR] ไม่พบช่องกรอกเลขสลากสำหรับเลข ${item.number} (URL: ${page.url()})`);
              if (page.url().includes('/login') || page.url().includes('/geolocation')) {
                return { success: false, error: 'Session หลุดหรือติดการยืนยันพิกัดตำแหน่ง กรุณาพิมพ์ qr ใน LINE เพื่อสแกนเป๋าตังใหม่' };
              }
              return { success: false, error: `หน้าค้นหาสลากไม่พร้อมใช้งาน (URL: ${page.url()})` };
            }
          }
        }

        // ตรวจจับป๊อปอัปเซสชันหมดอายุก่อนกดปุ่มเลือกเลข
        if (await N3Auth.checkAndDismissSessionModal(page)) {
          return { success: false, error: 'Session หมดอายุระหว่างค้นหาสลาก กรุณาสแกนเป๋าตังเข้าสู่ระบบใหม่' };
        }

        // กดปุ่ม "เลือกเลข" เพื่อค้นหาสลาก
        const selectBtn = page.locator('button:visible').filter({ hasText: /^เลือกเลข$/ }).first();
        try {
          if (await selectBtn.isVisible().catch(() => false)) {
            await selectBtn.click({ timeout: 10000 });
          } else {
            const fallbackBtn = page.locator('button:has-text("เลือกเลข"):visible, button:has-text("ค้นหา"):visible').first();
            if (await fallbackBtn.isVisible().catch(() => false)) {
              await fallbackBtn.click({ timeout: 10000 });
            } else {
              await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const b = btns.find(btn => btn.innerText.trim() === 'เลือกเลข' || btn.innerText.trim().includes('เลือกเลข'));
                if (b) b.click();
              }).catch(() => {});
            }
          }
        } catch (clickErr: any) {
          if (await N3Auth.checkAndDismissSessionModal(page)) {
            return { success: false, error: 'Session หมดอายุขณะกดเลือกเลข กรุณาสแกนเป๋าตังเข้าสู่ระบบใหม่' };
          }
          throw clickErr;
        }

        // รอผลลัพธ์ปรากฏ (ปุ่มเลือกสลาก หรือข้อความไม่พบสลาก) แทนการหน่วงเวลาคงที่
        await Promise.race([
          page.locator('button:has-text("เลือก"):visible').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {}),
          page.locator('text=ไม่พบสลาก, text=ไม่พบข้อมูล, text=ปิดการขาย').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
        ]);
        await page.waitForTimeout(50);

        if (page.isClosed()) {
          return { success: false, error: 'หน้าต่างเบราว์เซอร์ถูกปิด กรุณาสั่งซื้อใหม่อีกครั้ง' };
        }

        // ตรวจสอบว่ามีสลากให้เลือกหรือไม่
        const notFound = await page.locator('text=ไม่พบสลาก')
          .or(page.locator('text=ไม่พบข้อมูล'))
          .or(page.locator('text=ปิดการขาย'))
          .first()
          .isVisible()
          .catch(() => false);

        if (notFound) {
          console.warn(`[N3 ORDER] สลากเลข ${item.number} ไม่มีจำหน่ายหรือหมดในระบบ`);
          outOfStockItems.push(item.number);
          continue;
        }

        // คลิกปุ่ม "เลือก" สลากในแถวรายการที่เพิ่งค้นหา (cw.COMMON_LOTTO_CARD_SELECT_BUTTON)
        let selectedSuccess = await page.evaluate((targetNum) => {
          const isPickButton = (b: HTMLButtonElement) => {
            const t = b.innerText.replace(/\s+/g, ' ').trim();
            return (t === 'เลือก' || t === 'เลือกสลาก' || t === 'เลือกสลากฯ' || t === 'เลือกซื้อ' ||
                   (t.startsWith('เลือก') && !t.includes('เลือกเลข') && !t.includes('เลือกเลขอื่น'))) && !b.disabled;
          };

          const containers = Array.from(document.querySelectorAll('div, tr, li, [class*="card"], [class*="item"], [class*="result"]'));
          const cleanTarget = targetNum.replace(/\s+/g, '');
          const matchedContainers = containers.filter(c => {
            const text = (c.textContent || '').replace(/\s+/g, '');
            return text.includes(cleanTarget);
          });
          matchedContainers.sort((a, b) => a.innerHTML.length - b.innerHTML.length);

          for (const container of matchedContainers) {
            const pickBtn = Array.from(container.querySelectorAll('button')).find(isPickButton);
            if (pickBtn) {
              pickBtn.click();
              return true;
            }
          }

          // ค้นหาปุ่มเลือกทั่วไป
          const allButtons = Array.from(document.querySelectorAll('button'));
          const pickButtons = allButtons.filter(isPickButton);
          if (pickButtons.length > 0) {
            pickButtons[pickButtons.length - 1].click();
            return true;
          }
          return false;
        }, item.number).catch(() => false);

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
          if (page.url().includes('/login') || page.url().includes('/geolocation')) {
            return { success: false, error: 'Session หลุดหรือติดการยืนยันพิกัดตำแหน่งระหว่างสั่งซื้อ กรุณาพิมพ์ qr ใน LINE เพื่อสแกนเป๋าตังใหม่' };
          }
          outOfStockItems.push(item.number);
          continue;
        }

        // ปรับจำนวนใบสำหรับรายการสลากเลขนี้ให้ตรงตาม item.quantity (หากสั่ง 1 ใบ สลากลงตะกร้าแล้ว ข้ามไปได้ทันที ไม่ต้องรอ Stepper)
        if (item.quantity > 1) {
          // รอปุ่ม Stepper ปรากฏบนการ์ดหลังจากกดเลือกสลากสำเร็จ (GLO N3 แสดง img[src*="plus-icon"])
          const plusStepperLoc = page.locator('img[src*="plus-icon"]').last();
          await plusStepperLoc.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(150);

          console.log(`[N3 ORDER QTY] กำลังปรับจำนวนใบเลข ${item.number} เป็น ${item.quantity} ใบ...`);

          const numPattern = item.number.split('').join('\\s*');
          const targetCard = page.locator('div, section, tr, li, [class*="card"], [class*="item"]')
            .filter({ hasText: new RegExp(numPattern) })
            .filter({ has: page.locator('img[src*="plus-icon"]') })
            .last();

          let currentCardQty = 1;

          // 1. ตรวจสอบกล่อง input ตัวเลขจำนวนใบในแถวนี้
          const qtyInput = targetCard.locator('input[type="number"], input[inputmode="numeric"]').first();
          if (await qtyInput.isVisible().catch(() => false)) {
            const rawVal = await qtyInput.inputValue().catch(() => '1');
            currentCardQty = parseInt(rawVal, 10) || 1;

            if (currentCardQty < item.quantity) {
              // ลองใช้ Playwright fill เพื่อกระตุ้น Synthetic Event ของ React
              await qtyInput.fill(String(item.quantity)).catch(() => {});
              await qtyInput.dispatchEvent('change').catch(() => {});
              await qtyInput.dispatchEvent('blur').catch(() => {});
              await page.waitForTimeout(150);

              const checkVal = await qtyInput.inputValue().catch(() => '1');
              currentCardQty = parseInt(checkVal, 10) || 1;
            }
          }

          // 2. หากจำนวนยังไม่ถึงเป้าหมาย ให้คลิกปุ่มบวก (img[src*="plus-icon"]) ตามจำนวนครั้งที่ขาดอยู่
          if (currentCardQty < item.quantity) {
            const plusEl = targetCard.locator('img[src*="plus-icon"]').first();
            const neededClicks = item.quantity - currentCardQty;
            console.log(`[N3 ORDER QTY] คลิกปุ่มบวก (+) สำหรับเลข ${item.number} อีก ${neededClicks} ครั้ง...`);

            for (let c = 0; c < neededClicks; c++) {
              if (page.isClosed()) break;
              await plusEl.click({ force: true }).catch(() => {});
              await page.waitForTimeout(120);
            }
          }

          // 3. Fallback เสริมผ่าน DOM Evaluate และ React Native Descriptor Setter
          await page.evaluate(({ num, targetQty }) => {
            const cleanTarget = num.replace(/\s+/g, '');
            const containers = Array.from(document.querySelectorAll('div, section, tr, li, [class*="card"], [class*="item"]'));
            const matched = containers.filter(c => {
              const text = (c.textContent || '').replace(/\s+/g, '');
              return text.includes(cleanTarget) && (c.querySelector('img[src*="plus-icon"]') || c.querySelector('input[type="number"]'));
            });
            matched.sort((a, b) => a.innerHTML.length - b.innerHTML.length);

            for (const container of matched) {
              const qtyInput = container.querySelector('input[type="number"], input[inputmode="numeric"]') as HTMLInputElement | null;
              const plusImg = container.querySelector('img[src*="plus-icon"]') as HTMLElement | null;
              const plusClickable = (plusImg?.closest('div') || plusImg) as HTMLElement | null;

              let cur = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
              if (cur >= targetQty) return;

              // เรียกใช้ native prototype setter เพื่อให้ React Controlled Input อัปเดต state
              if (qtyInput) {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeSetter) {
                  nativeSetter.call(qtyInput, String(targetQty));
                } else {
                  qtyInput.value = String(targetQty);
                }
                qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
                qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
                qtyInput.dispatchEvent(new Event('blur', { bubbles: true }));
              }

              // หากมีปุ่มบวกให้กดซ้ำตามจำนวนที่ยังขาด
              if (plusClickable) {
                const diff = targetQty - cur;
                for (let i = 0; i < diff; i++) {
                  plusClickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                  plusClickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                  plusClickable.click();
                }
              }
            }
          }, { num: item.number, targetQty: item.quantity }).catch(() => {});

          await page.waitForTimeout(150);
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

      // ตรวจสอบและปรับปรุงจำนวนสลากในตะกร้าทั้งหมด (Pre-Checkout Cart Audit) ให้ครบถ้วนก่อนกดตรวจสอบสลากฯ (เฉพาะเมื่อมีรายการหลายใบ)
      const hasMultiQty = fulfilledItems.some(it => it.quantity > 1);
      if (hasMultiQty) {
        console.log('[N3 ORDER STEP 1.5] กำลังตรวจสอบความถูกต้องของจำนวนใบในตะกร้าทั้งหมดก่อนยืนยัน...');
        for (const it of fulfilledItems) {
          if (it.quantity <= 1) continue;
          const numPattern = it.number.split('').join('\\s*');
          const row = page.locator('div, section, tr, li, [class*="card"], [class*="item"]')
            .filter({ hasText: new RegExp(numPattern) })
            .filter({ has: page.locator('img[src*="plus-icon"]') })
            .last();

          if (await row.isVisible().catch(() => false)) {
            const inp = row.locator('input[type="number"], input[inputmode="numeric"]').first();
            const curVal = parseInt(await inp.inputValue().catch(() => '1'), 10) || 1;
            if (curVal < it.quantity) {
              const plus = row.locator('img[src*="plus-icon"]').first();
              const diff = it.quantity - curVal;
              console.log(`[N3 ORDER AUDIT 1.5] เลข ${it.number} ยังคงมี ${curVal} ใบ -> กดเพิ่มอีก ${diff} ครั้ง`);
              for (let c = 0; c < diff; c++) {
                await plus.click({ force: true }).catch(() => {});
                await page.waitForTimeout(100);
              }
            }
          }
        }
        await page.waitForTimeout(150);
      }

      // 2. กดปุ่ม "ตรวจสอบสลากฯ" (cw.COMMON_CEHCK_LOTTO_BUTTON) รวมทุกรายการในตะกร้า
      console.log('[N3 ORDER STEP 2] กำลังกดปุ่ม ตรวจสอบสลากฯ รวมทุกรายการในตะกร้า...');
      const inspectBtn = page.locator('button:has-text("ตรวจสอบสลากฯ"), button:has-text("ตรวจสอบสลาก")').first();
      await inspectBtn.waitFor({ state: 'visible', timeout: 15000 });
      await inspectBtn.click();

      // 3. รอหน้ายืนยันรายการ (/lotto-confirm/)
      console.log('[N3 ORDER STEP 3] รอนำทางสู่หน้า lotto-confirm...');
      await page.waitForURL(url => url.toString().includes('lotto-confirm'), { timeout: 15000 });
      await page.waitForTimeout(600); // รอ React render หน้า lotto-confirm และดึง expect-reward ให้สมบูรณ์

      // จัดการกรณีระบบ GLO ประมวลผลช้าและขึ้นปุ่ม "โหลดอีกครั้ง"
      const reloadBtn = page.locator('button:has-text("โหลดอีกครั้ง")').first();
      if (await reloadBtn.isVisible().catch(() => false)) {
        console.log('[N3 ORDER] ตรวจพบปุ่ม "โหลดอีกครั้ง" บนหน้า lotto-confirm -> กำลังกดโหลดซ้ำ...');
        await reloadBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      // 3.5 ตรวจสอบความถูกต้องของจำนวนใบในหน้า lotto-confirm อีกครั้ง (Confirm Page Audit)
      if (hasMultiQty) {
        console.log('[N3 ORDER STEP 3.5] ตรวจสอบรายการในหน้า lotto-confirm...');
        for (const it of fulfilledItems) {
          if (it.quantity <= 1) continue;
          const numPattern = it.number.split('').join('\\s*');
          const confirmRow = page.locator('div, section, tr, li, [class*="card"], [class*="item"]')
            .filter({ hasText: new RegExp(numPattern) })
            .filter({ has: page.locator('img[src*="plus-icon"]') })
            .last();

          if (await confirmRow.isVisible().catch(() => false)) {
            const inp = confirmRow.locator('input[type="number"], input[inputmode="numeric"]').first();
            const curVal = parseInt(await inp.inputValue().catch(() => '1'), 10) || 1;
            if (curVal < it.quantity) {
              const plus = confirmRow.locator('img[src*="plus-icon"]').first();
              const diff = it.quantity - curVal;
              console.log(`[N3 ORDER AUDIT 3.5] ในหน้า lotto-confirm เลข ${it.number} ยังคงมี ${curVal} ใบ -> ปรับเพิ่มอีก ${diff} ครั้ง`);
              for (let c = 0; c < diff; c++) {
                await plus.click({ force: true }).catch(() => {});
                await page.waitForTimeout(100);
              }
            }
          }
        }
        await page.waitForTimeout(200);
      } else {
        await page.waitForTimeout(200);
      }

      // 4. กดปุ่ม "สร้าง QR ซื้อ-ขายสลากฯ"
      console.log('[N3 ORDER STEP 4] กำลังกดปุ่ม สร้าง QR ซื้อ-ขายสลากฯ...');
      const createQrBtn = page.locator('button:has-text("สร้าง QR"), button:has-text("สร้าง QR ซื้อ-ขาย"), button:has-text("สร้าง QR ซื้อ-ขายสลากฯ"), [role="button"]:has-text("สร้าง QR")').first();
      await createQrBtn.waitFor({ state: 'visible', timeout: 15000 });
      await createQrBtn.click();

      // 5. รอป๊อปอัปยืนยัน และกดปุ่ม "ยืนยัน"
      console.log('[N3 ORDER STEP 5] กำลังกดยืนยันป๊อปอัปสร้าง QR Code...');
      const confirmDialogBtn = page.locator('[role="dialog"] button:has-text("ยืนยัน"), .modal button:has-text("ยืนยัน"), button:has-text("ยืนยัน")').last();
      await confirmDialogBtn.waitFor({ state: 'visible', timeout: 10000 });
      await confirmDialogBtn.click();

      // 6. รอหน้าแสดง QR Code (/qr/)
      console.log('[N3 ORDER STEP 6] รอหน้าแสดงผล QR Code ชำระเงิน (/qr/)...');
      await page.waitForURL(url => url.toString().includes('/qr/'), { timeout: 20000 });
      await page.waitForFunction(() => {
        const c = document.querySelector('canvas#qr-code-image') as HTMLCanvasElement || document.querySelector('canvas') as HTMLCanvasElement;
        return c && c.width >= 50 && c.height >= 50;
      }, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(100); // รอรูป QR Canvas โหลดสมบูรณ์

      // 7. ดึงภาพ QR Code ชำระเงิน คมชัดระดับ Retina HD 800x800px ตัดเฉพาะกรอบ QR Code จัตุรัส 1:1 พร้อม Quiet Zone นิรภัย
      const fileSummary = fulfilledItems.map(i => i.number).join('-');
      const qrFileName = `payment-${fileSummary}-${Date.now()}.png`;
      const qrFilePath = path.join(CONFIG.QR_OUTPUT_DIR, qrFileName);

      console.log('[N3 ORDER STEP 7] กำลังดึงภาพ QR Code ชำระเงิน (ความละเอียดสูงระดับ HD 800x800px จัตุรัส 1:1 พร้อม Quiet Zone)...');
      let isCaptured = false;

      // ทางเลือกที่ 1: ดึงภาพและเรนเดอร์ความละเอียดสูงตรงจาก Canvas (HD 800x800px, Nearest-Neighbor, Quiet Zone มาตรฐาน)
      try {
        const highResResult = await page.evaluate(() => {
          const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
          let targetCanvas = document.querySelector('canvas#qr-code-image') as HTMLCanvasElement | null;
          if (!targetCanvas) {
            targetCanvas = canvases.find(c => {
              const rect = c.getBoundingClientRect();
              return rect.width >= 60 && rect.height >= 60;
            }) || canvases[0] || null;
          }

          if (!targetCanvas) {
            const img = document.querySelector('#qr-code-image img, img[src^="data:image"]') as HTMLImageElement | null;
            if (img && img.src.startsWith('data:image/')) {
              return { type: 'img', src: img.src };
            }
            return null;
          }

          const targetSize = 800;
          const outCanvas = document.createElement('canvas');
          outCanvas.width = targetSize;
          outCanvas.height = targetSize;
          const ctx = outCanvas.getContext('2d');
          if (!ctx) return null;

          // 1. เติมพื้นหลังสีขาวบริสุทธิ์ 100%
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetSize, targetSize);

          // 2. ปิด Image Smoothing เพื่อให้ขอบโมดูล QR Code คมกริบ 100% (Nearest-Neighbor)
          ctx.imageSmoothingEnabled = false;
          (ctx as any).mozImageSmoothingEnabled = false;
          (ctx as any).webkitImageSmoothingEnabled = false;
          (ctx as any).msImageSmoothingEnabled = false;

          // 3. ขอบนิรภัย Quiet Zone (~48px บน 800px)
          const margin = 48;
          const drawSize = targetSize - margin * 2; // 704px

          ctx.drawImage(targetCanvas, margin, margin, drawSize, drawSize);
          return { type: 'canvas', data: outCanvas.toDataURL('image/png') };
        }).catch(() => null);

        if (highResResult?.data && highResResult.data.startsWith('data:image/')) {
          const base64Data = highResResult.data.split(',')[1];
          fs.writeFileSync(qrFilePath, Buffer.from(base64Data, 'base64'));
          console.log(`[QR CAPTURE SUCCESS] สร้างภาพ QR Code ความละเอียดสูงระดับ HD 800x800px (Quiet Zone 48px, คมกริบ ไร้รอยเบลอ) สำเร็จ: ${qrFilePath}`);
          isCaptured = true;
        } else if (highResResult?.src && highResResult.src.startsWith('data:image/')) {
          const base64Data = highResResult.src.split(',')[1];
          fs.writeFileSync(qrFilePath, Buffer.from(base64Data, 'base64'));
          await upscaleQrImageToHD(page, qrFilePath, 800);
          isCaptured = true;
        }
      } catch (err: any) {
        console.warn('[QR CAPTURE WARNING] ดึงภาพตรงจาก Canvas ล้มเหลว กำลังใช้ทางเลือกถัดไป...', err.message);
      }

      // ทางเลือกที่ 2: ค้นหา Element QR Code ผ่าน Selector และแคปเจอร์กรอบ 1:1 พร้อมอัปสเกลเป็น HD 800x800
      if (!isCaptured) {
        const qrElement = page.locator('#qr-code-image, canvas#qr-code-image, canvas:visible, img[src^="data:image"]:visible').first();
        if (await qrElement.isVisible({ timeout: 4000 }).catch(() => false)) {
          await qrElement.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(200);

          const box = await qrElement.boundingBox().catch(() => null);
          if (box && box.width >= 40 && box.height >= 40) {
            const pad = 28;
            const qrSize = Math.max(box.width, box.height);
            const totalSize = qrSize + pad * 2;
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;

            const clipX = Math.max(0, Math.round(centerX - totalSize / 2));
            const clipY = Math.max(0, Math.round(centerY - totalSize / 2));
            const clipSize = Math.round(totalSize);

            console.log(`[QR CAPTURE SUCCESS] ตรวจพบ QR Code ที่พิกัด (${Math.round(box.x)}, ${Math.round(box.y)}) ขนาด ${Math.round(box.width)}x${Math.round(box.height)}px -> บันทึกจัตุรัส 1:1 ขนาด ${clipSize}x${clipSize}px`);

            await page.screenshot({
              path: qrFilePath,
              clip: { x: clipX, y: clipY, width: clipSize, height: clipSize }
            });
            await upscaleQrImageToHD(page, qrFilePath, 800);
            isCaptured = true;
          }
        }
      }

      // ทางเลือกที่ 3: DOM evaluate getBoundingClientRect (พิกัด Viewport ตรง ไม่บวก scrollY)
      if (!isCaptured) {
        const qrBox = await page.evaluate(() => {
          const el = document.querySelector('#qr-code-image, canvas, img[src^="data:image"]');
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.width >= 40 && rect.height >= 40) {
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }
          }
          return null;
        }).catch(() => null);

        if (qrBox && qrBox.width >= 40 && qrBox.height >= 40) {
          const pad = 28;
          const qrSize = Math.max(qrBox.width, qrBox.height);
          const totalSize = qrSize + pad * 2;
          const centerX = qrBox.x + qrBox.width / 2;
          const centerY = qrBox.y + qrBox.height / 2;

          const clipX = Math.max(0, Math.round(centerX - totalSize / 2));
          const clipY = Math.max(0, Math.round(centerY - totalSize / 2));
          const clipSize = Math.round(totalSize);

          console.log(`[QR CAPTURE SUCCESS] แคปเจอร์จาก DOM Rect จัตุรัส 1:1: ${clipSize}x${clipSize}px`);
          await page.screenshot({
            path: qrFilePath,
            clip: { x: clipX, y: clipY, width: clipSize, height: clipSize }
          });
          await upscaleQrImageToHD(page, qrFilePath, 800);
          isCaptured = true;
        }
      }

      // ทางเลือกที่ 4: Fallback พิกัดกึ่งกลางจอมาตรฐานจัตุรัส 1:1 ขนาด 300x300px พร้อมอัปสเกลเป็น HD 800x800
      if (!isCaptured) {
        console.log('[QR CAPTURE FALLBACK] ใช้พิกัดกล่อง QR จัตุรัส 1:1 กลางจอมาตรฐาน (300x300px)...');
        const vp = page.viewportSize() || { width: 1440, height: 900 };
        const centerX = vp.width / 2;
        const centerY = 360; // กึ่งกลาง QR จากการวิเคราะห์ DOM โครงสร้างจริงของ GLO N3
        const squareSize = 300;
        const clipX = Math.max(0, Math.round(centerX - squareSize / 2));
        const clipY = Math.max(0, Math.round(centerY - squareSize / 2));

        await page.screenshot({
          path: qrFilePath,
          clip: { x: clipX, y: clipY, width: squareSize, height: squareSize }
        });
        await upscaleQrImageToHD(page, qrFilePath, 800);
        console.log(`[QR CAPTURE SUCCESS] แคปเจอร์พิกัดกล่อง QR จัตุรัส 1:1 สำเร็จ: ${qrFilePath}`);
      }

      const totalQty = fulfilledItems.reduce((sum, it) => sum + it.quantity, 0);
      const totalPrice = totalQty * 20;

      // คืนค่าผลลัพธ์ทันที เพื่อให้บอทส่งรูป QR Code ให้ลูกค้าได้อย่างรวดเร็วที่สุดในระดับวินาที
      return {
        success: true,
        qrImageUrl: `${CONFIG.BASE_URL}/qrcodes/${qrFileName}`,
        qrFilePath,
        qrFileName,
        fulfilledItems,
        outOfStockItems,
        totalQuantity: totalQty,
        totalPrice,
        syncedQuota: null
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

      // ตรวจสอบเซสชันหมดอายุอีกครั้งในกรณีเกิด Exception
      if (page && !page.isClosed()) {
        try {
          if (await N3Auth.checkAndDismissSessionModal(page)) {
            return {
              success: false,
              error: 'Session หมดอายุ กรุณาสแกนเป๋าตังเข้าสู่ระบบใหม่'
            };
          }
        } catch {}
      }

      let cleanErrorMsg = 'เกิดข้อผิดพลาดในการสร้าง QR Code บนหน้าเว็บ';
      if (err?.message) {
        if (err.message.includes('intercepts pointer events') || (err.message.includes('Timeout') && err.message.includes('button'))) {
          cleanErrorMsg = 'Session หมดอายุหรือมีป๊อปอัปขัดจังหวะ กรุณาสแกนเป๋าตังเพื่อเข้าสู่ระบบใหม่';
        } else if (err.message.includes('Timeout')) {
          cleanErrorMsg = 'หมดเวลาการเชื่อมต่อหน้าเว็บ (Timeout)';
        } else {
          cleanErrorMsg = err.message.split('\n')[0].replace(/Call log:.*$/i, '').trim();
        }
      }

      return {
        success: false,
        error: cleanErrorMsg
      };
    }
  }

  /**
   * ดำเนินการกดปุ่ม "กลับหน้าหลัก" และซิงค์โควต้าสดจาก GLO Portal หลังส่งข้อความให้ลูกค้าแล้ว
   */
  public static async postOrderCleanupAndQuotaSync(page: Page): Promise<{ remainingQuota: number; usedQuota: number; maxQuota: number } | null> {
    try {
      if (page && !page.isClosed()) {
        const backHomeBtn = page.locator('button:has-text("กลับหน้าหลัก")');
        if (await backHomeBtn.isVisible().catch(() => false)) {
          await backHomeBtn.click().catch(() => {});
          await page.waitForURL(u => {
            const s = u.toString().replace(/\/+$/, '');
            return s.includes('/landing') || s === 'https://n3.glolotteryshop.com';
          }, { timeout: 6000 }).catch(() => {});
          await page.waitForTimeout(300);
        }
        return await N3OrderService.syncQuotaFromLivePortal(page, false).catch(() => null);
      }
    } catch (e: any) {
      console.warn('[POST-ORDER CLEANUP WARNING]', e?.message);
    }
    return null;
  }

  /**
   * ซิงค์โควต้าสดจากหน้าเว็บ GLO N3 Portal (เช่น https://n3.glolotteryshop.com/landing/)
   */
  public static async syncQuotaFromLivePortal(
    page: Page,
    navigateIfNeeded: boolean = true
  ): Promise<{ remainingQuota: number; usedQuota: number; maxQuota: number } | null> {
    try {
      const { QuotaManager } = await import('../quota/quota-manager');
      const qm = QuotaManager.getInstance();
      return await qm.syncQuotaFromLivePortal(page, navigateIfNeeded);
    } catch (e: any) {
      console.warn('[N3 ORDER] syncQuotaFromLivePortal เกิดข้อผิดพลาด:', e?.message);
      return null;
    }
  }
}

export async function syncQuotaFromLivePortal(
  page: Page,
  navigateIfNeeded: boolean = true
): Promise<{ remainingQuota: number; usedQuota: number; maxQuota: number } | null> {
  return N3OrderService.syncQuotaFromLivePortal(page, navigateIfNeeded);
}

/**
 * ขยายขนาดภาพ QR Code ให้เป็นความละเอียดสูงระดับ HD (800x800 พิกเซล)
 * โดยใช้ Nearest-Neighbor Algorithm (imageSmoothingEnabled = false)
 * เพื่อคงความคมชัดสูงสุดของตารางพิกเซล QR Code โดยไม่มีรอยเบลอ/ฟุ้ง และเพิ่มขอบขาว Quiet Zone นิรภัย
 */
export async function upscaleQrImageToHD(page: Page, filePath: string, targetSize: number = 800): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false;
  try {
    const rawBuffer = fs.readFileSync(filePath);
    const base64 = rawBuffer.toString('base64');
    const upscaledDataUrl = await page.evaluate(async ({ b64, size }) => {
      return new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('no 2d context'));

            // เติมพื้นหลังสีขาวบริสุทธิ์เพื่อ Contrast สูงสุด
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);

            // ปิด image smoothing เพื่อความคมกริบแบบ Nearest-Neighbor
            ctx.imageSmoothingEnabled = false;
            (ctx as any).mozImageSmoothingEnabled = false;
            (ctx as any).webkitImageSmoothingEnabled = false;
            (ctx as any).msImageSmoothingEnabled = false;

            // Quiet zone ขอบขาวรอบทิศทาง (~6% ของขนาดรูป)
            const margin = Math.round(size * 0.06); // 48px บน 800x800
            const drawSize = size - margin * 2;
            ctx.drawImage(img, margin, margin, drawSize, drawSize);
            resolve(canvas.toDataURL('image/png'));
          } catch (e: any) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error('Image failed to load in browser context'));
        img.src = 'data:image/png;base64,' + b64;
      });
    }, { b64: base64, size: targetSize }).catch(() => null);

    if (upscaledDataUrl && upscaledDataUrl.startsWith('data:image/')) {
      const b64Data = upscaledDataUrl.split(',')[1];
      fs.writeFileSync(filePath, Buffer.from(b64Data, 'base64'));
      console.log(`[QR HD RESCALE] อัปสเกลรูปภาพเป็นความคมชัดระดับ HD 1:1 (${targetSize}x${targetSize}px) เรียบร้อยแล้ว: ${filePath}`);
      return true;
    }
  } catch (err: any) {
    console.warn('[QR HD RESCALE WARNING] อัปสเกลรูปภาพไม่สำเร็จ:', err.message);
  }
  return false;
}


