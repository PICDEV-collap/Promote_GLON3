export interface OrderTask {
  orderId: string;
  replyToken: string;
  userId: string;
  number: string;
  quantity: number;
  totalPrice: number;
  timestamp: number;
}

export type OrderWorkerFunction = (task: OrderTask) => Promise<void>;

export class OrderQueue {
  private queue: OrderTask[] = [];
  private isProcessing: boolean = false;
  private worker: OrderWorkerFunction | null = null;

  public setWorker(worker: OrderWorkerFunction) {
    this.worker = worker;
  }

  /**
   * นำคำสั่งซื้อเข้าคิว
   */
  public enqueue(task: OrderTask): number {
    this.queue.push(task);
    const queuePosition = this.queue.length;
    console.log(`[QUEUE] รับออเดอร์ ${task.orderId} เข้าคิว (ตำแหน่งที่ ${queuePosition}) | เลข ${task.number} x ${task.quantity} ใบ`);

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
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const currentTask = this.queue.shift();

    if (currentTask && this.worker) {
      const startTime = Date.now();
      try {
        console.log(`[QUEUE START] กำลังประมวลผลออเดอร์: ${currentTask.orderId} (เลข ${currentTask.number} x ${currentTask.quantity} ใบ)`);
        await this.worker(currentTask);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[QUEUE FINISHED] ออเดอร์ ${currentTask.orderId} เสร็จสิ้นใน ${elapsed} วินาที!`);
      } catch (error) {
        console.error(`[QUEUE ERROR] เกิดข้อผิดพลาดกับออเดอร์ ${currentTask.orderId}:`, error);
      }
    }

    // ประมวลผลรายการถัดไปต่อเนื่องทันที
    this.processNext();
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}
