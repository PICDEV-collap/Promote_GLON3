import express, { Request, Response } from 'express';
import { Page, BrowserContext } from 'playwright';
import http from 'http';
import { CONFIG } from './config';
import { SecurityGuard } from './automation/security-guard';
import { N3Auth } from './automation/n3-auth';
import { N3OrderService } from './automation/n3-order';
import { PersistentBrowserManager } from './automation/browser-context';
import { QuotaManager } from './quota/quota-manager';
import { OrderQueue, OrderTask } from './queue/order-queue';
import { LineReplyHandler } from './line/reply-handler';
import { FlexMessageBuilder } from './line/flex-message';
import { OperatingHoursGuard } from './guard/operating-hours';

const app = express();
app.use(express.json());

// เสิร์ฟรูปภาพ QR Code ผ่าน Static Route
app.use('/qrcodes', express.static(CONFIG.QR_OUTPUT_DIR));

// เริ่มต้นระบบหลัก
const quotaManager = new QuotaManager();
const orderQueue = new OrderQueue();
const lineHandler = new LineReplyHandler();
const securityGuard = new SecurityGuard();

let context: BrowserContext | null = null;
let page: Page | null = null;
let isLoggingIn: boolean = false;
let currentPublicBaseUrl: string = CONFIG.BASE_URL;

/**
 * ฟังก์ชันเปิดเบราว์เซอร์เฉพาะเมื่อมีงานเข้ามาจริง (On-Demand) ไม่เปิดค้างทิ้งไว้เบื้องหลัง
 */
async function ensureBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  if (!context || !page) {
    console.log('[BOT ENGINE] กำลังเปิดหน้าต่าง Google Chrome...');
    const res = await PersistentBrowserManager.getPage(false); // เปิดแบบแสดงหน้าต่างปกติ (Headed Mode)
    context = res.context;
    page = res.page;
    securityGuard.attachToPage(page);
    console.log('[BOT ENGINE] Google Chrome พร้อมทำงานเรียบร้อยแล้ว');
  }
  return { context, page };
}

/**
 * ฟังก์ชันสร้างและส่ง QR Login เป๋าตังให้ "ผู้ดูแลระบบ (ADMIN)" เท่านั้น!
 */
async function triggerAdminLoginQR(reason: string, replyToken?: string): Promise<void> {
  if (isLoggingIn) return;
  isLoggingIn = true;

  try {
    const { page: currentPage, context: currentContext } = await ensureBrowser();

    console.log(`[ADMIN AUTH] ${reason} -> กำลังสร้าง QR Login ส่งให้แอดมิน...`);
    const { qrImagePath } = await N3Auth.generatePaotangLoginQR(currentPage);
    const qrFileName = qrImagePath.split(/[\/\\]/).pop();
    const qrPublicUrl = `${currentPublicBaseUrl}/qrcodes/${qrFileName}`;

    const adminMessages: any[] = [
      {
        type: 'text',
        text: `⚠️ [แจ้งเตือนแอดมิน] ${reason}\n\nกรุณาเปิดแอป "เป๋าตัง" แล้วสแกน QR Code นี้ภายใน 5 นาที เพื่อเข้าสู่ระบบตัวแทน N3:`
      },
      {
        type: 'image',
        originalContentUrl: qrPublicUrl,
        previewImageUrl: qrPublicUrl
      }
    ];

    // ส่งภาพ QR Code ตอบกลับในแชททันที
    if (replyToken) {
      await lineHandler.reply(replyToken, adminMessages);
    } else {
      await lineHandler.pushToAdmin(adminMessages);
    }

    console.log('[ADMIN AUTH] ส่งภาพ QR เข้า LINE แอดมินเรียบร้อยแล้ว กำลังรอสแกน...');

    const success = await N3Auth.waitForAdminScan(currentPage, currentContext);
    if (success) {
      await lineHandler.pushToAdmin([
        { type: 'text', text: '✅ ล็อกอินเข้าสู่ระบบ N3 สำเร็จแล้ว! ระบบพร้อมประมวลผลออเดอร์ลูกค้าอัตโนมัติแล้วครับ 🎉' }
      ]);
      console.log('[BROWSER READY] ล็อกอินสำเร็จ หน้าต่าง Chrome พร้อมรับคำสั่งซื้อทันที');
    } else {
      // หากหมดเวลาหรือไม่สำเร็จ ให้ปิดหน้าต่างเบราว์เซอร์
      await PersistentBrowserManager.close();
      context = null;
      page = null;
    }
  } catch (err) {
    console.error('[ADMIN AUTH ERROR]', err);
    await PersistentBrowserManager.close();
    context = null;
    page = null;
  } finally {
    isLoggingIn = false;
  }
}

/**
 * ตั้งค่า Worker สำหรับประมวลผลคำสั่งซื้อในคิว
 */
orderQueue.setWorker(async (task: OrderTask) => {
  const { page: currentPage } = await ensureBrowser();

  try {
    // ฟังก์ชันช่วยส่งข้อความหาลูกค้า (หากเคยตอบแจ้งคิวไปแล้วจะใช้ Push Message)
    const sendCustomerMessage = async (messages: any[]) => {
      if (task.hasRepliedQueue) {
        await lineHandler.push(task.userId, messages);
      } else {
        await lineHandler.reply(task.replyToken, messages);
      }
    };

    // 1. ตรวจสอบเวลาจำหน่ายอีกครั้งก่อนประมวลผล
    const timeStatus = OperatingHoursGuard.checkSalesStatus();
    if (!timeStatus.isOpen) {
      await sendCustomerMessage([
        FlexMessageBuilder.buildOutsideOperatingHoursMessage(timeStatus)
      ]);
      return;
    }

    // 2. ตรวจสอบโควต้า
    const quotaCheck = quotaManager.canFulfill(task.quantity);
    if (!quotaCheck.allowed) {
      await sendCustomerMessage([
        FlexMessageBuilder.buildQuotaExceededMessage(quotaCheck.remaining)
      ]);
      return;
    }

    // 3. ตรวจสอบสถานะล็อกอิน N3
    const isLoggedIn = await N3Auth.isSessionValid(currentPage);
    if (!isLoggedIn) {
      console.warn('[ORDER BLOCKED] บอทยังไม่ได้ล็อกอินตัวแทน N3 หรือ Session หมดอายุ!');
      
      await sendCustomerMessage([
        {
          type: 'text',
          text: 'ขออภัยครับ ขณะนี้ระบบร้านค้าสลากกำลังเตรียมความพร้อมเข้าระบบ กรุณารอสักครู่แล้วสั่งซื้อใหม่อีกครั้งครับ 🙏'
        }
      ]);

      triggerAdminLoginQR(`มีลูกค้าสั่งซื้อเลข ${task.number} จำนวน ${task.quantity} ใบ แต่ระบบยังไม่ได้ล็อกอิน`);
      return;
    }

    // 4. สั่งซื้อบนเว็บ N3
    const result = await N3OrderService.executeOrder(currentPage, task.number, task.quantity);

    if (result.success && result.qrImageUrl) {
      quotaManager.deductQuota(task.quantity);

      const qrPublicUrl = result.qrImageUrl.replace(CONFIG.BASE_URL, currentPublicBaseUrl);

      const flexMsg = FlexMessageBuilder.buildPaymentQRMessage(
        qrPublicUrl,
        task.number,
        task.quantity,
        task.totalPrice,
        10
      );

      await sendCustomerMessage([flexMsg]);
      console.log(`[SUCCESS] ส่ง QR Code ชำระเงินให้ลูกค้า ${task.userId} เรียบร้อยแล้ว (ทาง ${task.hasRepliedQueue ? 'Push' : 'Reply'})`);
    } else {
      await sendCustomerMessage([
        {
          type: 'text',
          text: `ขออภัยครับ เกิดข้อผิดพลาดขณะสั่งซื้อเลข ${task.number}: ${result.error || 'กรุณาลองใหม่อีกครั้ง'}`
        }
      ]);
    }
  } catch (err: any) {
    console.error('[WORKER EXCEPTION]', err);
    if (task.hasRepliedQueue) {
      await lineHandler.push(task.userId, [
        { type: 'text', text: 'ขออภัยครับ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลังครับ' }
      ]);
    } else {
      await lineHandler.reply(task.replyToken, [
        { type: 'text', text: 'ขออภัยครับ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลังครับ' }
      ]);
    }
  }
});

/**
 * ฟังก์ชันแกะข้อความสั่งซื้อ
 */
export function parseOrderMessage(text: string): { number: string; quantity: number } | null {
  if (!text) return null;
  const clean = text.trim();

  const match = clean.match(/(?:สั่ง\s*)?(\b\d{3}\b)(?:[\s=\-xX*\/,]*([0-9]+)\s*(?:ใบ)?)?/);
  if (match) {
    const number = match[1];
    const quantity = match[2] ? parseInt(match[2], 10) : 1;
    if (quantity > 0 && quantity <= 100) {
      return { number, quantity };
    }
  }
  return null;
}

/**
 * LINE Webhook Endpoint
 */
app.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  res.status(200).send('OK');

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  if (host && !host.toString().includes('localhost')) {
    currentPublicBaseUrl = `${proto}://${host}`;
  }

  const events = req.body?.events || [];
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userText: string = event.message.text.trim();
      const replyToken: string = event.replyToken;
      const userId: string = event.source?.userId || 'anonymous';
      const adminId = CONFIG.LINE_ADMIN_USER_ID || CONFIG.ADMIN_LINE_USER_ID;
      const isAdmin: boolean = !!(adminId && userId === adminId);

      console.log(`[USER MESSAGE] "${userText}" จาก ${userId} | AdminID=${adminId} | (isAdmin: ${isAdmin})`);

      // คำสั่งพิเศษ: ดู User ID ตัวเอง
      const lower = userText.toLowerCase();
      if (lower === 'myid' || lower === 'id') {
        await lineHandler.reply(replyToken, [
          { type: 'text', text: `👤 LINE User ID ของคุณคือ:\n${userId}\n\nสถานะ: ${isAdmin ? '✅ แอดมิน (Admin)' : 'ลูกค้าทั่วไป'}` }
        ]);
        continue;
      }

      // 1. ตรวจสอบคำสั่งล็อกอิน Admin (ครอบคลุม Q, q, qr, QR, login, ล็อกอิน ทุกรูปแบบ)
      const isAdminLoginCmd = /^(?:q|qr|qrcode|qr\s*code|login|log\s*in|signin|ล็อกอิน|คิว|ขอคิว|ขอ\s*qr)$/i.test(userText);
      if (isAdminLoginCmd) {
        if (isAdmin) {
          triggerAdminLoginQR('แอดมินสั่งขอรับ QR Code เข้าสู่ระบบเป๋าตัง', replyToken);
        } else {
          // ถ้าไม่ใช่ Admin: ห้ามส่ง QR เด็ดขาด! ส่งการ์ดแนะนำวิธีสั่งซื้อแทน
          console.warn(`[SECURITY] ผู้ใช้ทั่วไป ${userId} พยายามสั่ง ${userText} -> ปฏิเสธและส่งวิธีสั่งซื้อ`);
          await lineHandler.reply(replyToken, [FlexMessageBuilder.buildHowToOrderMessage()]);
        }
        continue;
      }

      // 2. แกะคำสั่งซื้อสลาก
      const parsed = parseOrderMessage(userText);
      if (!parsed) {
        await lineHandler.reply(replyToken, [FlexMessageBuilder.buildHowToOrderMessage()]);
        continue;
      }

      console.log(`[ORDER DETECTED] เลข: ${parsed.number} | จำนวน: ${parsed.quantity} ใบ`);

      // 3. ตรวจสอบระเบียบเวลาจำหน่ายสลาก N3
      const salesStatus = OperatingHoursGuard.checkSalesStatus();
      if (!salesStatus.isOpen) {
        console.warn(`[TIME BLOCKED] ไม่อยู่ในเวลาจำหน่ายสลาก: ${salesStatus.reason}`);
        await lineHandler.reply(replyToken, [
          FlexMessageBuilder.buildOutsideOperatingHoursMessage(salesStatus)
        ]);
        continue;
      }

      // 4. ตรวจสอบโควต้า
      const quotaCheck = quotaManager.canFulfill(parsed.quantity);
      if (!quotaCheck.allowed) {
        await lineHandler.reply(replyToken, [
          FlexMessageBuilder.buildQuotaExceededMessage(quotaCheck.remaining)
        ]);
        continue;
      }

      // 5. นำเข้าคิวสั่งซื้อ & แจ้งเตือนลูกค้าหากมีคิวรอ
      const isQueueBusy = orderQueue.isBusy();

      const orderTask: OrderTask = {
        orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        replyToken,
        userId,
        number: parsed.number,
        quantity: parsed.quantity,
        totalPrice: parsed.quantity * 20,
        timestamp: Date.now(),
        hasRepliedQueue: false
      };

      if (isQueueBusy) {
        // หากมีคิวรออยู่: ส่งการ์ดแจ้งลำดับคิวและเวลารอโดยประมาณทันที เพื่อให้ลูกค้าสบายใจ
        const queuePos = orderQueue.enqueue(orderTask);
        const estSeconds = orderQueue.getEstimatedWaitTime(queuePos);
        orderTask.hasRepliedQueue = true;

        console.log(`[QUEUE NOTIFY] คิวกำลังทำงาน! ส่งการ์ดแจ้งคิวที่ ${queuePos} (รอ ~${estSeconds} วิ) ให้ลูกค้า ${userId}`);
        await lineHandler.reply(replyToken, [
          FlexMessageBuilder.buildQueueStatusMessage(queuePos, estSeconds, parsed.number, parsed.quantity)
        ]);
      } else {
        // ไม่มีคิว: นำเข้าคิวและบอทจะส่ง QR ทันที
        orderQueue.enqueue(orderTask);
      }
    }
  }
});

app.post('/admin/login-qr', async (_req: Request, res: Response) => {
  triggerAdminLoginQR('เรียกผ่าน API Admin');
  res.json({ success: true, message: 'กำลังส่งภาพ QR Login เข้า LINE แอดมิน' });
});

app.get('/admin/quota', (_req: Request, res: Response) => {
  res.json(quotaManager.getStatus());
});

app.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    queueLength: orderQueue.getQueueLength(),
    quota: quotaManager.getStatus(),
    salesHours: OperatingHoursGuard.checkSalesStatus()
  });
});

function startServerWithPort(targetPort: number) {
  const server = http.createServer(app);

  server.listen(targetPort, () => {
    console.log(`====================================================`);
    console.log(`🚀 N3 Order Bot Service รันอยู่ที่: http://localhost:${targetPort}`);
    console.log(`🎫 โควต้าคงเหลือ: ${quotaManager.getStatus().remainingQuota} / 2,000 ใบ`);
    const status = OperatingHoursGuard.checkSalesStatus();
    console.log(`⏰ สถานะเวลาจำหน่าย: ${status.isOpen ? 'เปิดจำหน่าย' : 'ปิดจำหน่าย'} (${status.currentHoursText})`);
    console.log(`👤 Admin LINE User ID: ${CONFIG.ADMIN_LINE_USER_ID || '(ว่าง)'}`);
    console.log(`🔮 ลิงก์ทำนายฝัน: ${CONFIG.DREAM_PREDICTION_URL}`);
    console.log(`💡 เบราว์เซอร์: On-Demand (เปิดเมื่อมีงานและปิดทันทีเมื่อเสร็จ)`);
    console.log(`====================================================`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[PORT WARNING] พอร์ต ${targetPort} ไม่ว่าง กำลังสลับพอร์ต...`);
      startServerWithPort(targetPort + 1);
    }
  });
}

startServerWithPort(CONFIG.PORT);
