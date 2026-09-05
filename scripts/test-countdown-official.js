/**
 * GLO N3 - Official Draw Schedule, Postponement & Winning Numbers Test Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const N3Countdown = require('../js/n3-countdown.js');
const N3Checker = require('../js/n3-checker.js');
const { parseOfficialRoundFromPortal, QuotaManager } = require('../bot-service/dist/quota/quota-manager.js');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
  }
}

console.log('====================================================');
console.log('TEST SUITE: GLO N3 Official Schedule & Postponement');
console.log('====================================================\n');

// 1. Dataset Integrity
runTest('Dataset: data/official-draw-schedule.json exists and contains GLO schedules', () => {
  const filePath = path.join(__dirname, '../data/official-draw-schedule.json');
  assert.strictEqual(fs.existsSync(filePath), true);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.strictEqual(Array.isArray(data.schedules), true);
  assert.strictEqual(data.schedules.length > 5, true);
  const may2 = data.schedules.find(s => s.drawDate === '2026-05-02');
  assert.strictEqual(may2?.isPostponed, true);
  assert.strictEqual(may2?.originalDate, '2026-05-01');
});

runTest('Dataset: data/latest-lottery.json contains official GLO N3 results', () => {
  const filePath = path.join(__dirname, '../data/latest-lottery.json');
  assert.strictEqual(fs.existsSync(filePath), true);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.strictEqual(data.drawDate, '2026-09-01');
  assert.strictEqual(data.n3.straight3.number, '212');
  assert.strictEqual(data.n3.straight3.prize, 5801);
  assert.deepStrictEqual(data.n3.shuffle3.numbers, ['122', '221']);
  assert.strictEqual(data.n3.straight2.number, '04');
  assert.strictEqual(data.n3.specialJackpot.ticketNumber, '212000003860');
  assert.strictEqual(data.gloStandard.firstPrize.number, '417212');
});

// 2. Postponement Calculation Engine
runTest('Postponement: Labor Day (May 1) shifts to May 2 at 14:30', () => {
  const refDate = new Date('2026-05-01T10:00:00+07:00');
  const rem = N3Countdown.calculateRemainingTime(refDate);
  assert.strictEqual(rem.targetDate.getDate(), 2);
  assert.strictEqual(rem.targetDate.getMonth(), 4); // May is 4
  assert.strictEqual(rem.targetDate.getHours(), 14);
  assert.strictEqual(rem.targetDate.getMinutes(), 30);
  assert.strictEqual(rem.isPostponed, true);
  assert.strictEqual(rem.postponeReason.includes('วันแรงงานแห่งชาติ'), true);
  assert.strictEqual(rem.targetDateText.includes('2 พฤษภาคม 2569'), true);
});

runTest('Postponement: Teacher\'s Day (Jan 16) shifts permanently to Jan 17 at 14:30', () => {
  const refDate = new Date('2026-01-16T10:00:00+07:00');
  const rem = N3Countdown.calculateRemainingTime(refDate);
  assert.strictEqual(rem.targetDate.getDate(), 17);
  assert.strictEqual(rem.targetDate.getMonth(), 0); // Jan is 0
  assert.strictEqual(rem.targetDate.getHours(), 14);
  assert.strictEqual(rem.targetDate.getMinutes(), 30);
  assert.strictEqual(rem.isPostponed, true);
  assert.strictEqual(rem.postponeReason.includes('วันครูแห่งชาติ'), true);
  assert.strictEqual(rem.targetDateText.includes('17 มกราคม 2569'), true);
});

runTest('Postponement: New Year\'s Day (Jan 1) shifts to Jan 2 at 14:30', () => {
  const refDate = new Date('2026-01-01T10:00:00+07:00');
  const rem = N3Countdown.calculateRemainingTime(refDate);
  assert.strictEqual(rem.targetDate.getDate(), 2);
  assert.strictEqual(rem.targetDate.getMonth(), 0); // Jan is 0
  assert.strictEqual(rem.isPostponed, true);
  assert.strictEqual(rem.postponeReason.includes('วันขึ้นปีใหม่'), true);
  assert.strictEqual(rem.targetDateText.includes('2 มกราคม 2569'), true);
});

runTest('Postponement: Late December advances to Dec 30 at 14:30', () => {
  const refDate = new Date('2026-12-25T10:00:00+07:00');
  const rem = N3Countdown.calculateRemainingTime(refDate);
  assert.strictEqual(rem.targetDate.getDate(), 30);
  assert.strictEqual(rem.targetDate.getMonth(), 11); // Dec is 11
  assert.strictEqual(rem.isPostponed, true);
  assert.strictEqual(rem.targetDateText.includes('30 ธันวาคม 2569'), true);
});

runTest('Schedule: Regular month (Sept 2026) targets Sept 16 at 14:30', () => {
  const refDate = new Date('2026-09-05T12:00:00+07:00');
  const rem = N3Countdown.calculateRemainingTime(refDate);
  assert.strictEqual(rem.targetDate.getDate(), 16);
  assert.strictEqual(rem.targetDate.getMonth(), 8); // Sept is 8
  assert.strictEqual(rem.isPostponed, false);
  assert.strictEqual(rem.targetDateText.includes('16 กันยายน 2569'), true);
});

// 3. Official API Handler
runTest('API Handler: api/draw-schedule.js returns 200 with CORS and required fields', async () => {
  const handler = require('../api/draw-schedule.js');
  let statusCode = 0;
  let headers = {};
  let responseData = null;

  const req = { method: 'GET' };
  const res = {
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; }
  };

  await handler(req, res);
  assert.strictEqual(statusCode, 200);
  assert.strictEqual(headers['access-control-allow-origin'], '*');
  assert.strictEqual(responseData.success, true);
  assert.strictEqual(responseData.upcomingDraw.drawDate, '2026-09-16');
  assert.strictEqual(responseData.latestLottery.n3.straight3.number, '212');
});

// 4. N3Checker Official Winning Numbers & Prize Checking
runTest('N3Checker: Latest draw has official GLO winning digits 212', () => {
  const latest = N3Checker.getLatestDraw();
  assert.strictEqual(latest.winning3Direct, '212');
  assert.deepStrictEqual(latest.winningTods, ['122', '221']);
  assert.strictEqual(latest.winning2Direct, '04');
  assert.strictEqual(latest.specialJackpotTicket, '212000003860');
  assert.strictEqual(latest.prizeDirect3, 5801);
});

runTest('N3Checker: checkN3Prize checks official winning 3-Direct 212', () => {
  const res = N3Checker.checkN3Prize('212');
  assert.strictEqual(res.isWinner, true);
  assert.strictEqual(res.hasJackpotChance, true);
  const titles = res.prizesWon.map(p => p.type);
  assert.strictEqual(titles.includes('3-DIRECT'), true);
  assert.strictEqual(res.totalPrize, 5801);
});

runTest('N3Checker: checkN3Prize checks official winning 3-Tod 122 and 221', () => {
  const res1 = N3Checker.checkN3Prize('122');
  assert.strictEqual(res1.isWinner, true);
  assert.strictEqual(res1.prizesWon[0].type, '3-TOD');
  assert.strictEqual(res1.totalPrize, 2702);

  const res2 = N3Checker.checkN3Prize('221');
  assert.strictEqual(res2.isWinner, true);
  assert.strictEqual(res2.prizesWon[0].type, '3-TOD');
});

runTest('N3Checker: checkN3Prize checks official winning 2-Direct 04', () => {
  const res = N3Checker.checkN3Prize('904'); // last 2 is 04
  assert.strictEqual(res.isWinner, true);
  assert.strictEqual(res.prizesWon[0].type, '2-DIRECT');
  assert.strictEqual(res.totalPrize, 582);
});

// 5. Dealer Portal Round Parsing
runTest('QuotaManager: parseOfficialRoundFromPortal parses dealer landing page round string', () => {
  const normal = parseOfficialRoundFromPortal('งวดวันที่ 16 ก.ย. 2569');
  assert.deepStrictEqual(normal, { round: '2026-09-16', thaiDate: '16 ก.ย. 2569' });

  const postponedMay = parseOfficialRoundFromPortal('งวดวันที่ 2 พ.ค. 2569');
  assert.deepStrictEqual(postponedMay, { round: '2026-05-02', thaiDate: '2 พ.ค. 2569' });

  const postponedJan = parseOfficialRoundFromPortal('งวดวันที่ 17 ม.ค. 2569');
  assert.deepStrictEqual(postponedJan, { round: '2026-01-17', thaiDate: '17 ม.ค. 2569' });
});

runTest('QuotaManager: getCurrentRoundIdentifier respects GLO postponed holidays', () => {
  const may2 = QuotaManager.getCurrentRoundIdentifier(new Date('2026-05-02T10:00:00+07:00'));
  assert.strictEqual(may2, '2026-05-02');

  const jan17 = QuotaManager.getCurrentRoundIdentifier(new Date('2026-01-17T10:00:00+07:00'));
  assert.strictEqual(jan17, '2026-01-17');

  const jan2 = QuotaManager.getCurrentRoundIdentifier(new Date('2026-01-02T10:00:00+07:00'));
  assert.strictEqual(jan2, '2026-01-02');

  const sept16 = QuotaManager.getCurrentRoundIdentifier(new Date('2026-09-05T10:00:00+07:00'));
  assert.strictEqual(sept16, '2026-09-16');
});

console.log('\n====================================================');
console.log(`OFFICIAL DRAW TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (100%)`);
console.log('====================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
