import { Page } from 'playwright';
import { ExtractedQuota, QuotaManager } from './quota-manager';

// Share concurrent requests, but always fetch a fresh landing page. Never navigate
// the order/QR tab or launch a separate browser/login session.
const pending = new WeakMap<QuotaManager, Promise<ExtractedQuota | null>>();

export function readLiveQuota(manager: QuotaManager, orderPage: Page): Promise<ExtractedQuota | null> {
  const existing = pending.get(manager);
  if (existing) return existing;
  const task = (async () => {
    let reader: Page | undefined;
    try {
      if (orderPage.isClosed() || orderPage.url().includes('/login')) return null;
      // Portal authentication is tab-scoped. Copy only login state, never its cart.
      const auth = await orderPage.evaluate(() => Object.fromEntries(
        ['accessToken', 'user_storage'].map(key => [key, sessionStorage.getItem(key)])
      ));
      reader = await orderPage.context().newPage();
      await reader.addInitScript(values => {
        if (location.origin !== 'https://n3.glolotteryshop.com') return;
        for (const [key, value] of Object.entries(values)) {
          if (value !== null) sessionStorage.setItem(key, value);
        }
      }, auth);
      await reader.goto('https://n3.glolotteryshop.com/landing/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await reader.waitForFunction(() => {
        const text = document.body?.innerText || '';
        return /คุณขายสลาก|ยอดขายร้านค้า|ยอดขาย\s*[:：]?\s*[0-9,]+\s*\//.test(text)
          || /เข้าสู่ระบบ|ไม่สามารถทำรายการได้/.test(text);
      }, undefined, { timeout: 10000 });
      const text = await reader.locator('body').innerText();
      if (reader.url().includes('/login') || /ไม่สามารถทำรายการได้/.test(text)) return null;
      return await manager.syncQuotaFromLivePortal(reader, false);
    } catch (error: any) {
      console.warn('[QUOTA LIVE READER] อ่านยอดสดไม่สำเร็จ เก็บยอดล่าสุดไว้:', error?.message);
      return null;
    } finally {
      if (reader) await reader.close().catch(() => {});
    }
  })();
  pending.set(manager, task);
  void task.finally(() => pending.delete(manager));
  return task;
}
