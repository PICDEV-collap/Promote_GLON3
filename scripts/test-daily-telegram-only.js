const test = require('node:test');
const assert = require('node:assert/strict');
require('../bot-service/node_modules/ts-node').register({ project: 'bot-service/tsconfig.json' });
const { LineReplyHandler } = require('../bot-service/src/line/reply-handler');
const { TelegramService } = require('../bot-service/src/notify/telegram-service');
test('daily OPEN/CLOSE notices use only Telegram, including failure', async () => {
  const telegram = TelegramService.getInstance();
  const original = telegram.notifyDailySchedule;
  const handler = new LineReplyHandler();
  handler.pushToAdmin = async () => { throw Error('Daily notice must not call LINE'); };
  const calls = [];
  try {
    telegram.notifyDailySchedule = async (type, time) => { calls.push({ type, time }); return true; };
    assert.equal(await handler.notifyNightlyClose('23:00'), true);
    assert.equal(await handler.notifyMorningStoreOpen('06:00'), true);
    assert.deepEqual(calls, [{ type: 'CLOSE', time: '23:00' }, { type: 'OPEN', time: '06:00' }]);
    telegram.notifyDailySchedule = async () => false;
    assert.equal(await handler.notifyNightlyClose('23:00'), false);
    assert.equal(await handler.notifyMorningStoreOpen('06:00'), false);
    telegram.notifyDailySchedule = async () => { throw Error('Telegram unavailable'); };
    await assert.rejects(handler.notifyNightlyClose('23:00'), /Telegram unavailable/);
    await assert.rejects(handler.notifyMorningStoreOpen('06:00'), /Telegram unavailable/);
  } finally { telegram.notifyDailySchedule = original; }
});
