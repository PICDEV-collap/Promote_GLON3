const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../bot-service/node_modules/typescript');
const { BOT_SERVICE_ID, probeProjectTunnel, TunnelHealthMonitor } = require('../bot-service/dist/guard/tunnel-health');

test('tunnel probe checks this instance without redirects or shell processes', async () => {
  let calls = 0;
  const healthy = await probeProjectTunnel('https://project.example.trycloudflare.com/webhook?ignored=1', 'instance-a', async (url, options) => {
    calls++;
    assert.equal(url.href, 'https://project.example.trycloudflare.com/health/instance');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ status: 'ok', service: BOT_SERVICE_ID, instanceId: 'instance-a' }) };
  });
  assert.equal(healthy, true);
  assert.equal(calls, 1);
});

test('invalid or foreign tunnel addresses never cause a request', async () => {
  let calls = 0;
  for (const url of ['invalid', 'http://localhost:3333', 'https://other-project.example/health', 'https://a.trycloudflare.com.evil.example', 'https://user:password@a.trycloudflare.com']) {
    assert.equal(await probeProjectTunnel(url, 'a', async () => { calls++; return { ok: false }; }), false);
  }
  assert.equal(calls, 0);
});

test('another service, stale instance, HTTP error and network error are unhealthy', async () => {
  const url = 'https://project.trycloudflare.com/webhook';
  for (const payload of [null, {}, { status: 'ok', service: 'other-service', instanceId: 'a' }, { status: 'ok', service: BOT_SERVICE_ID, instanceId: 'old' }]) {
    assert.equal(await probeProjectTunnel(url, 'a', async () => ({ ok: true, json: async () => payload })), false);
  }
  assert.equal(await probeProjectTunnel(url, 'a', async () => ({ ok: false })), false);
  assert.equal(await probeProjectTunnel(url, 'a', async () => { throw new Error('offline'); }), false);
});

test('monitor reports sustained failure and recovery once, ignoring a brief outage', async () => {
  const outcomes = [false, false, true, false, false, false, false, true, true];
  const monitor = new TunnelHealthMonitor(async () => outcomes.shift());
  const transitions = [];
  for (let i = 0; i < 9; i++) transitions.push(await monitor.checkNow());
  assert.deepEqual(transitions, [null, null, null, null, null, 'down', null, 'recovered', null]);
});

test('overlapping monitor calls never start another probe or count a false failure', async () => {
  let resolveProbe;
  let calls = 0;
  const monitor = new TunnelHealthMonitor(() => { calls++; return new Promise(resolve => { resolveProbe = resolve; }); }, 1);
  const pending = monitor.checkNow();
  assert.equal(await monitor.checkNow(), null);
  assert.equal(calls, 1);
  resolveProbe(true);
  assert.equal(await pending, null);
});

test('a busy configured bot port exits without binding an adjacent port', async () => {
  // Exercise the actual startup function in isolation: no import of index.ts,
  // production registries, credentials, browser, socket or notification APIs.
  const source = fs.readFileSync(path.join(__dirname, '../bot-service/src/index.ts'), 'utf8');
  const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const startup = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'startServerWithPort');
  assert(startup, 'Server startup function must be present');
  const code = ts.transpileModule(startup.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const listeners = new Map();
  const ports = [];
  const exits = [];
  let serversCreated = 0;
  const mainModule = {};
  const fakeServer = {
    listen(port) { ports.push(port); return this; },
    on(event, handler) { listeners.set(event, handler); return this; }
  };
  const context = vm.createContext({
    http: { createServer: () => { serversCreated++; return fakeServer; } },
    app: {}, module: mainModule, require: { main: mainModule },
    process: { exit: code => exits.push(code) },
    console: { error() {} }, hasNotifiedShutdown: false
  });
  vm.runInContext(code, context);
  context.startServerWithPort(3333);
  await listeners.get('error')({ code: 'EADDRINUSE' });
  assert.equal(serversCreated, 1);
  assert.deepEqual(ports, [3333]);
  assert.deepEqual(exits, [1]);
  assert.equal(context.hasNotifiedShutdown, true);
});
