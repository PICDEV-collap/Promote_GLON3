import express, { Request, Response } from 'express';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import http from 'http';
import { CONFIG } from './config';
import { SecurityGuard } from './automation/security-guard';
import { N3Auth } from './automation/n3-auth';
import { N3OrderService } from './automation/n3-order';
import { QuotaManager } from './quota/quota-manager';
import { OrderQueue, OrderTask } from './queue/order-queue';
import { LineReplyHandler } from './line/reply-handler';
import { FlexMessageBuilder } from './line/flex-message';

const app = express();
app.use(express.json());

// เสิร์ฟรูปภาพ QR Code ชั่วคราวผ่าน Static Route
app.use('/qrcodes', express.static(CONFIG.QR_OUTPUT_DIR));

// เริ่มต้นระบบหลัก
const quotaManager = new QuotaManager();
const orderQueue = new OrderQueue();
const lineHandler = new LineReplyHandler();
const securityGuard = new SecurityGuard();

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

/**
 * เริ่มต้นเบราว์เซอร์ Playwright พร้อม Persistent Storage State
 */
async function initBrowser() {
  console.log('[BOT ENGINE] กำลังเปิด Browser Context...');
  browser = await chromium.launch({ headless: true });

  const hasStorageState = fs.existsSync(CONFIG.SESSION_STORAGE_PATH);
  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: hasStorageState ? CONFIG.SESSION_STORAGE_PATH : undefined
  });

  page = await context.newPage();
  securityGuard.attachToPage(page);

  console.log(`[BOT ENGINE] Browser พร้อมทำงาน (Session Saved: ${hasStorageState})`);
}

/**
 * ตั้งค่า Worker สำหรับประมวลผลคำสั่งซื้อในคิว
 */
orderQueue.setWorker(async (task: OrderTask) => {
  if (!page) {
    await initBrowser();
  }

  try {
    // 1. ตรวจสอบโควต้าอีกครั้งเพื่อความปลอดภัย
    const quotaCheck = quotaManager.canFulfill(task.quantity);
    if (!quotaCheck.allowed) {
      await lineHandler.reply(task.replyToken, [
        FlexMessageBuilder.buildQuotaExceededMessage(quotaCheck.remaining)
      ]);
      return;
    }

    // 2. สั่งซื้อบนเว็บ N3
    const result = await N3OrderService.executeOrder(page!, task.number, task.quantity);

    if (result.success && result.qrImageUrl) {
      // 3. หักลบโควต้าสลาก (เพดาน 2,000 ใบ)
      quotaManager.deductQuota(task.quantity);

      // 4. ส่งรูป QR Code ชำระเงินกลับหาลูกค้าผ่าน ReplyToken ทันที (ฟรี ไม่เสียโควต้า LINE OA)
      const flexMsg = FlexMessageBuilder.buildPaymentQRMessage(
        result.qrImageUrl,
        task.number,
        task.quantity,
        task.totalPrice,
        10 // 10 นาที
      );

      await lineHandler.reply(task.replyToken, [flexMsg]);
      console.log(`[SUCCESS] ส่ง QR Code ชำระเงินให้ลูกค้า ${task.userId} เรียบร้อยแล้ว`);
    } else {
      // แจ้งลูกค้าหากเกิดข้อผิดพลาดในการกดเว็บ
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
 * ฟังก์ชันแกะข้อความสั่งซื้อที่ยืดหยุ่นสูง (Smart Regex Parser)
 * รองรับ:
 * - "342 2ใบ", "342 2", "453 3"
 * - "สั่ง 789 5 ใบ", "123=2", "999-1", "555x2"
 * - "000" (หากไม่พิมพ์จำนวน = 1 ใบ)
 */
export function parseOrderMessage(text: string): { number: string; quantity: number } | null {
  if (!text) return null;
  const clean = text.trim();

  // Pattern: ดึงเลข 3 ตัว และตัวเลขจำนวนใบ
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
  res.status(200).send('OK'); // ตอบ LINE ทันทีภายใน 1 วินาที

  const events = req.body?.events || [];
  console.log(`[WEBHOOK EVENT RECEIVED] จำนวน ${events.length} events`);

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userText: string = event.message.text;
      const replyToken: string = event.replyToken;
      const userId: string = event.source?.userId || 'anonymous';

      console.log(`[WEBHOOK] ได้รับข้อความจาก ${userId}: "${userText}"`);

      // 1. ถอดรหัสข้อความสั่งซื้อ
      const parsed = parseOrderMessage(userText);
      if (!parsed) {
        console.log(`[WEBHOOK] ข้อความ "${userText}" ไม่ใช่รูปแบบคำสั่งซื้อ -> ส่งข้อความแนะนำ`);
        await lineHandler.reply(replyToken, [
          {
            type: 'text',
            text: 'ยินดีต้อนรับสู่บริการสั่งซื้อสลาก N3 อัตโนมัติ 🎉\n\n📌 วิธีสั่งซื้อง่ายๆ เพียงพิมพ์เลข 3 ตัวตามด้วยจำนวนใบ เช่น:\n- 342 2ใบ\n- 453 3\n- สั่ง 789 5'
          }
        ]);
        continue;
      }

      console.log(`[PARSED ORDER] เลข: ${parsed.number} | จำนวน: ${parsed.quantity} ใบ`);

      // 2. ตรวจสอบโควต้าสลาก (2,000 ใบ)
      const quotaCheck = quotaManager.canFulfill(parsed.quantity);
      if (!quotaCheck.allowed) {
        console.log(`[QUOTA REJECT] ${quotaCheck.reason}`);
        await lineHandler.reply(replyToken, [
          FlexMessageBuilder.buildQuotaExceededMessage(quotaCheck.remaining)
        ]);
        continue;
      }

      // 3. ใส่คำสั่งซื้อลงในคิวความเร็วสูง
      const orderTask: OrderTask = {
        orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        replyToken,
        userId,
        number: parsed.number,
        quantity: parsed.quantity,
        totalPrice: parsed.quantity * 20, // ใบละ 20 บาท
        timestamp: Date.now()
      };

      orderQueue.enqueue(orderTask);
    }
  }
});

/**
 * Admin API: ดึง QR Code หน้า Login ส่งเข้า LINE แอดมิน
 */
app.post('/admin/login-qr', async (_req: Request, res: Response) => {
  if (!page || !context) {
    await initBrowser();
  }

  try {
    const { qrImagePath } = await N3Auth.generatePaotangLoginQR(page!);
    const qrFileName = qrImagePath.split(/[\/\\]/).pop();
    const qrPublicUrl = `${CONFIG.BASE_URL}/qrcodes/${qrFileName}`;

    await lineHandler.pushToAdmin([
      {
        type: 'text',
        text: '⚠️ ตรวจพบระบบต้องล็อกอินใหม่ กรุณาเปิดแอป "เป๋าตัง" แล้วสแกน QR Code นี้ภายใน 5 นาที:'
      },
      {
        type: 'image',
        originalContentUrl: qrPublicUrl,
        previewImageUrl: qrPublicUrl
      }
    ]);

    N3Auth.waitForAdminScan(page!, context!).then(success => {
      if (success) {
        lineHandler.pushToAdmin([
          { type: 'text', text: '✅ ล็อกอินเข้าสู่ระบบ N3 สำเร็จแล้ว ระบบพร้อมรับออเดอร์ลูกค้าอัตโนมัติ' }
        ]);
      }
    });

    res.json({ success: true, qrUrl: qrPublicUrl });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

/**
 * Admin API: ตรวจสอบและจัดการโควต้า
 */
app.get('/admin/quota', (_req: Request, res: Response) => {
  res.json(quotaManager.getStatus());
});

app.post('/admin/quota/reset', (req: Request, res: Response) => {
  const round = req.body.round || new Date().toLocaleDateString('th-TH');
  const maxQuota = req.body.maxQuota || 2000;
  const updated = quotaManager.resetRound(round, maxQuota);
  res.json({ success: true, quota: updated });
});

/**
 * Health check & status
 */
app.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    queueLength: orderQueue.getQueueLength(),
    quota: quotaManager.getStatus(),
    allowedDomains: CONFIG.ALLOWED_DOMAINS
  });
});

/**
 * ฟังก์ชันเริ่มรันเซิร์ฟเวอร์ พร้อมระบบ Auto Port Conflict Fallback
 */
function startServerWithPort(targetPort: number) {
  const server = http.createServer(app);

  server.listen(targetPort, async () => {
    console.log(`====================================================`);
    console.log(`🚀 N3 Order Bot Service รันอยู่ที่: http://localhost:${targetPort}`);
    console.log(`🔒 Security Domain Whitelist: ${CONFIG.ALLOWED_DOMAINS.join(', ')}`);
    console.log(`🎫 โควต้าคงเหลือ: ${quotaManager.getStatus().remainingQuota} / 2,000 ใบ`);
    console.log(`====================================================`);

    // เริ่มต้นเบราว์เซอร์
    await initBrowser();
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[PORT WARNING] พอร์ต ${targetPort} กำลังถูกใช้งานโดยโปรเจกต์อื่น`);
      const nextPort = targetPort + 1;
      console.log(`[PORT FALLBACK] กำลังสลับไปใช้พอร์ต ${nextPort} อัตโนมัติ...`);
      startServerWithPort(nextPort);
    } else {
      console.error('[SERVER ERROR]', err);
    }
  });
}

startServerWithPort(CONFIG.PORT);
