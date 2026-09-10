import { Request, Response, NextFunction, RequestHandler } from 'express';
import { TelegramService } from '../notify/telegram-service';

export interface JailedIpInfo {
  ip: string;
  bannedUntil: number;
  remainingSeconds: number;
  reason: string;
  strikeCount: number;
}

/**
 * CyberJailManager : ระบบจำคุกและตัดการเชื่อมต่อ IP ผู้โจมตีอัตโนมัติ (Threat Intelligence & Auto-Jail)
 * หากมี IP พยายามสแกนหาช่องโหว่ (.env, .git, SQLi, XSS) หรือยิง DDoS ซ้ำๆ จะถูกแบนทันที
 */
export class CyberJailManager {
  private static instance: CyberJailManager | null = null;
  private jailedIps: Map<string, { bannedUntil: number; reason: string; strikeCount: number }> = new Map();
  private strikeMap: Map<string, { count: number; lastStrike: number; reasons: string[] }> = new Map();
  private alertedJailedIps: Set<string> = new Set();
  private telegramService: TelegramService;

  private constructor(telegramService?: TelegramService) {
    this.telegramService = telegramService || TelegramService.getInstance();
    
    // ตั้งเวลาเคลียร์ IP ที่พ้นโทษทุก 1 นาที
    const cleanTimer = setInterval(() => this.cleanExpired(), 60000);
    if (cleanTimer.unref) cleanTimer.unref();
  }

  public static getInstance(telegramService?: TelegramService): CyberJailManager {
    if (!CyberJailManager.instance) {
      CyberJailManager.instance = new CyberJailManager(telegramService);
    }
    return CyberJailManager.instance;
  }

  /**
   * ตรวจสอบว่า IP นี้กำลังติดโทษแบน (Jailed) อยู่หรือไม่
   */
  public isJailed(ip: string): boolean {
    const jail = this.jailedIps.get(ip);
    if (!jail) return false;

    if (Date.now() > jail.bannedUntil) {
      this.jailedIps.delete(ip);
      this.alertedJailedIps.delete(ip);
      return false;
    }
    return true;
  }

  /**
   * ดึงข้อมูลเวลาคงเหลือของการแบน
   */
  public getRemainingSeconds(ip: string): number {
    const jail = this.jailedIps.get(ip);
    if (!jail) return 0;
    const remaining = Math.ceil((jail.bannedUntil - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  }

  /**
   * สั่งจำคุก (Jail/Ban) IP ทันทีตามระยะเวลาที่กำหนด
   */
  public jailIp(ip: string, reason: string, durationMinutes: number = 15, path?: string): void {
    // ป้องกันการแบน localhost หรือ internal IP
    if (this.isLocalhost(ip)) {
      return;
    }

    const bannedUntil = Date.now() + durationMinutes * 60 * 1000;
    const strikes = (this.strikeMap.get(ip)?.count || 0) + 1;
    this.jailedIps.set(ip, { bannedUntil, reason, strikeCount: strikes });
    this.strikeMap.delete(ip);

    console.warn(`[CYBER JAIL] 🚨 สั่งแบน IP ${ip} เป็นเวลา ${durationMinutes} นาที! สาเหตุ: ${reason}`);

    // ส่งแจ้งเตือน Telegram (ครั้งเดียวต่อการแบน 1 รอบ)
    if (!this.alertedJailedIps.has(ip)) {
      this.alertedJailedIps.add(ip);
      this.telegramService.notifySecurityThreat({
        event: 'ตรวจพบการโจมตีและสั่งแบน IP อัตโนมัติ (Auto-Jail)',
        ip,
        reason,
        durationMinutes,
        path
      }).catch(() => {});
    }
  }

  /**
   * บันทึกความผิด (Strike) หากครบเกณฑ์จะสั่ง Auto-Jail ทันที
   */
  public recordStrike(ip: string, reason: string, strikeLimit: number = 3, durationMinutes: number = 15, path?: string): boolean {
    if (this.isLocalhost(ip)) return false;

    const now = Date.now();
    const windowMs = 5 * 60 * 1000; // นับรวมความผิดภายใน 5 นาที
    let entry = this.strikeMap.get(ip);

    if (!entry || (now - entry.lastStrike > windowMs)) {
      entry = { count: 1, lastStrike: now, reasons: [reason] };
    } else {
      entry.count++;
      entry.lastStrike = now;
      entry.reasons.push(reason);
    }
    this.strikeMap.set(ip, entry);

    if (entry.count >= strikeLimit) {
      const combinedReason = `กระทำความผิดซ้ำ ${entry.count} ครั้ง (${entry.reasons.slice(-3).join(', ')})`;
      this.jailIp(ip, combinedReason, durationMinutes, path);
      return true;
    }
    return false;
  }

  public cleanExpired(): void {
    const now = Date.now();
    for (const [ip, jail] of this.jailedIps.entries()) {
      if (now > jail.bannedUntil) {
        this.jailedIps.delete(ip);
        this.alertedJailedIps.delete(ip);
      }
    }
    for (const [ip, strike] of this.strikeMap.entries()) {
      if (now - strike.lastStrike > 10 * 60 * 1000) {
        this.strikeMap.delete(ip);
      }
    }
  }

  public getJailedList(): JailedIpInfo[] {
    const now = Date.now();
    const list: JailedIpInfo[] = [];
    for (const [ip, jail] of this.jailedIps.entries()) {
      if (now <= jail.bannedUntil) {
        list.push({
          ip,
          bannedUntil: jail.bannedUntil,
          remainingSeconds: Math.ceil((jail.bannedUntil - now) / 1000),
          reason: jail.reason,
          strikeCount: jail.strikeCount
        });
      }
    }
    return list;
  }

  public unjail(ip: string): void {
    this.jailedIps.delete(ip);
    this.strikeMap.delete(ip);
    this.alertedJailedIps.delete(ip);
  }

  public resetForTest(): void {
    this.jailedIps.clear();
    this.strikeMap.clear();
    this.alertedJailedIps.clear();
  }

  public getMetrics(): { totalJailed: number; activeStrikes: number } {
    this.cleanExpired();
    return {
      totalJailed: this.jailedIps.size,
      activeStrikes: this.strikeMap.size
    };
  }

  private isLocalhost(ip: string): boolean {
    return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.');
  }
}

/**
 * MultiTierRateLimiter : ระบบคำนวณและจำกัดอัตราคำขอหลายระดับ (Sliding Window Algorithm)
 */
export class MultiTierRateLimiter {
  private requests: Map<string, number[]> = new Map();

  /**
   * ตรวจสอบอัตราคำขอ (คืนค่า true หากผ่าน, false หากเกินขีดจำกัด)
   */
  public check(key: string, limit: number, windowMs: number = 60000): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const valid = timestamps.filter(t => now - t < windowMs);

    if (valid.length >= limit) {
      return false;
    }

    valid.push(now);
    this.requests.set(key, valid);

    // ล้างหน่วยความจำเมื่อมีคีย์มากเกิน 5,000 คีย์
    if (this.requests.size > 5000) {
      for (const [k, v] of this.requests.entries()) {
        if (v.length === 0 || now - v[v.length - 1] > windowMs * 2) {
          this.requests.delete(k);
        }
      }
    }

    return true;
  }

  public checkDetailed(key: string, limit: number, windowMs: number = 60000): { allowed: boolean; count: number; limit: number } {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const valid = timestamps.filter(t => now - t < windowMs);
    const allowed = valid.length < limit;

    if (allowed) {
      valid.push(now);
      this.requests.set(key, valid);
    }
    return { allowed, count: valid.length, limit };
  }

  public resetForTest(): void {
    this.requests.clear();
  }

  public getMetrics(): { activeKeys: number } {
    return {
      activeKeys: this.requests.size
    };
  }
}

/**
 * ฟังก์ชันดึง Client IP ที่แท้จริงผ่าน Cloudflare / Reverse Proxy
 */
export function extractClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp) return cfIp.trim();

  const xRealIp = req.headers['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp) return xRealIp.trim();

  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor) {
    const firstIp = xForwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * CyberGuard Middleware : มิดเดิลแวร์ความปลอดภัยระดับสูงสุดสำหรับ Express.js
 */
export function createCyberGuardMiddleware(
  jailManager: CyberJailManager = CyberJailManager.getInstance(),
  rateLimiter: MultiTierRateLimiter = new MultiTierRateLimiter()
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = extractClientIp(req);
    const rawUrl = req.url || '';
    let decodedUrl = '';
    try {
      decodedUrl = decodeURIComponent(rawUrl).toLowerCase();
    } catch {
      decodedUrl = rawUrl.toLowerCase();
    }

    // -------------------------------------------------------------------------
    // 1. ดักจับ IP ที่ติดโทษแบน (Jailed IP Check)
    // -------------------------------------------------------------------------
    if (jailManager.isJailed(ip)) {
      const remaining = jailManager.getRemainingSeconds(ip);
      res.setHeader('Retry-After', remaining);
      res.setHeader('X-Security-Action', 'IP_JAILED');
      res.status(403).json({
        error: 'Forbidden',
        message: 'Your IP has been temporarily jailed due to repeated cyber security violations.',
        retryAfterSeconds: remaining
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 2. ตรวจจับการสแกนหาไฟล์ลับ / Directory Traversal / Exploit Probing
    // -------------------------------------------------------------------------
    const maliciousPatterns = [
      '..',
      '/.env',
      '/.git',
      '/.svn',
      '/.htaccess',
      'storagestate',
      'browser_profile',
      'quota.json',
      'bot.pid',
      '.log',
      'webhook-url',
      '/node_modules',
      '/package.json',
      '/tsconfig.json',
      'wp-login',
      'wp-admin',
      'xmlrpc.php',
      'phpmyadmin',
      '/etc/passwd',
      '/etc/shadow',
      'union select',
      '<script',
      'javascript:'
    ];

    const isMalicious = maliciousPatterns.some(pat => decodedUrl.includes(pat));
    if (isMalicious) {
      console.warn(`[SECURITY BLOCKED] ปฏิเสธคำขอเข้าถึง Sensitive Path จาก IP ${ip}: ${req.method} ${rawUrl}`);
      
      // บันทึกความผิด: หากทำซ้ำ 3 ครั้ง สั่ง Auto-Jail ทันที 15 นาที
      jailManager.recordStrike(ip, `พยายามเข้าถึง Sensitive Path (${rawUrl.slice(0, 50)})`, 3, 15, rawUrl);
      
      res.setHeader('X-Security-Action', 'PATH_BLOCKED');
      res.status(403).send('Forbidden: Access Denied by Security Policy');
      return;
    }

    // -------------------------------------------------------------------------
    // 3. ระบบ Multi-Tier Rate Limiting (จำกัดอัตราคำขอหลายระดับ)
    // -------------------------------------------------------------------------
    // 3.1 Tier 1: Global Rate Limit (คำขอรวมสูงสุด 200 ครั้ง/นาทีต่อ IP)
    const isGlobalAllowed = rateLimiter.check(`global:${ip}`, 200, 60000);
    if (!isGlobalAllowed) {
      console.warn(`[DDoS MITIGATION] IP ${ip} เกินขีดจำกัด Global Rate Limit (200 req/min)`);
      // บันทึกความผิด: หากยิงถล่มจนติด 429 เกิน 5 ครั้ง สั่ง Auto-Jail ทันที
      jailManager.recordStrike(ip, 'DDoS / HTTP Flooding เกิน 200 ครั้ง/นาที', 5, 15, req.path);

      res.setHeader('Retry-After', '60');
      res.status(429).send('Too Many Requests: Global Rate Limit Exceeded');
      return;
    }

    // 3.2 Tier 2: Specific Endpoint Limits
    const pathLower = req.path.toLowerCase();

    // Webhook Endpoint (120 req/min)
    if (pathLower.startsWith('/webhook')) {
      const isWebhookAllowed = rateLimiter.check(`webhook:${ip}`, 120, 60000);
      if (!isWebhookAllowed) {
        console.warn(`[RATE LIMIT] IP ${ip} เกินขีดจำกัด Webhook (120 req/min)`);
        jailManager.recordStrike(ip, 'Webhook Flooding เกิน 120 ครั้ง/นาที', 5, 15, req.path);
        res.setHeader('Retry-After', '60');
        res.status(429).send('Too Many Requests: Webhook Rate Limit Exceeded');
        return;
      }
    }
    // Orders API (30 req/min)
    else if (pathLower.startsWith('/api/order')) {
      const isOrderAllowed = rateLimiter.check(`order:${ip}`, 30, 60000);
      if (!isOrderAllowed) {
        console.warn(`[RATE LIMIT] IP ${ip} เกินขีดจำกัด Order API (30 req/min)`);
        res.setHeader('Retry-After', '60');
        res.status(429).json({ error: 'Too Many Requests', message: 'Order request rate limit exceeded' });
        return;
      }
    }
    // Admin API (15 req/min)
    else if (pathLower.startsWith('/api/admin')) {
      const isAdminAllowed = rateLimiter.check(`admin:${ip}`, 15, 60000);
      if (!isAdminAllowed) {
        console.warn(`[RATE LIMIT] IP ${ip} เกินขีดจำกัด Admin API (15 req/min)`);
        jailManager.recordStrike(ip, 'Admin API Brute-force / Flooding', 4, 30, req.path);
        res.setHeader('Retry-After', '60');
        res.status(429).json({ error: 'Too Many Requests', message: 'Admin API rate limit exceeded' });
        return;
      }
    }

    // -------------------------------------------------------------------------
    // 4. ติดตั้ง Enterprise Security Headers ครบชุด
    // -------------------------------------------------------------------------
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self "https://n3.glolotteryshop.com")');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    next();
  };
}
