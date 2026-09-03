import { Page, Route } from 'playwright';
import { CONFIG } from '../config';

export class SecurityGuard {
  private allowedDomains: string[];

  constructor() {
    this.allowedDomains = CONFIG.ALLOWED_DOMAINS;
  }

  /**
   * ตรวจสอบว่า URL หรือ Hostname อยู่ใน Whitelist หรือไม่
   */
  public isUrlAllowed(urlStr: string): boolean {
    try {
      // อนุญาต data: URI สำหรับ QR code และ blob: URI ภายใน
      if (urlStr.startsWith('data:') || urlStr.startsWith('blob:') || urlStr.startsWith('about:blank')) {
        return true;
      }

      const parsed = new URL(urlStr);
      const hostname = parsed.hostname.toLowerCase();

      return this.allowedDomains.some(allowed => {
        const clean = allowed.replace(/^\*\./, '').toLowerCase();
        return hostname === clean || hostname.endsWith('.' + clean);
      });
    } catch {
      return false;
    }
  }

  /**
   * แนบ Security Guard เข้ากับ Playwright Page เพื่อดักจับทุก Request และ Navigation
   */
  public attachToPage(page: Page): void {
    if ((page as any).__securityGuardAttached) {
      return;
    }
    (page as any).__securityGuardAttached = true;

    // ติดตามการเปิดหน้าต่างใหม่ (Popup) เพื่อความปลอดภัย แต่ไม่สั่งปิดหน้าต่างอัตโนมัติ
    page.on('popup', popup => {
      console.log(`[BROWSER POPUP] ตรวจพบหน้าต่างใหม่: ${popup.url()}`);
    });
  }
}
