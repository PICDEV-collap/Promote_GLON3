const test = require('node:test');
const assert = require('node:assert/strict');
const { readLiveQuota } = require('../bot-service/dist/quota/live-quota-reader');

function fixture(url, options = {}) {
  const calls = { opened: 0, closed: 0, synced: 0 };
  const reader = {
    addInitScript: async (_, auth) => { assert.deepEqual(auth, { accessToken: 'fixture', user_storage: '{}' }); },
    goto: async destination => { assert.equal(destination, 'https://n3.glolotteryshop.com/landing/'); if (options.fail) throw Error('offline'); },
    waitForFunction: async () => {},
    locator: () => ({ innerText: async () => options.expired ? 'ไม่สามารถทำรายการได้' : 'ยอดขายร้านค้า 72 / 2,000 ใบ' }),
    url: () => options.login ? 'https://n3.glolotteryshop.com/login/' : 'https://n3.glolotteryshop.com/landing/',
    close: async () => { calls.closed++; }
  };
  const page = { evaluate: async () => ({ accessToken: 'fixture', user_storage: '{}' }), isClosed: () => false, url: () => url, context: () => ({ newPage: async () => { calls.opened++; return reader; } }) };
  const manager = { syncQuotaFromLivePortal: async (target, navigate) => {
    assert.equal(target, reader); assert.equal(navigate, false); calls.synced++;
    return { remainingQuota: 1928, usedQuota: 72, maxQuota: 2000 };
  } };
  return { page, manager, calls };
}

test('reads fresh quota from search, confirmation and QR without navigating original tab', async () => {
  for (const path of ['lotto-search/?position=1', 'lotto-confirm/', 'qr/', 'landing/']) {
    const f = fixture('https://n3.glolotteryshop.com/' + path);
    assert.equal((await readLiveQuota(f.manager, f.page)).remainingQuota, 1928);
    assert.deepEqual(f.calls, { opened: 1, closed: 1, synced: 1 });
  }
});
test('shares concurrent requests and opens a fresh page next time', async () => {
  const f = fixture('https://n3.glolotteryshop.com/lotto-search/');
  await Promise.all([readLiveQuota(f.manager, f.page), readLiveQuota(f.manager, f.page)]);
  assert.equal(f.calls.opened, 1);
  await readLiveQuota(f.manager, f.page);
  assert.equal(f.calls.opened, 2);
  assert.equal(f.calls.closed, 2);
});
test('failed or expired reads preserve cache and close temporary tab', async () => {
  for (const options of [{ fail: true }, { expired: true }, { login: true }]) {
    const f = fixture('https://n3.glolotteryshop.com/qr/', options);
    assert.equal(await readLiveQuota(f.manager, f.page), null);
    assert.equal(f.calls.synced, 0); assert.equal(f.calls.closed, 1);
  }
  const f = fixture('https://n3.glolotteryshop.com/login/');
  assert.equal(await readLiveQuota(f.manager, f.page), null);
  assert.equal(f.calls.opened, 0);
});
