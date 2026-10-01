import fs from 'fs';
import path from 'path';
import { CustomerRegistry, CustomerProfile } from '../storage/customer-registry';
import { LuckyDistributor, DistributedLuckyItem } from '../dream/lucky-distributor';
import { FlexMessageBuilder } from '../line/flex-message';
import { LineReplyHandler } from '../line/reply-handler';
import { CONFIG } from '../config';

export interface CampaignResult {
  campaignType: 'lucky-teaser' | 'draw-results';
  drawDate: string;
  totalTarget: number;
  sentCount: number;
  failedCount: number;
  dryRun: boolean;
  timestamp: string;
  details?: any[];
}

export class CampaignService {
  private static instance: CampaignService;
  private lineHandler: LineReplyHandler;
  private customerRegistry: CustomerRegistry;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private lastTeaserDateSent: string = '';
  private teaserAttemptDate: string = '';
  private teaserAttemptCount: number = 0;
  // Scheduler checks every 15 minutes during the three-hour send window.
  private readonly maxScheduledTeaserAttempts: number = 12;
  private lastResultsDateSent: string = '';

  private constructor() {
    this.lineHandler = new LineReplyHandler();
    this.customerRegistry = CustomerRegistry.getInstance();
  }

  public static getInstance(): CampaignService {
    if (!CampaignService.instance) {
      CampaignService.instance = new CampaignService();
    }
    return CampaignService.instance;
  }

  /**
   * ดึงข้อมูลกำหนดการออกรางวัลงวดถัดไปจาก official-draw-schedule.json
   */
  public getUpcomingDrawInfo(nowOverride?: Date): { drawDate: string; thaiDate: string; period: string } {
    const now = nowOverride || new Date();
    const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayYMD = `${bangkokNow.getUTCFullYear()}-${String(bangkokNow.getUTCMonth() + 1).padStart(2, '0')}-${String(bangkokNow.getUTCDate()).padStart(2, '0')}`;

    try {
      const schedulePath = path.join(__dirname, '../../../data/official-draw-schedule.json');
      if (fs.existsSync(schedulePath)) {
        const raw = fs.readFileSync(schedulePath, 'utf-8');
        const data = JSON.parse(raw);
        const schedules: any[] = Array.isArray(data.schedules) ? data.schedules : [];

        // ไฟล์มีวันย้อนหลังต่อท้ายได้ จึงเลือกวันที่ใกล้ที่สุดจากรายการทั้งหมด ไม่ใช้แถวแรกที่ยังไม่ผ่านวัน
        const found = schedules
          .filter(s => typeof s?.drawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.drawDate) && s.drawDate >= todayYMD)
          .sort((a, b) => a.drawDate.localeCompare(b.drawDate))[0];
        if (found) {
          return {
            drawDate: found.drawDate,
            thaiDate: found.thaiDate || this.formatThaiDrawDate(found.drawDate),
            period: found.period || `งวดประจำวันที่ ${found.thaiDate || this.formatThaiDrawDate(found.drawDate)}`
          };
        }
      }
    } catch (err) {
      console.warn('[CAMPAIGN] ไม่สามารถอ่านไฟล์กำหนดการออกรางวัลได้:', err);
    }

    // Fallback ตามรอบปกติและวันเลื่อนประจำปีของ กองสลากฯ ใช้เวลาไทย ไม่ผูกกับ timezone ของเครื่อง
    const currentYear = bangkokNow.getUTCFullYear();
    const fallbackDates: string[] = [];
    for (const year of [currentYear, currentYear + 1]) {
      for (let month = 1; month <= 12; month++) {
        const days = month === 1 ? [17]
          : month === 5 ? [2, 16]
          : month === 12 ? [1, 16, 30]
          : [1, 16];
        for (const day of days) {
          fallbackDates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        }
      }
    }
    const drawDate = fallbackDates.filter(date => date >= todayYMD).sort()[0];
    const thaiDate = this.formatThaiDrawDate(drawDate);

    return {
      drawDate,
      thaiDate,
      period: `งวดประจำวันที่ ${thaiDate}`
    };
  }

  private formatThaiDrawDate(drawDate: string): string {
    const [year, month, day] = drawDate.split('-').map(Number);
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `${day} ${months[month - 1]} ${year + 543}`;
  }

  /**
   * ดึงข้อมูลผลสลากล่าสุดจาก latest-lottery.json
   */
  public getLatestLotteryData(): any {
    try {
      const lotteryPath = path.join(__dirname, '../../../data/latest-lottery.json');
      if (fs.existsSync(lotteryPath)) {
        const raw = fs.readFileSync(lotteryPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[CAMPAIGN] ไม่สามารถอ่านผลรางวัลล่าสุดได้:', err);
    }
    return null;
  }

  /**
   * 1. สุ่มเลขมงคลกระจายไม่ซ้ำและส่ง Push Notification ให้ลูกค้าทุกคนก่อนหวยออก
   */
  public async sendPersonalizedLuckyTeasers(options: {
    dryRun?: boolean;
    targetUserId?: string;
    force?: boolean;
    nowOverride?: Date;
  } = {}): Promise<CampaignResult> {
    const isDryRun = !!options.dryRun;
    const drawInfo = this.getUpcomingDrawInfo(options.nowOverride);

    let targets: CustomerProfile[] = [];
    if (options.targetUserId) {
      const single = this.customerRegistry.getCustomer(options.targetUserId);
      if (single) {
        targets = [single];
      } else {
        targets = [{
          userId: options.targetUserId,
          status: 'active',
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          totalOrders: 0,
          assignedLuckyNumbers: {}
        }];
      }
    } else {
      targets = this.customerRegistry.getActiveCustomers();
    }

    if (targets.length === 0) {
      console.log('[CAMPAIGN TEASER] ไม่มีลูกค้าที่เปิดรับข้อความในระบบ');
      return {
        campaignType: 'lucky-teaser',
        drawDate: drawInfo.drawDate,
        totalTarget: 0,
        sentCount: 0,
        failedCount: 0,
        dryRun: isDryRun,
        timestamp: new Date().toISOString()
      };
    }

    // Distribute using the complete active list before filtering delivered customers.
    // Otherwise a retry can shift a failed customer's number onto another customer's number.
    const allDistributedItems = LuckyDistributor.distributeLuckyNumbers(targets, drawInfo.drawDate, drawInfo.thaiDate);
    const targetById = new Map(targets.map(customer => [customer.userId, customer]));
    const distributedItems = allDistributedItems.filter(item => {
      if (options.force || options.targetUserId) return true;
      const record = targetById.get(item.userId)?.assignedLuckyNumbers?.[drawInfo.drawDate];
      return !record || record.deliveryStatus === 'pending';
    });

    // Persist the plan before sending so transient failures retry with the same number.
    if (!isDryRun) {
      this.customerRegistry.recordLuckyAssignments(distributedItems
        .filter(item => !targetById.get(item.userId)?.assignedLuckyNumbers?.[drawInfo.drawDate])
        .map(item => ({
          userId: item.userId,
          record: {
            number: item.number,
            tods: item.tods,
            n2: item.n2,
            blessing: item.blessing,
            drawDate: item.drawDate,
            sentAt: '',
            deliveryStatus: 'pending' as const
          }
        })));
    }

    console.log(`[CAMPAIGN TEASER] 🚀 เริ่มส่งเลขมงคลกระจายไม่ซ้ำ (${distributedItems.length} รายการ | งวด ${drawInfo.thaiDate} | dryRun=${isDryRun})`);

    let sentCount = 0;
    let failedCount = 0;
    const details: any[] = [];

    for (let i = 0; i < distributedItems.length; i++) {
      const item = distributedItems[i];
      try {
        const flexMsg = FlexMessageBuilder.buildPersonalizedLuckyTeaserMessage(item);

        if (!isDryRun) {
          if (!this.lineHandler.isPushAvailable()) {
            failedCount += distributedItems.length - i;
            console.warn('[CAMPAIGN TEASER] หยุดส่งต่อเพราะโควตา LINE Push หมด จะลองใหม่ในรอบ scheduler ถัดไป');
            break;
          }
          const success = await this.lineHandler.push(item.userId, [flexMsg]);
          if (success) {
            sentCount++;
            this.customerRegistry.recordLuckyAssignment(item.userId, {
              number: item.number,
              tods: item.tods,
              n2: item.n2,
              blessing: item.blessing,
              drawDate: item.drawDate,
              sentAt: new Date().toISOString(),
              deliveryStatus: 'sent'
            });
          } else {
            failedCount++;
          }
          // ป้องกัน Rate Limit ของ LINE API ด้วยการหน่วงเวลา 100ms
          await new Promise(r => setTimeout(r, 100));
        } else {
          sentCount++;
        }

        details.push({
          userId: item.userId,
          number: item.number,
          tods: item.tods,
          n2: item.n2,
          element: item.element
        });
      } catch (e) {
        console.error(`[CAMPAIGN TEASER ERROR] ส่งให้ ${item.userId} ล้มเหลว:`, e);
        failedCount++;
      }
    }

    console.log(`[CAMPAIGN TEASER DONE] สำเร็จ: ${sentCount}, ล้มเหลว: ${failedCount}`);

    return {
      campaignType: 'lucky-teaser',
      drawDate: drawInfo.drawDate,
      totalTarget: distributedItems.length,
      sentCount,
      failedCount,
      dryRun: isDryRun,
      timestamp: new Date().toISOString(),
      details
    };
  }

  /**
   * 2. ส่งผลการออกรางวัลสลาก N3 หลังหวยออกให้ลูกค้าทุกคน
   */
  public async broadcastDrawResults(options: {
    dryRun?: boolean;
    targetUserId?: string;
    force?: boolean;
  } = {}): Promise<CampaignResult> {
    const isDryRun = !!options.dryRun;
    const lotteryData = this.getLatestLotteryData();

    if (!lotteryData) {
      throw new Error('ไม่พบข้อมูลผลการออกรางวัลในระบบ latest-lottery.json');
    }

    const drawDate = lotteryData.drawDate || new Date().toISOString().slice(0, 10);
    let targets: CustomerProfile[] = [];

    if (options.targetUserId) {
      const single = this.customerRegistry.getCustomer(options.targetUserId);
      targets = single ? [single] : [{
        userId: options.targetUserId,
        status: 'active',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        totalOrders: 0,
        assignedLuckyNumbers: {}
      }];
    } else {
      targets = this.customerRegistry.getActiveCustomers();
    }

    // กรองลูกค้าที่เคยได้รับผลรางวัลของงวดนี้แล้ว เว้นแต่ระบุ force
    if (!options.force && !options.targetUserId) {
      targets = targets.filter(c => c.lastDrawResultSent !== drawDate);
    }

    if (targets.length === 0) {
      console.log(`[CAMPAIGN RESULTS] ลูกค้าทุกคนได้รับผลรางวัลงวด ${drawDate} เรียบร้อยแล้ว`);
      return {
        campaignType: 'draw-results',
        drawDate,
        totalTarget: 0,
        sentCount: 0,
        failedCount: 0,
        dryRun: isDryRun,
        timestamp: new Date().toISOString()
      };
    }

    const flexMsg = FlexMessageBuilder.buildDrawResultsMessage(lotteryData);
    console.log(`[CAMPAIGN RESULTS] 🏆 เริ่มส่งผลรางวัลสลาก N3 ให้ลูกค้า (${targets.length} ราย | dryRun=${isDryRun})`);

    let sentCount = 0;
    let failedCount = 0;

    for (const customer of targets) {
      try {
        if (!isDryRun) {
          const success = await this.lineHandler.push(customer.userId, [flexMsg]);
          if (success) {
            sentCount++;
            this.customerRegistry.recordDrawResultSent(customer.userId, drawDate);
          } else {
            failedCount++;
          }
          await new Promise(r => setTimeout(r, 100));
        } else {
          sentCount++;
        }
      } catch (e) {
        console.error(`[CAMPAIGN RESULTS ERROR] ส่งให้ ${customer.userId} ล้มเหลว:`, e);
        failedCount++;
      }
    }

    if (!isDryRun && !options.targetUserId) {
      this.lastResultsDateSent = drawDate;
    }

    console.log(`[CAMPAIGN RESULTS DONE] สำเร็จ: ${sentCount}, ล้มเหลว: ${failedCount}`);

    return {
      campaignType: 'draw-results',
      drawDate,
      totalTarget: targets.length,
      sentCount,
      failedCount,
      dryRun: isDryRun,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 3. เริ่มระบบตรวจจับเวลาและส่งแคมเปญอัตโนมัติ (Background Scheduler)
   */
  public startAutoScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
    }

    console.log('[CAMPAIGN SCHEDULER] ⏰ เริ่มการทำงานของระบบส่งผลและเลขมงคลอัตโนมัติ (ตรวจสอบทุก 15 นาที)');

    // ตรวจสอบทุก 15 นาที
    this.schedulerTimer = setInterval(async () => {
      try {
        await this.checkAndRunScheduledCampaigns();
      } catch (err) {
        console.error('[CAMPAIGN SCHEDULER ERROR] เกิดข้อผิดพลาดระหว่างตรวจสอบตารางเวลา:', err);
      }
    }, 15 * 60 * 1000);

    // รันตรวจสอบครั้งแรกแบบ background
    setTimeout(() => {
      this.checkAndRunScheduledCampaigns().catch(e => console.error(e));
    }, 5000);
  }

  /**
   * ตรวจสอบเงื่อนไขวันและเวลา เพื่อส่งแคมเปญโดยอัตโนมัติ
   */
  public async checkAndRunScheduledCampaigns(nowOverride?: Date): Promise<void> {
    const now = nowOverride || new Date();
    // ใช้ snapshot เวลาไทยเดียวกันทั้งการตรวจวันและช่วงเวลาส่ง
    const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const thaiHour = bangkokNow.getUTCHours();
    const thaiMinute = bangkokNow.getUTCMinutes();
    const todayYMD = `${bangkokNow.getUTCFullYear()}-${String(bangkokNow.getUTCMonth() + 1).padStart(2, '0')}-${String(bangkokNow.getUTCDate()).padStart(2, '0')}`;

    const upcoming = this.getUpcomingDrawInfo(now);
    const isTodayDrawDay = upcoming.drawDate === todayYMD;

    // เงื่อนไขที่ 1: ช่วงเช้าของวันหวยออก (09:00 - 12:00 น.) -> ส่งเลขมงคลกระจายไม่ซ้ำ
    if (isTodayDrawDay && thaiHour >= 9 && thaiHour < 12) {
      if (this.lastTeaserDateSent !== todayYMD) {
        if (this.teaserAttemptDate !== todayYMD) {
          this.teaserAttemptDate = todayYMD;
          this.teaserAttemptCount = 0;
        }

        if (this.teaserAttemptCount < this.maxScheduledTeaserAttempts) {
          this.teaserAttemptCount++;
          console.log(`[AUTO CAMPAIGN] 🌟 วันนี้เป็นวันหวยออก (${todayYMD} เวลา ${thaiHour}:${thaiMinute} น.) -> ส่งเลขมงคล (รอบ ${this.teaserAttemptCount}/${this.maxScheduledTeaserAttempts})`);
          const result = await this.sendPersonalizedLuckyTeasers({ force: false, nowOverride: now });
          if (result.failedCount === 0) {
            this.lastTeaserDateSent = todayYMD;
          } else if (this.teaserAttemptCount >= this.maxScheduledTeaserAttempts) {
            this.lastTeaserDateSent = todayYMD;
            console.error(`[AUTO CAMPAIGN] ส่งเลขมงคลไม่ครบหลังลอง ${this.teaserAttemptCount} รอบ: สำเร็จ ${result.sentCount}, ล้มเหลว ${result.failedCount}`);
          } else {
            console.warn(`[AUTO CAMPAIGN] ส่งเลขมงคลไม่ครบ: สำเร็จ ${result.sentCount}, ล้มเหลว ${result.failedCount}; จะลองซ้ำในรอบ scheduler ถัดไป`);
          }
        }
      }
    }

    // เงื่อนไขที่ 2: ช่วงบ่ายหลังหวยออก (15:45 - 18:00 น.) -> ส่งผลรางวัลเมื่อผลออกครบ
    if (isTodayDrawDay && thaiHour >= 15 && thaiHour < 19) {
      if (this.lastResultsDateSent !== todayYMD) {
        const latest = this.getLatestLotteryData();
        // ตรวจสอบว่าผลรางวัลใน latest-lottery.json เป็นของวันนี้และสถานะเสร็จสมบูรณ์แล้ว
        if (latest && latest.drawDate === todayYMD && latest.status === 'completed') {
          console.log(`[AUTO CAMPAIGN] 🏆 ผลการออกรางวัลงวด ${todayYMD} พร้อมแล้ว -> เริ่มส่งผลรางวัลให้ลูกค้าทุกคน`);
          await this.broadcastDrawResults({ force: false });
        }
      }
    }
  }
}
