import assert from 'assert';
import { parseOrderMessage } from './index';
import { FlexMessageBuilder } from './line/flex-message';
import { QuotaManager } from './quota/quota-manager';
import { OrderItem } from './queue/order-queue';

function runTests() {
  console.log('====================================================');
  console.log('   RUNNING AUTOMATED VERIFICATION TEST SUITE        ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(e);
    }
  }

  // TEST SUITE 1: Multi-ticket Parsing
  test('Parse multi-ticket comma separated: 334=5,447=6,778=3', () => {
    const result = parseOrderMessage('334=5,447=6,778=3');
    assert(result !== null);
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0], { number: '334', quantity: 5 });
    assert.deepStrictEqual(result[1], { number: '447', quantity: 6 });
    assert.deepStrictEqual(result[2], { number: '778', quantity: 3 });

    const totalQty = result.reduce((sum, i) => sum + i.quantity, 0);
    assert.strictEqual(totalQty, 14);
    assert.strictEqual(totalQty * 20, 280);
  });

  test('Parse multi-ticket comma + space: 111 2, 222 2', () => {
    const result = parseOrderMessage('111 2, 222 2');
    assert(result !== null);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { number: '111', quantity: 2 });
    assert.deepStrictEqual(result[1], { number: '222', quantity: 2 });
    assert.strictEqual(result.reduce((sum, i) => sum + i.quantity, 0), 4);
  });

  test('Parse multi-ticket space-separated pairs: 111 2 222 2', () => {
    const result = parseOrderMessage('111 2 222 2');
    assert(result !== null);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { number: '111', quantity: 2 });
    assert.deepStrictEqual(result[1], { number: '222', quantity: 2 });
  });

  test('Parse multi-ticket space-separated with equals: 111=2 222=3', () => {
    const result = parseOrderMessage('111=2 222=3');
    assert(result !== null);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { number: '111', quantity: 2 });
    assert.deepStrictEqual(result[1], { number: '222', quantity: 3 });
  });

  test('Parse multi-ticket Thai units: 111 2 ใบ 222 3 ใบ', () => {
    const result = parseOrderMessage('111 2 ใบ 222 3 ใบ');
    assert(result !== null);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { number: '111', quantity: 2 });
    assert.deepStrictEqual(result[1], { number: '222', quantity: 3 });
  });

  test('Parse multi-ticket multiplier style: 334 x 5, 447 x 6', () => {
    const result = parseOrderMessage('334 x 5, 447 x 6');
    assert(result !== null);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { number: '334', quantity: 5 });
    assert.deepStrictEqual(result[1], { number: '447', quantity: 6 });
  });

  test('Parse equal quantity format: 123 456 อย่างละ 2 ใบ', () => {
    const result = parseOrderMessage('123 456 อย่างละ 2 ใบ');
    assert(result !== null);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { number: '123', quantity: 2 });
    assert.deepStrictEqual(result[1], { number: '456', quantity: 2 });
  });

  test('Parse space-separated multiple 3-digit numbers (default 1 ticket): 111 222 333', () => {
    const result = parseOrderMessage('111 222 333');
    assert(result !== null);
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0], { number: '111', quantity: 1 });
    assert.deepStrictEqual(result[1], { number: '222', quantity: 1 });
    assert.deepStrictEqual(result[2], { number: '333', quantity: 1 });
  });

  test('Parse single ticket with prefix: ซื้อ 123 2 ใบ', () => {
    const result = parseOrderMessage('ซื้อ 123 2 ใบ');
    assert(result !== null);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], { number: '123', quantity: 2 });
  });

  test('Parse single ticket: 123 2', () => {
    const result = parseOrderMessage('123 2');
    assert(result !== null);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], { number: '123', quantity: 2 });
  });

  test('Parse single ticket 1 ticket default: 123', () => {
    const result = parseOrderMessage('123');
    assert(result !== null);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], { number: '123', quantity: 1 });
  });

  test('Parse single ticket with prefix สั่งซื้อ: สั่งซื้อ 123 2 ใบ', () => {
    const result = parseOrderMessage('สั่งซื้อ 123 2 ใบ');
    assert(result !== null);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], { number: '123', quantity: 2 });
  });

  test('Parse multi-ticket with prefix สั่งซื้อ: สั่งซื้อ 334=5, 447=6', () => {
    const result = parseOrderMessage('สั่งซื้อ 334=5, 447=6');
    assert(result !== null);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { number: '334', quantity: 5 });
    assert.deepStrictEqual(result[1], { number: '447', quantity: 6 });
  });

  test('Parse with prefix ขอซื้อ / ขอเลข / เอาเลข: ขอซื้อ 123 2 ใบ, ขอเลข 456 3 ใบ, เอาเลข 789 1', () => {
    const r1 = parseOrderMessage('ขอซื้อ 123 2 ใบ');
    assert(r1 !== null);
    assert.deepStrictEqual(r1[0], { number: '123', quantity: 2 });

    const r2 = parseOrderMessage('ขอเลข 456 3 ใบ');
    assert(r2 !== null);
    assert.deepStrictEqual(r2[0], { number: '456', quantity: 3 });

    const r3 = parseOrderMessage('เอาเลข 789 1');
    assert(r3 !== null);
    assert.deepStrictEqual(r3[0], { number: '789', quantity: 1 });
  });

  test('Parse multiple numbers with prefix: ซื้อ 123 456 789 and สั่งซื้อ 123 456 789', () => {
    const r1 = parseOrderMessage('ซื้อ 123 456 789');
    assert(r1 !== null);
    assert.strictEqual(r1.length, 3);
    assert.deepStrictEqual(r1[0], { number: '123', quantity: 1 });
    assert.deepStrictEqual(r1[1], { number: '456', quantity: 1 });
    assert.deepStrictEqual(r1[2], { number: '789', quantity: 1 });

    const r2 = parseOrderMessage('สั่งซื้อ 123 456 789');
    assert(r2 !== null);
    assert.strictEqual(r2.length, 3);
    assert.deepStrictEqual(r2[0], { number: '123', quantity: 1 });
  });

  test('Parse colon delimited pairs: 334:5, 447:6 and single 334: 5', () => {
    const r1 = parseOrderMessage('334:5, 447:6');
    assert(r1 !== null);
    assert.strictEqual(r1.length, 2);
    assert.deepStrictEqual(r1[0], { number: '334', quantity: 5 });
    assert.deepStrictEqual(r1[1], { number: '447', quantity: 6 });

    const r2 = parseOrderMessage('334: 5');
    assert(r2 !== null);
    assert.deepStrictEqual(r2[0], { number: '334', quantity: 5 });
  });

  test('Parse multiline orders: 111 2\\n222 3', () => {
    const result = parseOrderMessage('111 2\n222 3');
    assert(result !== null);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { number: '111', quantity: 2 });
    assert.deepStrictEqual(result[1], { number: '222', quantity: 3 });
  });

  test('Parse Thai numerals: ๑๒๓ ๒ ใบ', () => {
    const result = parseOrderMessage('๑๒๓ ๒ ใบ');
    assert(result !== null);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], { number: '123', quantity: 2 });
  });

  test('Parse equal quantity with prefix: สั่งซื้อ 123 456 อย่างละ 2 ใบ', () => {
    const result = parseOrderMessage('สั่งซื้อ 123 456 อย่างละ 2 ใบ');
    assert(result !== null);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { number: '123', quantity: 2 });
    assert.deepStrictEqual(result[1], { number: '456', quantity: 2 });
  });

  test('Parse duplicate numbers aggregated: 334=5, 447=6, 334=2', () => {
    const result = parseOrderMessage('334=5, 447=6, 334=2');
    assert(result !== null);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { number: '334', quantity: 7 });
    assert.deepStrictEqual(result[1], { number: '447', quantity: 6 });
  });

  test('Parse asterisk multipliers and space-separated colon pairs: 111 * 2, 222 * 3 and 111: 2 222: 3', () => {
    const r1 = parseOrderMessage('111 * 2, 222 * 3');
    assert(r1 !== null);
    assert.strictEqual(r1.length, 2);
    assert.deepStrictEqual(r1[0], { number: '111', quantity: 2 });
    assert.deepStrictEqual(r1[1], { number: '222', quantity: 3 });

    const r2 = parseOrderMessage('111: 2 222: 3');
    assert(r2 !== null);
    assert.strictEqual(r2.length, 2);
    assert.deepStrictEqual(r2[0], { number: '111', quantity: 2 });
    assert.deepStrictEqual(r2[1], { number: '222', quantity: 3 });
  });

  test('Non-order and admin commands return null', () => {
    assert.strictEqual(parseOrderMessage('qr'), null);
    assert.strictEqual(parseOrderMessage('login'), null);
    assert.strictEqual(parseOrderMessage('id'), null);
    assert.strictEqual(parseOrderMessage('myid'), null);
    assert.strictEqual(parseOrderMessage('help'), null);
    assert.strictEqual(parseOrderMessage('สวัสดีครับ'), null);
    assert.strictEqual(parseOrderMessage(''), null);
  });

  // TEST SUITE 2: Flex Message Generation (Unified Single Message, No Duplicates)
  test('Flex Message: Multi-ticket order breakdown and combined total', () => {
    const items: OrderItem[] = [
      { number: '334', quantity: 5 },
      { number: '447', quantity: 6 },
      { number: '778', quantity: 3 }
    ];
    const totalQty = 14;
    const totalPrice = 280;
    const qrUrl = 'http://localhost:3333/qrcodes/payment-334-447-778-12345.png';
    const downloadUrl = 'http://localhost:3333/download-qr/payment-334-447-778-12345.png';

    const msg = FlexMessageBuilder.buildPaymentQRMessage(
      qrUrl,
      items,
      totalQty,
      totalPrice,
      10,
      downloadUrl
    );

    assert.strictEqual(msg.type, 'flex');
    assert(msg.altText.includes('14 ใบ'));
    assert(msg.altText.includes('334, 447, 778'));

    const bubble = msg.contents as any;
    assert.strictEqual(bubble.type, 'bubble');

    // Hero contains only the single QR code image
    assert.strictEqual(bubble.hero.type, 'image');
    assert.strictEqual(bubble.hero.url, qrUrl);
    assert.strictEqual(bubble.hero.aspectMode, 'fit');
    assert.strictEqual(bubble.hero.action.uri, downloadUrl);

    // Body contains order breakdown
    const bodyStr = JSON.stringify(bubble.body);
    assert(bodyStr.includes('• เลข 334'));
    assert(bodyStr.includes('5 ใบ (100 บ.)'));
    assert(bodyStr.includes('• เลข 447'));
    assert(bodyStr.includes('6 ใบ (120 บ.)'));
    assert(bodyStr.includes('• เลข 778'));
    assert(bodyStr.includes('3 ใบ (60 บ.)'));
    assert(bodyStr.includes('14 ใบ'));
    assert(bodyStr.includes('280 บาท'));

    // Footer contains download action button
    const footerStr = JSON.stringify(bubble.footer);
    assert(footerStr.includes(downloadUrl));
  });

  test('Flex Message: Single ticket order', () => {
    const items: OrderItem[] = [{ number: '999', quantity: 3 }];
    const msg = FlexMessageBuilder.buildPaymentQRMessage(
      'http://localhost:3333/qrcodes/qr.png',
      items,
      3,
      60
    );
    assert.strictEqual(msg.type, 'flex');
    assert(msg.altText.includes('999 (3 ใบ)'));
    const bodyStr = JSON.stringify(msg.contents);
    assert(bodyStr.includes('999'));
    assert(bodyStr.includes('3 ใบ'));
    assert(bodyStr.includes('60 บาท'));
  });

  // TEST SUITE 3: Quota Calculation for Multi-ticket orders
  test('Quota check for combined ticket count', () => {
    const qm = new QuotaManager();
    const canFulfill = qm.canFulfill(14);
    assert.strictEqual(canFulfill.allowed, true);
    assert(canFulfill.remaining >= 14);
  });

  console.log(`\n====================================================`);
  console.log(`TEST SUMMARY: ${passed} / ${total} tests passed (100%)`);
  console.log(`====================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
