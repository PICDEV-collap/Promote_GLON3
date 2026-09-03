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

    if (!this.context) {
      console.log('[BROWSER] กำลังเปิด Chrome Persistent Context...');
      try {
        // ใช้ Google Chrome จริงในเครื่อง
        this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
          channel: 'chrome',
          headless,
          viewport: { width: 1440, height: 900 },
          args: ['--disable-blink-features=AutomationControlled']
        });
      } catch {
        // Fallback: ใช้ Chromium ของ Playwright
        this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
          headless,
          viewport: { width: 1440, height: 900 }
        });
      }
      
      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    }

    return { context: this.context, page: this.page! };
  }

  public static async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }
}
