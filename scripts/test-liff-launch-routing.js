const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function runHead(file, query) {
  const html = fs.readFileSync(file, 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const redirects = [], classes = [];
  vm.runInNewContext(script, { URLSearchParams, navigator: { userAgent: 'Android Line/15' },
    window: { location: { href: 'https://promote-glon-3.vercel.app/' + query, search: query, replace: url => redirects.push(url) } },
    document: { documentElement: { classList: { add: name => classes.push(name) } } } });
  return { redirects, classes };
}
test('LIFF primary redirect stays in LINE and both order modes avoid external-browser forcing', () => {
  for (const file of ['index.html', 'bot-service/public/index.html']) {
    assert.deepEqual(runHead(file, '?liff.state=%2Fline').redirects, []);
    assert.deepEqual(runHead(file, '?liff.state=%2Fline%3Fmode%3D6pack').redirects, []);
  }
  for (const file of ['line.html', 'order.html', 'order-6pack.html', 'bot-service/public/line.html', 'bot-service/public/order.html', 'bot-service/public/order-6pack.html']) {
    assert.deepEqual(runHead(file, '').redirects, []);
    const reverse = runHead(file, '?mode=6pack');
    assert.deepEqual(reverse.redirects, []);
    assert(reverse.classes.includes('mode-6pack'));
  }
});
