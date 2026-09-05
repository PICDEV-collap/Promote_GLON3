import { LineReplyHandler } from '../line/reply-handler';
import { OrderTask } from './order-queue';

export type OrderStage = 'QUEUED' | 'PREPARING_NUMBERS' | 'GENERATING_QR';

export interface ProgressDetails {
  current: number;
  total: number;
  number?: string;
}

interface ActiveHeartbeat {
  task: OrderTask;
  stage: OrderStage;
  startedAt: number;
  intervalId: NodeJS.Timeout;
  getQueuePos?: () => number;
  progress?: ProgressDetails;
  tickCount: number;
}

export class OrderHeartbeatManager {
  private static instance: OrderHeartbeatManager | null = null;
  private activeHeartbeats: Map<string, ActiveHeartbeat> = new Map();
  private lineHandler: LineReplyHandler;
  private intervalMs: number = 20000; // 20 วินาที

  constructor(lineHandler?: LineReplyHandler, intervalMs: number = 20000) {
    this.lineHandler = lineHandler || new LineReplyHandler();
    this.intervalMs = intervalMs;
  }

  public static getInstance(lineHandler?: LineReplyHandler): OrderHeartbeatManager {
    if (!OrderHeartbeatManager.instance) {
      OrderHeartbeatManager.instance = new OrderHeartbeatManager(lineHandler);
    }
    return OrderHeartbeatManager.instance;
  }

  /**
   * เริ่มต้นการติดตามและส่งข้อความอัปเดตสถานะทุก 20 วินาที
   */
  public start(task: OrderTask, getQueuePos?: () => number): void {
    if (!task || !task.orderId || !task.userId || task.userId === 'anonymous') {
      return;
    }

    // หากมี Heartbeat เดิมของออเดอร์นี้อยู่ ให้เคลียร์ก่อน
    this.stop(task.orderId);

    const initialStage: OrderStage = (getQueuePos && getQueuePos() > 1) ? 'QUEUED' : 'PREPARING_NUMBERS';

    const intervalId = setInterval(async () => {
      await this.sendTickNotification(task.orderId);
    }, this.intervalMs);

    this.activeHeartbeats.set(task.orderId, {
      task,
      stage: initialStage,
      startedAt: Date.now(),
      intervalId,
      getQueuePos,
      progress: {
        current: 1,
        total: task.items && task.items.length > 0 ? task.items.length : 1,
        number: task.items && task.items.length > 0 ? task.items[0].number : task.number
      },
      tickCount: 0
    });

    console.log(`[HEARTBEAT] เริ่มต้นตัวติดตามสถานะทุก 20 วิ สำหรับออเดอร์ ${task.orderId} (สถานะเริ่มต้น: ${initialStage})`);
  }

  /**
   * ปรับปรุงสถานะปัจจุบันของการทำรายการ (เช่น เปลี่ยนจากรอคิวเป็นกำลังหยิบเลข หรือกำลังออก QR)
   */
  public updateStage(orderId: string, stage: OrderStage, progress?: ProgressDetails): void {
    const hb = this.activeHeartbeats.get(orderId);
    if (!hb) return;

    hb.stage = stage;
    if (progress) {
      hb.progress = progress;
    }

    console.log(`[HEARTBEAT] อัปเดตสถานะออเดอร์ ${orderId} -> ${stage}${progress ? ` (${progress.current}/${progress.total})` : ''}`);
  }

  /**
   * สร้างข้อความอัปเดตความคืบหน้าตามประเภทการรอจริง
   */
  public buildProgressMessage(hb: ActiveHeartbeat): string {
    const elapsedSec = Math.round((Date.now() - hb.startedAt) / 1000);

    switch (hb.stage) {
      case 'QUEUED': {
        const qPos = hb.getQueuePos ? hb.getQueuePos() : 1;
        return (
          `⏳ [สถานะคำสั่งซื้อ] อยู่ระหว่างรอคิว (ลำดับคิวที่ ${qPos})\n\n` +
          `ระบบกำลังดำเนินการคำสั่งซื้อก่อนหน้าให้อย่างเร่งด่วน เจ้าหน้าที่จะเริ่มจัดทำออเดอร์ของคุณทันที กรุณารอสักครู่นะครับ 🙏\n` +
          `⏱️ (รอมาแล้ว ~${elapsedSec} วินาที)`
        );
      }

      case 'PREPARING_NUMBERS': {
        const p = hb.progress;
        const detailStr = p && p.total > 1
          ? ` (กำลังทำรายการที่ ${p.current}/${p.total}${p.number ? `: เลข ${p.number}` : ''})`
          : (p?.number ? ` (เลข ${p.number})` : '');

        return (
          `🛒 [สถานะคำสั่งซื้อ] กำลังจัดเตรียมและบรรจุเลขสลากลงตะกร้า${detailStr}\n\n` +
          `ระบบกำลังค้นหาและหยิบสลากเข้าสู่ตะกร้าของคุณอย่างถูกต้องและปลอดภัย กรุณารอสักครู่นะครับ ⏱️\n` +
          `⏱️ (กำลังดำเนินการ ~${elapsedSec} วินาที)`
        );
      }

      case 'GENERATING_QR': {
        return (
          `⚡ [สถานะคำสั่งซื้อ] บรรจุสลากครบทุกรายการแล้ว\n\n` +
          `กำลังส่งคำขอสร้าง QR Code ชำระเงินจากระบบกองสลาก (GLO)... อีกสักครู่ระบบจะส่งภาพ QR Code ให้สแกนจ่ายผ่านเป๋าตังนะครับ 💰\n` +
          `⏱️ (กำลังออก QR Code ~${elapsedSec} วินาที)`
        );
      }

      default:
        return `⏳ [สถานะคำสั่งซื้อ] กำลังดำเนินการจัดเตรียมสลาก กรุณารอสักครู่นะครับ...`;
    }
  }

  /**
   * ยิงข้อความอัปเดตเมื่อครบเวลาในแต่ละ Interval
   */
  private async sendTickNotification(orderId: string): Promise<void> {
    const hb = this.activeHeartbeats.get(orderId);
    if (!hb) return;

    hb.tickCount++;
    const msgText = this.buildProgressMessage(hb);

    console.log(`[HEARTBEAT TICK #${hb.tickCount}] ส่งข้อความอัปเดตสถานะ (${hb.stage}) ให้ลูกค้า ${hb.task.userId} (ออเดอร์ ${orderId})`);

    try {
      // 1. ต่ออายุ Loading Animation ใน LINE
      await this.lineHandler.showLoading(hb.task.userId, 20).catch(() => {});

      // 2. ส่ง Push Message แจ้งสถานะ
      await this.lineHandler.push(hb.task.userId, [
        {
          type: 'text',
          text: msgText
        }
      ]);
    } catch (err) {
      console.warn(`[HEARTBEAT ERROR] ไม่สามารถส่งแจ้งเตือนให้ลูกค้า ${hb.task.userId} ได้:`, err);
    }
  }

  /**
   * หยุดการติดตามคำสั่งซื้อทันที (เรียกใช้เมื่อส่ง QR สำเร็จ หรือออเดอร์เสร็จสิ้น/ล้มเหลว)
   */
  public stop(orderId: string): void {
    const hb = this.activeHeartbeats.get(orderId);
    if (hb) {
      clearInterval(hb.intervalId);
      this.activeHeartbeats.delete(orderId);
      console.log(`[HEARTBEAT] ยุติการส่งข้อความติดตามสำหรับออเดอร์ ${orderId} เรียบร้อยแล้ว (ทำงานไป ${hb.tickCount} ครั้ง)`);
    }
  }

  /**
   * หยุดและเคลียร์ทุก Heartbeat ที่ค้างอยู่ (สำหรับ Graceful Shutdown)
   */
  public stopAll(): void {
    for (const [orderId, hb] of this.activeHeartbeats.entries()) {
      clearInterval(hb.intervalId);
      console.log(`[HEARTBEAT STOP ALL] ล้างตัวจับเวลาของออเดอร์ ${orderId}`);
    }
    this.activeHeartbeats.clear();
  }

  public getActiveCount(): number {
    return this.activeHeartbeats.size;
  }
}
