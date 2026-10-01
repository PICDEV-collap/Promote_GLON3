const assert = require('node:assert/strict');
const { OperatingHoursGuard } = require('../bot-service/dist/guard/operating-hours');
const { QuotaManager } = require('../bot-service/dist/quota/quota-manager');

for (const [date, expected] of [
  ['2026-10-01T13:59:59+07:00', true],
  ['2026-10-01T14:00:00+07:00', false],
  ['2026-10-02T06:00:00+07:00', true],
  ['2027-01-16T15:00:00+07:00', true],
  ['2027-01-17T14:00:00+07:00', false],
  ['2027-05-01T15:00:00+07:00', true],
  ['2027-05-02T14:00:00+07:00', false],
]) {
  assert.equal(OperatingHoursGuard.checkSalesStatus(new Date(date)).isOpen, expected, date);
}
assert.equal(QuotaManager.parseQuotaFromPortalText('คุณขายสลากฯ ได้อีก 1,016,461 ใบ', 2000), null);
const recovered = QuotaManager.parseQuotaFromPortalText('ยอดขาย: 482 / 2,000 ใบ คุณขายสลากฯ ได้อีก 1,016,461 ใบ', 2000);
assert.equal(recovered.remainingQuota, 1518);
assert.equal(recovered.usedQuota, 482);
assert.equal(QuotaManager.parseQuotaFromPortalText('คุณขายสลากฯ ได้อีก 0 ใบ', 2000).remainingQuota, 0);
const fake = { data: { maxQuota: 2000, remainingQuota: 1000, usedQuota: 1000 } };
assert.throws(() => QuotaManager.prototype.syncFromWeb.call(fake, 1016461, 2000));
assert.throws(() => QuotaManager.prototype.updateLiveQuota.call(fake, -1, 2001, 2000));
assert.equal(fake.data.remainingQuota, 1000);
console.log('PASS: 13 sales date and quota regression checks');
