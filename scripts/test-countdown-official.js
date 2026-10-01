/**
 * GLO N3 - Official Draw Schedule, Postponement & Winning Numbers Test Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const N3Countdown = require('../js/n3-countdown.js');
const N3Checker = require('../js/n3-checker.js');
const { parseOfficialRoundFromPortal, QuotaManager } = require('../bot-service/dist/quota/quota-manager.js');
const drawScheduleHandler = require('../api/draw-schedule.js');

let passedTests = 0;
let totalTests = 0;
const pendingTests = [];

function runTest(name, fn) {
  totalTests++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pendingTests.push(Promise.resolve(result).then(() => {
        console.log(`✅ PASS: ${name}`);
        passedTests++;
      }).catch(err => {
        console.error(`❌ FAIL: ${name}`);
        console.error(err);
      }));
    } else {
      console.log(`✅ PASS: ${name}`);
      passedTests++;
    }
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
  assert.strictEqual(data.drawDate, '2026-10-01');
  assert.strictEqual(data.n3.straight3.number, '701');
  assert.strictEqual(data.n3.straight3.prize, 6021);
  assert.deepStrictEqual(data.n3.shuffle3.numbers, ['017', '071', '107', '170', '710']);
  assert.strictEqual(data.n3.straight2.number, '70');
  assert.strictEqual(data.n3.specialJackpot.ticketNumber, '701000001140');
  assert.strictEqual(data.gloStandard.firstPrize.number, '402701');
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

runTest('Schedule API: Oct 1 is upcoming before 14:30 Bangkok and Oct 16 after it', () => {
  const filePath = path.join(__dirname, '../data/official-draw-schedule.json');
  const schedules = JSON.parse(fs.readFileSync(filePath, 'utf8')).schedules;

  const beforeDraw = drawScheduleHandler.getNextUpcomingDraw(schedules, new Date('2026-10-01T07:29:59.000Z'));
  assert.strictEqual(beforeDraw?.drawDate, '2026-10-01');

  const atDrawTime = drawScheduleHandler.getNextUpcomingDraw(schedules, new Date('2026-10-01T07:30:00.000Z'));
  assert.strictEqual(atDrawTime?.drawDate, '2026-10-16');
});

// 3. Official API Handler
runTest('API Handler: api/draw-schedule.js returns 200 with CORS and required fields', async () => {
  let statusCode = 0;
  let headers = {};
  let responseData = null;

  const req = { method: 'GET' };
  const res = {
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; }
  };

  await drawScheduleHandler(req, res);
  assert.strictEqual(statusCode, 200);
  assert.strictEqual(headers['access-control-allow-origin'], '*');
  assert.strictEqual(responseData.success, true);
  assert.strictEqual(typeof responseData.upcomingDraw.drawDate, 'string');
  assert.strictEqual(responseData.upcomingDraw.drawTime, '14:30');
  assert.strictEqual(responseData.scheduleCount > 5, true);
  assert.strictEqual(responseData.latestLottery.n3.straight3.number, '701');
});

// 4. N3Checker Official Winning Numbers & Prize Checking
runTest('N3Checker: Latest draw has official GLO winning digits 701', () => {
  const latest = N3Checker.getLatestDraw();
  assert.strictEqual(latest.winning3Direct, '701');
  assert.deepStrictEqual(latest.winningTods, ['017', '071', '107', '170', '710']);
  assert.strictEqual(latest.winning2Direct, '70');
  assert.strictEqual(latest.specialJackpotTicket, '701000001140');
  assert.strictEqual(latest.prizeDirect3, 6021);
});

runTest('N3Checker: checkN3Prize checks official winning 3-Direct 701', () => {
  const res = N3Checker.checkN3Prize('701');
  assert.strictEqual(res.isWinner, true);
  assert.strictEqual(res.hasJackpotChance, true);
  const titles = res.prizesWon.map(p => p.type);
  assert.strictEqual(titles.includes('3-DIRECT'), true);
  assert.strictEqual(res.totalPrize, 6021);
});

runTest('N3Checker: checkN3Prize checks official winning 3-Tod 017 and 710', () => {
  const res1 = N3Checker.checkN3Prize('017');
  assert.strictEqual(res1.isWinner, true);
  assert.strictEqual(res1.prizesWon[0].type, '3-TOD');
  assert.strictEqual(res1.totalPrize, 997);

  const res2 = N3Checker.checkN3Prize('710');
  assert.strictEqual(res2.isWinner, true);
  assert.strictEqual(res2.prizesWon[0].type, '3-TOD');
});

runTest('N3Checker: checkN3Prize checks official winning 2-Direct 70', () => {
  const res = N3Checker.checkN3Prize('970'); // last 2 is 70
  assert.strictEqual(res.isWinner, true);
  assert.strictEqual(res.prizesWon[0].type, '2-DIRECT');
  assert.strictEqual(res.totalPrize, 443);
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

Promise.all(pendingTests).then(() => {
  console.log('\n====================================================');
  console.log(`OFFICIAL DRAW TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exitCode = 1;
  }
});
