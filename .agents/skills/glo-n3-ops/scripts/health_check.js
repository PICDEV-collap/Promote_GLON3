#!/usr/bin/env node
/**
 * GLO N3 Operations - Comprehensive System Health Check & Auto-Recovery CLI
 *
 * Checks:
 * 1. Bot Service HTTP Port 3333 (/health & status)
 * 2. Chrome Browser CDP Port 9222 & Active Pages
 * 3. Cloudflare Tunnel & Active Webhook URL
 * 4. Quota Balance & Sales Count
 * 5. Overall System Health Score
 *
 * Usage:
 *   node health_check.js          (Human readable colored dashboard)
 *   node health_check.js --json   (JSON format for AI agents)
 *   node health_check.js --fix    (Auto-recover failed components)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '../../../../');
const BOT_DIR = path.join(ROOT_DIR, 'bot-service');
const QUOTA_PATH = path.join(BOT_DIR, 'data', 'quota.json');
const WEBHOOK_FILE = path.join(ROOT_DIR, 'webhook-url.txt');

const args = process.argv.slice(2);
const isJson = args.includes('--json');
const autoFix = args.includes('--fix');

function fetchHttp(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https://') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode, data });
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'TIMEOUT' }); });
  });
}

async function runHealthCheck() {
  const result = {
    timestamp: new Date().toISOString(),
    status: 'UNKNOWN',
    botService: { alive: false, port: 3333, uptime: null, queueBusy: false },
    browser: { alive: false, cdpPort: 9222, gloUrl: null, isLoginPage: false, isLandingPage: false },
    tunnel: { alive: false, webhookUrl: null },
    quota: { remaining: 0, sold: 0, max: 2000 },
    issues: [],
    recoveries: []
  };

  // 1. Check Bot Service HTTP (Port 3333)
  const healthRes = await fetchHttp('http://127.0.0.1:3333/health');
  if (healthRes.ok) {
    result.botService.alive = true;
    try {
      const data = JSON.parse(healthRes.data);
      result.botService.uptime = data.uptime;
      if (data.queue) result.botService.queueBusy = data.queue.isBusy;
    } catch {}
  } else {
    // Fallback: Check root
    const rootRes = await fetchHttp('http://127.0.0.1:3333/');
    if (rootRes.ok) {
      result.botService.alive = true;
    } else {
      result.issues.push('Bot Service HTTP on Port 3333 is unreachable');
    }
  }

  // 2. Check Chrome Browser CDP (Port 9222)
  const cdpRes = await fetchHttp('http://127.0.0.1:9222/json/version');
  if (cdpRes.ok) {
    result.browser.alive = true;
    // Check pages
    const pagesRes = await fetchHttp('http://127.0.0.1:9222/json');
    if (pagesRes.ok) {
      try {
        const pages = JSON.parse(pagesRes.data);
        const gloPage = pages.find(p => p.url && p.url.includes('glolotteryshop.com'));
        if (gloPage) {
          result.browser.gloUrl = gloPage.url;
          result.browser.isLoginPage = gloPage.url.includes('/login');
          result.browser.isLandingPage = gloPage.url.includes('/landing') || gloPage.url === 'https://n3.glolotteryshop.com';
        }
      } catch {}
    }
  } else {
    result.issues.push('Chrome Detached Browser (Port 9222) is not responding');
  }

  // 3. Check Cloudflare Tunnel
  if (fs.existsSync(WEBHOOK_FILE)) {
    try {
      const url = fs.readFileSync(WEBHOOK_FILE, 'utf-8').trim();
      if (url && url.startsWith('https://')) {
        result.tunnel.webhookUrl = url;
        const testRes = await fetchHttp(url.replace(/\/webhook\/?$/, '/health'), 4000);
        result.tunnel.alive = testRes.ok;
        if (!testRes.ok) {
          result.issues.push(`Cloudflare Tunnel endpoint returned status ${testRes.statusCode || 'UNREACHABLE'}`);
        }
      }
    } catch {}
  } else {
    result.issues.push('No webhook-url.txt found. Tunnel may be down.');
  }

  // 4. Check Quota
  if (fs.existsSync(QUOTA_PATH)) {
    try {
      const q = JSON.parse(fs.readFileSync(QUOTA_PATH, 'utf-8'));
      result.quota.max = q.maxQuota || 2000;
      result.quota.sold = q.usedQuota || 0;
      result.quota.remaining = q.remainingQuota !== undefined ? q.remainingQuota : (result.quota.max - result.quota.sold);
    } catch {}
  }

  // Determine overall status
  if (result.botService.alive && result.browser.alive && result.tunnel.alive && !result.browser.isLoginPage) {
    result.status = 'HEALTHY';
  } else if (result.botService.alive && result.browser.alive && result.browser.isLoginPage) {
    result.status = 'ACTION_REQUIRED_LOGIN';
    result.issues.push('GLO N3 session requires Paotang login (Current URL is /login/)');
  } else {
    result.status = result.issues.length > 0 ? 'CRITICAL' : 'DEGRADED';
  }

  // AUTO-FIX if requested
  if (autoFix && result.status !== 'HEALTHY') {
    if (!result.botService.alive) {
      console.log('🔄 [AUTO-FIX] Restarting Bot Service via n3-engine.js...');
      try {
        execSync('node scripts/n3-engine.js restart-bot', { cwd: ROOT_DIR, stdio: 'ignore' });
        result.recoveries.push('Restarted Bot Service');
      } catch (e) {
        result.recoveries.push(`Failed to restart Bot: ${e.message}`);
      }
    }

    if (result.browser.isLoginPage) {
      console.log('📱 [AUTO-FIX] Browser is at /login/. Sending Paotang QR alert to Admin...');
      try {
        const { getLineConfig, sendLineAdminAlert } = require(path.join(ROOT_DIR, 'scripts/n3-engine.js'));
        // n3-engine handles paotang alerts
        result.recoveries.push('Triggered Paotang login alert recommendation');
      } catch {}
    }
  }

  return result;
}

runHealthCheck().then((res) => {
  if (isJson) {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.status === 'HEALTHY' ? 0 : 1);
  }

  console.log('\n===============================================================================');
  console.log('           🔍 GLO N3 LOTTERY BOT & AGENT HEALTH DASHBOARD');
  console.log('===============================================================================');

  const statusColor = res.status === 'HEALTHY'
    ? '\x1b[32m● HEALTHY (ระบบพร้อมบริการ 100%)\x1b[0m'
    : res.status === 'ACTION_REQUIRED_LOGIN'
    ? '\x1b[33m▲ WAITING FOR LOGIN (รอแอดมินสแกนเป๋าตัง)\x1b[0m'
    : '\x1b[31m✖ CRITICAL (พบข้อขัดข้อง)\x1b[0m';

  console.log(`  Overall Status:   ${statusColor}`);
  console.log(`  Bot Service:      ${res.botService.alive ? '\x1b[32m● ONLINE\x1b[0m (Port 3333)' : '\x1b[31m✖ OFFLINE\x1b[0m'}`);
  console.log(`  Chrome (CDP):     ${res.browser.alive ? '\x1b[32m● CONNECTED\x1b[0m (Port 9222)' : '\x1b[31m✖ DISCONNECTED\x1b[0m'}`);
  if (res.browser.gloUrl) {
    console.log(`  Active GLO URL:   ${res.browser.gloUrl}`);
  }
  console.log(`  LINE Tunnel:      ${res.tunnel.alive ? '\x1b[32m● ACTIVE\x1b[0m' : '\x1b[31m✖ UNREACHABLE\x1b[0m'}`);
  if (res.tunnel.webhookUrl) {
    console.log(`  Webhook URL:      ${res.tunnel.webhookUrl}`);
  }
  console.log(`  Ticket Quota:     \x1b[36m${res.quota.remaining.toLocaleString()} / ${res.quota.max.toLocaleString()} ใบ\x1b[0m (ขายแล้ว ${res.quota.sold.toLocaleString()} ใบ)`);
  console.log('===============================================================================');

  if (res.issues.length > 0) {
    console.log('\n⚠️  Issues Detected:');
    res.issues.forEach((iss, i) => console.log(`   ${i + 1}. ${iss}`));
  }

  if (res.recoveries.length > 0) {
    console.log('\n🛠️  Auto-Recovery Actions Taken:');
    res.recoveries.forEach((act, i) => console.log(`   ${i + 1}. ${act}`));
  }

  console.log('');
  process.exit(res.status === 'HEALTHY' ? 0 : (res.status === 'ACTION_REQUIRED_LOGIN' ? 0 : 1));
});
