const test = require('node:test');
const assert = require('node:assert/strict');
const { N3OrderService } = require('../bot-service/dist/automation/n3-order');
test('audits previous numbers from the cart without requiring their search cards', async () => {
  const items = [{ number: '461', quantity: 16 }, { number: '780', quantity: 23 }, ...Array.from({ length: 56 }, (_, i) => ({ number: String(i).padStart(3, '0'), quantity: 1 }))];
  const cart = { lottoList: items.map(item => ({ ltNumber: item.number, ltQuantity: item.quantity })), totalQuantity: 95 };
  const page = { evaluate: async () => cart };
  await N3OrderService.verifyCartQuantities(page, items);
  cart.lottoList[0].ltQuantity = 15;
  await assert.rejects(N3OrderService.verifyCartQuantities(page, items), /ไม่ตรง/);
  cart.lottoList[0].ltQuantity = 16; cart.totalQuantity = 96;
  await assert.rejects(N3OrderService.verifyCartQuantities(page, items), /ไม่ตรง/);
  await assert.rejects(N3OrderService.verifyCartQuantities({ evaluate: async () => null }, items), /ไม่สามารถตรวจ/);
});
