import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';

export const USER_DATA_DIR = path.join(__dirname, '../../data/browser_profile');

export class PersistentBrowserManager {
  private static context: BrowserContext | null = null;
  private static page: Page | null = null;

  public static async getPage(headless: boolean = false): Promise<{ context: BrowserContext; page: Page }> {
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    // 1. ตรวจสอบว่า context และ page เดิมยังใช้งานได้จริงหรือไม่
    if (this.context) {
      try {
        const pages = this.context.pages();
        const activePage = pages.find(p => !p.isClosed());
        if (activePage) {
          this.page = activePage;
          return { context: this.context, page: this.page };
        } else {
          // ถ้าไม่มีหน้า active อยู่ ให้ลองสร้าง page ใหม่ใน context เดิม
          this.page = await this.context.newPage();
          return { context: this.context, page: this.page };
        }
      } catch (e) {
        console.warn('[BROWSER] Browser context เดิมปิดตัวหรือใช้งานไม่ได้แล้ว กำลังรีเซ็ต...');
        await this.close().catch(() => {});
      }
    }

    console.log('[BROWSER] กำลังเปิด Chrome Persistent Context...');
    const browserArgs = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ];

    try {
      // ใช้ Google Chrome จริงในเครื่อง
      this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        channel: 'chrome',
        headless,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        args: browserArgs
      });
    } catch {
      // Fallback: ใช้ Chromium ของ Playwright
      this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        args: browserArgs
      });
    }

    // ดักฟัง event เมื่อ context หรือ browser ปิดตัว
    this.context.on('close', () => {
      console.log('[BROWSER EVENT] Browser Context ปิดตัวลง');
      PersistentBrowserManager.context = null;
      PersistentBrowserManager.page = null;
    });
    
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    return { context: this.context, page: this.page! };
  }

  public static async close(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close().catch(() => {});
      } catch {}
      this.context = null;
      this.page = null;
    }
  }
}
