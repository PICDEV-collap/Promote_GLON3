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
 * เริ่มต้นเบราว์เซอร์ Playwright ด้วย Persistent Context (จำ Session ถาวร)
 */
async function initBrowser() {
  console.log('[BOT ENGINE] กำลังเปิด Persistent Browser...');
  const res = await PersistentBrowserManager.getPage(false);
  context = res.context;
  page = res.page;
  securityGuard.attachToPage(page);
  console.log('[BOT ENGINE] Persistent Browser พร้อมทำงานเรียบร้อยแล้ว');
}

/**
 * ฟังก์ชันสร้างและส่ง QR Login เป๋าตังให้ "ผู้ดูแลระบบ (ADMIN)" เท่านั้น!
 */
async function triggerAdminLoginQR(reason: string): Promise<void> {
  if (isLoggingIn || !page || !context) return;
  isLoggingIn = true;

  try {
    console.log(`[ADMIN AUTH] ${reason} -> กำลังสร้าง QR Login ส่งให้แอดมิน...`);
    const { qrImagePath } = await N3Auth.generatePaotangLoginQR(page);
    const qrFileName = qrImagePath.split(/[\/\\]/).pop();
    const qrPublicUrl = `${currentPublicBaseUrl}/qrcodes/${qrFileName}`;

    // ส่งเข้าแชทส่วนตัวของ Admin เท่านั้น
    await lineHandler.pushToAdmin([
      {
        type: 'text',
        text: `⚠️ [แจ้งเตือนแอดมิน] ${reason}\n\nกรุณาเปิดแอป "เป๋าตัง" แล้วสแกน QR Code นี้ภายใน 5 นาที เพื่อเข้าสู่ระบบตัวแทน N3:`
      },
      {
        type: 'image',
        originalContentUrl: qrPublicUrl,
        previewImageUrl: qrPublicUrl
      }
    ]);

    console.log('[ADMIN AUTH] ส่งภาพ QR เข้า LINE แอดมินเรียบร้อยแล้ว กำลังรอสแกน...');

    const success = await N3Auth.waitForAdminScan(page, context);
    if (success) {
      await lineHandler.pushToAdmin([
        { type: 'text', text: '✅ ล็อกอินเข้าสู่ระบบ N3 สำเร็จแล้ว! ระบบพร้อมประมวลผลออเดอร์ลูกค้าอัตโนมัติแล้วครับ 🎉' }
      ]);
    }
  } catch (err) {
    console.error('[ADMIN AUTH ERROR]', err);
  } finally {
    isLoggingIn = false;
  }
}

/**
 * ตั้งค่า Worker สำหรับประมวลผลคำสั่งซื้อในคิว
 */
orderQueue.setWorker(async (task: OrderTask) => {
  if (!page) {
    await initBrowser();
  }

  try {
    // 1. ตรวจสอบเวลาจำหน่ายอีกครั้งก่อนประมวลผล
    const timeStatus = OperatingHoursGuard.checkSalesStatus();
    if (!timeStatus.isOpen) {
      await lineHandler.reply(task.replyToken, [
        FlexMessageBuilder.buildOutsideOperatingHoursMessage(timeStatus)
      ]);
      return;
    }

    // 2. ตรวจสอบโควต้า
    const quotaCheck = quotaManager.canFulfill(task.quantity);
    if (!quotaCheck.allowed) {
      await lineHandler.reply(task.replyToken, [
        FlexMessageBuilder.buildQuotaExceededMessage(quotaCheck.remaining)
      ]);
      return;
    }

    // 3. ตรวจสอบสถานะล็อกอิน N3
    const isLoggedIn = await N3Auth.isSessionValid(page!);
    if (!isLoggedIn) {
      console.warn('[ORDER BLOCKED] บอทยังไม่ได้ล็อกอินตัวแทน N3 หรือ Session หมดอายุ!');
      
      await lineHandler.reply(task.replyToken, [
        {
          type: 'text',
          text: 'ขออภัยครับ ขณะนี้ระบบร้านค้าสลากกำลังเตรียมความพร้อมเข้าระบบ กรุณารอสักครู่แล้วสั่งซื้อใหม่อีกครั้งครับ 🙏'
        }
      ]);

      triggerAdminLoginQR(`มีลูกค้าสั่งซื้อเลข ${task.number} จำนวน ${task.quantity} ใบ แต่ระบบยังไม่ได้ล็อกอิน`);
      return;
    }

    // 4. สั่งซื้อบนเว็บ N3
    const result = await N3OrderService.executeOrder(page!, task.number, task.quantity);

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

      await lineHandler.reply(task.replyToken, [flexMsg]);
      console.log(`[SUCCESS] ส่ง QR Code ชำระเงินให้ลูกค้า ${task.userId} เรียบร้อยแล้ว`);
    } else {
      await lineHandler.reply(task.replyToken, [
        {
          type: 'text',
          text: `ขออภัยครับ เกิดข้อผิดพลาดขณะสั่งซื้อเลข ${task.number}: ${result.error || 'กรุณาลองใหม่อีกครั้ง'}`
        }
      ]);
    }
  } catch (err: any) {
    console.error('[WORKER EXCEPTION]', err);
    await lineHandler.reply(task.replyToken, [
      { type: 'text', text: 'ขออภัยครับ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลังครับ' }
    ]);
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

      // 1. ตรวจสอบคำสั่งล็อกอิน Admin
      if (lower === 'login' || lower === 'ล็อกอิน' || lower === 'qr') {
        if (isAdmin) {
          triggerAdminLoginQR('แอดมินสั่งขอรับ QR Code เข้าสู่ระบบเป๋าตัง');
          await lineHandler.reply(replyToken, [
            { type: 'text', text: 'กำลังสร้างและส่ง QR Code สำหรับล็อกอินเป๋าตังให้แอดมิน รอสักครู่ครับ...' }
          ]);
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

      // 5. นำเข้าคิวสั่งซื้อ
      const orderTask: OrderTask = {
        orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        replyToken,
        userId,
        number: parsed.number,
        quantity: parsed.quantity,
        totalPrice: parsed.quantity * 20,
        timestamp: Date.now()
      };

      orderQueue.enqueue(orderTask);
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

  server.listen(targetPort, async () => {
    console.log(`====================================================`);
    console.log(`🚀 N3 Order Bot Service รันอยู่ที่: http://localhost:${targetPort}`);
    console.log(`🎫 โควต้าคงเหลือ: ${quotaManager.getStatus().remainingQuota} / 2,000 ใบ`);
    const status = OperatingHoursGuard.checkSalesStatus();
    console.log(`⏰ สถานะเวลาจำหน่าย: ${status.isOpen ? 'เปิดจำหน่าย' : 'ปิดจำหน่าย'} (${status.currentHoursText})`);
    console.log(`👤 Admin LINE User ID: ${CONFIG.ADMIN_LINE_USER_ID || '(ว่าง)'}`);
    console.log(`🔮 ลิงก์ทำนายฝัน: ${CONFIG.DREAM_PREDICTION_URL}`);
    console.log(`====================================================`);

    await initBrowser();
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[PORT WARNING] พอร์ต ${targetPort} ไม่ว่าง กำลังสลับพอร์ต...`);
      startServerWithPort(targetPort + 1);
    }
  });
}

startServerWithPort(CONFIG.PORT);
