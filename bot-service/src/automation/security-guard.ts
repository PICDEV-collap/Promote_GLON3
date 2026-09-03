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
    // 1. Intercept Network Route: บล็อกทราฟฟิกขาออกนอกโดเมนทันที
    page.route('**/*', (route: Route) => {
      const reqUrl = route.request().url();
      if (this.isUrlAllowed(reqUrl)) {
        route.continue();
      } else {
        console.warn(`[SECURITY BLOCKED] ป้องกันการเชื่อมต่อไปยัง URL นอกเหนือจาก N3: ${reqUrl}`);
        route.abort('accessdenied');
      }
    });

    // 2. Navigation Guard: ดักจับการเปลี่ยนหน้าเว็บ
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        const targetUrl = frame.url();
        if (!this.isUrlAllowed(targetUrl)) {
          console.error(`[CRITICAL SECURITY] ตรวจพบการพยายามเปลี่ยนหน้าไปยัง URL ต้องห้าม: ${targetUrl}`);
          page.goto(CONFIG.N3_LOGIN_URL).catch(() => {});
        }
      }
    });

    // 3. Popup Guard: ปิด Popup แปลกปลอมทันที
    page.on('popup', popup => {
      console.warn(`[SECURITY BLOCKED] ตรวจพบ Popup แปลกปลอม กำลังปิดหน้าต่าง...`);
      popup.close().catch(() => {});
    });
  }
}
