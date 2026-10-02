const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ line = true, share = false, cancel = false } = {}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { style: {}, classList: { add() {}, remove() {} }, querySelector: selector => element(selector.slice(1)) });
    return elements.get(id);
  }
  const calls = { download: 0, shared: 0, opened: [], toast: [] };
  const context = vm.createContext({
    console, Blob, File, Uint8Array, URL, setTimeout: () => {},
    navigator: { userAgent: 'Android' + (line ? ' Line/15' : ''),
      ...(share ? { canShare: () => true, share: async ({ files }) => {
        assert.equal(files[0].type, 'image/png'); calls.shared++;
        if (cancel) throw Object.assign(Error('cancel'), { name: 'AbortError' });
      } } : {}) },
    liff: { isInClient: () => line, openWindow: options => calls.opened.push(options) },
    window: { location: { href: 'https://promote-glon-3.vercel.app/line' },
      atob: s => Buffer.from(s, 'base64').toString('binary'), showToast: message => calls.toast.push(message) },
    document: { readyState: 'loading', addEventListener() {}, getElementById: element,
      createElement: () => ({ style: {}, click: () => calls.download++ }),
      body: { appendChild() {}, contains: () => false } }
  });
  vm.runInContext(fs.readFileSync('js/image-saver.js', 'utf8'), context);
  return { context, calls, element };
}
const options = { dataUrl: 'data:image/png;base64,aGVsbG8=', filename: 'GLO-N3-Payment-QR-test.png',
  externalUrl: 'https://promote-glon-3.vercel.app/download-qr/payment-test.png?action=dl' };
test('Android LINE opens an image sheet without a blocked download or false success', async () => {
  const { context, calls, element } = setup();
  await context.window.ImageSaver.saveImage(options);
  assert.equal(element('image-saver-img').src, options.dataUrl);
  assert.equal(element('btn-image-saver-dl').style.display, 'none');
  assert.equal(element('btn-image-saver-external').style.display, 'none');
  assert.equal(calls.download, 0);
  await element('btn-image-saver-share').onclick();
  assert.equal(calls.download, 0);
  element('btn-image-saver-external').onclick();
  assert.equal(calls.opened[0].url, options.externalUrl);
  assert.equal(calls.opened[0].external, true);
  assert.equal(context.window.location.href, 'https://promote-glon-3.vercel.app/line');
  assert.ok(!calls.toast.some(s => /เรียบร้อย|สำเร็จ/.test(s)));
});
test('Android can share the QR file; cancelling does not trigger a download', async () => {
  for (const cancel of [false, true]) {
    const { context, calls, element } = setup({ share: true, cancel });
    await context.window.ImageSaver.saveImage(options);
    await element('btn-image-saver-share').onclick();
    assert.equal(calls.shared, 1);
    assert.equal(calls.download, 0);
    assert.equal(calls.opened.length, 0);
  }
});
test('standard Android browser downloads the QR', async () => {
  const { context, calls } = setup({ line: false });
  await context.window.ImageSaver.saveImage(options);
  assert.equal(calls.download, 1);
  assert.ok(!calls.toast.some(s => /เรียบร้อย|สำเร็จ/.test(s)));
});
test('all order pages use the same image saver and clear the download URL on exit', () => {
  for (const name of ['line.html', 'order.html', 'order-6pack.html']) {
    const html = fs.readFileSync(name, 'utf8');
    assert.equal(html, fs.readFileSync('bot-service/public/' + name, 'utf8'));
    assert.match(html, /externalUrl: window.currentQrDownloadUrl/);
    assert.match(html, /window.currentQrDownloadUrl = null/);
    assert.match(html, /image-saver.js\?v=2.4/);
  }
  assert.equal(fs.readFileSync('js/image-saver.js', 'utf8'), fs.readFileSync('bot-service/public/js/image-saver.js', 'utf8'));
});
