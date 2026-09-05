import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config';

export const USER_DATA_DIR = path.join(__dirname, '../../data/browser_profile');
export const BROWSER_MODE_FILE = path.join(__dirname, '../../data/browser_mode.json');
export const CDP_PORT = (CONFIG as any).CDP_PORT || 9222;

export function getChromeExecutablePath(): string {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
  ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }

  try {
    return chromium.executablePath();
  } catch {
    return 'chrome';
  }
}

export function isCdpAlive(port: number = CDP_PORT): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve(res.statusCode === 200 && data.includes('Browser'));
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

export function sanitizeChromePreferences(userDataDir: string = USER_DATA_DIR): void {
  const prefsPath = path.join(userDataDir, 'Default', 'Preferences');
  if (fs.existsSync(prefsPath)) {
    try {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
      let modified = false;
      if (prefs.partition && prefs.partition.per_host_zoom_levels) {
        delete prefs.partition.per_host_zoom_levels;
        modified = true;
      }
      if (prefs.profile && prefs.profile.default_zoom_level !== undefined && prefs.profile.default_zoom_level !== 0) {
        prefs.profile.default_zoom_level = 0;
        modified = true;
      }
      if (modified) {
        fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');
        console.log('[BROWSER] ล้างค่า per_host_zoom_levels ใน Chrome Preferences เพื่อให้ความละเอียดหน้าจอและ QR Code คมชัดระดับ Retina สำเร็จ');
      }
    } catch (e: any) {
      console.warn('[BROWSER PREFS WARNING] ไม่สามารถคลีน Preferences ได้:', e.message);
    }
  }
}

export async function enforceHighDpiSession(page: Page): Promise<void> {
  try {
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.resetPageScaleFactor').catch(() => {});
    await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.0 }).catch(() => {});
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    }).catch(() => {});
  } catch {}
}

export class PersistentBrowserManager {
  private static browser: Browser | null = null;
  private static context: BrowserContext | null = null;
  private static page: Page | null = null;
  private static currentHeadless: boolean | null = null;

  public static async getPage(headless: boolean = CONFIG.HEADLESS): Promise<{ context: BrowserContext; page: Page }> {
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }
    sanitizeChromePreferences(USER_DATA_DIR);

    // 1. ตรวจสอบว่าใน Node.js Process ปัจจุบันมี Context และ Page ที่ยังใช้งานได้จริงอยู่แล้วหรือไม่
    if (this.context && this.page && !this.page.isClosed()) {
      if (this.currentHeadless === headless) {
        return { context: this.context, page: this.page };
      } else {
        console.log(`[BROWSER] สลับโหมดเบราว์เซอร์จาก headless=${this.currentHeadless} เป็น headless=${headless}...`);
        await this.terminateBrowserProcess();
      }
    }

    // 2. ตรวจสอบว่ามี Chrome Process ทำงานอยู่แล้วผ่าน Chrome DevTools Protocol (CDP Port) หรือไม่
    const isAlive = await isCdpAlive(CDP_PORT);
    let prevHeadless: boolean | null = null;
    if (fs.existsSync(BROWSER_MODE_FILE)) {
      try {
        const modeData = JSON.parse(fs.readFileSync(BROWSER_MODE_FILE, 'utf-8'));
        prevHeadless = modeData.headless;
      } catch {}
    }

    if (isAlive) {
      // หาก Chrome เดิมเปิดอยู่ แต่ต้องการเปลี่ยนโหมด Headless ให้ปิดตัวเดิมก่อน
      if (prevHeadless !== null && prevHeadless !== headless) {
        console.log(`[BROWSER] โหมดเบราว์เซอร์เดิม (headless=${prevHeadless}) ไม่ตรงกับที่ต้องการ (headless=${headless}) กำลังรีเซ็ต Chrome...`);
        await this.terminateBrowserProcess();
      } else {
        // Chrome เดิมเปิดอยู่และโหมดตรงกัน -> เชื่อมต่อผ่าน CDP ทันที (รักษา Session & แท็บเดิม 100%)
        try {
          console.log(`[BROWSER] พบ Chrome กำลังทำงานอยู่บน CDP พอร์ต ${CDP_PORT} กำลังเชื่อมต่อเข้าสู่เซสชันเดิม...`);
          this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
          
          this.browser.on('disconnected', () => {
            console.log('[BROWSER EVENT] CDP Client หลุดจากการเชื่อมต่อ Chrome');
            PersistentBrowserManager.context = null;
            PersistentBrowserManager.page = null;
            PersistentBrowserManager.browser = null;
          });

          const contexts = this.browser.contexts();
          this.context = contexts.length > 0 ? contexts[0] : await this.browser.newContext({
            viewport: { width: 1440, height: 900 },
            deviceScaleFactor: 2,
            permissions: ['geolocation'],
            geolocation: { latitude: 13.7563, longitude: 100.5018, accuracy: 10 }
          });

          try {
            await this.context.grantPermissions(['geolocation'], { origin: 'https://n3.glolotteryshop.com' });
            await this.context.setGeolocation({ latitude: 13.7563, longitude: 100.5018, accuracy: 10 });
          } catch {}

          const pages = this.context.pages();
          let targetPage = pages.find(p => !p.isClosed() && p.url().includes('glolotteryshop.com'));
          if (!targetPage) {
            targetPage = pages.find(p => !p.isClosed());
          }
          if (!targetPage) {
            targetPage = await this.context.newPage();
          }

          this.page = targetPage;
          this.currentHeadless = headless;
          this.attachPageListeners(this.page);
          await enforceHighDpiSession(this.page);

          console.log(`[BROWSER CDP] เชื่อมต่อกับ Chrome เดิมสำเร็จ (URL: ${this.page.url()})`);
          return { context: this.context, page: this.page };
        } catch (err: any) {
          console.warn(`[BROWSER CDP RECONNECT FAILED] เชื่อมต่อ Chrome เดิมไม่สำเร็จ (${err.message}) กำลังเปิดโปรเซสใหม่...`);
          await this.terminateBrowserProcess();
        }
      }
    }

    // 3. กรณี Chrome ยังไม่ได้เปิด: เคลียร์ orphaned lockfile ก่อนเปิด Chrome Process ใหม่
    const lockfilePath = path.join(USER_DATA_DIR, 'lockfile');
    const singletonLockPath = path.join(USER_DATA_DIR, 'SingletonLock');
    try { if (fs.existsSync(lockfilePath)) fs.unlinkSync(lockfilePath); } catch {}
    try { if (fs.existsSync(singletonLockPath)) fs.unlinkSync(singletonLockPath); } catch {}

    // 4. สปอว์น Chrome Detached Process อิสระ เพื่อให้เบราว์เซอร์ไม่ถูกผูกติดกับ Node.js Lifecycle
    const chromeExe = getChromeExecutablePath();
    console.log(`[BROWSER LAUNCH] กำลังเปิด Chrome Detached Process (headless: ${headless}, cdp: ${CDP_PORT})...`);

    const standardUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

    const browserArgs = [
      `--user-data-dir=${USER_DATA_DIR}`,
      `--remote-debugging-port=${CDP_PORT}`,
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--enable-features=Geolocation',
      '--window-size=1440,900',
      '--force-device-scale-factor=2',
      '--hide-scrollbars',
      '--mute-audio',
      `--user-agent=${standardUserAgent}`
    ];

    if (headless) {
      browserArgs.push('--headless=new');
    }
    const spawnArgs = [...browserArgs, 'about:blank'];

    try {
      const chromeProc = spawn(chromeExe, spawnArgs, {
        detached: true,
        stdio: 'ignore',
        windowsHide: headless
      });
      chromeProc.unref();

      // บันทึกสถานะโหมดเบราว์เซอร์
      try {
        fs.writeFileSync(BROWSER_MODE_FILE, JSON.stringify({
          headless,
          cdpPort: CDP_PORT,
          pid: chromeProc.pid,
          startedAt: new Date().toISOString()
        }, null, 2), 'utf-8');
      } catch {}

      // รอให้ Chrome CDP Port 9222 พร้อมทำงาน (สูงสุด 15 วินาที)
      const startTime = Date.now();
      let isReady = false;
      while (Date.now() - startTime < 15000) {
        await new Promise(r => setTimeout(r, 300));
        if (await isCdpAlive(CDP_PORT)) {
          isReady = true;
          break;
        }
      }

      if (isReady) {
        this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
        
        this.browser.on('disconnected', () => {
          console.log('[BROWSER EVENT] CDP Client disconnected from Chrome');
          PersistentBrowserManager.context = null;
          PersistentBrowserManager.page = null;
          PersistentBrowserManager.browser = null;
        });

        const contexts = this.browser.contexts();
        this.context = contexts.length > 0 ? contexts[0] : await this.browser.newContext({
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 2,
          permissions: ['geolocation'],
          geolocation: { latitude: 13.7563, longitude: 100.5018, accuracy: 10 }
        });

        try {
          await this.context.grantPermissions(['geolocation'], { origin: 'https://n3.glolotteryshop.com' });
          await this.context.setGeolocation({ latitude: 13.7563, longitude: 100.5018, accuracy: 10 });
        } catch {}

        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
        this.currentHeadless = headless;
        this.attachPageListeners(this.page);
        await enforceHighDpiSession(this.page);

        console.log(`[BROWSER READY] Chrome Detached Process พร้อมใช้งานแล้ว (PID: ${chromeProc.pid}, Port: ${CDP_PORT})`);
        return { context: this.context, page: this.page };
      }
    } catch (spawnErr: any) {
      console.warn('[BROWSER SPAWN WARNING] สปอว์น Detached Chrome ล้มเหลว กำลังใช้ Fallback...', spawnErr.message);
    }

    // 5. Fallback: กรณีสปอว์น Detached ไม่สำเร็จ ให้ใช้ launchPersistentContext ดั้งเดิม
    console.log('[BROWSER FALLBACK] กำลังเปิด Chrome Persistent Context แบบตรง...');
    const launchOpts = {
      headless,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      args: browserArgs.filter(a => !a.startsWith('--user-data-dir=')),
      userAgent: standardUserAgent,
      permissions: ['geolocation'],
      geolocation: { latitude: 13.7563, longitude: 100.5018, accuracy: 10 },
      timeout: 25000
    };

    try {
      this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        channel: 'chrome',
        ...launchOpts
      });
    } catch {
      this.context = await chromium.launchPersistentContext(USER_DATA_DIR, launchOpts);
    }

    try {
      await this.context.grantPermissions(['geolocation'], { origin: 'https://n3.glolotteryshop.com' });
      await this.context.setGeolocation({ latitude: 13.7563, longitude: 100.5018, accuracy: 10 });
    } catch {}

    this.currentHeadless = headless;
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    this.attachPageListeners(this.page);

    return { context: this.context, page: this.page! };
  }

  private static attachPageListeners(p: Page): void {
    p.on('crash', () => {
      console.warn('[BROWSER EVENT] ตรวจพบหน้าต่างเว็บเบราว์เซอร์แครช (Renderer Crash)');
      if (PersistentBrowserManager.page === p) {
        PersistentBrowserManager.page = null;
      }
    });
    p.on('close', () => {
      if (PersistentBrowserManager.page === p) {
        PersistentBrowserManager.page = null;
      }
    });
  }

  public static isBrowserOpen(): boolean {
    return !!(this.context && this.page && !this.page.isClosed());
  }

  public static getActivePage(): Page | null {
    if (this.context) {
      try {
        const pages = this.context.pages();
        const activePage = pages.find(p => !p.isClosed());
        return activePage || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * ตัดการเชื่อมต่อ CDP Client ของ Node.js โดยไม่ปิด Chrome Browser Process
   * (ใช้สำหรับกรณีรีสตาร์ทหรืออัปเดตบอท เพื่อคงหน้าต่างเว็บและ Session ไว้)
   */
  public static async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close().catch(() => {});
      } catch {}
      this.browser = null;
    }
    this.context = null;
    this.page = null;
    this.currentHeadless = null;
  }

  /**
   * สั่งปิด Chrome Browser Process ทั้งหมดอย่างสมบูรณ์ และคืน RAM สู่ระบบ
   * (ใช้สำหรับกรณีสั่งหยุดบอท STOP-BOT.bat หรือ N3-MANAGER เมนู [7])
   */
  public static async terminateBrowserProcess(): Promise<void> {
    await this.close();
    try {
      if (fs.existsSync(BROWSER_MODE_FILE)) {
        fs.unlinkSync(BROWSER_MODE_FILE);
      }
    } catch {}

    try {
      const { execSync } = await import('child_process');
      // 1. ตรวจหา PID ที่กำลังฟังพอร์ต CDP_PORT (LISTENING) แล้วสั่ง taskkill ปิดทั้งทรี
      try {
        const netstatOut = execSync('netstat -ano', { encoding: 'utf-8' });
        const match = netstatOut.match(new RegExp(`:${CDP_PORT}\\s+.*LISTENING\\s+(\\d+)`, 'i'));
        if (match && match[1]) {
          const pid = match[1];
          if (pid !== '0' && pid !== '4' && pid !== String(process.pid)) {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
          }
        }
      } catch {}

      // 2. ตรวจจับและปิดกระบวนการที่มี browser_profile ใน CommandLine (หากยังมีตกค้าง)
      try {
        const wmicOut = execSync('wmic process where "name=\'chrome.exe\'" get processid,commandline /format:csv', { encoding: 'utf-8' });
        for (const line of wmicOut.split('\n')) {
          if (line.includes('browser_profile') || line.includes(`--remote-debugging-port=${CDP_PORT}`)) {
            const parts = line.trim().split(',');
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid) && pid !== '0' && pid !== '4' && pid !== String(process.pid)) {
              try {
                execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
              } catch {}
            }
          }
        }
      } catch {}

      // 3. Fallback สำหรับ Windows 11 (ที่ไม่มี wmic.exe ติดตั้งแล้ว): ใช้ PowerShell CIM
      try {
        const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'chrome.exe'\\" | Where-Object { $_.CommandLine -like '*browser_profile*' -or $_.CommandLine -like '*--remote-debugging-port=${CDP_PORT}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`;
        execSync(psCmd, { stdio: 'ignore', windowsHide: true });
      } catch {}

      console.log('[BROWSER] ปิดโปรเซส Chrome ทั้งหมดและคืนหน่วยความจำเรียบร้อยแล้ว');
    } catch {}
  }
}

