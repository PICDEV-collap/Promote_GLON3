'use strict';

// All process and port observations below are fixtures. No real process is launched or stopped.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createProcessController, classifyProcess, sameProcess } = require('./project-processes');
const ROOT = 'D:\\Promote_GLON3';
const processInfo = (commandLine, executablePath = 'C:\\Program Files\\nodejs\\node.exe', extra = {}) => ({
  pid: 1200, parentPid: 900, createdAt: '2026-10-01T14:27:00.3712020Z', commandLine, executablePath, ...extra
});
const bot = processInfo('"C:\\Program Files\\nodejs\\node.exe" "D:\\Promote_GLON3\\bot-service\\dist\\index.js"');
const browser = processInfo('chrome.exe --remote-debugging-port=9222 --user-data-dir="D:\\Promote_GLON3\\bot-service\\data\\browser_profile"', 'C:\\Chrome\\chrome.exe', { pid: 1300 });
const tunnel = processInfo('cloudflared.exe tunnel --url http://localhost:3333 --logfile "D:\\Promote_GLON3\\tunnel.log"', 'C:\\Tools\\cloudflared.exe', { pid: 1400 });

function mockController({ processes = [bot], owners = [], afterStop = [] } = {}) {
  const calls = [];
  let current = processes;
  const controller = createProcessController({ rootDir: ROOT, platform: 'win32', sleep: async () => {},
    run(executable, args, options) {
      const script = Buffer.from(args[args.length - 1], 'base64').toString('utf16le');
      calls.push({ executable, args, options, script });
      if (script.includes('$p.Kill()')) { current = afterStop; return ''; }
      if (script.includes('Get-NetTCPConnection')) return JSON.stringify(owners);
      if (script.includes('Get-CimInstance Win32_Process -Filter')) return JSON.stringify(current);
      throw new Error('Unexpected process command');
    }
  });
  return { controller, calls };
}

test('ownership requires the exact absolute project entry, profile, or tunnel logfile', () => {
  assert.equal(classifyProcess(bot, ROOT), 'bot');
  assert.equal(classifyProcess(browser, ROOT), 'browser');
  assert.equal(classifyProcess(tunnel, ROOT), 'tunnel');
  for (const info of [
    processInfo('node.exe dist/index.js'),
    processInfo('node.exe D:\\OtherProject\\bot-service\\dist\\index.js'),
    processInfo('node.exe D:\\Promote_GLON3-copy\\bot-service\\dist\\index.js'),
    processInfo('node.exe -e "D:\\Promote_GLON3\\bot-service\\dist\\index.js"'),
    { ...browser, commandLine: 'chrome.exe --remote-debugging-port=9222 --user-data-dir=D:\\OtherProject\\browser_profile' },
    { ...browser, commandLine: 'chrome.exe --remote-debugging-port=9222' },
    { ...tunnel, commandLine: 'cloudflared.exe tunnel --url http://localhost:3333' },
    { ...tunnel, commandLine: tunnel.commandLine.replace('localhost:3333', 'localhost:4444') },
    { ...bot, createdAt: '' }
  ]) assert.equal(classifyProcess(info, ROOT), null);
});

test('another project owning the configured port is preserved', () => {
  const other = { ...bot, pid: 2222, commandLine: 'node.exe D:\\OtherProject\\dist\\index.js' };
  const { controller, calls } = mockController({ processes: [other], owners: [2222] });
  assert.throws(() => controller.assertBotPortOwnership(), /unverified process/);
  assert.throws(() => controller.assertPortAvailable(), /already occupied/);
  assert.equal(calls.some(call => call.script.includes('$p.Kill()')), false);
});

test('a reused PID is refused even when its command line is unchanged', () => {
  const reused = { ...bot, createdAt: '2026-10-02T14:27:00.3712020Z' };
  const { controller, calls } = mockController({ processes: [reused] });
  assert.equal(sameProcess(bot, reused), false);
  assert.throws(() => controller.stopOwnedProcess(bot, 'bot'), /identity changed/);
  assert.equal(calls.some(call => call.script.includes('$p.Kill()')), false);
});

test('verified termination rechecks identity, uses a process handle, and confirms exit', () => {
  const { controller, calls } = mockController();
  controller.stopOwnedProcess(bot, 'bot');
  const stop = calls.find(call => call.script.includes('$p.Kill()'));
  assert.ok(stop.script.includes('$null = $p.Handle'));
  assert.ok(stop.script.includes('$actual.CreationDate'));
  assert.ok(stop.script.includes('$actual.CommandLine'));
  assert.ok(stop.script.includes('$p.WaitForExit(10000)'));
  for (const call of calls) {
    assert.equal(call.executable, 'powershell.exe');
    assert.equal(call.options.windowsHide, true);
    assert.equal(call.options.shell, false);
    assert.ok(call.args.includes('-NonInteractive'));
    assert.equal(/taskkill|\/IM|Stop-Process -Name/.test(call.script), false);
  }
});

test('an old bot still running after termination fails the operation', () => {
  const { controller } = mockController({ afterStop: [bot] });
  assert.throws(() => controller.stopOwnedProcess(bot, 'bot'), /did not stop/);
});

test('startup succeeds only when the new exact process owns its listener', async () => {
  const success = mockController({ owners: [bot.pid] }).controller;
  await success.waitForBotPort(bot, 1);
  await assert.rejects(mockController({ owners: [2222] }).controller.waitForBotPort(bot, 1), /another process/);
  await assert.rejects(mockController({ processes: [] }).controller.waitForBotPort(bot, 1), /exited or changed identity/);
  await assert.rejects(mockController().controller.waitForBotPort(bot, 0), /did not listen/);
});

test('invalid ports and foreign snapshots are rejected before executing commands', () => {
  const { controller, calls } = mockController();
  assert.throws(() => controller.portOwners('9222; Stop-Process'), /Invalid port/);
  assert.throws(() => controller.stopOwnedProcess({ ...bot, commandLine: 'node.exe dist/index.js' }, 'bot'), /unverified/);
  assert.equal(calls.length, 0);
});
