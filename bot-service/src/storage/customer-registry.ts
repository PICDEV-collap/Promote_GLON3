import fs from 'fs';
import path from 'path';

export interface CustomerLuckyRecord {
  number: string;
  tods: string[];
  n2: string;
  blessing: string;
  drawDate: string;
  sentAt: string;
}

export interface CustomerProfile {
  userId: string;
  displayName?: string;
  status: 'active' | 'blocked';
  firstSeen: string;
  lastSeen: string;
  totalOrders: number;
  assignedLuckyNumbers: Record<string, CustomerLuckyRecord>; // key: drawDate (e.g. '2026-09-16')
  lastDrawResultSent?: string; // drawDate (e.g. '2026-09-01')
}

export class CustomerRegistry {
  private static instance: CustomerRegistry;
  private filePath: string;
  private customers: Map<string, CustomerProfile> = new Map();
  private isLoaded: boolean = false;

  private constructor() {
    this.filePath = path.join(__dirname, '../../data/customers.json');
    this.load();
  }

  public static getInstance(): CustomerRegistry {
    if (!CustomerRegistry.instance) {
      CustomerRegistry.instance = new CustomerRegistry();
    }
    return CustomerRegistry.instance;
  }

  /**
   * โหลดรายชื่อลูกค้าจากไฟล์ customers.json
   */
  public load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const list: CustomerProfile[] = JSON.parse(raw);
        this.customers.clear();
        if (Array.isArray(list)) {
          for (const c of list) {
            if (c && c.userId) {
              this.customers.set(c.userId, {
                ...c,
                assignedLuckyNumbers: c.assignedLuckyNumbers || {}
              });
            }
          }
        }
        console.log(`[CUSTOMER REGISTRY] โหลดข้อมูลลูกค้าเรียบร้อยแล้ว: ${this.customers.size} ราย`);
      } else {
        this.customers.clear();
        this.save();
      }
      this.isLoaded = true;
    } catch (err) {
      console.error('[CUSTOMER REGISTRY] ไม่สามารถอ่านไฟล์ customers.json ได้:', err);
    }
  }

  /**
   * บันทึกข้อมูลลูกค้าลงไฟล์ customers.json
   */
  public save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.customers.values());
      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('[CUSTOMER REGISTRY] ไม่สามารถบันทึกไฟล์ customers.json ได้:', err);
    }
  }

  /**
   * ลงทะเบียนหรืออัปเดตสถานะของลูกค้าเมื่อมีปฏิสัมพันธ์
   */
  public registerOrUpdateUser(userId: string, displayName?: string): CustomerProfile {
    if (!userId || userId === 'anonymous') {
      return {
        userId: 'anonymous',
        status: 'blocked',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        totalOrders: 0,
        assignedLuckyNumbers: {}
      };
    }

    const now = new Date().toISOString();
    let profile = this.customers.get(userId);

    if (profile) {
      profile.lastSeen = now;
      profile.status = 'active'; // ถ้าเคยบล็อกแล้วกลับมาคุยใหม่ ให้เปลี่ยนเป็น active
      if (displayName) profile.displayName = displayName;
    } else {
      profile = {
        userId,
        displayName: displayName || undefined,
        status: 'active',
        firstSeen: now,
        lastSeen: now,
        totalOrders: 0,
        assignedLuckyNumbers: {}
      };
      this.customers.set(userId, profile);
      console.log(`[CUSTOMER REGISTRY] ✨ เพิ่มลูกค้าใหม่เข้าสู่ระบบ: ${userId}`);
    }

    this.save();
    return profile;
  }

  /**
   * ปรับสถานะเมื่อลูกค้ากด Block หรือ Unfollow บอท
   */
  public markBlocked(userId: string): void {
    if (!userId || userId === 'anonymous') return;
    const profile = this.customers.get(userId);
    if (profile) {
      profile.status = 'blocked';
      profile.lastSeen = new Date().toISOString();
      this.save();
      console.log(`[CUSTOMER REGISTRY] ⚠️ ลูกค้าบล็อกหรือเลิกติดตาม: ${userId}`);
    }
  }

  /**
   * บันทึกจำนวนการสั่งซื้อ
   */
  public incrementOrderCount(userId: string): void {
    if (!userId || userId === 'anonymous') return;
    const profile = this.customers.get(userId);
    if (profile) {
      profile.totalOrders = (profile.totalOrders || 0) + 1;
      profile.lastSeen = new Date().toISOString();
      this.save();
    }
  }

  /**
   * บันทึกเลขมงคลที่สุ่มให้ลูกค้าในงวดนั้นๆ
   */
  public recordLuckyAssignment(userId: string, record: CustomerLuckyRecord): void {
    const profile = this.customers.get(userId);
    if (profile) {
      if (!profile.assignedLuckyNumbers) profile.assignedLuckyNumbers = {};
      profile.assignedLuckyNumbers[record.drawDate] = record;
      this.save();
    }
  }

  /**
   * บันทึกว่างวดล่าสุดได้ส่งผลรางวัลให้ลูกค้ารายนี้แล้ว
   */
  public recordDrawResultSent(userId: string, drawDate: string): void {
    const profile = this.customers.get(userId);
    if (profile) {
      profile.lastDrawResultSent = drawDate;
      this.save();
    }
  }

  /**
   * ดึงรายชื่อลูกค้าที่เปิดรับข้อความ (Active) ทั้งหมด
   */
  public getActiveCustomers(): CustomerProfile[] {
    return Array.from(this.customers.values()).filter(c => c.status === 'active' && c.userId !== 'anonymous');
  }

  /**
   * ดึงข้อมูลลูกค้าตาม User ID
   */
  public getCustomer(userId: string): CustomerProfile | undefined {
    return this.customers.get(userId);
  }

  /**
   * สรุปสถิติลูกค้า
   */
  public getStats(): { total: number; active: number; blocked: number } {
    const list = Array.from(this.customers.values());
    const total = list.length;
    const active = list.filter(c => c.status === 'active').length;
    const blocked = list.filter(c => c.status === 'blocked').length;
    return { total, active, blocked };
  }
}
