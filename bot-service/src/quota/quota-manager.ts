import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';

export interface QuotaData {
  round: string;           // งวดวันที่ เช่น "16 ก.ย. 2569"
  maxQuota: number;        // โควต้าสูงสุด (2000)
  usedQuota: number;       // ใช้ไปแล้ว
  remainingQuota: number;  // คงเหลือ
  lastUpdated: string;
}

export class QuotaManager {
  private filePath: string;
  private data: QuotaData;

  constructor() {
    this.filePath = CONFIG.QUOTA_FILE_PATH;
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
      usedQuota: 0,
      remainingQuota: CONFIG.DEFAULT_MAX_QUOTA,
      lastUpdated: new Date().toISOString()
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
   * ตรวจสอบว่าโควต้าคงเหลือเพียงพอกับจำนวนที่ลูกค้าต้องการหรือไม่
   */
  public canFulfill(quantity: number): { allowed: boolean; remaining: number; reason?: string } {
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
  public syncFromWeb(webRemainingQuota: number): QuotaData {
    console.log(`[QUOTA SYNC] ปรับปรุงยอดจากหน้าเว็บ N3: คงเหลือ ${webRemainingQuota} ใบ`);
    this.data.remainingQuota = webRemainingQuota;
    this.data.usedQuota = Math.max(0, this.data.maxQuota - webRemainingQuota);
    this.data.lastUpdated = new Date().toISOString();
    this.saveQuota(this.data);
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
      lastUpdated: new Date().toISOString()
    };
    this.saveQuota(newData);
    console.log(`[QUOTA RESET] เริ่มต้นงวดใหม่ ${roundName} | โควต้า ${maxQuota} ใบ`);
    return newData;
  }

  public getStatus(): QuotaData {
    this.checkAndAutoResetRound();
    return { ...this.data };
  }
}
