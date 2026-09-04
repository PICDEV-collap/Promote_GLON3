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
import { LineReplyHandler, getThaiTime } from './line/reply-handler';
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
const quotaManager = QuotaManager.getInstance();
const orderQueue = new OrderQueue();
const lineHandler = new LineReplyHandler();
const securityGuard = new SecurityGuard();

let context: BrowserContext | null = null;
let page: Page | null = null;
let isLoggingIn: boolean = false;
let currentPublicBaseUrl: string = CONFIG.BASE_URL;

// กำหนด currentPublicBaseUrl จาก webhook-url.txt ล่วงหน้าหากมีอยู่แล้ว
try {
  const initialWebhook = getStoredWebhookUrl();
  if (initialWebhook && initialWebhook.startsWith('http') && !initialWebhook.includes('localhost')) {
    currentPublicBaseUrl = initialWebhook.replace(/\/webhook\/?$/, '');
  }
} catch {}

/**
 * ฟังก์ชันเปิดเบราว์เซอร์เฉพาะเมื่อมีงานเข้ามาจริง (On-Demand) ไม่เปิดค้างทิ้งไว้เบื้องหลัง
 * พร้อมระบบตรวจสอบหน้าต่างเบราว์เซอร์และกู้คืนอัตโนมัติหากถูกปิดหรือแครช
 */
async function ensureBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  const res = await PersistentBrowserManager.getPage(CONFIG.HEADLESS);
  context = res.context;
  page = res.page;
  securityGuard.attachToPage(page);

  // ผูกตัวดักฟังการนำทางหน้าเว็บ เพื่อซิงค์โควต้าสดอัตโนมัติเมื่อเข้าสู่หน้า Landing (Requirement 1a)
  if (!(page as any).__quotaNavListenerAttached) {
    (page as any).__quotaNavListenerAttached = true;
    page.on('framenavigated', async (frame) => {
      try {
        if (frame === page?.mainFrame()) {
          const rawUrl = frame.url();
          const clean = rawUrl.replace(/\/+$/, '');
          if (clean.includes('/landing') || clean === 'https://n3.glolotteryshop.com') {
            setTimeout(async () => {
              try {
                if (page && !page.isClosed() && !orderQueue.isBusy()) {
                  const curr = page.url().replace(/\/+$/, '');
                  if (curr.includes('/landing') || curr === 'https://n3.glolotteryshop.com') {
                    await quotaManager.syncQuotaFromLivePortal(page, false);
                  }
                }
              } catch {}
            }, 1200);
          }
        }
      } catch {}
    });
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
      await quotaManager.syncQuotaFromLivePortal(currentPage, false).catch(() => {});
      const liveQuota = quotaManager.getStatus();
      await lineHandler.pushToAdmin([
        {
          type: 'text',
          text: `✅ ล็อกอินเข้าสู่ระบบ N3 สำเร็จแล้ว! ระบบพร้อมประมวลผลออเดอร์ลูกค้าอัตโนมัติแล้วครับ 🎉\n\n📊 โควต้าคงเหลือจริง: ${liveQuota.remainingQuota.toLocaleString()} / ${liveQuota.maxQuota.toLocaleString()} ใบ (ขายแล้ว ${liveQuota.usedQuota.toLocaleString()} ใบ)`
        }
      ]);
      console.log(`[BROWSER READY] ล็อกอินสำเร็จ โควต้าจริง ${liveQuota.remainingQuota}/${liveQuota.maxQuota} ใบ หน้าต่าง Chrome พร้อมรับคำสั่งซื้อทันที`);
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

      // จัดการอัปเดตโควต้า: หากผลการสั่งซื้อซิงค์จากหน้าเว็บสำเร็จแล้ว ไม่ต้องหักลบซ้ำซ้อน
      if (result.syncedQuota) {
        console.log(`[ORDER QUOTA] ซิงค์ยอดโควต้าสดจาก GLO สำเร็จ: คงเหลือ ${result.syncedQuota.remainingQuota.toLocaleString()} / ${result.syncedQuota.maxQuota.toLocaleString()} ใบ (ขายแล้ว ${result.syncedQuota.usedQuota.toLocaleString()} ใบ)`);
      } else {
        // หากยังไม่ได้ซิงค์จาก executeOrder ให้ลองซิงค์สดอีกครั้ง
        const liveSynced = await quotaManager.syncQuotaFromLivePortal(currentPage, false).catch(() => null);
        if (liveSynced) {
          console.log(`[ORDER QUOTA] ซิงค์ยอดโควต้าสดจาก GLO สำเร็จ: คงเหลือ ${liveSynced.remainingQuota.toLocaleString()} / ${liveSynced.maxQuota.toLocaleString()} ใบ`);
        } else {
          // Fallback: หากไม่สามารถซิงค์สดได้ ให้หักลบตามจำนวนออเดอร์เพื่อป้องกันการสั่งเกิน
          quotaManager.deductQuota(actualQty);
          console.log(`[ORDER QUOTA] สำรอง: หักลบโควต้า ${actualQty} ใบ (คงเหลือ ${quotaManager.getStatus().remainingQuota.toLocaleString()} ใบ)`);
        }
      }

      const qrPublicUrl = result.qrImageUrl.replace(CONFIG.BASE_URL, currentPublicBaseUrl);
      const qrFileName = result.qrImageUrl.split(/[\/\\]/).pop() || '';
      const downloadUrl = `${currentPublicBaseUrl}/download-qr/${qrFileName}`;

      // ส่ง Flex Message สรุปคำสั่งซื้อพร้อมรูป QR Code คมชัดสูงในตัว (ส่งข้อความเดียว จบครบ ไม่ขึ้นซ้ำ 2 ภาพ)
      const flexMsg = FlexMessageBuilder.buildPaymentQRMessage(
        qrPublicUrl,
        result.fulfilledItems || orderItems,
        actualQty,
        actualPrice,
        10,
        downloadUrl,
        result.outOfStockItems
      );

      await sendCustomerMessage([flexMsg]);
      console.log(`[SUCCESS] ส่งการ์ด QR Code ชำระเงินให้ลูกค้า ${task.userId} เรียบร้อยแล้ว (ทาง ${task.hasRepliedQueue ? 'Push' : 'Reply'})`);
    } else {
      const itemsDesc = task.items && task.items.length > 0
        ? task.items.map(i => i.number).join(', ')
        : (task.number || '');

      let userMsg = `ขออภัยครับ เกิดข้อผิดพลาดขณะสั่งซื้อสลากเลข ${itemsDesc} กรุณาลองใหม่อีกครั้งครับ`;
      if (result.outOfStockItems && result.outOfStockItems.length > 0) {
        userMsg = `ขออภัยครับ สลากเลข ${result.outOfStockItems.join(', ')} ไม่มีจำหน่ายหรือสลากหมดในระบบแล้วครับ`;
      } else if (result.error && !result.error.includes('Target page') && !result.error.includes('closed') && !result.error.includes('evaluate')) {
        userMsg = `ขออภัยครับ เกิดข้อผิดพลาดขณะสั่งซื้อสลากเลข ${itemsDesc}: ${result.error}`;
      }

      await sendCustomerMessage([
        {
          type: 'text',
          text: userMsg
        }
      ]);
    }
  } catch (err: any) {
    console.error('[WORKER EXCEPTION]', err);
    if (err?.message?.includes('closed') || err?.message?.includes('crash') || (page && page.isClosed())) {
      console.warn('[WORKER RECOVERY] รีเซ็ตเบราว์เซอร์หลังจากพบข้อผิดพลาด...');
      await PersistentBrowserManager.close().catch(() => {});
      context = null;
      page = null;
    }
    await sendCustomerMessage([
      { type: 'text', text: 'ขออภัยครับ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลังครับ' }
    ]);
  }
});

/**
 * ฟังก์ชันแกะข้อความสั่งซื้อ (รองรับทั้งเลขเดี่ยว หลายเลข คั่นด้วยลูกน้ำ เว้นวรรค และคำสั่ง "อย่างละ X ใบ")
 */
export function parseOrderMessage(text: string): OrderItem[] | null {
  if (!text) return null;

  // 1. แปลงเลขอารบิกและแปลงเลขไทย (๐-๙) เป็นเลขอารบิก (0-9)
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  let clean = text.trim();
  for (let i = 0; i < 10; i++) {
    clean = clean.replace(new RegExp(thaiDigits[i], 'g'), String(i));
  }

  // 2. ป้องกันคำสั่งระบบ/แอดมิน/คำถามทั่วไป
  if (/^(?:q|qr|qrcode|qr\s*code|login|log\s*in|signin|id|myid|help|status|quota|sync|โควต้า|เช็คโควต้า|เช็คสถานะ|ดูโควต้า|ยอดคงเหลือ|วิธีซื้อ|วิธีสั่ง|วิธี|ขอคิว|ขอ\s*qr|ล็อกอิน)$/i.test(clean) || /^(?:login|signin|help|myid|status|quota)\b/i.test(clean)) {
    return null;
  }

  // กำหนด Regex ตัดคำนำหน้าการสั่งซื้อภาษาไทยออก (เช่น สั่งซื้อ, ขอซื้อ, สั่ง, ซื้อ, เอาเลข, ขอเลข, สลาก, ฯลฯ)
  const orderPrefixRegex = /^(?:ขอสั่งซื้อ|ขอซื้อสลาก|ซื้อสลาก|สั่งสลาก|ขอสลาก|สั่งซื้อ|ขอซื้อ|ขอสั่ง|เอาเลข|ซื้อเลข|สั่งเลข|เลือกเลข|ขอเลข|สั่ง|ซื้อ|เอา|ขอ|เลือก|สลาก|เลข|\s)+/i;
  const normalized = clean.replace(orderPrefixRegex, '').trim();
  if (!normalized) return null;

  // แบบที่ 1: '123 456 789 อย่างละ 2 ใบ' หรือ '123, 456 อย่างละ 1'
  const eachMatch = normalized.match(/^((?:\d{3}[\s,+/]*)+)\s*(?:อย่างละ|อันละ|ตัวละ|เลขละ)\s*([0-9]+)\s*(?:ใบ)?$/i);
  if (eachMatch) {
    const rawNums = eachMatch[1].match(/\d{3}/g);
    const qty = parseInt(eachMatch[2], 10);
    if (rawNums && rawNums.length > 0 && qty > 0 && qty <= 100) {
      const itemsMap = new Map<string, number>();
      for (const num of rawNums) {
        itemsMap.set(num, (itemsMap.get(num) || 0) + qty);
      }
      return Array.from(itemsMap.entries()).map(([number, quantity]) => ({ number, quantity }));
    }
  }

  // แบบที่ 2: พิมพ์เฉพาะเลข 3 ตัว คั่นด้วยช่องว่างหรือเครื่องหมายคั่น (เช่น '123 456 789', '123, 456, 789')
  const pureNums = normalized.split(/[\s,;/|+]+/).map(s => s.trim()).filter(Boolean);
  if (pureNums.length > 1 && pureNums.every(s => /^\d{3}$/.test(s))) {
    const itemsMap = new Map<string, number>();
    for (const num of pureNums) {
      itemsMap.set(num, (itemsMap.get(num) || 0) + 1);
    }
    return Array.from(itemsMap.entries()).map(([number, quantity]) => ({ number, quantity }));
  }

  // แบบที่ 3: หลายบรรทัด หรือคั่นด้วยเครื่องหมายจุลภาค/สแลช/ไปป์/บวก เช่น '334=5,447=6,778=3' หรือ '111 2, 222 2' หรือ '334:5, 447:6'
  const segments = normalized.split(/[\r\n,;/|+]+/).map(s => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    const itemsMap = new Map<string, number>();
    let validCount = 0;

    for (const seg of segments) {
      const cleanSeg = seg.replace(orderPrefixRegex, '').trim();
      const m = cleanSeg.match(/^(\d{3})(?:[\s=\-xX*:]+([0-9]+))?(?:\s*ใบ)?$/);
      if (m) {
        const num = m[1];
        const qty = m[2] ? parseInt(m[2], 10) : 1;
        if (qty > 0 && qty <= 100) {
          itemsMap.set(num, (itemsMap.get(num) || 0) + qty);
          validCount++;
        }
      }
    }

    if (validCount === segments.length && itemsMap.size > 0) {
      return Array.from(itemsMap.entries()).map(([number, quantity]) => ({ number, quantity }));
    }
  }

  // แบบที่ 4: เลขเดี่ยว หรือหลายเลขคั่นด้วยเว้นวรรคพร้อมจำนวน เช่น '111 2 222 2', '111=2 222=3', '111 2 ใบ 222 3 ใบ', '123 2', '123:2', '123'
  const pairRegex = /(\b\d{3}\b)(?:[\s=\-xX*:]+([0-9]+))?(?:\s*ใบ)?/g;
  let m2: RegExpExecArray | null;
  const pairs: { num: string; qty: number }[] = [];
  let lastIndex = 0;
  let fullMatch = true;

  while ((m2 = pairRegex.exec(normalized)) !== null) {
    const intervening = normalized.slice(lastIndex, m2.index).trim();
    if (intervening.length > 0 && !/^[,;/|+]+$/.test(intervening)) {
      fullMatch = false;
      break;
    }
    const num = m2[1];
    const qty = m2[2] ? parseInt(m2[2], 10) : 1;
    if (qty > 0 && qty <= 100) {
      pairs.push({ num, qty });
    } else {
      fullMatch = false;
      break;
    }
    lastIndex = pairRegex.lastIndex;
  }

  const trailing = normalized.slice(lastIndex).trim();
  if (trailing.length > 0) fullMatch = false;

  if (fullMatch && pairs.length > 0) {
    const itemsMap = new Map<string, number>();
    for (const p of pairs) {
      itemsMap.set(p.num, (itemsMap.get(p.num) || 0) + p.qty);
    }
    return Array.from(itemsMap.entries()).map(([number, quantity]) => ({ number, quantity }));
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
      try {
        const rootUrlFile = path.resolve(__dirname, '../../webhook-url.txt');
        fs.writeFileSync(rootUrlFile, `${currentPublicBaseUrl}/webhook`, 'utf-8');
      } catch {}
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

      // คำสั่งตรวจสอบสถานะและโควต้าคงเหลือจริง (status, quota, โควต้า, เช็คโควต้า, เช็คสถานะ)
      const isStatusQuotaCmd = /^(?:status|quota|โควต้า|เช็คโควต้า|เช็คสถานะ|ดูโควต้า|ยอดคงเหลือ)$/i.test(userText);
      if (isStatusQuotaCmd) {
        const qStatus = quotaManager.getStatus();
        const salesStatus = OperatingHoursGuard.checkSalesStatus();
        const syncTime = qStatus.syncedAt
          ? new Date(qStatus.syncedAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }) + ' น.'
          : 'ตามระบบเริ่มต้น';
        const statusReply = `📊 สถานะโควต้าสลาก N3 (ร้านธนกิจนำโชค)\n\n` +
          `🎫 โควต้าคงเหลือ: ${qStatus.remainingQuota.toLocaleString()} / ${qStatus.maxQuota.toLocaleString()} ใบ\n` +
          `🛒 ยอดขายแล้ว: ${qStatus.usedQuota.toLocaleString()} ใบ\n` +
          `📅 งวดประจำวันที่: ${qStatus.round}\n` +
          `⏱️ ซิงค์ระบบจริง: ${syncTime}\n` +
          `🏪 สถานะร้านค้า: ${salesStatus.isOpen ? '🟢 เปิดจำหน่ายตามปกติ' : '🔴 นอกเวลาทำการ'}`;

        await lineHandler.reply(replyToken, [{ type: 'text', text: statusReply }]);
        continue;
      }

      // คำสั่งสำหรับแอดมิน: บังคับซิงค์โควต้าสดจากหน้าเว็บ GLO N3 ทันที (sync, sync quota, ซิงค์โควต้า)
      const isSyncCmd = /^(?:sync|sync\s*quota|ซิงค์|ซิงค์โควต้า)$/i.test(userText);
      if (isSyncCmd) {
        if (isAdmin) {
          try {
            const { page: p } = await ensureBrowser();
            const synced = await quotaManager.syncQuotaFromLivePortal(p, true);
            if (synced) {
              await lineHandler.reply(replyToken, [{
                type: 'text',
                text: `✅ ซิงค์โควต้าสดจากเว็บ GLO N3 สำเร็จเรียบร้อยครับ!\n\n• โควต้าคงเหลือจริง: ${synced.remainingQuota.toLocaleString()} / ${synced.maxQuota.toLocaleString()} ใบ\n• ขายแล้ว: ${synced.usedQuota.toLocaleString()} ใบ`
              }]);
            } else {
              await lineHandler.reply(replyToken, [{
                type: 'text',
                text: `⚠️ ไม่สามารถซิงค์โควต้าได้ กรุณาตรวจสอบสถานะการล็อกอินเว็บ N3 (พิมพ์ qr เพื่อล็อกอินใหม่)`
              }]);
            }
          } catch (e: any) {
            await lineHandler.reply(replyToken, [{
              type: 'text',
              text: `❌ เกิดข้อผิดพลาดขณะซิงค์โควต้า: ${e?.message}`
            }]);
          }
        } else {
          await lineHandler.reply(replyToken, [FlexMessageBuilder.buildHowToOrderMessage()]);
        }
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
        hasRepliedQueue: false
      };

      const queuePos = orderQueue.enqueue(orderTask);
      const estSeconds = orderQueue.getEstimatedWaitTime(queuePos);

      const waitingMessage = queuePos > 1
        ? `✨ ร้านสลาก N3 ธนกิจนำโชค ได้รับคำสั่งซื้อแล้วครับ (คิวที่ ${queuePos})\n\n🎯 ชุดเลขมงคล: ${formattedSummary}\n🔢 รวมทั้งหมด: ${totalQuantity} ใบ — ยอดรวม ${totalPrice} บาท\n⏱️ มีออเดอร์ก่อนหน้า กำลังจัดทำตามคิว (รอประมาณ ~${estSeconds} วินาที)\n\n⚡ ขอให้เฮงๆ ปังๆ ถูกรางวัลใหญ่ 3 ตัวตรงงวดนี้นะครับ! 💰🎉`
        : `✨ ร้านสลาก N3 ธนกิจนำโชค ได้รับคำสั่งซื้อแล้วครับ\n\n🎯 ชุดเลขมงคล: ${formattedSummary}\n🔢 รวมทั้งหมด: ${totalQuantity} ใบ — ยอดรวม ${totalPrice} บาท\n⚡ กำลังออก QR Code ชำระเงินให้คุณ รอสักครู่นะครับ ขอให้เฮงๆ ปังๆ ถูกรางวัลใหญ่ 3 ตัวตรงงวดนี้นะครับ! 💰🎉`;

      console.log(`[ORDER ACK] ส่งข้อความรับออเดอร์และคำอวยพรให้ลูกค้า ${userId} (คิวที่ ${queuePos})`);
      const replySuccess = await lineHandler.reply(replyToken, [{ type: 'text', text: waitingMessage }]);
      orderTask.hasRepliedQueue = replySuccess;
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

app.get('/admin/quota', requireAdminAuth, async (req: Request, res: Response) => {
  if (req.query.sync === 'true') {
    try {
      const { page: p } = await ensureBrowser();
      const synced = await quotaManager.syncQuotaFromLivePortal(p, true);
      res.json({ success: true, quota: quotaManager.getStatus(), liveSynced: synced !== null });
      return;
    } catch (e: any) {
      res.status(500).json({ error: e.message, quota: quotaManager.getStatus() });
      return;
    }
  }
  res.json(quotaManager.getStatus());
});

app.post('/admin/quota/sync', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const { page: p } = await ensureBrowser();
    const synced = await quotaManager.syncQuotaFromLivePortal(p, true);
    res.json({ success: true, quota: quotaManager.getStatus(), liveSynced: synced !== null });
  } catch (e: any) {
    res.status(500).json({ error: e.message, quota: quotaManager.getStatus() });
  }
});

app.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    queueLength: orderQueue.getQueueLength(),
    quota: quotaManager.getStatus(),
    salesHours: OperatingHoursGuard.checkSalesStatus()
  });
});

let hasNotifiedShutdown = false;

/**
 * ตรวจสอบว่าแอดมินเป็นผู้สั่งหยุดบอทอย่างตั้งใจหรือไม่ (ผ่าน STOP-BOT.bat หรือ N3-MANAGER)
 */
export function isStopIntentional(): boolean {
  const rootStopFile = path.resolve(__dirname, '../../.stop_intentional');
  const botStopFile = path.resolve(__dirname, '../.stop_intentional');
  try {
    if (fs.existsSync(rootStopFile)) {
      const stats = fs.statSync(rootStopFile);
      if (Date.now() - stats.mtimeMs < 60000) return true;
    }
    if (fs.existsSync(botStopFile)) {
      const stats = fs.statSync(botStopFile);
      if (Date.now() - stats.mtimeMs < 60000) return true;
    }
  } catch {}
  return false;
}

/**
 * ดึง Webhook URL ล่าสุดจากไฟล์ webhook-url.txt
 */
export function getStoredWebhookUrl(): string {
  const rootUrlFile = path.resolve(__dirname, '../../webhook-url.txt');
  const botUrlFile = path.resolve(__dirname, '../webhook-url.txt');
  try {
    if (fs.existsSync(rootUrlFile)) {
      const u = fs.readFileSync(rootUrlFile, 'utf-8').trim();
      if (u) return u;
    }
    if (fs.existsSync(botUrlFile)) {
      const u = fs.readFileSync(botUrlFile, 'utf-8').trim();
      if (u) return u;
    }
  } catch {}
  return `${CONFIG.BASE_URL}/webhook`;
}

/**
 * ติดตั้ง Event Listeners สำหรับดักจับการหยุดทำงานและแครชของบอท
 */
export function setupLifecycleHandlers(): void {
  // 1. ดักจับ Uncaught Exception (แครชร้ายแรง)
  process.on('uncaughtException', async (err: Error) => {
    console.error('[FATAL CRASH] Uncaught Exception:', err);
    if (!hasNotifiedShutdown && !isStopIntentional()) {
      hasNotifiedShutdown = true;
      const timeStr = getThaiTime();
      try {
        await Promise.race([
          lineHandler.notifyBotStopped(timeStr, err.message || 'Uncaught Exception'),
          new Promise(r => setTimeout(r, 6000))
        ]);
      } catch (e) {
        console.error('[ALERT ERROR]', e);
      }
    }
    process.exit(1);
  });

  // 2. ดักจับ Unhandled Rejection
  process.on('unhandledRejection', (reason: any) => {
    console.error('[UNHANDLED REJECTION]', reason);
  });

  // 3. ดักจับ SIGINT และ SIGTERM (การสั่งปิดโปรเซส)
  const handleSignal = async (signal: string) => {
    console.log(`[SHUTDOWN] ได้รับสัญญาณ ${signal}`);
    if (!hasNotifiedShutdown) {
      hasNotifiedShutdown = true;
      const intentional = isStopIntentional();
      if (!intentional) {
        const timeStr = getThaiTime();
        try {
          await Promise.race([
            lineHandler.notifyBotStopped(timeStr, `ได้รับสัญญาณ ${signal}`),
            new Promise(r => setTimeout(r, 6000))
          ]);
        } catch (e) {
          console.error('[ALERT ERROR]', e);
        }
      }
    }
    try {
      await PersistentBrowserManager.close().catch(() => {});
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));

  // 4. ดักจับ beforeExit (กรณี Event Loop ว่างลงหรือเซิร์ฟเวอร์หยุดทำงาน)
  process.on('beforeExit', async (_code) => {
    if (!hasNotifiedShutdown && !isStopIntentional()) {
      hasNotifiedShutdown = true;
      const timeStr = getThaiTime();
      try {
        await Promise.race([
          lineHandler.notifyBotStopped(timeStr),
          new Promise(r => setTimeout(r, 6000))
        ]);
      } catch (e) {
        console.error('[ALERT ERROR]', e);
      }
    }
  });
}

function startServerWithPort(targetPort: number) {
  const server = http.createServer(app);

  server.listen(targetPort, async () => {
    console.log(`====================================================`);
    console.log(`[SERVICE] N3 Order Bot is RUNNING at: http://localhost:${targetPort}`);
    const qStatus = quotaManager.getStatus();
    console.log(`[QUOTA]   Quota Remaining: ${qStatus.remainingQuota.toLocaleString()} / ${qStatus.maxQuota.toLocaleString()} tickets (Used: ${qStatus.usedQuota} tickets)`);
    const status = OperatingHoursGuard.checkSalesStatus();
    console.log(`[SALES]   Status: ${status.isOpen ? 'OPEN' : 'CLOSED'} (${status.currentHoursText})`);
    console.log(`[ADMIN]   Admin User ID: ${CONFIG.ADMIN_LINE_USER_ID || '(Not Set)'}`);
    console.log(`[DREAM]   Dream Prediction URL: ${CONFIG.DREAM_PREDICTION_URL}`);
    console.log(`====================================================`);

    // Background Quota Sync: หากเบราว์เซอร์เปิดทำงานอยู่แล้ว ให้ซิงค์โควต้าสดเริ่มต้น
    setTimeout(async () => {
      try {
        const activePage = PersistentBrowserManager.getActivePage();
        if (activePage && !activePage.isClosed()) {
          const valid = await N3Auth.isSessionValid(activePage);
          if (valid) {
            console.log('[QUOTA SYNC] ตรวจพบเบราว์เซอร์พร้อมใช้งาน เริ่มต้นซิงค์โควต้าสดจากหน้าเว็บ GLO N3...');
            await quotaManager.syncQuotaFromLivePortal(activePage, false);
          }
        }
      } catch {}
    }, 3000);

    // รอบ Background Sync ทุก 5 นาทีเมื่อเบราว์เซอร์เปิดอยู่ (Active) และไม่ได้กำลังประมวลผลออเดอร์
    const quotaSyncTimer = setInterval(async () => {
      try {
        if (orderQueue.isBusy()) return;
        const activePage = PersistentBrowserManager.getActivePage();
        if (activePage && !activePage.isClosed()) {
          const u = activePage.url();
          if (!u.includes('/lotto-search') && !u.includes('/lotto-confirm') && !u.includes('/login')) {
            await quotaManager.syncQuotaFromLivePortal(activePage, false);
          }
        }
      } catch {}
    }, 5 * 60 * 1000);
    quotaSyncTimer.unref();

    // ส่งแจ้งเตือน Admin เมื่อเปิดบอท (หากไม่ได้เปิดผ่าน n3-engine ที่แจ้งเตือนพร้อม URL Tunnel แล้ว)
    if (process.env.ENGINE_NOTIFIES_START !== 'true') {
      const webhookUrl = getStoredWebhookUrl();
      try {
        await lineHandler.notifyBotStarted(webhookUrl);
      } catch (err) {
        console.error('[START NOTIFY ERROR]', err);
      }
    }

    // Tunnel Watchdog: ตรวจสอบความพร้อมของ Cloudflare Tunnel เป็นระยะเพื่อป้องกันกรณีบอทหยุดเงียบ
    const isTunnelExpected = process.env.ENGINE_NOTIFIES_START === 'true' || fs.existsSync(path.resolve(__dirname, '../../webhook-url.txt'));
    if (isTunnelExpected) {
      let hasAlertedTunnelDown = false;
      const watchdog = setInterval(() => {
        if (isStopIntentional()) {
          clearInterval(watchdog);
          return;
        }
        import('child_process').then(({ exec }) => {
          exec('tasklist /FI "IMAGENAME eq cloudflared.exe" /NH', (err, stdout) => {
            if (!err && stdout) {
              const isTunnelAlive = stdout.toLowerCase().includes('cloudflared.exe');
              if (!isTunnelAlive && !hasAlertedTunnelDown && !isStopIntentional()) {
                hasAlertedTunnelDown = true;
                console.warn('[WATCHDOG ALERT] ไม่พบโปรเซส cloudflared.exe กำลังแจ้งเตือนแอดมิน...');
                const timeStr = getThaiTime();
                lineHandler.pushToAdmin([{
                  type: 'text',
                  text: `⚠️ [แจ้งเตือนด่วน] Cloudflare Tunnel ของบอทสลาก N3 หยุดทำงานแล้ว (Tunnel Process Down) เมื่อเวลา ${timeStr} กรุณาเปิดบอทใหม่เพื่อรับออเดอร์`
                }]).catch(() => {});
              } else if (isTunnelAlive && hasAlertedTunnelDown) {
                hasAlertedTunnelDown = false;
                console.log('[WATCHDOG RECOVERED] Cloudflare Tunnel กลับมาทำงานตามปกติแล้ว');
              }
            }
          });
        }).catch(() => {});
      }, 60000);
      watchdog.unref();
    }
  });

  server.on('close', async () => {
    console.log('[SERVER CLOSED] HTTP server has closed');
    if (!hasNotifiedShutdown && !isStopIntentional()) {
      hasNotifiedShutdown = true;
      const timeStr = getThaiTime();
      try {
        await lineHandler.notifyBotStopped(timeStr, 'Port 3333 closed');
      } catch (e) {}
    }
  });

  server.on('error', async (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[PORT WARNING] พอร์ต ${targetPort} ไม่ว่าง กำลังสลับพอร์ต...`);
      startServerWithPort(targetPort + 1);
    } else {
      console.error('[SERVER ERROR]', err);
      if (!hasNotifiedShutdown && !isStopIntentional()) {
        hasNotifiedShutdown = true;
        const timeStr = getThaiTime();
        try {
          await lineHandler.notifyBotStopped(timeStr, err.message || 'Server error');
        } catch (e) {}
      }
    }
  });
}

if (require.main === module) {
  setupLifecycleHandlers();
  startServerWithPort(CONFIG.PORT);
}

export { app, startServerWithPort };
