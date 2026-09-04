import fs from 'fs';
import path from 'path';
import { Page } from 'playwright';
import { CONFIG } from '../config';

export interface QuotaData {
  round: string;           // งวดวันที่ เช่น "2026-09-16"
  maxQuota: number;        // โควต้าสูงสุด (2,000 ใบ)
  usedQuota: number;       // ใช้ไปแล้ว (เช่น 32 ใบ)
  remainingQuota: number;  // คงเหลือ (เช่น 1,968 ใบ)
  lastUpdated: string;
  syncedAt?: string;       // เวลาที่ซิงค์จากหน้าเว็บ GLO N3 Portal ล่าสุด
}

export interface ExtractedQuota {
  remainingQuota: number;
  usedQuota: number;
  maxQuota: number;
}

export class QuotaManager {
  private static instance: QuotaManager | null = null;
  private filePath: string;
  private data: QuotaData;

  public static getInstance(customFilePath?: string): QuotaManager {
    if (!QuotaManager.instance) {
      QuotaManager.instance = new QuotaManager(customFilePath);
    }
    return QuotaManager.instance;
  }

  constructor(customFilePath?: string) {
    this.filePath = customFilePath || CONFIG.QUOTA_FILE_PATH;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.data = this.loadQuota();
    this.checkAndAutoResetRound();
  }

  /**
   * คำนวณชื่องวดปัจจุบันตามปฏิทินสลากกินแบ่งรัฐบาล (วันที่ 1 และ 16 ของแต่ละเดือน)
   */
  public static getCurrentRoundIdentifier(dateObj?: Date): string {
    const now = dateObj || new Date();
    const bkkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const year = bkkTime.getFullYear();
    const month = bkkTime.getMonth() + 1;
    const day = bkkTime.getDate();

    if (day <= 1) {
      return `${year}-${String(month).padStart(2, '0')}-01`;
    } else if (day <= 16) {
      return `${year}-${String(month).padStart(2, '0')}-16`;
    } else {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    }
  }

  /**
   * ตรวจสอบว่างวดเปลี่ยนหรือยัง หากเปลี่ยนให้รีเซ็ตอัตโนมัติ
   */
  public checkAndAutoResetRound(): void {
    const currentRound = QuotaManager.getCurrentRoundIdentifier();
    if (this.data.round !== currentRound) {
      console.log(`[QUOTA AUTO-RESET] ตรวจพบการเปลี่ยนงวดสลากจาก ${this.data.round} เป็น ${currentRound} -> รีเซ็ตโควต้า ${CONFIG.DEFAULT_MAX_QUOTA} ใบ`);
      this.resetRound(currentRound, CONFIG.DEFAULT_MAX_QUOTA);
    }
  }

  /**
   * อ่านข้อมูลโควต้าล่าสุดจากดิสก์ เพื่อให้ทุก Instance และ Process ได้รับค่าที่เป็นจริงตรงกันเสมอ
   */
  public refreshFromDisk(): QuotaData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.remainingQuota === 'number') {
          this.data = parsed;
        }
      }
    } catch (e) {
      console.error('[QUOTA] ไม่สามารถอ่านไฟล์โควต้าจากดิสก์ได้', e);
    }
    return this.data;
  }

  private loadQuota(): QuotaData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[QUOTA] ไม่สามารถโหลดไฟล์โควต้าได้ ใช้ค่าเริ่มต้น 2,000 ใบ', e);
    }

    const defaultData: QuotaData = {
      round: QuotaManager.getCurrentRoundIdentifier(),
      maxQuota: CONFIG.DEFAULT_MAX_QUOTA,
      usedQuota: 32,
      remainingQuota: 1968,
      lastUpdated: new Date().toISOString(),
      syncedAt: new Date().toISOString()
    };
    this.saveQuota(defaultData);
    return defaultData;
  }

  private saveQuota(data: QuotaData): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.data = data;
    } catch (e) {
      console.error('[QUOTA] ไม่สามารถบันทึกไฟล์โควต้าได้', e);
    }
  }

  /**
   * แกะตัวเลขโควต้าจริงจากข้อความหน้าเว็บ GLO N3 Landing (https://n3.glolotteryshop.com/landing/)
   * รองรับ:
   * 1. แบนเนอร์ด้านบน: "📣 คุณขายสลากฯ ได้อีก 1,968 ใบ" หรือ "คุณขายสลากได้อีก: 1968 ใบ"
   * 2. กล่องยอดขายร้านค้า: "32 / 2,000 ใบ" หรือ "ยอดขาย 32 / 2,000 ใบ"
   * 3. ข้อความคงเหลือในการ์ดยอดขาย: "เหลืออีก 1,968 ใบ", "คงเหลือ 1,968 ใบ"
   * 4. รองรับตัวเลขทั้งอารบิกและไทย (๑,๙๖๘ ใบ) และทนทานต่อเครื่องหมายทวิภาค (:) และช่องว่างหลากรูปแบบ
   */
  public static parseQuotaFromPortalText(rawText: string, fallbackMaxQuota?: number): ExtractedQuota | null {
    if (!rawText || typeof rawText !== 'string') return null;

    // แปลงตัวเลขไทย (๐-๙) เป็นตัวเลขอารบิก (0-9), ลบ HTML tags, แปลง entities และจัด whitespace
    const text = rawText
      .replace(/[๐-๙]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0E50 + 0x30))
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#160;/g, ' ')
      .replace(/[\t\r\n]+/g, ' ')
      .replace(/\s+/g, ' ');

    let remainingQuota: number | null = null;
    let usedQuota: number | null = null;
    let maxQuota: number = fallbackMaxQuota || CONFIG.DEFAULT_MAX_QUOTA || 2000;

    // 1. ตรวจสอบยอดขายร้านค้า: "32 / 2,000 ใบ" หรือ "ยอดขาย: 32 / 2,000 ใบ"
    const soldMatch = text.match(/(?:ยอดขาย(?:ร้านค้า)?)?\s*[:：]?\s*([0-9,]+)\s*\/\s*([0-9,]+)\s*ใบ/);
    if (soldMatch) {
      const sold = parseInt(soldMatch[1].replace(/,/g, ''), 10);
      const max = parseInt(soldMatch[2].replace(/,/g, ''), 10);
      if (!isNaN(sold) && !isNaN(max) && max > 0) {
        usedQuota = sold;
        maxQuota = max;
      }
    }

    // 2. ตรวจสอบแบนเนอร์แจ้งเตือน: "📣 คุณขายสลากฯ ได้อีก 1,968 ใบ", "คุณขายสลากฯ ได้อีก: 1968 ใบ"
    const bannerMatch = text.match(/คุณขายสลาก(?:ฯ)?\s*(?:สามารถ)?\s*ได้อีก\s*[:：]?\s*([0-9,]+)\s*ใบ/);
    if (bannerMatch) {
      const rem = parseInt(bannerMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(rem)) {
        remainingQuota = rem;
      }
    }

    // 3. ตรวจสอบข้อความคงเหลือในการ์ดยอดขาย: "เหลืออีก 1,968 ใบ", "คงเหลือ 1,968 ใบ", "เหลืออีก: 1,968 ใบ"
    if (remainingQuota === null) {
      const cardRemainingMatch = text.match(/(?:ยอด)?(?:คง)?เหลือ(?:อีก)?\s*[:：]?\s*([0-9,]+)\s*ใบ/);
      if (cardRemainingMatch) {
        const rem = parseInt(cardRemainingMatch[1].replace(/,/g, ''), 10);
        if (!isNaN(rem)) {
          remainingQuota = rem;
        }
      }
    }

    // เติมเต็มค่าที่อนุมานได้หากพบเพียงตัวใดตัวหนึ่ง
    if (remainingQuota !== null && usedQuota === null) {
      usedQuota = Math.max(0, maxQuota - remainingQuota);
    } else if (remainingQuota === null && usedQuota !== null) {
      remainingQuota = Math.max(0, maxQuota - usedQuota);
    }

    if (remainingQuota !== null && usedQuota !== null) {
      return {
        remainingQuota,
        usedQuota,
        maxQuota
      };
    }

    return null;
  }

  /**
   * Sync ยอดสลากคงเหลือจากหน้าเว็บตัวแทน GLO N3 Portal (เช่น https://n3.glolotteryshop.com/landing/)
   */
  public async syncQuotaFromLivePortal(
    page: Page,
    navigateIfNeeded: boolean = true
  ): Promise<ExtractedQuota | null> {
    try {
      if (!page || (typeof page.isClosed === 'function' && page.isClosed())) {
        console.warn('[QUOTA SYNC] หน้าต่างเบราว์เซอร์ไม่พร้อมใช้งานหรือถูกปิด');
        return null;
      }

      const currentUrl = typeof page.url === 'function' ? page.url() : '';
      const cleanUrl = currentUrl.replace(/\/+$/, '');
      const isLanding = cleanUrl.includes('/landing') || cleanUrl === 'https://n3.glolotteryshop.com';

      // หากไม่ได้อยู่ในหน้า landing และต้องการนำทาง ให้เปิดไปที่ /landing/
      if (!isLanding && navigateIfNeeded) {
        if (currentUrl.includes('/lotto-search') || currentUrl.includes('/lotto-confirm')) {
          console.log('[QUOTA SYNC] เบราว์เซอร์กำลังอยู่ในขั้นตอนสั่งซื้อ ข้ามการนำทางเพื่อไม่ให้รบกวนออเดอร์');
          return null;
        }

        console.log('[QUOTA SYNC] กำลังนำทางไปหน้าหลักเพื่อซิงค์โควต้า: https://n3.glolotteryshop.com/landing/');
        await page.goto('https://n3.glolotteryshop.com/landing/', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);
      }

      const activeUrl = typeof page.url === 'function' ? page.url() : '';
      if (activeUrl.includes('/login')) {
        console.warn('[QUOTA SYNC] ยังไม่ได้ล็อกอินหรือ Session หลุด ไม่สามารถอ่านโควต้าได้');
        return null;
      }

      // 1. ดึงข้อความทั้งหมดบนหน้าเว็บ
      let pageText = '';
      if (typeof page.evaluate === 'function') {
        pageText = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
      }

      // 2. แกะตัวเลขโควต้า
      let extracted = QuotaManager.parseQuotaFromPortalText(pageText, this.data.maxQuota);

      // 3. Fallback: ค้นหาจากข้อความเฉพาะกลุ่ม DOM และ __NEXT_DATA__
      if (!extracted && typeof page.evaluate === 'function') {
        const domTexts = await page.evaluate(() => {
          const res: string[] = [];
          const nodes = document.querySelectorAll('div, p, span, h1, h2, h3, h4, strong, b');
          for (let i = 0; i < nodes.length; i++) {
            const txt = nodes[i].textContent?.trim() || '';
            if (txt.includes('คุณขายสลาก') || txt.includes('เหลืออีก') || txt.includes('คงเหลือ') || txt.includes('ยอดขาย') || txt.includes('/ 2,000') || txt.includes('/ 2000')) {
              res.push(txt);
            }
          }
          const nextData = document.getElementById('__NEXT_DATA__');
          if (nextData && nextData.textContent) {
            res.push(nextData.textContent);
          }
          return res.join('\n');
        }).catch(() => '');

        if (domTexts) {
          extracted = QuotaManager.parseQuotaFromPortalText(domTexts, this.data.maxQuota);
        }
      }

      if (extracted) {
        this.data.remainingQuota = extracted.remainingQuota;
        this.data.usedQuota = extracted.usedQuota;
        this.data.maxQuota = extracted.maxQuota;
        this.data.lastUpdated = new Date().toISOString();
        this.data.syncedAt = new Date().toISOString();
        this.saveQuota(this.data);

        console.log(`[QUOTA SYNC SUCCESS] อัปเดตโควต้าจากระบบจริงสำเร็จ: คงเหลือ ${this.data.remainingQuota.toLocaleString()} / ${this.data.maxQuota.toLocaleString()} ใบ (ขายแล้ว ${this.data.usedQuota.toLocaleString()} ใบ)`);
        return {
          remainingQuota: this.data.remainingQuota,
          usedQuota: this.data.usedQuota,
          maxQuota: this.data.maxQuota
        };
      } else {
        console.warn('[QUOTA SYNC] ไม่พบรูปแบบข้อความโควต้าบนหน้าเว็บ (URL:', activeUrl, ')');
        return null;
      }
    } catch (err: any) {
      console.warn('[QUOTA SYNC ERROR] เกิดข้อผิดพลาดขณะดึงโควต้า:', err?.message);
      return null;
    }
  }

  /**
   * Static helper สำหรับ sync โควต้าจากหน้าเว็บ
   */
  public static async syncQuotaFromLivePortal(
    page: Page,
    navigateIfNeeded: boolean = true
  ): Promise<ExtractedQuota | null> {
    const qm = QuotaManager.getInstance();
    return qm.syncQuotaFromLivePortal(page, navigateIfNeeded);
  }

  /**
   * ตรวจสอบว่าโควต้าคงเหลือเพียงพอกับจำนวนที่ลูกค้าต้องการหรือไม่
   */
  public canFulfill(quantity: number): { allowed: boolean; remaining: number; reason?: string } {
    this.refreshFromDisk();
    this.checkAndAutoResetRound();
    if (this.data.remainingQuota <= 0) {
      return { allowed: false, remaining: 0, reason: 'สลากงวดนี้หมดแล้ว (Sold Out)' };
    }
    if (quantity > this.data.remainingQuota) {
      return {
        allowed: false,
        remaining: this.data.remainingQuota,
        reason: `สลากเหลือไม่พอ (เหลือเพียง ${this.data.remainingQuota} ใบ แต่ต้องการสั่ง ${quantity} ใบ)`
      };
    }
    return { allowed: true, remaining: this.data.remainingQuota };
  }

  /**
   * หักลบโควต้าเมื่อบอทออก QR ชำระเงินสำเร็จ
   */
  public deductQuota(quantity: number): QuotaData {
    this.refreshFromDisk();
    this.data.usedQuota += quantity;
    this.data.remainingQuota = Math.max(0, this.data.maxQuota - this.data.usedQuota);
    this.data.lastUpdated = new Date().toISOString();
    this.saveQuota(this.data);
    console.log(`[QUOTA DEDUCTED] หักลบ ${quantity} ใบ | คงเหลือ ${this.data.remainingQuota} / ${this.data.maxQuota}`);
    return this.data;
  }

  /**
   * Sync ยอดสลากคงเหลือจากหน้าเว็บตัวแทน N3
   */
  public syncFromWeb(webRemainingQuota: number, maxQuota: number = 2000, usedQuota?: number): QuotaData {
    console.log(`[QUOTA SYNC] ปรับปรุงยอดจากหน้าเว็บ N3: คงเหลือ ${webRemainingQuota} ใบ`);
    this.data.maxQuota = maxQuota;
    this.data.remainingQuota = webRemainingQuota;
    this.data.usedQuota = usedQuota !== undefined ? usedQuota : Math.max(0, maxQuota - webRemainingQuota);
    this.data.lastUpdated = new Date().toISOString();
    this.data.syncedAt = new Date().toISOString();
    this.saveQuota(this.data);
    return this.data;
  }

  /**
   * อัปเดตยอดโควต้าสดทั้งขายแล้วและคงเหลือ
   */
  public updateLiveQuota(usedQuota: number, remainingQuota: number, maxQuota: number = 2000): QuotaData {
    this.data.maxQuota = maxQuota;
    this.data.usedQuota = usedQuota;
    this.data.remainingQuota = remainingQuota;
    this.data.lastUpdated = new Date().toISOString();
    this.data.syncedAt = new Date().toISOString();
    this.saveQuota(this.data);
    console.log(`[QUOTA LIVE UPDATE] ปรับปรุงยอด: ขายแล้ว ${usedQuota} ใบ | คงเหลือ ${remainingQuota} / ${maxQuota} ใบ`);
    return this.data;
  }

  /**
   * รีเซ็ตโควต้าต่องวดใหม่ (2,000 ใบ)
   */
  public resetRound(roundName: string, maxQuota: number = 2000): QuotaData {
    const newData: QuotaData = {
      round: roundName,
      maxQuota,
      usedQuota: 0,
      remainingQuota: maxQuota,
      lastUpdated: new Date().toISOString(),
      syncedAt: new Date().toISOString()
    };
    this.saveQuota(newData);
    console.log(`[QUOTA RESET] เริ่มต้นงวดใหม่ ${roundName} | โควต้า ${maxQuota} ใบ`);
    return newData;
  }

  public getStatus(): QuotaData {
    this.refreshFromDisk();
    this.checkAndAutoResetRound();
    return { ...this.data };
  }
}

export function parseQuotaFromPortalText(rawText: string, fallbackMaxQuota?: number): ExtractedQuota | null {
  return QuotaManager.parseQuotaFromPortalText(rawText, fallbackMaxQuota);
}

export async function syncQuotaFromLivePortal(
  page: Page,
  navigateIfNeeded: boolean = true
): Promise<ExtractedQuota | null> {
  return QuotaManager.syncQuotaFromLivePortal(page, navigateIfNeeded);
}


