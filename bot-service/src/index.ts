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
import { PersistentBrowserManager, isCdpAlive } from './automation/browser-context';
import { QuotaManager } from './quota/quota-manager';
import { OrderQueue, OrderTask, OrderItem } from './queue/order-queue';
import { OrderHeartbeatManager } from './queue/order-heartbeat';
import { LineReplyHandler, getThaiTime } from './line/reply-handler';
import { FlexMessageBuilder } from './line/flex-message';
import { OperatingHoursGuard } from './guard/operating-hours';
import { DreamEngine } from './dream/dream-engine';
import { CustomerRegistry } from './storage/customer-registry';
import { CampaignService } from './automation/campaign-service';
import { LuckyDistributor } from './dream/lucky-distributor';
import { DailyScheduleService } from './guard/daily-schedule-service';

const app = express();

// ปิดการเปิดเผยเทคโนโลยีเซิร์ฟเวอร์
app.disable('x-powered-by');

// -------------------------------------------------------------------------
// 0. ระบบความปลอดภัย (Security Controls & Hardening)
// -------------------------------------------------------------------------

// In-Memory Sliding-Window Rate Limiter
class InMemoryRateLimiter {
  private requests: Map<string, number[]> = new Map();

  public check(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const valid = timestamps.filter(t => now - t < windowMs);
    if (valid.length >= limit) {
      return false; // เกินอัตราคำขอ
    }
    valid.push(now);
    this.requests.set(key, valid);

    // เคลียร์ความจำเมื่อมีคีย์มากเกินไป
    if (this.requests.size > 2000) {
      for (const [k, v] of this.requests.entries()) {
        if (v.length === 0 || now - v[v.length - 1] > windowMs * 2) {
          this.requests.delete(k);
        }
      }
    }
    return true;
  }
}

const rateLimiter = new InMemoryRateLimiter();

// Security Headers Middleware (ป้องกัน Clickjacking, MIME Sniffing, XSS)
app.use((_req: Request, res: Response, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Sensitive Path & Traversal Blocker (ป้องกันการเข้าถึง .env, .git, .log, data/, browser_profile)
app.use((req: Request, res: Response, next) => {
  const rawUrl = req.url || '';
  const decodedUrl = decodeURIComponent(rawUrl).toLowerCase();

  if (
    decodedUrl.includes('..') ||
    decodedUrl.includes('/.env') ||
    decodedUrl.includes('/.git') ||
    decodedUrl.includes('browser_profile') ||
    decodedUrl.includes('storagestate') ||
    decodedUrl.includes('quota.json') ||
    decodedUrl.includes('bot.pid') ||
    decodedUrl.includes('.log') ||
    decodedUrl.includes('webhook-url') ||
    decodedUrl.includes('/node_modules') ||
    decodedUrl.includes('/package.json') ||
    decodedUrl.includes('/tsconfig.json')
  ) {
    console.warn(`[SECURITY BLOCKED] ปฏิเสธคำขอเข้าถึง Sensitive Path: ${req.method} ${rawUrl}`);
    res.status(403).send('Forbidden');
    return;
  }
  next();
});

// ดักจับ rawBody สำหรับตรวจสอบ LINE Webhook Signature
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// -------------------------------------------------------------------------
// QR Memory Cache (In-Memory Buffer Cache)
// เก็บไฟล์รูปภาพ QR Code ใน RAM ชั่วคราว (~35 KB ต่อรูป พร้อม auto-expire 10 นาที)
// เพื่อให้ลบไฟล์ภาพจริงออกจากดิสก์ได้ทันทีหลังส่ง ลดการจัดเก็บค้างบนดิสก์เป็น 0 KB
// -------------------------------------------------------------------------
export const qrMemoryCache = new Map<string, { buffer: Buffer; expiresAt: number }>();

export function saveQrToMemoryCache(filename: string, buffer: Buffer, ttlMinutes: number = 10): void {
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  qrMemoryCache.set(filename, { buffer, expiresAt });
}

export function getQrFromMemoryCache(filename: string): Buffer | null {
  const item = qrMemoryCache.get(filename);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    qrMemoryCache.delete(filename);
    return null;
  }
  return item.buffer;
}

// ล้างไฟล์ภาพ QR Code ตกค้างที่เก่าเกิน 24 ชั่วโมงออกจากดิสก์ตอนเริ่มต้นระบบ
try {
  if (fs.existsSync(CONFIG.QR_OUTPUT_DIR)) {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const oldFiles = fs.readdirSync(CONFIG.QR_OUTPUT_DIR).filter(f => f.startsWith('payment-') && f.endsWith('.png'));
    let cleanedCount = 0;
    for (const f of oldFiles) {
      try {
        const fullPath = path.join(CONFIG.QR_OUTPUT_DIR, f);
        const stats = fs.statSync(fullPath);
        if (stats.mtimeMs < oneDayAgo) {
          fs.unlinkSync(fullPath);
          cleanedCount++;
        }
      } catch {}
    }
    if (cleanedCount > 0) {
      console.log(`[STARTUP STORAGE CLEANUP] ล้างภาพ QR Code เก่าเกิน 24 ชม. ตกค้างบนดิสก์ ${cleanedCount} ไฟล์เรียบร้อยแล้ว`);
    }
  }
} catch {}

// -------------------------------------------------------------------------
// Static Asset Whitelist (จำกัดสิทธิ์เฉพาะโฟลเดอร์สาธารณะที่ปลอดภัยเท่านั้น)
// -------------------------------------------------------------------------
app.use('/qrcodes/:filename', (req: Request, res: Response, next) => {
  const rawParam = req.params.filename;
  const filename = path.basename(Array.isArray(rawParam) ? rawParam[0] : (rawParam || ''));
  const cachedBuf = getQrFromMemoryCache(filename);
  if (cachedBuf) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.send(cachedBuf);
    return;
  }
  next();
});

app.use('/qrcodes', (req: Request, res: Response, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  next();
}, express.static(CONFIG.QR_OUTPUT_DIR, { dotfiles: 'ignore', index: false }));
app.use('/public', express.static(path.join(__dirname, '../../public'), { dotfiles: 'ignore', index: false }));
app.use('/public', express.static(path.join(__dirname, '../public'), { dotfiles: 'ignore', index: false }));
app.use('/css', express.static(path.join(__dirname, '../../css'), { dotfiles: 'ignore', index: false }));
app.use('/js', express.static(path.join(__dirname, '../../js'), { dotfiles: 'ignore', index: false }));
app.use('/images', express.static(path.join(__dirname, '../../images'), { dotfiles: 'ignore', index: false }));
app.use('/logos', express.static(path.join(__dirname, '../../logos'), { dotfiles: 'ignore', index: false }));
app.use('/icons', express.static(path.join(__dirname, '../../icons'), { dotfiles: 'ignore', index: false }));

// Routes สำหรับหน้าเว็บสาธารณะ
app.get(['/', '/index.html'], (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../../index.html'));
});

app.get(['/order', '/order.html'], (_req: Request, res: Response) => {
  const rootOrderPath = path.join(__dirname, '../../order.html');
  const localOrderPath = path.join(__dirname, '../public/order.html');
  if (fs.existsSync(rootOrderPath)) {
    res.sendFile(rootOrderPath);
  } else if (fs.existsSync(localOrderPath)) {
    res.sendFile(localOrderPath);
  } else {
    res.redirect(CONFIG.ORDER_FORM_URL);
  }
});

app.get(['/order-6pack', '/order-6pack.html'], (_req: Request, res: Response) => {
  const root6PackPath = path.join(__dirname, '../../order-6pack.html');
  const local6PackPath = path.join(__dirname, '../public/order-6pack.html');
  if (fs.existsSync(root6PackPath)) {
    res.sendFile(root6PackPath);
  } else if (fs.existsSync(local6PackPath)) {
    res.sendFile(local6PackPath);
  } else {
    res.redirect(CONFIG.ORDER_6PACK_URL);
  }
});

// LIFF Endpoint fallback for GET /webhook requests (Prevents "Cannot GET /webhook" error in LINE LIFF)
app.get(['/webhook', '/webhook/'], (req: Request, res: Response) => {
  const mode = req.query.mode || req.query.type;
  const liffState = req.query['liff.state'] as string;
  const is6Pack = mode === '6pack' || mode === 'sixpack' || (liffState && (liffState.includes('6pack') || liffState.includes('sixpack')));

  if (is6Pack) {
    const root6PackPath = path.join(__dirname, '../../order-6pack.html');
    const local6PackPath = path.join(__dirname, '../public/order-6pack.html');
    if (fs.existsSync(root6PackPath)) return res.sendFile(root6PackPath);
    if (fs.existsSync(local6PackPath)) return res.sendFile(local6PackPath);
    return res.redirect('/order?mode=6pack');
  }

  const rootOrderPath = path.join(__dirname, '../../order.html');
  const localOrderPath = path.join(__dirname, '../public/order.html');
  if (fs.existsSync(rootOrderPath)) return res.sendFile(rootOrderPath);
  if (fs.existsSync(localOrderPath)) return res.sendFile(localOrderPath);
  return res.redirect('/order');
});

// Endpoint ดาวน์โหลดไฟล์รูปภาพ QR Code พร้อมหน้ารองรับทั้ง Direct Download และ Mobile Web View
app.get('/download-qr/:filename', (req: Request, res: Response): void => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || 'unknown';
  if (!rateLimiter.check(`download:${ip}`, 60, 60000)) {
    res.status(429).send('คำขอดาวน์โหลดถี่เกินไป กรุณารอ 1 นาที');
    return;
  }

  const rawParam = req.params.filename;
  const paramStr = Array.isArray(rawParam) ? rawParam[0] : (rawParam || '');
  const filename = path.basename(paramStr);

  // ตรวจสอบความถูกต้องของชื่อไฟล์ ต้องเป็นรูปภาพ PNG เฉพาะของระบบสลาก N3 เท่านั้น
  if (!/^payment-[\w.-]+\.png$/i.test(filename) && !/^[\w.-]+\.png$/i.test(filename)) {
    res.status(400).send('รูปแบบชื่อไฟล์ไม่ถูกต้อง');
    return;
  }

  const cachedBuf = getQrFromMemoryCache(filename);
  const filePath = path.join(CONFIG.QR_OUTPUT_DIR, filename);
  const fileExists = cachedBuf !== null || fs.existsSync(filePath);

  if (!fileExists) {
    res.status(404).send('ไม่พบไฟล์ QR Code หรืออาจหมดอายุแล้ว');
    return;
  }

  // หากระบุ ?action=dl หรือ ?download=1 ให้ส่งเป็นไฟล์ดาวน์โหลดตรงทันที
  const isDirectDownload = req.query.action === 'dl' || req.query.download === '1';
  if (isDirectDownload) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Disposition', `attachment; filename="n3-qr-${filename}"`);
    if (cachedBuf) {
      res.send(cachedBuf);
    } else {
      res.download(filePath, `n3-qr-${filename}`);
    }
    return;
  }

  // ส่งหน้าดาวน์โหลดแบบ Responsive สวยงาม รองรับทั้ง Android, iOS, และ LINE In-App Browser
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.removeHeader('X-Frame-Options');
  res.send(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>QR Code ชำระเงินสลาก N3 | ร้านสลาก N3 ธนกิจนำโชค</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Prompt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: linear-gradient(135deg, #091322 0%, #0f172a 50%, #1e293b 100%); color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
    .card { background: #1e293b; border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 24px; box-shadow: 0 12px 40px rgba(0,0,0,0.5); max-width: 440px; width: 100%; padding: 24px 20px; text-align: center; position: relative; }
    .header h2 { font-size: 1.3rem; color: #fde68a; font-weight: 700; margin-bottom: 4px; }
    .header p { font-size: 0.88rem; color: #94a3b8; }
    .line-warning-banner { display: none; background: rgba(2, 132, 199, 0.15); border: 1px solid #0284c7; border-radius: 12px; padding: 10px; margin-bottom: 14px; font-size: 0.82rem; color: #bae6fd; text-align: left; }
    .line-warning-banner a { color: #38bdf8; font-weight: 700; text-decoration: underline; }
    .qr-container { background: #ffffff; padding: 14px; border: 2.5px dashed #10b981; border-radius: 20px; margin: 16px auto; display: inline-block; width: 100%; max-width: 270px; box-shadow: 0 8px 25px rgba(0,0,0,0.3); transition: all 0.3s ease; }
    .qr-container img { width: 100%; height: auto; display: block; border-radius: 10px; -webkit-touch-callout: default !important; -webkit-user-select: auto !important; user-select: auto !important; pointer-events: auto !important; touch-action: auto !important; }
    .touch-hint { font-size: 0.82rem; color: #fde68a; margin-top: 6px; font-weight: 600; display: block; }
    .btn-action { display: flex; align-items: center; justify-content: center; width: 100%; padding: 14px; border-radius: 14px; font-weight: 700; font-size: 1.02rem; margin-bottom: 12px; border: none; cursor: pointer; transition: transform 0.1s ease, filter 0.2s; text-decoration: none; }
    .btn-action:active { transform: scale(0.98); }
    .btn-download { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.35); }
    .btn-paotang { background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; box-shadow: 0 4px 15px rgba(2, 132, 199, 0.35); }
    .btn-external { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #cbd5e1; font-size: 0.85rem; padding: 10px; }
    .touch-guide-box { background: rgba(212, 175, 55, 0.15); border: 1.5px solid #d4af37; border-radius: 14px; padding: 12px; margin: 12px 0; font-size: 0.88rem; color: #fef08a; text-align: left; line-height: 1.55; }
    .guide-box { background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px; padding: 14px; font-size: 0.82rem; color: #cbd5e1; text-align: left; line-height: 1.55; margin-top: 10px; }
    .guide-box b { color: #fde68a; }
    .guide-step { display: flex; align-items: flex-start; margin-bottom: 10px; }
    .guide-step:last-child { margin-bottom: 0; }
    .step-badge { background: #d4af37; color: #0c1b33; font-weight: 800; border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.78rem; margin-right: 8px; flex-shrink: 0; margin-top: 2px; }
    .toast-msg { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #10b981; color: white; padding: 10px 20px; border-radius: 30px; font-size: 0.9rem; font-weight: 600; box-shadow: 0 4px 15px rgba(0,0,0,0.3); opacity: 0; transition: opacity 0.3s ease; pointer-events: none; z-index: 9999; }
    .toast-msg.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="card">
    <div id="lineBanner" class="line-warning-banner">
      💡 <b>เปิดในแอป LINE อยู่ใช่ไหม?</b><br>
      หากบันทึกรูปหรือเปิดแอปเป๋าตังไม่ได้ <a href="javascript:openExternalBrowser()">แตะที่นี่เพื่อเปิดใน Safari / Chrome</a>
    </div>

    <div class="header">
      <h2>ร้านสลาก N3 ธนกิจนำโชค</h2>
      <p>QR Code สำหรับชำระเงินผ่านแอป "เป๋าตัง"</p>
    </div>

    <div class="qr-container" id="qrContainer">
      <img id="qrImg" src="/qrcodes/${filename}" alt="N3 Payment QR Code">
    </div>

    <div class="touch-guide-box">
      📸 <b>ขั้นตอนชำระเงินง่ายๆ 2 ขั้นตอน:</b><br>
      1. <b>แคปหน้าจอ (Screenshot)</b> หรือ <b>แตะค้างที่รูป QR ด้านบน (Long-press)</b> แล้วเลือก <b>"บันทึกรูปภาพ"</b><br>
      2. เปิดแอป <b>"เป๋าตัง"</b> เข้าเมนู <b>"สแกน"</b> แล้วเลือกรูปภาพ QR จากอัลบั้มรูปในเครื่อง
    </div>

    <div class="guide-box" style="margin-top: 16px;">
      <div class="guide-step">
        <span class="step-badge">1</span>
        <div><b>บันทึกรูป QR:</b> แคปหน้าจอ หรือแตะค้างที่รูป QR ด้านบนแล้วเลือก <i>"บันทึกรูปภาพ"</i></div>
      </div>
      <div class="guide-step">
        <span class="step-badge">2</span>
        <div><b>เปิดแอปเป๋าตัง:</b> เปิดแอปเป๋าตังในโทรศัพท์มือถือของคุณ</div>
      </div>
      <div class="guide-step">
        <span class="step-badge">3</span>
        <div><b>สแกนชำระเงิน:</b> ในแอปเป๋าตัง กดเมนู <i>"สแกน"</i> แล้วเลือกรูป QR จากอัลบั้มรูปเพื่อจ่ายเงิน 20 บาท/ใบ</div>
      </div>
    </div>
  </div>

  <div id="toast" class="toast-msg">บันทึกรูปภาพสำเร็จ</div>

  <script>
    const isLine = /Line\//i.test(navigator.userAgent || '');

    if (isLine) {
      const banner = document.getElementById('lineBanner');
      const btnExt = document.getElementById('btnExternal');
      if (banner) banner.style.display = 'block';
      if (btnExt) btnExt.style.display = 'flex';
    }

    function showToast(text) {
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = text;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
      }
    }

    function openExternalBrowser() {
      const currentUrl = window.location.href;
      const sep = currentUrl.includes('?') ? '&' : '?';
      window.location.href = currentUrl + sep + 'openExternalBrowser=1';
    }
  </script>
</body>
</html>`);
});

// เริ่มต้นระบบหลัก
const quotaManager = QuotaManager.getInstance();
const orderQueue = new OrderQueue();
const lineHandler = new LineReplyHandler();
const orderHeartbeat = OrderHeartbeatManager.getInstance(lineHandler);
const securityGuard = new SecurityGuard();
const customerRegistry = CustomerRegistry.getInstance();
const campaignService = CampaignService.getInstance();

// Health Check API สำหรับตรวจสอบสถานะและ Telemetry ของระบบ
app.get('/health', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const lineQuota = await lineHandler.getQuotaStatus().catch(() => null);
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    quota: quotaManager.getStatus(),
    lineQuota: lineQuota || { type: 'unknown', value: 300, totalUsage: 300, remaining: 0, isExhausted: true },
    customers: customerRegistry.getStats(),
    queue: {
      isBusy: orderQueue.isBusy()
    }
  });
});

// Official Draw Schedule & Latest Winning Numbers API
app.get(['/api/draw-info', '/api/draw-schedule'], async (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const drawScheduleHandler = require(path.join(process.cwd(), '../api/draw-schedule.js'));
    return await drawScheduleHandler(req, res);
  } catch (_) {
    const quota = quotaManager.getStatus();
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      upcomingDraw: {
        drawDate: quota.round,
        thaiDate: quota.drawDateThai || '16 กันยายน 2569',
        drawTime: '14:30',
        isPostponed: false
      },
      quota: quota
    });
  }
});

// Campaign REST API: สถิติแคมเปญและลูกค้า
app.get('/api/campaign/stats', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const stats = customerRegistry.getStats();
  const upcoming = campaignService.getUpcomingDrawInfo();
  res.json({
    success: true,
    stats,
    upcomingDraw: upcoming,
    timestamp: new Date().toISOString()
  });
});

// Campaign REST API: ยิงเลขมงคลกระจายไม่ซ้ำ (รองรับ ?dryRun=true หรือ ?target=userId)
app.post('/api/campaign/lucky-teaser', async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (CONFIG.ADMIN_API_KEY && apiKey !== CONFIG.ADMIN_API_KEY) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
  const targetUserId = (req.query.target as string) || req.body?.targetUserId;
  const force = req.query.force === 'true' || req.body?.force === true;

  try {
    const result = await campaignService.sendPersonalizedLuckyTeasers({ dryRun, targetUserId, force });
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Campaign REST API: บรอดแคสต์ผลรางวัลล่าสุด (รองรับ ?dryRun=true หรือ ?target=userId)
app.post('/api/campaign/draw-results', async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (CONFIG.ADMIN_API_KEY && apiKey !== CONFIG.ADMIN_API_KEY) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
  const targetUserId = (req.query.target as string) || req.body?.targetUserId;
  const force = req.query.force === 'true' || req.body?.force === true;

  try {
    const result = await campaignService.broadcastDrawResults({ dryRun, targetUserId, force });
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

export interface StoredOrderStatus {
  orderId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  queuePosition?: number;
  qrImageUrl?: string;
  downloadUrl?: string;
  fulfilledItems?: OrderItem[];
  outOfStockItems?: string[];
  totalQuantity?: number;
  totalPrice?: number;
  error?: string;
  createdAt: number;
}

export const orderStatusStore: Map<string, StoredOrderStatus> = new Map();

// -------------------------------------------------------------------------
// Direct Order REST API (รองรับการสั่งซื้อผ่านตารางเว็บ / LIFF โดยตรง ไม่ต้องพิมพ์ส่งซ้ำในแชท LINE)
// -------------------------------------------------------------------------
app.options(['/api/order-direct', '/api/order-status/:orderId'], (_req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.status(204).end();
});

// ล้างคำสั่งซื้อเก่าเกิน 30 นาทีออกจากหน่วยความจำอัตโนมัติ
const orderCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [orderId, status] of orderStatusStore.entries()) {
    if (now - status.createdAt > 30 * 60 * 1000) {
      orderStatusStore.delete(orderId);
    }
  }
}, 5 * 60 * 1000);
orderCleanupTimer.unref();

app.get('/api/order-status/:orderId', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const rawParam = req.params.orderId;
  const orderId = Array.isArray(rawParam) ? rawParam[0] : (rawParam || '');
  const status = orderStatusStore.get(orderId);
  if (!status) {
    const queuePos = orderQueue.getPosition(orderId);
    if (queuePos > 0) {
      res.json({
        success: true,
        orderId,
        status: 'queued',
        queuePosition: queuePos,
        estimatedSeconds: orderQueue.getEstimatedWaitTime(queuePos)
      });
      return;
    }
    res.status(404).json({ success: false, error: 'ไม่พบคำสั่งซื้อนี้ หรือคำสั่งซื้อหมดอายุแล้ว' });
    return;
  }
  const queuePos = status.status === 'queued' ? orderQueue.getPosition(orderId) : 0;
  res.json({
    success: true,
    ...status,
    queuePosition: queuePos,
    estimatedSeconds: queuePos > 0 ? orderQueue.getEstimatedWaitTime(queuePos) : 0
  });
});

app.post('/api/order-direct', async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  const { userId, items } = req.body || {};
  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'ข้อมูลคำสั่งซื้อไม่ถูกต้อง (ต้องระบุรายการ items)' });
    return;
  }

  const effectiveUserId = userId || 'anonymous_web_user';

  // กรองตัวเลขสลาก 3 หลัก
  const validItems: OrderItem[] = [];
  for (const it of items) {
    const num = String(it.number || '').trim();
    const qty = parseInt(it.quantity, 10) || 1;
    if (/^\d{3}$/.test(num) && qty >= 1) {
      validItems.push({ number: num, quantity: Math.min(qty, 100) });
    }
  }

  if (validItems.length === 0) {
    res.status(400).json({ success: false, error: 'ไม่มีตัวเลขสลาก 3 หลักที่ถูกต้อง' });
    return;
  }

  const totalQuantity = validItems.reduce((sum, it) => sum + it.quantity, 0);
  const totalPrice = totalQuantity * 20;

  // 1. ตรวจสอบระเบียบเวลาจำหน่าย
  const salesStatus = OperatingHoursGuard.checkSalesStatus();
  if (!salesStatus.isOpen) {
    res.status(400).json({
      success: false,
      error: 'ไม่อยู่ในเวลาจำหน่ายสลาก N3 (เปิดจำหน่าย 06:00 - 23:00 น.)',
      reason: salesStatus.reason
    });
    return;
  }

  // 2. ตรวจสอบโควต้าสลากคงเหลือ
  const quotaCheck = quotaManager.canFulfill(totalQuantity);
  if (!quotaCheck.allowed) {
    res.status(400).json({
      success: false,
      error: `โควต้าสลากคงเหลือไม่เพียงพอ (เหลือ ${quotaCheck.remaining} ใบ)`,
      remaining: quotaCheck.remaining
    });
    return;
  }

  // 3. บันทึกข้อมูลลูกค้า
  if (effectiveUserId !== 'anonymous_web_user') {
    customerRegistry.registerOrUpdateUser(effectiveUserId);
    customerRegistry.incrementOrderCount(effectiveUserId);
  }

  const formattedSummary = validItems.map(i => `${i.number} (${i.quantity} ใบ)`).join(', ');
  const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const orderTask: OrderTask = {
    orderId,
    replyToken: '',
    userId: effectiveUserId,
    items: validItems,
    number: validItems[0].number,
    quantity: totalQuantity,
    totalQuantity,
    totalPrice,
    timestamp: Date.now(),
    hasRepliedQueue: false
  };

  orderStatusStore.set(orderId, {
    orderId,
    status: 'queued',
    fulfilledItems: validItems,
    totalQuantity,
    totalPrice,
    createdAt: Date.now()
  });

  const queuePos = orderQueue.enqueue(orderTask);
  orderHeartbeat.start(orderTask, () => orderQueue.getPosition(orderTask.orderId));
  const estSeconds = orderQueue.getEstimatedWaitTime(queuePos, validItems.length);

  const waitingMessage = queuePos > 1
    ? `✨ ร้านสลาก N3 ธนกิจนำโชค ได้รับคำสั่งซื้อจากตารางแล้วครับ (คิวที่ ${queuePos})\n\n🎯 ชุดเลขมงคล: ${formattedSummary}\n🔢 รวมทั้งหมด: ${totalQuantity} ใบ — ยอดรวม ${totalPrice} บาท\n⏱️ กำลังจัดทำตามคิว (รอประมาณ ~${estSeconds} วินาที)\n\n⚡ ขอให้เฮงๆ ปังๆ ถูกรางวัลใหญ่ 3 ตัวตรงงวดนี้นะครับ! 💰🎉`
    : `✨ ร้านสลาก N3 ธนกิจนำโชค ได้รับคำสั่งซื้อจากตารางแล้วครับ\n\n🎯 ชุดเลขมงคล: ${formattedSummary}\n🔢 รวมทั้งหมด: ${totalQuantity} ใบ — ยอดรวม ${totalPrice} บาท\n⚡ กำลังออก QR Code ชำระเงินให้คุณ รอสักครู่นะครับ ขอให้เฮงๆ ปังๆ ถูกรางวัลใหญ่ 3 ตัวตรงงวดนี้นะครับ! 💰🎉`;

  // ส่ง Push Message แจ้งเตือนเข้าแชท LINE เฉพาะเมื่อมี Push Quota เท่านั้น
  if (lineHandler.isPushAvailable() && effectiveUserId !== 'anonymous_web_user') {
    try {
      await lineHandler.push(effectiveUserId, [{ type: 'text', text: waitingMessage }]);
      orderTask.hasRepliedQueue = true;
    } catch (err) {
      console.warn('[ORDER DIRECT] ไม่สามารถ push ข้อความยืนยันรับออเดอร์ได้:', err);
    }
  }

  res.json({
    success: true,
    orderId,
    queuePosition: queuePos,
    estimatedSeconds: estSeconds,
    totalQuantity,
    totalPrice,
    statusUrl: `/api/order-status/${orderId}`,
    message: 'รับคำสั่งซื้อเรียบร้อยแล้ว ระบบกำลังสร้าง QR Code ให้คุณ'
  });
});

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
 * ดึง Public Base URL ล่าสุดแบบ Dynamic เสมอ
 * โดยตรวจสอบทั้งจาก webhook-url.txt และ Memory ป้องกันปัญหารูปภาพไม่แสดงจาก Tunnel URL เก่า
 */
export function getPublicBaseUrl(): string {
  try {
    const stored = getStoredWebhookUrl();
    if (stored && stored.startsWith('https://') && !stored.includes('localhost')) {
      const parsed = stored.replace(/\/webhook\/?$/, '');
      if (parsed) {
        currentPublicBaseUrl = parsed;
        return parsed;
      }
    }
  } catch {}

  if (currentPublicBaseUrl && currentPublicBaseUrl.startsWith('https://') && !currentPublicBaseUrl.includes('localhost')) {
    return currentPublicBaseUrl;
  }

  return CONFIG.BASE_URL;
}

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

let lastAdminQrUrl: string = '';
let lastAdminQrTime: number = 0;

/**
 * ฟังก์ชันสร้างและส่ง QR Login เป๋าตังให้ "ผู้ดูแลระบบ (ADMIN)" เท่านั้น!
 */
async function triggerAdminLoginQR(reason: string, replyToken?: string): Promise<void> {
  // หากมีภาพ QR ที่ยังไม่หมดอายุ (< 4 นาที) และแอดมินขอผ่าน ReplyToken ให้ส่งภาพนั้นทันที
  if (replyToken && lastAdminQrUrl && (Date.now() - lastAdminQrTime < 240000)) {
    console.log(`[ADMIN AUTH INSTANT REPLY] ส่งภาพ QR Code เดิมที่กำลังรอสแกนให้แอดมินผ่าน ReplyToken ทันที`);
    const adminMessages: any[] = [
      {
        type: 'text',
        text: `⚠️ [แจ้งเตือนแอดมิน] ${reason}\n\nกรุณาเปิดแอป "เป๋าตัง" แล้วสแกน QR Code นี้เพื่อเข้าสู่ระบบตัวแทน N3:\n🔗 ลิงก์ตรงรูปภาพ: ${lastAdminQrUrl}`
      },
      {
        type: 'image',
        originalContentUrl: lastAdminQrUrl,
        previewImageUrl: lastAdminQrUrl
      }
    ];
    await lineHandler.reply(replyToken, adminMessages);
    return;
  }

  if (isLoggingIn) {
    if (replyToken) {
      if (lastAdminQrUrl) {
        await lineHandler.reply(replyToken, [
          {
            type: 'text',
            text: `⚠️ [แจ้งเตือนแอดมิน] กำลังรอสแกนเป๋าตังอยู่ครับ สแกน QR Code นี้ได้ทันที:\n🔗 ลิงก์ตรงรูปภาพ: ${lastAdminQrUrl}`
          },
          {
            type: 'image',
            originalContentUrl: lastAdminQrUrl,
            previewImageUrl: lastAdminQrUrl
          }
        ]);
      } else {
        await lineHandler.reply(replyToken, [
          {
            type: 'text',
            text: `⏳ ระบบกำลังจัดเตรียมภาพ QR Login เป๋าตัง กรุณาส่ง 'Q' อีกครั้งในอีกสักครู่ครับ`
          }
        ]);
      }
    }
    return;
  }
  isLoggingIn = true;

  try {
    const { page: currentPage, context: currentContext } = await ensureBrowser();

    console.log(`[ADMIN AUTH] ${reason} -> กำลังสร้าง QR Login ส่งให้แอดมิน...`);
    const { qrImagePath } = await N3Auth.generatePaotangLoginQR(currentPage);
    const qrFileName = qrImagePath.split(/[\/\\]/).pop();
    const activePublicBase = getPublicBaseUrl();
    const qrPublicUrl = `${activePublicBase}/qrcodes/${qrFileName}`;
    lastAdminQrUrl = qrPublicUrl;
    lastAdminQrTime = Date.now();

    const adminMessages: any[] = [
      {
        type: 'text',
        text: `⚠️ [แจ้งเตือนแอดมิน] ${reason}\n\nกรุณาเปิดแอป "เป๋าตัง" แล้วสแกน QR Code นี้ภายใน 5 นาที เพื่อเข้าสู่ระบบตัวแทน N3:\n🔗 ลิงก์ตรงรูปภาพ: ${qrPublicUrl}`
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
      lastAdminQrUrl = '';
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
      lastAdminQrUrl = '';
    }
  } catch (err) {
    console.error('[ADMIN AUTH ERROR]', err);
    await PersistentBrowserManager.close();
    context = null;
    page = null;
    lastAdminQrUrl = '';
  } finally {
    isLoggingIn = false;
  }
}

/**
 * ตั้งค่า Worker สำหรับประมวลผลคำสั่งซื้อในคิว
 */
orderQueue.setWorker(async (task: OrderTask) => {
  // ฟังก์ชันช่วยส่งข้อความหาลูกค้า: ส่งผ่าน ReplyToken ก่อนเสมอ (ฟรี 100% ไม่เสียโควต้า Push) และ Fallback ไปยัง Push Message หากจำเป็น
  const sendCustomerMessage = async (messages: any[]): Promise<boolean> => {
    let sent = false;
    if (!task.hasRepliedQueue && task.replyToken) {
      sent = await lineHandler.reply(task.replyToken, messages);
      if (sent) {
        task.hasRepliedQueue = true;
        console.log(`[ORDER DELIVERY SUCCESS] ส่งข้อความสำเร็จผ่าน ReplyToken (ฟรี 100% ไม่เสียโควต้าข้อความ) สำหรับออเดอร์ ${task.orderId}`);
      }
    }
    if (!sent && task.userId && task.userId !== 'anonymous') {
      sent = await lineHandler.push(task.userId, messages);
      if (sent) {
        console.log(`[ORDER DELIVERY FALLBACK] ส่งข้อความผ่าน Push Message สำหรับออเดอร์ ${task.orderId}`);
      }
    }
    return sent;
  };

  try {
    const { page: currentPage } = await ensureBrowser();

    // 1. ตรวจสอบเวลาจำหน่ายอีกครั้งก่อนประมวลผล
    const timeStatus = OperatingHoursGuard.checkSalesStatus();
    if (!timeStatus.isOpen) {
      orderHeartbeat.stop(task.orderId);
      orderStatusStore.set(task.orderId, {
        orderId: task.orderId,
        status: 'failed',
        error: 'ไม่อยู่ในเวลาจำหน่ายสลาก N3 (เปิดจำหน่าย 06:00 - 23:00 น.)',
        createdAt: task.timestamp || Date.now()
      });
      await sendCustomerMessage([
        FlexMessageBuilder.buildOutsideOperatingHoursMessage(timeStatus)
      ]);
      return;
    }

    // 2. ตรวจสอบโควต้า
    const totalQty = task.totalQuantity || task.quantity || 1;
    const quotaCheck = quotaManager.canFulfill(totalQty);
    if (!quotaCheck.allowed) {
      orderHeartbeat.stop(task.orderId);
      orderStatusStore.set(task.orderId, {
        orderId: task.orderId,
        status: 'failed',
        error: `โควต้าสลากคงเหลือไม่เพียงพอ (เหลือ ${quotaCheck.remaining} ใบ)`,
        createdAt: task.timestamp || Date.now()
      });
      await sendCustomerMessage([
        FlexMessageBuilder.buildQuotaExceededMessage(quotaCheck.remaining)
      ]);
      return;
    }

    // 3. ตรวจสอบสถานะล็อกอิน N3
    const isLoggedIn = await N3Auth.isSessionValid(currentPage);
    if (!isLoggedIn) {
      orderHeartbeat.stop(task.orderId);
      orderStatusStore.set(task.orderId, {
        orderId: task.orderId,
        status: 'failed',
        error: 'ระบบร้านค้าสลากกำลังเตรียมความพร้อมเข้าระบบ กรุณารอสักครู่แล้วสั่งซื้อใหม่อีกครั้ง',
        createdAt: task.timestamp || Date.now()
      });
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

    // 4. สั่งซื้อบนเว็บ N3 (อัปเดตสถานะเป็น PREPARING_NUMBERS)
    const existingStatus = orderStatusStore.get(task.orderId);
    if (existingStatus) {
      existingStatus.status = 'processing';
    }
    orderHeartbeat.updateStage(task.orderId, 'PREPARING_NUMBERS', {
      current: 1,
      total: task.items && task.items.length > 0 ? task.items.length : 1,
      number: task.items && task.items.length > 0 ? task.items[0].number : task.number
    });

    const orderItems: OrderItem[] = task.items && task.items.length > 0
      ? task.items
      : [{ number: task.number || '', quantity: task.quantity || 1 }];
    const result = await N3OrderService.executeOrder(currentPage, orderItems, 1, (stage, info) => {
      orderHeartbeat.updateStage(task.orderId, stage, info);
    });

    // หยุด Heartbeat ทันทีหลังจากกระบวนการสั่งซื้อและออก QR บน GLO เสร็จสิ้น
    orderHeartbeat.stop(task.orderId);

    if (result.success && result.qrImageUrl) {
      const actualQty = result.totalQuantity || totalQty;
      const actualPrice = result.totalPrice || task.totalPrice || actualQty * 20;

      // 1. แคชภาพ QR Code ใน RAM (60 นาที) และเก็บไฟล์จริงบนดิสก์เพื่อความเสถียรในการดาวน์โหลด
      const qrFileName = result.qrFileName || result.qrImageUrl.split(/[\/\\]/).pop() || '';
      const qrFilePath = result.qrFilePath || path.join(CONFIG.QR_OUTPUT_DIR, qrFileName);

      if (fs.existsSync(qrFilePath)) {
        try {
          const qrBuf = fs.readFileSync(qrFilePath);
          saveQrToMemoryCache(qrFileName, qrBuf, 60);
          console.log(`[STORAGE] บันทึกไฟล์รูปภาพ ${qrFileName} บนดิสก์และ RAM แคชเรียบร้อยแล้ว`);
        } catch (e: any) {
          console.warn('[STORAGE CACHE WARNING]', e?.message);
        }
      }

      // 2. หักลบโควต้าในเครื่องทันที ป้องกันคำสั่งซื้อเกิน
      quotaManager.deductQuota(actualQty);
      console.log(`[ORDER QUOTA] หักลบโควต้า ${actualQty} ใบ (คงเหลือ ${quotaManager.getStatus().remainingQuota.toLocaleString()} ใบ)`);

      const activePublicBase = getPublicBaseUrl();
      const qrPublicUrl = result.qrImageUrl.replace(CONFIG.BASE_URL, activePublicBase);
      const downloadUrl = `${activePublicBase}/download-qr/${qrFileName}?openExternalBrowser=1`;

      // อัปเดตสถานะใน orderStatusStore สำหรับ Web Polling
      orderStatusStore.set(task.orderId, {
        orderId: task.orderId,
        status: 'completed',
        qrImageUrl: qrPublicUrl,
        downloadUrl,
        fulfilledItems: result.fulfilledItems || orderItems,
        outOfStockItems: result.outOfStockItems,
        totalQuantity: actualQty,
        totalPrice: actualPrice,
        createdAt: task.timestamp || Date.now()
      });

      // 3. ส่งภาพ QR Code แบบ Native LINE Image Message (1 แตะเปิด Photo Viewer บันทึกลงเครื่อง)
      const imageMsg: messagingApi.ImageMessage = {
        type: 'image',
        originalContentUrl: qrPublicUrl,
        previewImageUrl: qrPublicUrl
      };

      // 4. ส่ง Flex Message การ์ดสรุปคำสั่งซื้อสลาก N3 (includeHeroImage = false เพื่อไม่ให้แสดงภาพ QR ซ้ำ 2 รูป!)
      const flexMsg = FlexMessageBuilder.buildPaymentQRMessage(
        qrPublicUrl,
        result.fulfilledItems || orderItems,
        actualQty,
        actualPrice,
        10,
        downloadUrl,
        result.outOfStockItems,
        false // ไม่ใส่ hero ซ้ำซ้อน
      );

      // 5. ส่งข้อความให้ลูกค้าทันที! ลูกค้าได้รับ QR Code รวดเร็วที่สุด
      await sendCustomerMessage([imageMsg, flexMsg]);
      console.log(`[SUCCESS] ส่งภาพ QR Code คมชัดสูง (Native Image + การ์ดสรุปคำสั่งซื้อ) ให้ลูกค้า ${task.userId} เรียบร้อยแล้ว (ทาง ${task.hasRepliedQueue ? 'Push' : 'Reply'})`);

      // 6. ดำเนินการกดกลับหน้าหลักและซิงค์โควต้าสดจาก GLO Portal ในเบื้องหลัง (ไม่ถ่วงเวลาการส่งรูปให้ลูกค้า)
      N3OrderService.postOrderCleanupAndQuotaSync(currentPage).then(liveSynced => {
        if (liveSynced) {
          console.log(`[ORDER QUOTA] ซิงค์ยอดโควต้าสดจาก GLO สำเร็จ: คงเหลือ ${liveSynced.remainingQuota.toLocaleString()} / ${liveSynced.maxQuota.toLocaleString()} ใบ (ขายแล้ว ${liveSynced.usedQuota.toLocaleString()} ใบ)`);
        }
      }).catch(e => {
        console.warn('[ORDER QUOTA POST-SYNC ERROR]', e?.message);
      });
    } else {
      const itemsDesc = task.items && task.items.length > 0
        ? task.items.map(i => i.number).join(', ')
        : (task.number || '');

      const isSessionOrAuthError = !!(result.error && (
        result.error.includes('Session') ||
        result.error.includes('Geolocation') ||
        result.error.includes('พิกัด') ||
        result.error.includes('ไม่พร้อมใช้งาน') ||
        result.error.includes('หมดอายุ') ||
        result.error.includes('เข้าสู่ระบบ') ||
        result.error.includes('Timeout') ||
        result.error.includes('intercept') ||
        result.error.includes('ขัดจังหวะ')
      ));

      let userMsg = `ขออภัยครับ เกิดข้อผิดพลาดขณะสั่งซื้อสลากเลข ${itemsDesc} กรุณาลองใหม่อีกครั้งครับ`;
      if (isSessionOrAuthError) {
        userMsg = 'ขออภัยครับ ขณะนี้ระบบร้านค้าสลากกำลังเตรียมความพร้อมเข้าระบบ กรุณารอสักครู่แล้วสั่งซื้อใหม่อีกครั้งครับ 🙏';
        triggerAdminLoginQR(`มีลูกค้าสั่งซื้อสลาก ${itemsDesc} แต่ระบบแจ้ง: ${result.error}`);
      } else if (result.outOfStockItems && result.outOfStockItems.length > 0) {
        userMsg = `ขออภัยครับ สลากเลข ${result.outOfStockItems.join(', ')} ไม่มีจำหน่ายหรือสลากหมดในระบบแล้วครับ`;
      } else if (result.error && !result.error.includes('Target page') && !result.error.includes('closed') && !result.error.includes('evaluate')) {
        const cleanErr = result.error.split('\n')[0].replace(/Call log:.*$/i, '').trim();
        userMsg = `ขออภัยครับ เกิดข้อผิดพลาดขณะสั่งซื้อสลากเลข ${itemsDesc}: ${cleanErr}`;
      }

      if (userMsg.length > 400) {
        userMsg = userMsg.slice(0, 390) + '...';
      }

      orderStatusStore.set(task.orderId, {
        orderId: task.orderId,
        status: 'failed',
        error: userMsg,
        outOfStockItems: result.outOfStockItems,
        createdAt: task.timestamp || Date.now()
      });

      await sendCustomerMessage([
        {
          type: 'text',
          text: userMsg
        }
      ]);
    }
  } catch (err: any) {
    console.error('[WORKER EXCEPTION]', err);
    orderStatusStore.set(task.orderId, {
      orderId: task.orderId,
      status: 'failed',
      error: 'ขออภัยครับ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลังครับ',
      createdAt: task.timestamp || Date.now()
    });
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
  clean = clean.replace(/^(?:\??text\s*=\s*)/i, '').trim();
  for (let i = 0; i < 10; i++) {
    clean = clean.replace(new RegExp(thaiDigits[i], 'g'), String(i));
  }

  // 1.5 ตัดคำทักทายสุภาพนำหน้า เช่น "สวัสดีครับ", "สวัสดีค่ะ", "ดีครับ", "หวัดดี", "hello"
  const greetingPrefix = /^(?:สวัสดี|สว้สดี|หวัดดี|ดีครับ|ดีค่ะ|ดีคับ|ดีจ้า|ดีฮะ|hello|hi|hey)\s*(?:ครับ|ค่ะ|คับ|จ้า|ฮะ|คะ|ค้าบ)?\s*/i;
  clean = clean.replace(greetingPrefix, '').trim();

  // 2. ป้องกันคำสั่งระบบ/แอดมิน/คำถามทั่วไป/ทักทาย/ชำระเงิน
  if (/^(?:q|qr|qrcode|qr\s*code|login|log\s*in|signin|id|myid|help|status|quota|sync|โควต้า|เช็คโควต้า|เช็คสถานะ|ดูโควต้า|ยอดคงเหลือ|วิธีซื้อ|วิธีสั่ง|วิธี|ขอคิว|ขอ\s*qr|ล็อกอิน|เริ่ม$|start$|เมนู.*|menu.*|หน้าแรก.*|home.*|สวัสดี.*|สว้สดี.*|หวัดดี.*|ดีครับ.*|ดีค่ะ.*|ดีคับ.*|ทำนายฝัน.*|ทำนายความฝัน.*|เลขเด็ด$|ขอเลขเด็ด.*|ชำระเงิน.*|จ่ายเงิน.*|วิธีชำระ.*|วิธีการชำระ.*|วิธีจ่าย.*|เป๋าตัง.*|สั่งซื้อ$|ซื้อสลาก$|สั่งสลาก$|เลือกเลข$)$/i.test(clean) || /^(?:login|signin|help|myid|status|quota)\b/i.test(clean)) {
    return null;
  }

  // กำหนด Regex ตัดคำนำหน้าการสั่งซื้อภาษาไทยออก (เช่น สั่งซื้อ, ขอซื้อ, สั่ง, ซื้อ, เอาเลข, ขอเลข, หาเลข, สลาก, ฯลฯ)
  const orderPrefixRegex = /^(?:ขอสั่งซื้อ|ขอซื้อสลาก|ซื้อสลาก|สั่งสลาก|ขอสลาก|สั่งซื้อ|ขอซื้อ|ขอสั่ง|เอาเลข|ซื้อเลข|สั่งเลข|เลือกเลข|ขอเลข|หาเลข|สั่ง|ซื้อ|เอา|ขอ|เลือก|หา|สลาก|เลข|\s)+/i;
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
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || 'unknown';

  // 0. Rate Limiting ป้องกัน DoS / Flooding บน Webhook
  if (!rateLimiter.check(`webhook:${ip}`, 120, 60000)) {
    console.warn(`[SECURITY RATE LIMIT] ปฏิเสธ Webhook จาก IP ${ip}: เกินอัตราคำขอที่กำหนด (120 req/min)`);
    res.status(429).send('Too Many Requests');
    return;
  }

  const signature = req.headers['x-line-signature'] as string;
  const rawBody = (req as any).rawBody;

  // 1. ตรวจสอบความถูกต้องของ LINE Webhook Signature ป้องกันการปลอมแปลง Request 100%
  if (CONFIG.LINE_CHANNEL_SECRET) {
    if (!signature || !rawBody || !validateSignature(rawBody, CONFIG.LINE_CHANNEL_SECRET, signature)) {
      console.warn(`[SECURITY BLOCKED] ปฏิเสธ Webhook จาก IP ${ip}: ไม่มีลายเซ็น หรือ ลายเซ็น x-line-signature ไม่ถูกต้อง!`);
      res.status(403).send('Invalid Signature');
      return;
    }
  }

  res.status(200).send('OK');

  // 2. ป้องกัน Host Header Injection: อัปเดต Memory Base URL ให้ตรงกับ Host ที่ LINE ส่งเข้ามาเสมอ
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
    // 0. ตรวจจับการเพิ่มเพื่อนใหม่ (Follow Event) -> บันทึกลงระบบ & ส่งการ์ดต้อนรับ
    if (event.type === 'follow') {
      const replyToken: string = event.replyToken;
      const followerId: string = event.source?.userId || 'anonymous';
      console.log(`[NEW FOLLOWER] 🎉 มีลูกค้าใหม่เพิ่มเพื่อน: ${followerId}`);
      customerRegistry.registerOrUpdateUser(followerId);

      try {
        const welcomeMsg = FlexMessageBuilder.buildWelcomeMessage();
        if (replyToken) {
          await lineHandler.reply(replyToken, [welcomeMsg]);
        }
      } catch (err) {
        console.error('[FOLLOW ERROR] ไม่สามารถส่งข้อความต้อนรับได้:', err);
      }

      // แจ้งเตือนแอดมินว่ามีผู้ติดตามใหม่
      try {
        const adminId = CONFIG.LINE_ADMIN_USER_ID || CONFIG.ADMIN_LINE_USER_ID;
        if (adminId && followerId !== adminId) {
          await lineHandler.pushToAdmin([
            {
              type: 'text',
              text: `🎉 [แจ้งเตือนแอดมิน] มีลูกค้าใหม่เพิ่มเพื่อนร้านสลาก N3 ธนกิจนำโชค!\n\n• User ID: ${followerId}\n• เวลา: ${new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })} น.`
            }
          ]);
        }
      } catch (e) {}

      continue;
    }

    // ตรวจจับการเลิกติดตาม / บล็อก (Unfollow Event) -> ปรับสถานะเป็น blocked
    if (event.type === 'unfollow') {
      const unfollowerId: string = event.source?.userId || 'anonymous';
      console.log(`[UNFOLLOW] ⚠️ ลูกค้าบล็อกหรือเลิกติดตาม: ${unfollowerId}`);
      customerRegistry.markBlocked(unfollowerId);
      continue;
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const userText: string = event.message.text.trim();
      const replyToken: string = event.replyToken;
      const userId: string = event.source?.userId || 'anonymous';
      const adminId = CONFIG.LINE_ADMIN_USER_ID || CONFIG.ADMIN_LINE_USER_ID;
      const isAdmin: boolean = !!(adminId && userId === adminId);

      // บันทึกการติดต่อของลูกค้าเสมอเพื่อใช้อัปเดตสถานะ Active
      customerRegistry.registerOrUpdateUser(userId);

      console.log(`[USER MESSAGE] "${userText}" จาก ${userId} | AdminID=${adminId} | (isAdmin: ${isAdmin})`);

      // คำสั่งพิเศษ: ดู User ID ตัวเอง
      const lower = userText.toLowerCase();
      if (lower === 'myid' || lower === 'id') {
        await lineHandler.reply(replyToken, [
          { type: 'text', text: `👤 LINE User ID ของคุณคือ:\n${userId}\n\nสถานะ: ${isAdmin ? '✅ แอดมิน (Admin)' : 'ลูกค้าทั่วไป'}` }
        ]);
        continue;
      }

      // คำสั่งเมนูหลัก (เมนู, menu, หน้าแรก, home, คำสั่ง)
      const isMainMenuCmd = /^(?:เมนู|เมนูหลัก|menu|main\s*menu|หน้าแรก|home|คำสั่ง|เลือก)$/i.test(userText);
      if (isMainMenuCmd) {
        await lineHandler.reply(replyToken, [FlexMessageBuilder.buildMainMenuMessage()]);
        continue;
      }

      // ตรวจจับล่วงหน้าว่าข้อความเป็นคำสั่งซื้อสลากที่ถูกต้องหรือไม่ (ป้องกันไม่ให้คำทักทายหรือคำถามกลืนคำสั่งซื้อ)
      const preParsedOrder = parseOrderMessage(userText);

      // คำสั่งทักทาย / เริ่มต้นใช้งาน (เฉพาะเมื่อไม่ใช่การสั่งซื้อสลาก) -> ส่งการ์ดต้อนรับชุดใหญ่
      const isGreeting = /^(?:สวัสดี.*|สว้สดี.*|หวัดดี.*|ดีครับ.*|ดีค่ะ.*|ดีคับ.*|ดีจ้า.*|ดีฮะ.*|สวัสดียาม.*|อรุณสวัสดิ์.*|hello.*|hi.*|hey.*|start.*|เริ่ม.*|แนะนำตัว|ยินดีต้อนรับ)$/i.test(userText);
      if (!preParsedOrder && isGreeting) {
        await lineHandler.reply(replyToken, [FlexMessageBuilder.buildWelcomeMessage()]);
        continue;
      }

      // คำสั่งวิธีการชำระเงิน (จ่ายผ่านแอปเป๋าตังเท่านั้น)
      const isPaymentGuideCmd = /^(?:(?:วิธี|วิธีการ)?(?:ชำระเงิน|จ่ายเงิน|จ่าย|ชำระ|สแกน|เป๋าตัง|วิธีจ่าย|วิธีสแกน|จ่ายยังไง|สแกนยังไง)|payment)$/i.test(userText);
      if (!preParsedOrder && isPaymentGuideCmd) {
        await lineHandler.reply(replyToken, [FlexMessageBuilder.buildPaymentGuideMessage()]);
        continue;
      }

      // คำสั่งขั้นตอนสั่งซื้อ / ตารางสั่งซื้อ / สั่งซื้อสลาก N3 / คำว่า สั่งซื้อ เดี่ยวๆ
      const isOrderGuideCmd = /^(?:(?:ตาราง)?(?:สั่งซื้อ|ซื้อสลาก|สั่งสลาก|ขอซื้อ|เลือกเลข|ซื้อ|สั่ง)(?:\s*(?:สลาก)?(?:\s*N3)?)?|order|ตาราง|ตารางสั่งซื้อ)$/i.test(userText);
      if (!preParsedOrder && isOrderGuideCmd) {
        await lineHandler.reply(replyToken, [FlexMessageBuilder.buildOrderGuidanceMessage()]);
        continue;
      }

      // คำสั่งทำนายฝัน / เลขเด็ด AI (เฉพาะเมื่อไม่ใช่การสั่งซื้อสลาก เช่น "ขอเลขเด็ด", "เมื่อคืนฝันว่า...")
      const isDreamCmd = /^(?:(?:เมื่อคืน(?:นี้)?|เมื่อวาน(?:นี้)?|เมื่อกี้|เมื่อเช้า)?\s*(?:ผม|หนู|ฉัน|เรา|เค้า)?\s*ฝัน.*|ทำนายฝัน.*|ทำนายความฝัน.*|ทำนาย.*|เลขเด็ด.*|หาเลขเด็ด.*|ขอเลขเด็ด.*|แปลฝัน.*|แปลความฝัน.*|ช่วยทำนาย.*|ช่วยแปล.*|ช่วยดู.*|ความฝัน.*)$/i.test(userText);
      if (!preParsedOrder && isDreamCmd) {
        const analysis = DreamEngine.analyzeDreamPrompt(userText);
        if (analysis.hasDreamContent) {
          console.log(`[DREAM IN-CHAT] ทำนายฝันข้อความ: "${analysis.cleanedText}" จาก ${userId}`);
          const prediction = DreamEngine.predictDream(analysis.cleanedText);
          const flexMsg = FlexMessageBuilder.buildDreamPredictionMessage(prediction);
          await lineHandler.reply(replyToken, [flexMsg]);
        } else {
          console.log(`[DREAM IN-CHAT] ส่งการ์ดแนะนำทำนายฝัน AI ให้ ${userId}`);
          await lineHandler.reply(replyToken, [FlexMessageBuilder.buildDreamPromptGuidanceMessage()]);
        }
        continue;
      }

      // คำสั่งขอวิธีสั่งซื้อ / ช่วยเหลือ
      const isHelpCmd = /^(?:help|วิธี|วิธีซื้อ|วิธีสั่ง|วิธีสั่งซื้อ|สั่งยังไง|ซื้อยังไง|ช่วยด้วย|วิธีซื้อ.*จ่ายเงิน.*|วิธีสั่งซื้อ.*จ่ายเงิน.*|วิธีสั่งซื้อ.*ชำระเงิน.*)$/i.test(userText);
      if (isHelpCmd) {
        await lineHandler.reply(replyToken, [FlexMessageBuilder.buildHowToOrderMessage()]);
        continue;
      }

      // คำสั่งตรวจสอบสถานะและโควต้าคงเหลือจริง (status, quota, โควต้า, เช็คโควต้า, เช็คสถานะ)
      const isStatusQuotaCmd = /^(?:status|quota|โควต้า|เช็คโควต้า|เช็คสถานะ|ดูโควต้า|ยอดคงเหลือ)$/i.test(userText);
      if (isStatusQuotaCmd) {
        // หากเบราว์เซอร์เปิดอยู่และไม่ได้กำลังทำรายการ ให้ซิงค์สดจากหน้าเว็บ GLO ทันที เพื่อให้ยอดขายและโควต้าอัปเดตล่าสุดตรงกับกองสลาก 100%
        try {
          if (!orderQueue.isBusy()) {
            let activePage = PersistentBrowserManager.getActivePage();
            if (!activePage) {
              const isAlive = await isCdpAlive();
              if (isAlive) {
                const browserObj = await PersistentBrowserManager.getPage();
                activePage = browserObj.page;
              }
            }
            if (activePage && !activePage.isClosed()) {
              const u = activePage.url();
              if (!u.includes('/lotto-search') && !u.includes('/lotto-confirm') && !u.includes('/login') && !u.includes('/qr/')) {
                await quotaManager.syncQuotaFromLivePortal(activePage, false);
              }
            }
          }
        } catch (e: any) {
          console.warn('[QUOTA CMD SYNC] ไม่สามารถซิงค์สดขณะเรียกเช็คโควต้าได้ ใช้ค่าแคชล่าสุด:', e?.message);
        }

        const qStatus = quotaManager.getStatus();
        const salesStatus = OperatingHoursGuard.checkSalesStatus();
        const syncTime = qStatus.syncedAt
          ? new Date(qStatus.syncedAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }) + ' น.'
          : 'ตามระบบเริ่มต้น';

        let soldLine = `🛒 ยอดขายแล้ว: ${qStatus.usedQuota.toLocaleString()} ใบ`;
        if (qStatus.pendingQuota && qStatus.pendingQuota > 0) {
          soldLine += ` (รอชำระเงิน ${qStatus.pendingQuota.toLocaleString()} ใบ)`;
        }

        const statusReply = `📊 สถานะโควต้าสลาก N3 (ร้านธนกิจนำโชค)\n\n` +
          `🎫 โควต้าคงเหลือ: ${qStatus.remainingQuota.toLocaleString()} / ${qStatus.maxQuota.toLocaleString()} ใบ\n` +
          `${soldLine}\n` +
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
          await lineHandler.reply(replyToken, [FlexMessageBuilder.buildMainMenuMessage()]);
        }
        continue;
      }

      // คำสั่งสำหรับแอดมิน: ทดสอบส่งเลขมงคลจำลองให้ตัวเองดู (ทดสอบเลขมงคล, พรีวิวเลขมงคล)
      const isTestTeaserCmd = /^(?:ทดสอบเลขมงคล|พรีวิวเลขมงคล|test\s*lucky|preview\s*lucky)$/i.test(userText);
      if (isTestTeaserCmd) {
        if (isAdmin) {
          const upcoming = campaignService.getUpcomingDrawInfo();
          const sample = LuckyDistributor.generateSingleLuckyItem(userId, upcoming.drawDate, upcoming.thaiDate, 'คุณแอดมิน');
          const flexMsg = FlexMessageBuilder.buildPersonalizedLuckyTeaserMessage(sample);
          await lineHandler.reply(replyToken, [
            { type: 'text', text: `🧪 [ตัวอย่าง] การ์ดเลขมงคลเฉพาะบุคคลที่จะส่งให้ลูกค้า (แต่ละคนจะได้รับเลขกระจายไม่ซ้ำกัน):` },
            flexMsg
          ]);
        } else {
          await lineHandler.reply(replyToken, [FlexMessageBuilder.buildMainMenuMessage()]);
        }
        continue;
      }

      // คำสั่งสำหรับแอดมิน: ทดสอบการ์ดประกาศผลรางวัล (ทดสอบผลรางวัล, พรีวิวผลรางวัล)
      const isTestResultsCmd = /^(?:ทดสอบผลรางวัล|พรีวิวผลรางวัล|test\s*results|preview\s*results)$/i.test(userText);
      if (isTestResultsCmd) {
        if (isAdmin) {
          const lotteryData = campaignService.getLatestLotteryData();
          if (lotteryData) {
            const flexMsg = FlexMessageBuilder.buildDrawResultsMessage(lotteryData);
            await lineHandler.reply(replyToken, [
              { type: 'text', text: `🧪 [ตัวอย่าง] การ์ดแจ้งผลการออกรางวัลสลาก N3 ทางการที่จะส่งให้ลูกค้า:` },
              flexMsg
            ]);
          } else {
            await lineHandler.reply(replyToken, [{ type: 'text', text: '⚠️ ไม่พบข้อมูลผลสลากใน latest-lottery.json' }]);
          }
        } else {
          await lineHandler.reply(replyToken, [FlexMessageBuilder.buildMainMenuMessage()]);
        }
        continue;
      }

      // คำสั่งสำหรับแอดมิน: ส่งเลขมงคลกระจายไม่ซ้ำให้ลูกค้าทุกคนทันที (ส่งเลขมงคล, บรอดแคสต์เลขมงคล)
      const isBroadcastLuckyCmd = /^(?:ส่งเลขมงคล|บรอดแคสต์เลขมงคล|ยิงเลขมงคล|broadcast\s*lucky)$/i.test(userText);
      if (isBroadcastLuckyCmd) {
        if (isAdmin) {
          const stats = customerRegistry.getStats();
          await lineHandler.reply(replyToken, [{
            type: 'text',
            text: `🚀 เริ่มต้นกระบวนการสุ่มเลขมงคลกระจายไม่ซ้ำ และส่งให้ลูกค้าทั้งหมด (${stats.active} ราย) รอผลสรุปสักครู่ครับ...`
          }]);
          const result = await campaignService.sendPersonalizedLuckyTeasers({ force: true });
          await lineHandler.pushToAdmin([{
            type: 'text',
            text: `✅ [บรอดแคสต์เลขมงคลสำเร็จ]\n\n• งวดประจำวันที่: ${result.drawDate}\n• ส่งสำเร็จ: ${result.sentCount} ราย\n• ล้มเหลว: ${result.failedCount} ราย\n• รูปแบบ: กระจายเลข 3 หลักไม่ซ้ำกัน 100%`
          }]);
        } else {
          await lineHandler.reply(replyToken, [FlexMessageBuilder.buildMainMenuMessage()]);
        }
        continue;
      }

      // คำสั่งสำหรับแอดมิน: ส่งผลการออกรางวัลให้ลูกค้าทุกคนทันที (ส่งผลรางวัล, บรอดแคสต์ผลรางวัล)
      const isBroadcastResultsCmd = /^(?:ส่งผลรางวัล|บรอดแคสต์ผลรางวัล|ยิงผลรางวัล|broadcast\s*results)$/i.test(userText);
      if (isBroadcastResultsCmd) {
        if (isAdmin) {
          await lineHandler.reply(replyToken, [{
            type: 'text',
            text: `🏆 กำลังเริ่มส่งผลการออกรางวัลสลาก N3 ให้ลูกค้าทุกคน รอสักครู่ครับ...`
          }]);
          const result = await campaignService.broadcastDrawResults({ force: true });
          await lineHandler.pushToAdmin([{
            type: 'text',
            text: `✅ [บรอดแคสต์ผลรางวัลสำเร็จ]\n\n• งวดประจำวันที่: ${result.drawDate}\n• ส่งสำเร็จ: ${result.sentCount} ราย\n• ล้มเหลว: ${result.failedCount} ราย`
          }]);
        } else {
          await lineHandler.reply(replyToken, [FlexMessageBuilder.buildMainMenuMessage()]);
        }
        continue;
      }

      // คำสั่งสำหรับแอดมิน: ดูข้อมูลลูกค้าทั้งหมดและสถิติแคมเปญ (ลูกค้าทั้งหมด, สถิติแคมเปญ, สมาชิก)
      const isCustomerStatsCmd = /^(?:ลูกค้าทั้งหมด|สถิติแคมเปญ|สมาชิก|ดูสถิติ|customer\s*stats|users)$/i.test(userText);
      if (isCustomerStatsCmd) {
        if (isAdmin) {
          const stats = customerRegistry.getStats();
          const upcoming = campaignService.getUpcomingDrawInfo();
          await lineHandler.reply(replyToken, [{
            type: 'text',
            text: `👥 ข้อมูลลูกค้าและสถิติการส่งแคมเปญ (ร้านธนกิจนำโชค)\n\n` +
              `• ลูกค้าทั้งหมดในระบบ: ${stats.total.toLocaleString()} ราย\n` +
              `• สถานะ Active (เปิดรับข้อความ): ${stats.active.toLocaleString()} ราย\n` +
              `• บล็อกหรือเลิกติดตาม: ${stats.blocked.toLocaleString()} ราย\n` +
              `• งวดออกรางวัลถัดไป: ${upcoming.thaiDate}\n\n` +
              `💡 คำสั่งควบคุมแอดมิน:\n` +
              `• "ทดสอบเลขมงคล" - ดูตัวอย่างการ์ดเลขมงคลกระจาย\n` +
              `• "ส่งเลขมงคล" - บรอดแคสต์เลขมงคลให้ลูกค้าทุกคน\n` +
              `• "ทดสอบผลรางวัล" - ดูตัวอย่างการ์ดผลรางวัล\n` +
              `• "ส่งผลรางวัล" - บรอดแคสต์ผลรางวัลให้ลูกค้าทุกคน`
          }]);
        } else {
          await lineHandler.reply(replyToken, [FlexMessageBuilder.buildMainMenuMessage()]);
        }
        continue;
      }

      // คำสั่งสำหรับลูกค้าทั่วไป: ตรวจผลรางวัล / ผลสลากล่าสุด
      const isResultsInquiryCmd = /^(?:ผลรางวัล.*|ผลสลาก.*|ตรวจหวย.*|ตรวจรางวัล.*|หวยออกอะไร.*|ผล\s*n3.*|งวดล่าสุด.*|ผลการออกรางวัล.*)$/i.test(userText);
      if (isResultsInquiryCmd) {
        const lotteryData = campaignService.getLatestLotteryData();
        if (lotteryData) {
          const flexMsg = FlexMessageBuilder.buildDrawResultsMessage(lotteryData);
          await lineHandler.reply(replyToken, [flexMsg]);
        } else {
          await lineHandler.reply(replyToken, [{
            type: 'text',
            text: `🔍 ท่านสามารถตรวจผลรางวัลสลาก N3 ได้ที่เว็บไซต์ร้าน:\n${CONFIG.DREAM_PREDICTION_URL}`
          }]);
        }
        continue;
      }

      // คำสั่งสำหรับลูกค้าทั่วไป: ขอคำแนะนำสั่งซื้อสลาก N3
      const isOrderGuidanceCmd = /^(?:สั่งซื้อสลาก|ซื้อสลาก|จองสลาก|สั่งสลาก)$/i.test(userText);
      if (isOrderGuidanceCmd) {
        await lineHandler.reply(replyToken, [FlexMessageBuilder.buildHowToOrderMessage()]);
        continue;
      }

      // คำสั่งสำหรับลูกค้าทั่วไป: สูตร 6 กลับ / สูตรเลขชุด 6 กลับ
      const isSixPermutationCmd = /^(?:สูตร\s*6\s*กลับ|สูตรเลขชุด\s*6\s*กลับ|6\s*กลับ|เลขชุด\s*6\s*กลับ)$/i.test(userText);
      if (isSixPermutationCmd) {
        await lineHandler.reply(replyToken, [FlexMessageBuilder.buildSixPermutationGuidanceMessage()]);
        continue;
      }

      // 1. ตรวจสอบคำสั่งล็อกอิน Admin (ครอบคลุม Q, q, qr, QR, login, ล็อกอิน ทุกรูปแบบ)
      const isAdminLoginCmd = /^(?:q|qr|qrcode|qr\s*code|login|log\s*in|signin|ล็อกอิน|คิว|ขอคิว|ขอ\s*qr)$/i.test(userText);
      if (isAdminLoginCmd) {
        if (isAdmin) {
          triggerAdminLoginQR('แอดมินสั่งขอรับ QR Code เข้าสู่ระบบเป๋าตัง', replyToken);
        } else {
          // ถ้าไม่ใช่ Admin: ห้ามส่ง QR เด็ดขาด! ส่งการ์ดเมนูหลักแทน
          console.warn(`[SECURITY] ผู้ใช้ทั่วไป ${userId} พยายามสั่ง ${userText} -> ปฏิเสธและส่งเมนูหลัก`);
          await lineHandler.reply(replyToken, [FlexMessageBuilder.buildMainMenuMessage()]);
        }
        continue;
      }

      // 2. แกะคำสั่งซื้อสลาก (รองรับทั้งเลขเดี่ยวและหลายเลขในบิลเดียว)
      const parsedItems = preParsedOrder || parseOrderMessage(userText);
      if (!parsedItems || parsedItems.length === 0) {
        // ตรวจจับกรณีลูกค้าพยายามสั่งซื้อเลข 2 หลัก (เช่น "89", "89 1", "สั่งซื้อ 89 1 ใบ")
        const thaiConverted = userText.trim().replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));
        const twoDigitMatch = thaiConverted
          .replace(/^(?:ขอสั่งซื้อ|ขอซื้อสลาก|ซื้อสลาก|สั่งสลาก|ขอสลาก|สั่งซื้อ|ขอซื้อ|ขอสั่ง|เอาเลข|ซื้อเลข|สั่งเลข|เลือกเลข|ขอเลข|หาเลข|สั่ง|ซื้อ|เอา|ขอ|เลือก|หา|สลาก|เลข|\s)+/i, '')
          .match(/^(\d{2})(?:[\s=\-xX*:]+([0-9]+))?(?:\s*ใบ)?$/);

        if (twoDigitMatch) {
          const twoNum = twoDigitMatch[1];
          const twoQty = twoDigitMatch[2] ? parseInt(twoDigitMatch[2], 10) : 1;
          const s1 = `0${twoNum}`;
          const s2 = `9${twoNum}`;
          console.log(`[2-DIGIT ORDER DETECTED] ลูกค้าสั่งเลข 2 ตัว "${twoNum}" (${twoQty} ใบ) -> แนะนำสลาก N3 3 หลัก`);
          await lineHandler.reply(replyToken, [
            {
              type: 'text',
              text: `💡 สลาก N3 เป็นสลากตัวเลข 3 หลัก (000-999) ใบละ 20 บาท\n\nหากท่านต้องการลุ้นรางวัลเลขท้าย 2 ตัว "${twoNum}" ระบบจะตรวจผลจาก 2 ตัวท้ายของสลาก 3 หลักครับ เช่น ${s1} หรือ ${s2}\n\n👉 สามารถแตะปุ่ม "🛒 สั่งซื้อสลาก N3" ด้านล่าง เพื่อเลือกเลขและจำนวนใบผ่านตารางออนไลน์ได้ทันทีครับ 🙏`
            }
          ]);
          continue;
        }

        await lineHandler.reply(replyToken, [FlexMessageBuilder.buildMainMenuMessage()]);
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

      // 5. เปิดอนิเมชันจุดกำลังพิมพ์ (LINE Native Loading Indicator) — ฟรี 100% ไม่เปลือง ReplyToken และไม่คิดโควต้า
      await lineHandler.showLoading(userId, 35);
      customerRegistry.incrementOrderCount(userId);

      // 6. นำเข้าคิวสั่งซื้อ โดยสงวน ReplyToken ไว้ส่งภาพ QR Code ฟรี 100% (Reply-First Architecture)
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
      orderHeartbeat.start(orderTask, () => orderQueue.getPosition(orderTask.orderId));
      const estSeconds = orderQueue.getEstimatedWaitTime(queuePos, parsedItems.length);

      // สำหรับออเดอร์ทั่วไป (คิวที่ 1-2): สงวน ReplyToken ไว้ส่ง QR Code สุดท้าย เพื่อให้ฟรี 100% ตลอดชีพ
      // เฉพาะกรณีคิวยาวมาก (คิว >= 3 และเวลารอ > 45 วินาที): แจ้งเตือนข้อความรอคิวก่อน ReplyToken หมดอายุ
      if (queuePos >= 3 && estSeconds > 45) {
        const waitingMessage = `✨ ร้านสลาก N3 ธนกิจนำโชค ได้รับคำสั่งซื้อแล้วครับ (คิวที่ ${queuePos})\n\n🎯 ชุดเลขมงคล: ${formattedSummary}\n🔢 รวมทั้งหมด: ${totalQuantity} ใบ — ยอดรวม ${totalPrice} บาท\n⏱️ มีออเดอร์ก่อนหน้า กำลังจัดทำตามคิว (รอประมาณ ~${estSeconds} วินาที)\n\n⚡ ขอให้เฮงๆ ปังๆ ถูกรางวัลใหญ่ 3 ตัวตรงงวดนี้นะครับ! 💰🎉`;
        console.log(`[ORDER ACK QUEUE DELAY] แจ้งสถานะคิวล่วงหน้าเนื่องจากคิวยาว (คิวที่ ${queuePos}) ให้ลูกค้า ${userId}`);
        const replySuccess = await lineHandler.reply(replyToken, [{ type: 'text', text: waitingMessage }]);
        orderTask.hasRepliedQueue = replySuccess;
      } else {
        console.log(`[ORDER ENQUEUED ZERO-QUOTA] ออเดอร์ ${orderTask.orderId} เข้าคิวลำดับที่ ${queuePos} — สงวน ReplyToken ไว้ส่งมอบ QR Code ฟรี 100% (ไม่ใช้โควต้า Push)`);
      }
    }
  }
});

const requireAdminAuth = (req: Request, res: Response, next: () => void) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';

  if (CONFIG.ADMIN_API_KEY) {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== CONFIG.ADMIN_API_KEY) {
      res.status(401).json({ error: 'Unauthorized: Invalid Admin API Key' });
      return;
    }
  } else if (!isLocal) {
    res.status(401).json({ error: 'Unauthorized: ADMIN_API_KEY is not configured for public access' });
    return;
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

app.get('/api/line-quota', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const lineQuota = await lineHandler.getQuotaStatus(true);
  res.json({ success: true, lineQuota });
});

app.get('/status', async (_req: Request, res: Response) => {
  const lineQuota = await lineHandler.getQuotaStatus().catch(() => null);
  res.json({
    status: 'online',
    queueLength: orderQueue.getQueueLength(),
    quota: quotaManager.getStatus(),
    lineQuota: lineQuota || { type: 'unknown', value: 300, totalUsage: 300, remaining: 0, isExhausted: true },
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
    try { orderHeartbeat.stopAll(); } catch {}
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

    // รอบ Background Sync ทุก 2 นาทีเมื่อเบราว์เซอร์เปิดอยู่ (Active) และไม่ได้กำลังประมวลผลออเดอร์
    const quotaSyncTimer = setInterval(async () => {
      try {
        if (orderQueue.isBusy()) return;
        const activePage = PersistentBrowserManager.getActivePage();
        if (activePage && !activePage.isClosed()) {
          const u = activePage.url();
          if (!u.includes('/lotto-search') && !u.includes('/lotto-confirm') && !u.includes('/login') && !u.includes('/qr/')) {
            await quotaManager.syncQuotaFromLivePortal(activePage, false);
          }
        }
      } catch {}
    }, 2 * 60 * 1000);
    quotaSyncTimer.unref();

    // เริ่มต้นระบบตั้งเวลาส่งเลขมงคลกระจายและส่งผลรางวัลอัตโนมัติ (Campaign Auto Scheduler)
    campaignService.startAutoScheduler();

    // เริ่มต้นระบบตั้งเวลา Logoff ประจำวัน (23:00 น.) และแจ้งเตือนเปิดร้าน (06:00 น.)
    const dailyScheduleService = DailyScheduleService.getInstance(lineHandler, orderQueue);
    dailyScheduleService.start();

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
