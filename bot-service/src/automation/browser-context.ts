import { chromium, Browser, BrowserContext, Page, CDPSession } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config';

export const USER_DATA_DIR = path.resolve(__dirname, '../../data/browser_profile');
export const BROWSER_MODE_FILE = path.resolve(__dirname, '../../data/browser_mode.json');
export const CDP_PORT = CONFIG.CDP_PORT || 9222;

interface OwnedProcess {
  pid: number;
  parentPid: number;
  executablePath: string;
  commandLine: string;
  createdAt: string;
}

const { createProcessController } = require(path.resolve(__dirname, '../../../scripts/project-processes.js'));
const processController: {
  portOwners(port: number): number[];
  listProcesses(): OwnedProcess[];
  classify(info: OwnedProcess | undefined): string | null;
  ownedProcesses(kind: string, processes?: OwnedProcess[]): OwnedProcess[];
  stopOwnedProcess(snapshot: OwnedProcess, kind: string): void;
} = createProcessController({ rootDir: path.resolve(__dirname, '../../..'), port: CONFIG.PORT });

let knownBrowser: { port: number; process: OwnedProcess } | null = null;
let nextOwnershipCheckAt = 0;

// A port number is never proof of ownership. Verify its actual listener before CDP access.
function inspectOwnedCdpBrowser(port: number): OwnedProcess | null {
  const owners = processController.portOwners(port);
  if (!owners.length) return null;
  const processes = processController.listProcesses();
  if (owners.length !== 1) throw new Error(`CDP port ${port} has multiple listeners; preserving them`);
  const owner = processes.find(info => info.pid === owners[0]);
  if (!owner || processController.classify(owner) !== 'browser') {
    throw new Error(`CDP port ${port} belongs to an unverified process; preserving it`);
  }
  knownBrowser = { port, process: owner };
  return owner;
}

export function getChromeExecutablePath(): string {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return chromium.executablePath();
}

// The 500 ms watchdog must not spawn a shell or contact an unverified CDP endpoint.
// A cached PID is only a liveness hint; getPage always verifies ownership again before attaching.
export async function isCdpAlive(port: number = CDP_PORT): Promise<boolean> {
  if (knownBrowser?.port === port) {
    try {
      process.kill(knownBrowser.process.pid, 0);
      return true;
    } catch {
      knownBrowser = null;
    }
  }
  if (Date.now() < nextOwnershipCheckAt) return false;
  nextOwnershipCheckAt = Date.now() + 5000;
  try {
    return !!inspectOwnedCdpBrowser(port);
  } catch {
    return false;
  }
}

export function isManagedBrowserUrl(url: string): boolean {
  if (url === 'about:blank') return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && [
      'n3.glolotteryshop.com',
      'paotang-auth.krungthai.com'
    ].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function usablePage(page: Page | null): page is Page {
  return !!page && !page.isClosed() && isManagedBrowserUrl(page.url());
}

function selectManagedPage(pages: Page[], tracked: Page | null = null): Page | null {
  if (usablePage(tracked)) return tracked;
  return pages.find(page => usablePage(page) && page.url() !== 'about:blank')
    || pages.find(page => usablePage(page)) || null;
}

export function sanitizeChromePreferences(userDataDir: string = USER_DATA_DIR): void {
  const prefsPath = path.join(userDataDir, 'Default', 'Preferences');
  if (!fs.existsSync(prefsPath)) return;
  try {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
    let modified = false;
    if (prefs.partition?.per_host_zoom_levels) {
      delete prefs.partition.per_host_zoom_levels;
      modified = true;
    }
    if (prefs.profile?.default_zoom_level !== undefined && prefs.profile.default_zoom_level !== 0) {
      prefs.profile.default_zoom_level = 0;
      modified = true;
    }
    if (modified) fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');
  } catch (error: any) {
    console.warn('[BROWSER PREFS WARNING]', error.message);
  }
}

const pageEmulationSessions = new WeakMap<Page, CDPSession>();

export async function enforceHighDpiSession(page: Page): Promise<void> {
  if (!usablePage(page)) return;
  let client;
  try {
    client = pageEmulationSessions.get(page);
    if (!client) {
      client = await page.context().newCDPSession(page);
      pageEmulationSessions.set(page, client);
      const session = client;
      page.once('close', () => {
        pageEmulationSessions.delete(page);
        void session.detach().catch(() => {});
      });
    }
    await client.send('Emulation.resetPageScaleFactor').catch(() => {});
    await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.0 }).catch(() => {});
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 2, mobile: false
    }).catch(() => {});
    // Scope geolocation to the managed page instead of changing unrelated tabs in its context.
    await client.send('Emulation.setGeolocationOverride', {
      latitude: 13.7563, longitude: 100.5018, accuracy: 10
    }).catch(() => {});
    // CDP clears geolocation emulation when its owning session detaches.
    // Keep that session alive until the managed page closes/disconnects.
  } catch {
    pageEmulationSessions.delete(page);
    await client?.detach().catch(() => {});
  }
}

export class PersistentBrowserManager {
  private static browser: Browser | null = null;
  private static context: BrowserContext | null = null;
  private static page: Page | null = null;
  private static opening: Promise<{ context: BrowserContext; page: Page }> | null = null;

  public static getPage(headless: boolean = CONFIG.HEADLESS): Promise<{ context: BrowserContext; page: Page }> {
    if (!this.opening) {
      this.opening = this.openPage(headless).finally(() => { this.opening = null; });
    }
    return this.opening;
  }

  private static async useManagedPage(): Promise<{ context: BrowserContext; page: Page }> {
    if (!this.context) throw new Error('Project browser context is unavailable');
    const page = selectManagedPage(this.context.pages(), this.page) || await this.context.newPage();
    if (this.page !== page) {
      this.page = page;
      this.attachPageListeners(page);
      await this.context.grantPermissions(['geolocation'], { origin: 'https://n3.glolotteryshop.com' }).catch(() => {});
      await enforceHighDpiSession(page);
    }
    return { context: this.context, page };
  }

  private static async connectOwnedBrowser(): Promise<{ context: BrowserContext; page: Page }> {
    if (!inspectOwnedCdpBrowser(CDP_PORT)) throw new Error('Project Chrome is not listening on its CDP port');
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 15000 });
    this.browser = browser;
    browser.on('disconnected', () => {
      if (this.browser !== browser) return;
      this.browser = null;
      this.context = null;
      this.page = null;
    });
    this.context = browser.contexts()[0] || await browser.newContext({
      viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2
    });
    return this.useManagedPage();
  }

  private static async openPage(headless: boolean): Promise<{ context: BrowserContext; page: Page }> {
    if (this.browser?.isConnected() && this.context) return this.useManagedPage();

    const existingBrowser = inspectOwnedCdpBrowser(CDP_PORT);
    if (existingBrowser) {
      // Preserve the existing session even if a caller requests a different display mode.
      // A connection failure is reported; it never causes an automatic browser kill.
      return this.connectOwnedBrowser();
    }

    const profileProcesses = processController.ownedProcesses('browser');
    if (profileProcesses.length) {
      throw new Error('Project Chrome is still running without a verified CDP listener; preserving its session');
    }

    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    sanitizeChromePreferences();
    for (const name of ['lockfile', 'SingletonLock']) {
      const file = path.join(USER_DATA_DIR, name);
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    }

    const browserArgs = [
      `--user-data-dir=${USER_DATA_DIR}`,
      `--remote-debugging-port=${CDP_PORT}`,
      '--remote-debugging-address=127.0.0.1',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--disable-software-rasterizer', '--no-first-run',
      '--no-default-browser-check', '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--enable-features=Geolocation', '--window-size=1440,900',
      '--force-device-scale-factor=2', '--hide-scrollbars', '--mute-audio',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    ];
    if (headless) browserArgs.push('--headless=new');

    // Recheck immediately before launch. Never replace a service occupying this port.
    if (processController.portOwners(CDP_PORT).length) throw new Error('CDP port became occupied; launch aborted');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(getChromeExecutablePath(), [...browserArgs, 'about:blank'], {
        detached: true, stdio: 'ignore', shell: false, windowsHide: true
      });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });

    const deadline = Date.now() + 15000;
    do {
      const owner = inspectOwnedCdpBrowser(CDP_PORT);
      if (owner) {
        const result = await this.connectOwnedBrowser();
        fs.writeFileSync(BROWSER_MODE_FILE, JSON.stringify({
          headless, cdpPort: CDP_PORT, pid: owner.pid, startedAt: owner.createdAt
        }, null, 2), 'utf-8');
        return result;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    } while (Date.now() < deadline);
    throw new Error('Project Chrome did not start its verified CDP listener; no additional browser was launched');
  }

  private static attachPageListeners(page: Page): void {
    const forget = () => { if (this.page === page) this.page = null; };
    page.on('crash', forget);
    page.on('close', forget);
  }

  public static isBrowserOpen(): boolean {
    return !!this.browser?.isConnected() && !!this.getActivePage();
  }

  public static getActivePage(): Page | null {
    if (!this.browser?.isConnected() || !this.context) return null;
    try {
      return selectManagedPage(this.context.pages(), this.page);
    } catch {
      return null;
    }
  }

  /** Disconnect only this Playwright CDP client, preserving Chrome and the GLO session. */
  public static async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.context = null;
    this.page = null;
    if (browser) await browser.close().catch(() => {});
  }

  /** Stop only browser processes whose exact project profile and identity are verified. */
  public static async terminateBrowserProcess(): Promise<void> {
    const owned = processController.ownedProcesses('browser');
    await this.close();
    for (const snapshot of owned) processController.stopOwnedProcess(snapshot, 'browser');
    knownBrowser = null;
    nextOwnershipCheckAt = 0;
    if (fs.existsSync(BROWSER_MODE_FILE)) fs.unlinkSync(BROWSER_MODE_FILE);
  }
}
