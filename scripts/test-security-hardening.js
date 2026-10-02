const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('../bot-service/node_modules/typescript');
const { randomUUID, createHash } = require('crypto');
const { extractClientIp, MultiTierRateLimiter, createCyberGuardMiddleware } = require('../bot-service/dist/guard/cyber-guard');
const { OrderQueue } = require('../bot-service/dist/queue/order-queue');
const source = fs.readFileSync(path.join(__dirname, '../bot-service/src/index.ts'), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
function handler(route, method, dependencies) {
  const statement = ast.statements.find(s => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression)
    && s.expression.expression.getText(ast) === 'app.' + method && s.expression.arguments[0]?.text === route);
  assert(statement, route);
  const callback = statement.expression.arguments[1];
  const code = ts.transpileModule('const run = ' + callback.getText(ast) + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ ...dependencies, console, Date, Buffer });
  vm.runInContext(code, context);
  return vm.runInContext('run', context);
}
function response() {
  return { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; },
    status(n) { this.code = n; return this; }, json(v) { this.body = v; }, send(v) { this.body = v; }, end() {} };
}
test('proxy identity cannot be forged by a direct remote client', () => {
  assert.equal(extractClientIp({ headers: { 'cf-connecting-ip': '127.0.0.1', 'x-real-ip': '10.0.0.1' }, socket: { remoteAddress: '203.0.113.5' } }), '203.0.113.5');
  assert.equal(extractClientIp({ headers: { 'cf-connecting-ip': '203.0.113.6' }, socket: { remoteAddress: '127.0.0.1' } }), '203.0.113.6');
  assert.equal(extractClientIp({ headers: { 'cf-connecting-ip': 'not-an-ip' }, socket: { remoteAddress: '::ffff:127.0.0.1' } }), '127.0.0.1');
});
test('40 status polls do not consume the creation limit; excess polling still rejected', () => {
  const middleware = createCyberGuardMiddleware({ isJailed: () => false, recordStrike() {} }, new MultiTierRateLimiter());
  const request = path => ({ path, url: path, method: path.includes('status') ? 'GET' : 'POST', headers: {}, socket: { remoteAddress: '203.0.113.7' } });
  for (let i = 0; i < 40; i++) { let passed = false; middleware(request('/api/order-status/ORD-test'), response(), () => { passed = true; }); assert(passed); }
  for (let i = 0; i < 30; i++) { let passed = false; middleware(request('/api/order-direct'), response(), () => { passed = true; }); assert(passed); }
  const blocked = response(); middleware(request('/api/order-direct'), blocked, () => assert.fail()); assert.equal(blocked.code, 429);
});
test('bounded queue deduplicates IDs and reports unknown orders as absent', () => {
  const queue = new OrderQueue();
  const task = n => ({ orderId: 'TEST-' + n, items: [], totalQuantity: 0, quantity: 0 });
  assert.equal(queue.getPosition('missing'), 0);
  queue.enqueue(task(0)); queue.enqueue(task(0)); assert.equal(queue.getQueueLength(), 1);
  for (let i = 1; i < OrderQueue.MAX_PENDING_ORDERS; i++) queue.enqueue(task(i));
  assert.equal(queue.canAccept(), false); assert.throws(() => queue.enqueue(task(101)), /full/);
});
test('anonymous direct retries reuse the order, altered payload conflicts, full queue returns busy', async () => {
  let accepted = 0;
  const queue = { canAccept: () => accepted < 1, getPosition: () => 1, getEstimatedWaitTime: () => 10, enqueue: () => { accepted++; return 1; } };
  const run = handler('/api/order-direct', 'post', {
    applyDirectOrderCors: () => true, extractClientIp: () => 'test', rateLimiter: { check: () => true },
    createHash, randomUUID, directRequestCache: new Map(), orderQueue: queue, orderStatusStore: new Map(),
    OperatingHoursGuard: { checkSalesStatus: () => ({ isOpen: true }) }, quotaManager: { canFulfill: () => ({ allowed: true }) },
    orderHeartbeat: { start() {} }, TelegramService: { getInstance: () => ({ notifyOrderCreated: () => Promise.resolve() }) }
  });
  const body = { clientRequestId: randomUUID(), items: Array.from({ length: 100 }, (_, i) => ({ number: String(i).padStart(3, '0'), quantity: 2 })) };
  const first = response(); await run({ body }, first); assert.equal(first.body.success, true); assert.equal(first.body.totalQuantity, 200, 'Orders above 100 tickets must enter the queue');
  const retry = response(); await run({ body }, retry); assert.equal(retry.body.orderId, first.body.orderId); assert.equal(accepted, 1);
  const conflict = response(); await run({ body: { ...body, items: [{ number: '456', quantity: 1 }] } }, conflict); assert.equal(conflict.code, 409);
  const busy = response(); await run({ body: { ...body, clientRequestId: randomUUID() } }, busy); assert.equal(busy.code, 503);
});
test('login QR must have random filename and expire; error images are never served', () => {
  let age = 0;
  const run = handler('/qrcodes/:filename', 'use', { path, CONFIG: { QR_OUTPUT_DIR: '/test' }, fs: { existsSync: () => true, statSync: () => ({ mtimeMs: Date.now() - age }) }, getQrFromMemoryCache: () => null });
  for (const filename of ['error-123.png', 'paotang-login-qr-123.png']) { const res = response(); run({ params: { filename } }, res, () => assert.fail()); assert.equal(res.code, 404); }
  const filename = 'paotang-login-qr-' + randomUUID() + '.png';
  let passed = false; const valid = response(); run({ params: { filename } }, valid, () => { passed = true; }); assert(passed); assert.equal(valid.headers['Cache-Control'], 'no-store');
  age = 301000; const expired = response(); run({ params: { filename } }, expired, () => assert.fail()); assert.equal(expired.code, 404);
});
test('all order pages parse and polling honors retry-after, prevents overlap and expires on errors', async () => {
  for (const file of ['order.html', 'order-6pack.html', 'line.html', 'bot-service/public/order.html', 'bot-service/public/order-6pack.html', 'bot-service/public/line.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1]);
    const begin = html.indexOf('        const pollDeadline ='); const end = html.indexOf('        }, 1500);', begin) + '        }, 1500);'.length;
    let clock = 0, calls = 0, tick, cleared = false;
    const context = vm.createContext({ Date: { now: () => clock }, maxPolls: 2, pollCount: 0, orderId: 'test', AbortSignal,
      currentOrderData: {}, console, progressTimer: null, modalTitle: { textContent: '' }, modalDesc: {}, modalProcessingArea: null,
      modalOrderPreview: null, btnModalSubmitDirect: null, btnModalOpenLine: null, btnModalCopyCmd: null,
      setInterval(fn) { tick = fn; return 1; }, clearInterval() { cleared = true; },
      fetch: async () => { calls++; return { status: 429, headers: { get: () => '60' } }; }
    });
    vm.runInContext(html.slice(begin, end), context);
    await tick(); assert.equal(calls, 1); clock = 1500; await tick(); assert.equal(calls, 1);
    clock = 3000; await tick(); assert(cleared); assert.equal(context.modalTitle.textContent, 'ใช้เวลาดำเนินการนานกว่าปกติ');
    // Re-run the production callback with a fetch that remains pending across ticks.
    clock = 0; calls = 0; cleared = false;
    let release;
    context.fetch = () => { calls++; return new Promise(resolve => { release = resolve; }); };
    const slowContext = vm.createContext({ ...context });
    vm.runInContext(html.slice(begin, end), slowContext);
    const pending = tick();
    clock = 1500; await tick(); assert.equal(calls, 1, 'Pending poll must not overlap');
    release({ status: 429, headers: { get: () => '60' } }); await pending;
  }
});
