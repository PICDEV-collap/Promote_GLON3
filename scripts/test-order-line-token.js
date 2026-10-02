const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../bot-service/node_modules/typescript');
test('Rich Menu orders obtain a token only after LINE login and retry failed initialization', async () => {
  const html = fs.readFileSync('line.html', 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
  const ast = ts.createSourceFile('line', scripts, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'getVerifiedOrderToken');
  let loggedIn = false, initialized = 0, login = 0, fail = true;
  const context = vm.createContext({ window: { location: { href: 'https://promote-glon-3.vercel.app/line' } },
    liff: { init: async () => { initialized++; if (fail) throw Error('offline'); }, isLoggedIn: () => loggedIn,
      login: () => { login++; }, getAccessToken: () => 'verified-token' } });
  vm.runInContext('let orderAccountInit;\n' + fn.getText(ast), context);
  await assert.rejects(vm.runInContext('getVerifiedOrderToken()', context), /offline/);
  fail = false;
  assert.equal(await vm.runInContext('getVerifiedOrderToken()', context), null);
  assert.equal(login, 1); assert.equal(initialized, 2);
  loggedIn = true;
  assert.equal(await vm.runInContext('getVerifiedOrderToken()', context), 'verified-token');
  assert.equal(initialized, 2);
  for (const file of ['line.html', 'order.html', 'order-6pack.html', 'bot-service/public/line.html', 'bot-service/public/order.html', 'bot-service/public/order-6pack.html']) {
    assert.match(fs.readFileSync(file, 'utf8'), /accessToken: verifiedAccessToken/);
  }
});
