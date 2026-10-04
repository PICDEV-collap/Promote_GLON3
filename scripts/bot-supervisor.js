'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createProcessController } = require('./project-processes');
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'bot-service/data');

function recoveryDecision({ paused, bots, owners, browser, tunnel, attempts }) {
  if (paused) return 'paused';
  if (owners.some(pid => !bots.some(bot => bot.pid === pid))) return 'foreign-port';
  if (bots.length) return 'inspect-health';
  if (!browser || !tunnel) return 'dependencies-missing';
  if (attempts >= 3) return 'restart-limit';
  return 'recover';
}
async function main() {
  fs.mkdirSync(path.join(DATA, 'diagnostics'), { recursive: true });
  const statePath = path.join(DATA, 'supervisor-state.json');
  const lockPath = path.join(DATA, 'supervisor.lock');
  // Windows task also disallows overlapping runs. A fresh file lock covers manual invocations.
  if (fs.existsSync(lockPath)) {
    if (Date.now() - fs.statSync(lockPath).mtimeMs < 120000) return;
    fs.unlinkSync(lockPath);
  }
  let lock;
  try { lock = fs.openSync(lockPath, 'wx'); } catch (e) { if (e.code === 'EEXIST') return; throw e; }
  const log = message => fs.appendFileSync(path.join(DATA, 'diagnostics/supervisor.log'), `${new Date().toISOString()} ${message}\n`);
  let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
  const persist = () => {
    const temp = statePath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(state, null, 2)); fs.renameSync(temp, statePath);
  };
  const notify = async (key, message) => {
    if (state.alert === key && Date.now() - (state.alertAt || 0) < 30 * 60000) return;
    state.alert = key; state.alertAt = Date.now(); persist();
    try {
      require(path.join(ROOT, 'bot-service/node_modules/dotenv')).config({ path: path.join(ROOT, 'bot-service/.env') });
      const { TelegramService } = require(path.join(ROOT, 'bot-service/dist/notify/telegram-service'));
      await TelegramService.getInstance().notifySystemStatus('ตัวดูแลบอท N3', message, '⚠️');
    } catch { log('Telegram notification failed'); }
  };
  try {
    const env = require(path.join(ROOT, 'bot-service/node_modules/dotenv')).parse(fs.readFileSync(path.join(ROOT, 'bot-service/.env')));
    const port = Number(env.PORT || 3333);
    const control = createProcessController({ rootDir: ROOT, port });
    const processes = control.listProcesses();
    const bots = control.ownedProcesses('bot', processes);
    const owners = control.portOwners();
    state.attempts = (state.attempts || []).filter(time => Date.now() - time < 10 * 60000);
    const decision = recoveryDecision({
      paused: fs.existsSync(path.join(DATA, 'supervisor-paused')) || fs.existsSync(path.join(ROOT, '.stop_intentional')),
      bots, owners, browser: control.ownedProcesses('browser', processes).length > 0,
      tunnel: control.ownedProcesses('tunnel', processes).length > 0, attempts: state.attempts.length
    });
    if (decision === 'paused') return;
    if (decision === 'inspect-health') {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw Error('health unavailable');
        const health = await response.json();
        if (health.status !== 'ok') throw Error('health not ready');
        state.healthFailures = 0; state.lastHealthy = new Date().toISOString(); state.alert = null; persist();
      } catch {
        state.healthFailures = (state.healthFailures || 0) + 1; persist();
        if (state.healthFailures >= 3) await notify('unhealthy', 'บอทยังมีโปรเซสแต่ไม่ตอบ health ติดต่อกัน 3 รอบ กรุณาตรวจออเดอร์ก่อนรีสตาร์ต ระบบไม่ได้หยุดโปรเซสเพื่อรักษางานลูกค้า');
      }
      return;
    }
    if (decision !== 'recover') {
      log(`Recovery withheld: ${decision}`);
      await notify(decision, `บอทไม่พร้อมใช้งาน (${decision}) ตัวดูแลไม่ได้ยึดพอร์ตหรือเริ่มบริการอื่น กรุณาตรวจระบบ`);
      return;
    }
    // Recheck immediately before starting; never kill another process or replay an order.
    control.assertPortAvailable();
    if (control.ownedProcesses('bot').length) return;
    state.attempts.push(Date.now()); persist();
    log('Bot process missing; recovering without order replay');
    const stamp = Date.now();
    for (const name of ['bot-runtime.log', 'bot-runtime-error.log']) {
      const source = path.join(ROOT, name);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(DATA, 'diagnostics', `${stamp}-${name}`));
    }
    const quote = value => "'" + value.replace(/'/g, "''") + "'";
    const script = `$env:ENGINE_NOTIFIES_START = 'true'; $p = Start-Process -FilePath ${quote(process.execPath)} -ArgumentList ${quote('"' + path.join(ROOT, 'bot-service/dist/index.js') + '"')} -WorkingDirectory ${quote(path.join(ROOT, 'bot-service'))} -WindowStyle Hidden -RedirectStandardOutput ${quote(path.join(ROOT, 'bot-runtime.log'))} -RedirectStandardError ${quote(path.join(ROOT, 'bot-runtime-error.log'))} -PassThru; $p.Id`;
    const pid = Number(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true }).trim());
    const snapshot = control.ownedProcesses('bot').find(bot => bot.pid === pid);
    if (!snapshot) throw Error('New bot ownership not confirmed');
    await control.waitForBotPort(snapshot, 30000);
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Error('Recovered bot health unavailable');
    const metadataPath = path.join(ROOT, 'bot.pid');
    const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : {};
    metadata.botPid = pid; metadata.startedAt = new Date().toISOString();
    metadata.processes = { ...metadata.processes, bot: snapshot };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    state.healthFailures = 0; state.lastRecovered = new Date().toISOString(); persist();
    log('Recovery healthy; preserved browser and tunnel');
    await notify('recovered-' + pid, 'พบโปรเซสบอทหยุดและเปิดกลับแล้ว ตรวจ health ผ่าน รักษาเบราว์เซอร์ GLO และ tunnel เดิมไว้ ไม่มีการส่งออเดอร์ซ้ำอัตโนมัติ กรุณาตรวจรายการที่อาจค้างก่อนหยุด');
  } catch (error) {
    log(`Supervisor failure: ${error.name}`);
    await notify('supervisor-error', 'ตัวดูแลบอทพบข้อผิดพลาดในการตรวจหรือกู้คืน กรุณาตรวจ supervisor.log ไม่มีการหยุดโปรเซสอื่น');
    process.exitCode = 1;
  } finally { fs.closeSync(lock); fs.unlinkSync(lockPath); }
}
module.exports = { recoveryDecision };
if (require.main === module) main().catch(() => { process.exitCode = 1; });
