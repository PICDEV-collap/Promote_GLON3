const test = require('node:test');
const assert = require('node:assert/strict');
const { TelegramService } = require('../bot-service/dist/notify/telegram-service');
const { CustomerRegistry } = require('../bot-service/dist/storage/customer-registry');
const { CONFIG } = require('../bot-service/dist/config');

test('Telegram order alerts show names/full IDs and separate verified admin tests', async () => {
  const service = TelegramService.getInstance();
  const registry = CustomerRegistry.getInstance();
  const original = { getCustomer: registry.getCustomer, sendText: service.sendText, sendPhoto: service.sendPhoto, admin: CONFIG.ADMIN_LINE_USER_ID };
  const messages = [];
  try {
    CONFIG.ADMIN_LINE_USER_ID = 'U-admin-test';
    registry.getCustomer = id => id === 'U-customer-full-id' ? { displayName: 'ลูกค้า <หนึ่ง>' } : undefined;
    service.sendText = async text => { messages.push(text); return true; };
    service.sendPhoto = async (_, caption) => { messages.push(caption); return true; };
    await service.notifyOrderCreated('123 (1 ใบ)', 20, 1, 'U-customer-full-id', 'ORD-customer');
    assert.match(messages[0], /ลูกค้า <หนึ่ง>/);
    assert.match(messages[0], /LINE ID: U-customer-full-id/);
    assert.match(messages[0], /เลขออเดอร์: ORD-customer/);
    assert.doesNotMatch(messages[0], /แอดมินทดสอบ|ออเดอร์ทดสอบ/);
    await service.notifyOrderCreated('123 (1 ใบ)', 20, 1, 'U-admin-test', 'ORD-admin');
    assert.match(messages[1], /ออเดอร์ทดสอบโดยแอดมิน/);
    assert.match(messages[1], /LINE ID: U-admin-test/);
    await service.notifyOrderCompleted('123 (1 ใบ)', 20, 'fixture.png', 'U-admin-test', 'ORD-admin');
    assert.match(messages[2], /ออเดอร์ทดสอบแอดมิน: ออก QR สำเร็จ/);
    assert.match(messages[2], /เลขออเดอร์: ORD-admin/);
    await service.notifyOrderCreated('123 (1 ใบ)', 20, 1, 'anonymous_web_user', 'ORD-web');
    assert.match(messages[3], /ไม่ทราบบัญชี LINE/);
    assert.match(messages[3], /ORD-web/);
    assert.doesNotMatch(messages[3], /แอดมินทดสอบ|LINE ID:|anonymous_we/);
  } finally {
    registry.getCustomer = original.getCustomer;
    service.sendText = original.sendText; service.sendPhoto = original.sendPhoto;
    CONFIG.ADMIN_LINE_USER_ID = original.admin;
  }
});
