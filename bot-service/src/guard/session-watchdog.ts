import { Page } from 'playwright';
import { PersistentBrowserManager, isCdpAlive } from '../automation/browser-context';
import { TelegramService } from '../notify/telegram-service';
import { OrderQueue } from '../queue/order-queue';
import { CONFIG } from '../config';

export type SessionHealthStatus = 'INITIALIZING' | 'LOGGED_IN' | 'DISCONNECTED' | 'STOPPED';

export interface SessionWatchdogState {
  status: SessionHealthStatus;
  lastCheckTime: string | null;
  lastDropReason: string | null;
  detectedUrl: string | null;
  hasAlerted: boolean;
  intervalMs: number;
  checkCount: number;
}

/**
 * GloSessionWatchdog : ระบบเฝ้าระวังเซสชัน GLO N3 แบบเรียลไทม์ (ตรวจทุก 500 ms)
 * เมื่อตรวจพบว่าเซสชันหลุด จะส่งแจ้งเตือนด่วนเข้า Telegram แอดมินทันที
 * และมีระบบ Anti-Spam Latch ป้องกันข้อความส่งซ้ำรัวๆ
 */
export class GloSessionWatchdog {
  private static instance: GloSessionWatchdog | null = null;

  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number = 500;
  private isChecking: boolean = false;
  private status: SessionHealthStatus = 'INITIALIZING';
  private lastCheckTime: string | null = null;
  private lastDropReason: string | null = null;
  private detectedUrl: string | null = null;
  private hasAlerted: boolean = false;
  private checkCount: number = 0;

  private telegramService: TelegramService;
  private orderQueue: OrderQueue | null = null;

  private constructor(telegramService?: TelegramService, orderQueue?: OrderQueue | null) {
    this.telegramService = telegramService || TelegramService.getInstance();
    this.orderQueue = orderQueue || null;
  }

  public static getInstance(telegramService?: TelegramService, orderQueue?: OrderQueue | null): GloSessionWatchdog {
    if (!GloSessionWatchdog.instance) {
      GloSessionWatchdog.instance = new GloSessionWatchdog(telegramService, orderQueue);
    }
    return GloSessionWatchdog.instance;
  }

  public setOrderQueue(queue: OrderQueue): void {
    this.orderQueue = queue;
  }

  /**
   * เริ่มต้นระบบตรวจสอบเซสชันทุก 500 ms
   */
  public start(intervalMs: number = 500): void {
    if (this.timer) {
      return;
    }
    this.intervalMs = intervalMs;
    console.log(`[SESSION WATCHDOG] 🛡️ เริ่มต้นระบบตรวจจับเซสชัน GLO N3 ทุก ${this.intervalMs} ms (Telegram Alert Pipeline พร้อมทำงาน)`);
    
    // ทำการตรวจสอบครั้งแรกทันที
    this.checkNow().catch(() => {});

    this.timer = setInterval(async () => {
      try {
        await this.checkNow();
      } catch (err: any) {
        // เงียบข้อผิดพลาดเพื่อไม่ให้ขัดจังหวะรอบถัดไป
      }
    }, this.intervalMs);

    // unref() เพื่อไม่ให้ขัดขวางการปิดโปรเซสถ้าต้องการ shutdown
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * หยุดระบบตรวจสอบ
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'STOPPED';
    console.log('[SESSION WATCHDOG] 🛑 หยุดระบบตรวจจับเซสชัน GLO N3 เรียบร้อยแล้ว');
  }

  /**
   * ตรวจสอบสถานะเซสชัน 1 รอบทันที
   */
  public async checkNow(pageOverride?: Page | null): Promise<SessionHealthStatus> {
    if (this.isChecking) {
      return this.status;
    }
    this.isChecking = true;
    this.checkCount++;
    this.lastCheckTime = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }) + ' น.';

    try {
      let page: Page | null = pageOverride !== undefined ? pageOverride : PersistentBrowserManager.getActivePage();

      // 1. ตรวจสอบว่าเบราว์เซอร์หรือการเชื่อมต่อ CDP ยังทำงานอยู่หรือไม่
      const cdpAlive = await isCdpAlive(CONFIG.CDP_PORT || 9222).catch(() => false);
      
      if (!page || page.isClosed()) {
        if (!cdpAlive) {
          // หากยังอยู่ในช่วงเริ่มต้นระบบ (INITIALIZING) และเบราว์เซอร์ยังอยู่ในโหมด Standby ให้รอจนกว่าจะเชื่อมต่อครั้งแรก
          if (this.status === 'INITIALIZING' && pageOverride === undefined) {
            this.detectedUrl = 'cdp://localhost:9222 (Standby)';
            return this.status;
          }
          await this.handleSessionDrop(
            'เบราว์เซอร์หรือการเชื่อมต่อ Chrome CDP ปิดตัวลง (Browser Closed or CDP Disconnected)',
            'cdp://localhost:9222 (Offline)'
          );
          return this.status;
        }
      }

      // ถ้าหน้าเว็บปิดตัวหรือไม่มี page แต่ cdpAlive ลองดึง page ล่าสุด
      if ((!page || page.isClosed()) && cdpAlive && pageOverride === undefined) {
        try {
          const browserObj = await PersistentBrowserManager.getPage();
          page = browserObj.page;
        } catch {
          // หากดึงไม่ได้ ให้ถือว่าเบราว์เซอร์ยังไม่พร้อม
          return this.status;
        }
      }

      if (!page || page.isClosed()) {
        return this.status;
      }

      // 2. ตรวจสอบ URL ของหน้าเว็บ
      let currentUrl = '';
      try {
        currentUrl = page.url();
        this.detectedUrl = currentUrl;
      } catch {
        return this.status;
      }

      // 2.1 หาก URL ถูกเปลี่ยนเส้นทางกลับมาที่หน้า /login/ หรือหน้าอื่นนอกระบบตัวแทน
      if (currentUrl.includes('/login') || (currentUrl.startsWith('http') && !currentUrl.includes('glolotteryshop.com'))) {
        await this.handleSessionDrop(
          `หน้าเว็บถูกเปลี่ยนเส้นทางไปหน้า Login หรือออกนอกระบบตัวแทน GLO (${currentUrl})`,
          currentUrl
        );
        return this.status;
      }

      // 3. ตรวจสอบการปรากฏของป๊อปอัปเซสชันหมดอายุบน DOM (Fast Evaluate in < 5ms)
      const isModalKicked = await page.evaluate(() => {
        try {
          const modalPattern = /ไม่สามารถทำรายการได้|เข้าสู่ระบบใหม่อีกครั้ง|เซสชันหมดอายุ|หมดอายุการใช้งาน|กรุณาเข้าสู่ระบบ/;
          
          // ตรวจหา dialog หรือ modal containers
          const modals = document.querySelectorAll('div.fixed, div[class*="inset-0"], [role="dialog"], .modal');
          for (let i = 0; i < modals.length; i++) {
            const el = modals[i] as HTMLElement;
            const txt = el.innerText || '';
            if (modalPattern.test(txt)) {
              const style = window.getComputedStyle(el);
              if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                return true;
              }
            }
          }

          // ตรวจหา Overlay สีดำระดับ z-[200]
          const overlays = document.querySelectorAll('div.fixed.inset-0[class*="z-"]');
          for (let i = 0; i < overlays.length; i++) {
            const ov = overlays[i] as HTMLElement;
            const ovTxt = ov.innerText || '';
            if (modalPattern.test(ovTxt)) {
              return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      }).catch(() => false);

      if (isModalKicked) {
        await this.handleSessionDrop(
          'ตรวจพบป๊อปอัปแจ้งเตือนบนหน้าเว็บ: "ไม่สามารถทำรายการได้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง" (Session Expired Modal)',
          currentUrl
        );
        return this.status;
      }

      // 4. หากผ่านทุกเงื่อนไข แสดงว่าเซสชันปกติ (HEALTHY / LOGGED_IN)
      await this.handleSessionHealthy(currentUrl);
      return this.status;

    } catch (checkErr: any) {
      // ป้องกัน exception หลุดออกไป
      return this.status;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * จัดการกรณีเซสชันหลุด (Drop Event)
   */
  public async handleSessionDrop(reason: string, url?: string): Promise<void> {
    const prevStatus = this.status;
    this.status = 'DISCONNECTED';
    this.lastDropReason = reason;
    if (url) this.detectedUrl = url;

    // ระบบ Anti-Spam Latch: ยิง Telegram ทันทีเฉพาะเมื่อเปลี่ยนสถานะเป็น DISCONNECTED และยังไม่ได้แจ้งเตือน
    if (!this.hasAlerted) {
      this.hasAlerted = true;
      console.warn(`[SESSION WATCHDOG ALERT] 🚨 ตรวจพบเซสชัน GLO N3 หลุด! สาเหตุ: ${reason} (กำลังส่งแจ้งเตือน Telegram แอดมิน)`);

      try {
        await this.telegramService.notifySessionDropped({
          reason,
          detectedUrl: this.detectedUrl || url || undefined,
          timestamp: this.lastCheckTime || undefined
        });
      } catch (notifyErr: any) {
        console.error('[SESSION WATCHDOG NOTIFY ERROR] ไม่สามารถส่งแจ้งเตือนเข้า Telegram ได้:', notifyErr?.message);
      }
    }
  }

  /**
   * จัดการกรณีเซสชันปกติ (Healthy Event)
   */
  private async handleSessionHealthy(url?: string): Promise<void> {
    const prevStatus = this.status;
    this.status = 'LOGGED_IN';
    if (url) this.detectedUrl = url;

    // หากก่อนหน้านี้เซสชันเคยหลุด (hasAlerted = true) และตอนนี้กลับมาออนไลน์แล้ว -> ส่งแจ้งเตือนกู้คืนระบบ
    if (this.hasAlerted && prevStatus === 'DISCONNECTED') {
      console.log(`[SESSION WATCHDOG RECOVERED] 🟢 เซสชัน GLO N3 กลับมาออนไลน์เรียบร้อยแล้ว (กำลังส่งแจ้งเตือน Telegram)`);
      this.hasAlerted = false;
      this.lastDropReason = null;

      try {
        await this.telegramService.notifySessionRestored(this.lastCheckTime || undefined);
      } catch (err: any) {
        console.error('[SESSION WATCHDOG RESTORE NOTIFY ERROR]:', err?.message);
      }
    }
  }

  // Getters & Testing helpers
  public getStatus(): SessionWatchdogState {
    return {
      status: this.status,
      lastCheckTime: this.lastCheckTime,
      lastDropReason: this.lastDropReason,
      detectedUrl: this.detectedUrl,
      hasAlerted: this.hasAlerted,
      intervalMs: this.intervalMs,
      checkCount: this.checkCount
    };
  }

  public resetTrackingForTest(): void {
    this.status = 'INITIALIZING';
    this.lastCheckTime = null;
    this.lastDropReason = null;
    this.detectedUrl = null;
    this.hasAlerted = false;
    this.checkCount = 0;
  }

  public setHasAlertedForTest(val: boolean): void {
    this.hasAlerted = val;
  }
}
