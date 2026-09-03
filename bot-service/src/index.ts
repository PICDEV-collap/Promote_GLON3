import express, { Request, Response } from 'express';
import { Page, BrowserContext } from 'playwright';
import { validateSignature, messagingApi } from '@line/bot-sdk';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { CONFIG } from './config';
import { SecurityGuard } from './automation/security-guard';
import { N3Auth } from './automation/n3-auth';
import { N3OrderService } from './automation/n3-order';
import { PersistentBrowserManager } from './automation/browser-context';
import { QuotaManager } from './quota/quota-manager';
import { OrderQueue, OrderTask, OrderItem } from './queue/order-queue';
import { LineReplyHandler } from './line/reply-handler';
import { FlexMessageBuilder } from './line/flex-message';
import { OperatingHoursGuard } from './guard/operating-hours';

const app = express();

// ดักจับ rawBody สำหรับตรวจสอบ LINE Webhook Signature
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// เสิร์ฟรูปภาพ QR Code ผ่าน Static Route
app.use('/qrcodes', express.static(CONFIG.QR_OUTPUT_DIR));

// Endpoint บังคับดาวน์โหลดไฟล์รูปภาพ QR Code โดยตรง (Force Download)
app.get('/download-qr/:filename', (req: Request, res: Response) => {
  const rawParam = req.params.filename;
  const paramStr = Array.isArray(rawParam) ? rawParam[0] : (rawParam || '');
  const filename = path.basename(paramStr);
  const filePath = path.join(CONFIG.QR_OUTPUT_DIR, filename);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'image/png');
    res.download(filePath, `n3-payment-${filename}`);
  } else {
    res.status(404).send('ไม่พบไฟล์ QR Code หรืออาจหมดอายุแล้ว');
  }
});

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
 * พร้อมระบบตรวจสอบหน้าต่างเบราว์เซอร์และกู้คืนอัตโนมัติหากถูกปิดหรือแครช
 */
async function ensureBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  const res = await PersistentBrowserManager.getPage(false);
  context = res.context;
  page = res.page;
  securityGuard.attachToPage(page);
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
  // ฟังก์ชันช่วยส่งข้อความหาลูกค้า พร้อมระบบ Fallback อัตโนมัติไปยัง Push Message หาก replyToken หมดอายุ
  const sendCustomerMessage = async (messages: any[]): Promise<boolean> => {
    let sent = false;
    if (!task.hasRepliedQueue && task.replyToken) {
      sent = await lineHandler.reply(task.replyToken, messages);
    }
    if (!sent && task.userId && task.userId !== 'anonymous') {
      sent = await lineHandler.push(task.userId, messages);
    }
    return sent;
  };

  try {
    const { page: currentPage } = await ensureBrowser();

    // 1. ตรวจสอบเวลาจำหน่ายอีกครั้งก่อนประมวลผล
    const timeStatus = OperatingHoursGuard.checkSalesStatus();
    if (!timeStatus.isOpen) {
      await sendCustomerMessage([
        FlexMessageBuilder.buildOutsideOperatingHoursMessage(timeStatus)
      ]);
      return;
    }

    // 2. ตรวจสอบโควต้า
    const totalQty = task.totalQuantity || task.quantity || 1;
    const quotaCheck = quotaManager.canFulfill(totalQty);
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

      const itemsDesc = task.items && task.items.length > 0
        ? task.items.map(i => `${i.number}x${i.quantity}`).join(', ')
        : `${task.number} x ${task.quantity} ใบ`;
      triggerAdminLoginQR(`มีลูกค้าสั่งซื้อสลาก ${itemsDesc} แต่ระบบยังไม่ได้ล็อกอิน`);
      return;
    }

    // 4. สั่งซื้อบนเว็บ N3
    const orderItems: OrderItem[] = task.items && task.items.length > 0
      ? task.items
      : [{ number: task.number || '', quantity: task.quantity || 1 }];
    const result = await N3OrderService.executeOrder(currentPage, orderItems);

    if (result.success && result.qrImageUrl) {
      const actualQty = result.totalQuantity || totalQty;
      const actualPrice = result.totalPrice || task.totalPrice || actualQty * 20;
      quotaManager.deductQuota(actualQty);

      const qrPublicUrl = result.qrImageUrl.replace(CONFIG.BASE_URL, currentPublicBaseUrl);
      const qrFileName = result.qrImageUrl.split(/[\/\\]/).pop() || '';
      const downloadUrl = `${currentPublicBaseUrl}/download-qr/${qrFileName}`;

      // 1. ส่งรูปภาพ QR Code แบบ Native LINE Image Bubble (ขนาดใหญ่เต็มจอ สแกนง่าย เซฟลงเครื่องใน 1 แตะ)
      const imageMsg: messagingApi.ImageMessage = {
        type: 'image',
        originalContentUrl: qrPublicUrl,
        previewImageUrl: qrPublicUrl
      };

      // 2. ส่ง Flex Message สรุปคำสั่งซื้อ พร้อมปุ่มดาวน์โหลด/บันทึกรูป
      const flexMsg = FlexMessageBuilder.buildPaymentQRMessage(
        qrPublicUrl,
        result.fulfilledItems || orderItems,
        actualQty,
        actualPrice,
        10,
        downloadUrl,
        result.outOfStockItems
      );

      await sendCustomerMessage([imageMsg, flexMsg]);
      console.log(`[SUCCESS] ส่งภาพ QR Code คมชัดสูง (Native Image + Flex Card) ให้ลูกค้า ${task.userId} เรียบร้อยแล้ว (ทาง ${task.hasRepliedQueue ? 'Push' : 'Reply'})`);
    } else {
      const itemsDesc = task.items && task.items.length > 0
        ? task.items.map(i => i.number).join(', ')
        : (task.number || '');
      await sendCustomerMessage([
        {
          type: 'text',
          text: `ขออภัยครับ เกิดข้อผิดพลาดขณะสั่งซื้อสลากเลข ${itemsDesc}: ${result.error || 'กรุณาลองใหม่อีกครั้ง'}`
        }
      ]);
    }
  } catch (err: any) {
    console.error('[WORKER EXCEPTION]', err);
    await sendCustomerMessage([
      { type: 'text', text: 'ขออภัยครับ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลังครับ' }
    ]);
  }
});

/**
 * ฟังก์ชันแกะข้อความสั่งซื้อ (รองรับทั้งเลขเดี่ยว หลายเลข และคำสั่ง "อย่างละ X ใบ")
 */
export function parseOrderMessage(text: string): OrderItem[] | null {
  if (!text) return null;
  const clean = text.trim();

  // ป้องกันคำสั่งระบบ/แอดมิน/คำถามทั่วไป
  if (/^(?:q|qr|qrcode|qr\s*code|login|signin|id|myid|help|วิธี|ขอ|ล็อกอิน)/i.test(clean)) return null;

  // แบบที่ 1: '123 456 789 อย่างละ 2 ใบ' หรือ '123, 456 อย่างละ 1'
  const eachMatch = clean.match(/^((?:\d{3}[\s,+/]*)+)\s*(?:อย่างละ|อันละ|ตัวละ|เลขละ)\s*([0-9]+)\s*(?:ใบ)?$/i);
  if (eachMatch) {
    const rawNums = eachMatch[1].match(/\d{3}/g);
    const qty = parseInt(eachMatch[2], 10);
    if (rawNums && rawNums.length > 0 && qty > 0 && qty <= 50) {
      const itemsMap = new Map<string, number>();
      for (const num of rawNums) {
        itemsMap.set(num, (itemsMap.get(num) || 0) + qty);
      }
      return Array.from(itemsMap.entries()).map(([number, quantity]) => ({ number, quantity }));
    }
  }

  // แบบที่ 2: พิมพ์เฉพาะเลข 3 ตัวเว้นวรรคติดกัน เช่น '123 456 789'
  const spaceNums = clean.split(/\s+/);
  if (spaceNums.length > 1 && spaceNums.every(s => /^\d{3}$/.test(s))) {
    const itemsMap = new Map<string, number>();
    for (const num of spaceNums) {
      itemsMap.set(num, (itemsMap.get(num) || 0) + 1);
    }
    return Array.from(itemsMap.entries()).map(([number, quantity]) => ({ number, quantity }));
  }

  // แบบที่ 3: หลายบรรทัด หรือคั่นด้วยเครื่องหมายจุลภาค/สแลช/ไปป์/บวก
  const segments = clean.split(/[\r\n,;/|+]+/).map(s => s.trim()).filter(Boolean);
  if (segments.length > 0) {
    const itemsMap = new Map<string, number>();
    let validCount = 0;

    for (const seg of segments) {
      const m = seg.match(/^(?:(?:สั่ง|ซื้อ|เอา)?\s*)(\d{3})(?:[\s=\-xX*]*([0-9]+)\s*(?:ใบ)?)?$/);
      if (m) {
        const num = m[1];
        const qty = m[2] ? parseInt(m[2], 10) : 1;
        if (qty > 0 && qty <= 100) {
          itemsMap.set(num, (itemsMap.get(num) || 0) + qty);
          validCount++;
        }
      } else {
        return null;
      }
    }

    if (validCount === segments.length && itemsMap.size > 0) {
      return Array.from(itemsMap.entries()).map(([number, quantity]) => ({ number, quantity }));
    }
  }

  return null;
}

/**
 * LINE Webhook Endpoint
 */
app.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-line-signature'] as string;
  const rawBody = (req as any).rawBody;

  // 1. ตรวจสอบความถูกต้องของ LINE Webhook Signature ป้องกันการปลอมแปลง Request
  if (CONFIG.LINE_CHANNEL_SECRET && signature && rawBody) {
    if (!validateSignature(rawBody, CONFIG.LINE_CHANNEL_SECRET, signature)) {
      console.warn('[SECURITY BLOCKED] ปฏิเสธ Webhook: ลายเซ็นดิจิทัล x-line-signature ไม่ถูกต้อง!');
      res.status(403).send('Invalid Signature');
      return;
    }
  }

  res.status(200).send('OK');

  // 2. ป้องกัน Host Header Injection: อนุญาตเฉพาะโดเมน Cloudflare Tunnel หรือบริการที่ปลอดภัย
  const host = (req.headers['x-forwarded-host'] || req.headers.host) as string;
  const proto = (req.headers['x-forwarded-proto'] || 'https') as string;
  if (host && typeof host === 'string') {
    const lowerHost = host.toLowerCase();
    if (lowerHost.endsWith('.trycloudflare.com') || lowerHost.includes('ngrok') || lowerHost.includes('loca.lt')) {
      currentPublicBaseUrl = `${proto}://${host}`;
    }
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

      // 2. แกะคำสั่งซื้อสลาก (รองรับทั้งเลขเดี่ยวและหลายเลขในบิลเดียว)
      const parsedItems = parseOrderMessage(userText);
      if (!parsedItems || parsedItems.length === 0) {
        await lineHandler.reply(replyToken, [FlexMessageBuilder.buildHowToOrderMessage()]);
        continue;
      }

      const totalQuantity = parsedItems.reduce((sum, it) => sum + it.quantity, 0);
      const totalPrice = totalQuantity * 20;
      const summaryNumbers = parsedItems.map(i => `${i.number}x${i.quantity}`).join(', ');
      const formattedSummary = parsedItems.map(i => `${i.number} (${i.quantity} ใบ)`).join(', ');

      console.log(`[ORDER DETECTED] ${parsedItems.length} รายการ: ${summaryNumbers} (รวม ${totalQuantity} ใบ / ${totalPrice} บาท)`);

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
      const quotaCheck = quotaManager.canFulfill(totalQuantity);
      if (!quotaCheck.allowed) {
        await lineHandler.reply(replyToken, [
          FlexMessageBuilder.buildQuotaExceededMessage(quotaCheck.remaining)
        ]);
        continue;
      }

      // 5. เปิดอนิเมชันจุดกำลังพิมพ์ (LINE Native Loading Indicator)
      await lineHandler.showLoading(userId, 30);

      // 6. นำเข้าคิวสั่งซื้อ & ส่งข้อความต้อนรับอวยพรรอคิวทันที (สไตล์ที่ 3)
      const orderTask: OrderTask = {
        orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        replyToken,
        userId,
        items: parsedItems,
        number: parsedItems[0].number,
        quantity: totalQuantity,
        totalQuantity,
        totalPrice,
        timestamp: Date.now(),
        hasRepliedQueue: true
      };

      const queuePos = orderQueue.enqueue(orderTask);
      const estSeconds = orderQueue.getEstimatedWaitTime(queuePos);

      const waitingMessage = queuePos > 1
        ? `✨ ร้านสลาก N3 ธนกิจนำโชค ได้รับคำสั่งซื้อแล้วครับ (คิวที่ ${queuePos})\n\n🎯 ชุดเลขมงคล: ${formattedSummary}\n🔢 รวมทั้งหมด: ${totalQuantity} ใบ — ยอดรวม ${totalPrice} บาท\n⏱️ มีออเดอร์ก่อนหน้า กำลังจัดทำตามคิว (รอประมาณ ~${estSeconds} วินาที)\n\n⚡ ขอให้เฮงๆ ปังๆ ถูกรางวัลใหญ่ 3 ตัวตรงงวดนี้นะครับ! 💰🎉`
        : `✨ ร้านสลาก N3 ธนกิจนำโชค ได้รับคำสั่งซื้อแล้วครับ\n\n🎯 ชุดเลขมงคล: ${formattedSummary}\n🔢 รวมทั้งหมด: ${totalQuantity} ใบ — ยอดรวม ${totalPrice} บาท\n⚡ กำลังออก QR Code ชำระเงินให้คุณ รอสักครู่นะครับ ขอให้เฮงๆ ปังๆ ถูกรางวัลใหญ่ 3 ตัวตรงงวดนี้นะครับ! 💰🎉`;

      console.log(`[ORDER ACK] ส่งข้อความรับออเดอร์และคำอวยพรให้ลูกค้า ${userId} (คิวที่ ${queuePos})`);
      await lineHandler.reply(replyToken, [{ type: 'text', text: waitingMessage }]);
    }
  }
});

const requireAdminAuth = (req: Request, res: Response, next: () => void) => {
  if (CONFIG.ADMIN_API_KEY) {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== CONFIG.ADMIN_API_KEY) {
      res.status(401).json({ error: 'Unauthorized: Invalid Admin API Key' });
      return;
    }
  }
  next();
};

app.post('/admin/login-qr', requireAdminAuth, async (_req: Request, res: Response) => {
  triggerAdminLoginQR('เรียกผ่าน API Admin');
  res.json({ success: true, message: 'กำลังส่งภาพ QR Login เข้า LINE แอดมิน' });
});

app.get('/admin/quota', requireAdminAuth, (_req: Request, res: Response) => {
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
    console.log(`[SERVICE] N3 Order Bot is RUNNING at: http://localhost:${targetPort}`);
    console.log(`[QUOTA]   Quota Remaining: ${quotaManager.getStatus().remainingQuota} / 2,000 tickets`);
    const status = OperatingHoursGuard.checkSalesStatus();
    console.log(`[SALES]   Status: ${status.isOpen ? 'OPEN' : 'CLOSED'} (${status.currentHoursText})`);
    console.log(`[ADMIN]   Admin User ID: ${CONFIG.ADMIN_LINE_USER_ID || '(Not Set)'}`);
    console.log(`[DREAM]   Dream Prediction URL: ${CONFIG.DREAM_PREDICTION_URL}`);
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
