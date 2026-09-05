export interface OrderItem {
  number: string;
  quantity: number;
}

export interface OrderTask {
  orderId: string;
  replyToken: string;
  userId: string;
  items: OrderItem[];
  totalQuantity: number;
  totalPrice: number;
  timestamp: number;
  hasRepliedQueue?: boolean;
  // Backward compatibility
  number?: string;
  quantity?: number;
}

export type OrderWorkerFunction = (task: OrderTask) => Promise<void>;

export class OrderQueue {
  private queue: OrderTask[] = [];
  private isProcessing: boolean = false;
  private currentRunningTask: OrderTask | null = null;
  private worker: OrderWorkerFunction | null = null;

  public setWorker(worker: OrderWorkerFunction) {
    this.worker = worker;
    if (!this.isProcessing && this.queue.length > 0) {
      this.processNext();
    }
  }

  /**
   * ตรวจสอบว่าระบบกำลังประมวลผลคิวอยู่หรือไม่
   */
  public isBusy(): boolean {
    return this.isProcessing || this.queue.length > 0;
  }

  /**
   * คำนวณเวลารอโดยประมาณ (วินาที)
   */
  public getEstimatedWaitTime(position: number): number {
    // ประมาณการเฉลี่ย 8-10 วินาทีต่อออเดอร์
    return Math.max(8, position * 9);
  }

  /**
   * นำคำสั่งซื้อเข้าคิว
   */
  public enqueue(task: OrderTask): number {
    this.queue.push(task);
    // ตำแหน่งคิว = รายการที่รอในแถว + (หากมีตัวกำลังรันอยู่)
    const queuePosition = this.queue.length + (this.currentRunningTask ? 1 : 0);
    const summaryText = task.items && task.items.length > 0
      ? task.items.map(i => `${i.number}x${i.quantity}`).join(', ')
      : `${task.number} x ${task.quantity} ใบ`;
    console.log(`[QUEUE] รับออเดอร์ ${task.orderId} เข้าคิว (ลำดับที่ ${queuePosition}) | ${summaryText} (รวม ${task.totalQuantity || task.quantity} ใบ)`);

    // หากไม่ได้กำลังทำงานอยู่ ให้เริ่มประมวลผลทันที
    if (!this.isProcessing) {
      this.processNext();
    }

    return queuePosition;
  }

  /**
   * ประมวลผลคิวทีละรายการ (Single Concurrency FIFO)
   */
  private async processNext(): Promise<void> {
    if (this.queue.length === 0 || !this.worker) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const currentTask = this.queue.shift();
    this.currentRunningTask = currentTask || null;

    if (currentTask && this.worker) {
      const startTime = Date.now();
      try {
        const summaryText = currentTask.items && currentTask.items.length > 0
          ? currentTask.items.map(i => `${i.number}x${i.quantity}`).join(', ')
          : `${currentTask.number} x ${currentTask.quantity} ใบ`;
        console.log(`[QUEUE START] กำลังประมวลผลออเดอร์: ${currentTask.orderId} (${summaryText})`);
        await this.worker(currentTask);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[QUEUE FINISHED] ออเดอร์ ${currentTask.orderId} เสร็จสิ้นใน ${elapsed} วินาที!`);
      } catch (error) {
        console.error(`[QUEUE ERROR] เกิดข้อผิดพลาดกับออเดอร์ ${currentTask.orderId}:`, error);
      } finally {
        this.currentRunningTask = null;
      }
    }

    // ประมวลผลรายการถัดไปต่อเนื่องทันที
    this.processNext();
  }

  /**
   * ค้นหาลำดับคิวของออเดอร์ (1 = กำลังทำรายการอยู่ หรือ คิวแรกสุด)
   */
  public getPosition(orderId: string): number {
    if (this.currentRunningTask && this.currentRunningTask.orderId === orderId) {
      return 1;
    }
    const idx = this.queue.findIndex(t => t.orderId === orderId);
    if (idx !== -1) {
      return idx + 1 + (this.currentRunningTask ? 1 : 0);
    }
    return 1;
  }

  public getCurrentRunningTask(): OrderTask | null {
    return this.currentRunningTask;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}
