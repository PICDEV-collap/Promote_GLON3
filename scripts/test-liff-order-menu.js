const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderMenu } = require('./liff-order-menu');
test('opens orders in LIFF and preserves every other button and the previous menu', () => {
  const existing = { size: { width: 2500, height: 1686 }, selected: true, chatBarText: 'เมนู', areas: [
    { bounds: { x: 0 }, action: { type: 'uri', uri: 'https://promote-glon-3.vercel.app/line?openExternalBrowser=1' } },
    { bounds: { x: 833 }, action: { type: 'uri', uri: 'https://promote-glon-3.vercel.app/line?mode=6pack&openExternalBrowser=1' } },
    ...Array.from({ length: 4 }, (_, i) => ({ bounds: { x: i }, action: { type: 'message', text: String(i) } }))
  ] };
  const before = structuredClone(existing);
  const result = buildOrderMenu(existing, '2011462211-WVsuHFk4');
  assert.equal(result.areas[0].action.uri, 'https://liff.line.me/2011462211-WVsuHFk4/line');
  assert.equal(result.areas[1].action.uri, 'https://liff.line.me/2011462211-WVsuHFk4/line?mode=6pack');
  assert.deepEqual(result.areas.slice(2), existing.areas.slice(2));
  assert.deepEqual(existing, before);
  assert.throws(() => buildOrderMenu({ ...existing, areas: [] }, '2011462211-WVsuHFk4'));
});
