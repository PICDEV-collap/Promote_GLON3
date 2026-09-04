import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config';

export const USER_DATA_DIR = path.join(__dirname, '../../data/browser_profile');

export class PersistentBrowserManager {
  private static context: BrowserContext | null = null;
  private static page: Page | null = null;
  private static currentHeadless: boolean | null = null;

  public static async getPage(headless: boolean = CONFIG.HEADLESS): Promise<{ context: BrowserContext; page: Page }> {
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    // 1. หากมี Context เปิดอยู่แต่ต้องการสลับโหมด Headless ให้ปิดแล้วเปิดใหม่ด้วยโหมดที่ต้องการ
    if (this.context && this.currentHeadless !== null && this.currentHeadless !== headless) {
      console.log(`[BROWSER] สลับโหมดเบราว์เซอร์จาก headless=${this.currentHeadless} เป็น headless=${headless}...`);
      await this.close().catch(() => {});
    }

    // 2. ตรวจสอบว่า context และ page เดิมยังใช้งานได้จริงหรือไม่
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
          this.attachPageListeners(this.page);
          return { context: this.context, page: this.page };
        }
      } catch (e) {
        console.warn('[BROWSER] Browser context เดิมปิดตัวหรือใช้งานไม่ได้แล้ว กำลังรีเซ็ต...');
        await this.close().catch(() => {});
      }
    }

    // ทำความสะอาด orphaned lockfile หากไม่มี browser process ใช้งานอยู่ ป้องกัน Chrome แฮงก์
    const lockfilePath = path.join(USER_DATA_DIR, 'lockfile');
    if (fs.existsSync(lockfilePath)) {
      try {
        fs.unlinkSync(lockfilePath);
        console.log('[BROWSER] ทำความสะอาด orphaned lockfile สำเร็จ');
      } catch {
        // หากไฟล์กำลังถูกใช้งานโดย Chrome Process อื่น ไม่ต้องทำอะไร
      }
    }

    console.log(`[BROWSER] กำลังเปิด Chrome Persistent Context (headless: ${headless})...`);
    const browserArgs = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--window-size=1440,900',
      '--hide-scrollbars',
      '--mute-audio'
    ];

    const standardUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

    try {
      // ใช้ Google Chrome จริงในเครื่อง
      this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        channel: 'chrome',
        headless,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        args: browserArgs,
        userAgent: standardUserAgent,
        timeout: 25000
      });
    } catch {
      // Fallback: ใช้ Chromium ของ Playwright
      this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        args: browserArgs,
        userAgent: standardUserAgent,
        timeout: 25000
      });
    }

    this.currentHeadless = headless;

    // ดักฟัง event เมื่อ context ปิดตัว
    this.context.on('close', () => {
      console.log('[BROWSER EVENT] Browser Context ปิดตัวลง');
      PersistentBrowserManager.context = null;
      PersistentBrowserManager.page = null;
      PersistentBrowserManager.currentHeadless = null;
    });
    
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    // ดักฟัง event แครชและปิดตัวของเพจ
    this.attachPageListeners(this.page);

    return { context: this.context, page: this.page! };
  }

  private static attachPageListeners(p: Page): void {
    p.on('crash', () => {
      console.warn('[BROWSER EVENT] ตรวจพบหน้าต่างเว็บเบราว์เซอร์แครช (Renderer Crash)');
      if (PersistentBrowserManager.page === p) {
        PersistentBrowserManager.page = null;
      }
    });
    p.on('close', () => {
      if (PersistentBrowserManager.page === p) {
        PersistentBrowserManager.page = null;
      }
    });
  }

  public static isBrowserOpen(): boolean {
    return !!(this.context && this.page && !this.page.isClosed());
  }

  public static getActivePage(): Page | null {
    if (this.context) {
      try {
        const pages = this.context.pages();
        const activePage = pages.find(p => !p.isClosed());
        return activePage || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  public static async close(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close().catch(() => {});
      } catch {}
      this.context = null;
      this.page = null;
      this.currentHeadless = null;
    }
  }
}

