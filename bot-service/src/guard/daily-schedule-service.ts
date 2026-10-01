import { LineReplyHandler, getThaiTime } from '../line/reply-handler';
import { N3Auth } from '../automation/n3-auth';
import { PersistentBrowserManager } from '../automation/browser-context';
import { OrderQueue } from '../queue/order-queue';
import { GloSessionWatchdog } from './session-watchdog';
import { Page } from 'playwright';

export class DailyScheduleService {
  private static instance: DailyScheduleService | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lineHandler: LineReplyHandler;
  private orderQueue: OrderQueue | null = null;

  // Idempotency tracking to ensure each notification/action runs only once per day
  private lastNightlyCloseDate: string | null = null;
  private lastMorningAlertDate: string | null = null;

  private constructor(lineHandler: LineReplyHandler, orderQueue?: OrderQueue) {
    this.lineHandler = lineHandler;
    this.orderQueue = orderQueue || null;
  }

  public static getInstance(lineHandler?: LineReplyHandler, orderQueue?: OrderQueue): DailyScheduleService {
    if (!DailyScheduleService.instance) {
      DailyScheduleService.instance = new DailyScheduleService(
        lineHandler || new LineReplyHandler(),
        orderQueue
      );
    } else {
      if (lineHandler) DailyScheduleService.instance.lineHandler = lineHandler;
      if (orderQueue) DailyScheduleService.instance.orderQueue = orderQueue;
    }
    return DailyScheduleService.instance;
  }

  /**
   * เริ่มต้นการทำงานของ Background Scheduler ตรวจสอบเวลาทุก 30 วินาที
   */
  public start(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    console.log('[DAILY SCHEDULE] ⏰ เริ่มต้นระบบแจ้งปิดร้านประจำวัน (23:00 น.) และแจ้งเตือนเปิดร้าน (06:00 น.) โดยไม่สั่ง Logoff');

    // ตรวจสอบทุก 30 วินาที
    this.timer = setInterval(async () => {
      try {
        await this.checkSchedule();
      } catch (err) {
        console.error('[DAILY SCHEDULE ERROR] เกิดข้อผิดพลาดระหว่างตรวจสอบตารางเวลาประจำวัน:', err);
      }
    }, 30000);
    this.timer.unref();

    // รันตรวจสอบครั้งแรกหลังเริ่มทำงาน 3 วินาที
    setTimeout(() => {
      this.checkSchedule().catch(e => console.error(e));
    }, 3000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * ตรวจสอบเวลาแจ้งปิดร้านและแจ้งเตือนเปิดร้าน โดยไม่สั่ง Logoff หรือเคลียร์เซสชัน
   */
  public async checkSchedule(dateObj?: Date): Promise<{ triggeredNightlyClose: boolean; triggeredMorningAlert: boolean }> {
    const now = dateObj || new Date();
    // แปลงเป็นเวลาประเทศไทย (Asia/Bangkok)
    const bkkDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));

    const year = bkkDate.getFullYear();
    const month = String(bkkDate.getMonth() + 1).padStart(2, '0');
    const day = String(bkkDate.getDate()).padStart(2, '0');
    const todayYMD = `${year}-${month}-${day}`;

    const hours = bkkDate.getHours();
    const minutes = bkkDate.getMinutes();

    let triggeredNightlyClose = false;
    let triggeredMorningAlert = false;

    // 1. เงื่อนไขเวลา 23:00 น. แจ้งปิดร้าน แต่ปล่อยให้ GLO จัดการอายุเซสชันเอง
    if (hours === 23 && this.lastNightlyCloseDate !== todayYMD) {
      this.lastNightlyCloseDate = todayYMD;
      triggeredNightlyClose = true;
      console.log(`[DAILY SCHEDULE] 🌙 ถึงเวลา 23:00 น. ประจำวันที่ ${todayYMD} (เวลา ${hours}:${String(minutes).padStart(2, '0')} น.) -> แจ้งปิดร้านโดยรักษาเซสชันไว้`);

      // รอให้ออเดอร์ที่กำลังประมวลผลอยู่เสร็จสิ้น (ถ้ามี)
      if (this.orderQueue && this.orderQueue.isBusy()) {
        console.log('[DAILY SCHEDULE] ⏳ มีออเดอร์กำลังประมวลผลอยู่ กำลังรอให้เสร็จสิ้นก่อนส่งแจ้งปิดร้าน...');
        let waitAttempts = 0;
        while (this.orderQueue.isBusy() && waitAttempts < 20) {
          await new Promise(r => setTimeout(r, 1500));
          waitAttempts++;
        }
      }

      // ไม่สั่ง Logoff ไม่ล้าง Cookie/Storage และไม่เปลี่ยนหน้า Login ให้ GLO หมดอายุเซสชันตามระบบเอง
      console.log('[DAILY SCHEDULE] 🔒 แจ้งปิดร้านแล้ว คงเซสชัน GLO ไว้ และปล่อยให้ระบบจัดการเวลาหมดอายุเอง');

      // ส่งข้อความแจ้งเตือนแอดมินทาง LINE
      try {
        const timeStr = getThaiTime(now);
        await this.lineHandler.notifyNightlyClose(timeStr);
        console.log('[DAILY SCHEDULE] ✅ ส่งข้อความแจ้งเตือน 23:00 ปิดร้านประจำวันให้แอดมินสำเร็จ');
      } catch (notifyErr) {
        console.error('[DAILY SCHEDULE NOTIFY ERROR] ไม่สามารถส่งแจ้งเตือน 23:00 ได้:', notifyErr);
      }
    }

    // 2. เงื่อนไขเวลา 06:00 น. (เปิดระบบจำหน่ายสลากประจำวัน & แจ้งเตือนเตรียม Login)
    if (hours === 6 && this.lastMorningAlertDate !== todayYMD) {
      this.lastMorningAlertDate = todayYMD;
      triggeredMorningAlert = true;
      console.log(`[DAILY SCHEDULE] ☀️ ถึงเวลา 06:00 น. ประจำวันที่ ${todayYMD} (เวลา ${hours}:${String(minutes).padStart(2, '0')} น.) -> ส่งข้อความแจ้งเตือนเปิดระบบจำหน่ายสลาก`);

      try {
        const timeStr = getThaiTime(now);
        await this.lineHandler.notifyMorningStoreOpen(timeStr);
        console.log('[DAILY SCHEDULE] ✅ ส่งข้อความแจ้งเตือน 06:00 เปิดร้านให้แอดมินสำเร็จ');
      } catch (notifyErr) {
        console.error('[DAILY SCHEDULE NOTIFY ERROR] ไม่สามารถส่งแจ้งเตือน 06:00 ได้:', notifyErr);
      }

      // เมื่อ scheduler ทำงานจริง (ไม่มี date override) ให้ตรวจเซสชันรอบแรกตอน 06:00 น.
      // การจำลองเวลาใน unit test ต้องไม่เรียก watchdog กับ browser จริง
      if (!dateObj) {
        try {
          GloSessionWatchdog.getInstance().checkNow().catch(err => {
            console.warn('[DAILY SCHEDULE] ตรวจสอบเซสชันรอบเปิดร้าน 06:00 น. ล่าช้า:', err?.message);
          });
        } catch {}
      }
    }

    return { triggeredNightlyClose, triggeredMorningAlert };
  }

  // Getters for testing and inspection
  public getLastNightlyCloseDate(): string | null {
    return this.lastNightlyCloseDate;
  }

  public getLastMorningAlertDate(): string | null {
    return this.lastMorningAlertDate;
  }

  public resetTrackingForTest(): void {
    this.lastNightlyCloseDate = null;
    this.lastMorningAlertDate = null;
  }
}
