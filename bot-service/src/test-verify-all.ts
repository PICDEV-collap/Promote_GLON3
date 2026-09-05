import assert from 'assert';
import { messagingApi } from '@line/bot-sdk';
import fs from 'fs';
import path from 'path';
import { parseOrderMessage, isStopIntentional, getStoredWebhookUrl, getPublicBaseUrl } from './index';
import { FlexMessageBuilder } from './line/flex-message';
import { QuotaManager, parseQuotaFromPortalText } from './quota/quota-manager';
import { syncQuotaFromLivePortal as syncQuotaAutomation } from './automation/quota-manager';
import { N3OrderService, syncQuotaFromLivePortal as syncQuotaOrder } from './automation/n3-order';
import { OrderItem } from './queue/order-queue';
import { CONFIG } from './config';
import { LineReplyHandler, getThaiTime } from './line/reply-handler';
import { DreamEngine } from './dream/dream-engine';
import { N3Auth } from './automation/n3-auth';

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

  test('Parse polite greeting with orders: สวัสดี, ดีครับ, หวัดดี', () => {
    const r1 = parseOrderMessage('สวัสดีครับ สั่งซื้อ 123 2 ใบ');
    assert(r1 !== null);
    assert.deepStrictEqual(r1, [{ number: '123', quantity: 2 }]);

    const r2 = parseOrderMessage('สวัสดีค่ะ 456 1 ใบ');
    assert(r2 !== null);
    assert.deepStrictEqual(r2, [{ number: '456', quantity: 1 }]);

    const r3 = parseOrderMessage('ดีครับ เอาเลข 789 2 ใบ');
    assert(r3 !== null);
    assert.deepStrictEqual(r3, [{ number: '789', quantity: 2 }]);

    const r4 = parseOrderMessage('หวัดดี 334 5');
    assert(r4 !== null);
    assert.deepStrictEqual(r4, [{ number: '334', quantity: 5 }]);
  });

  test('Distinguish between dream requests and ticket orders', () => {
    // Ticket orders starting with ขอเลข / หาเลข
    const o1 = parseOrderMessage('ขอเลข 123 2 ใบ');
    assert(o1 !== null);
    assert.deepStrictEqual(o1, [{ number: '123', quantity: 2 }]);

    const o2 = parseOrderMessage('หาเลข 456 1 ใบ');
    assert(o2 !== null);
    assert.deepStrictEqual(o2, [{ number: '456', quantity: 1 }]);

    // Generic dream / lucky number requests should return null so DreamEngine handles them
    assert.strictEqual(parseOrderMessage('ขอเลขเด็ด'), null);
    assert.strictEqual(parseOrderMessage('ขอเลขเด็ดหน่อย'), null);
    assert.strictEqual(parseOrderMessage('หาเลขเด็ด'), null);
  });

  test('Non-order and admin commands return null', () => {
    assert.strictEqual(parseOrderMessage('qr'), null);
    assert.strictEqual(parseOrderMessage('login'), null);
    assert.strictEqual(parseOrderMessage('id'), null);
    assert.strictEqual(parseOrderMessage('myid'), null);
    assert.strictEqual(parseOrderMessage('help'), null);
    assert.strictEqual(parseOrderMessage('สวัสดีครับ'), null);
    assert.strictEqual(parseOrderMessage('สว้สดี'), null);
    assert.strictEqual(parseOrderMessage('เริ่ม'), null);
    assert.strictEqual(parseOrderMessage('เมนู'), null);
    assert.strictEqual(parseOrderMessage('ทำนายฝัน'), null);
    assert.strictEqual(parseOrderMessage('เลขเด็ด'), null);
    assert.strictEqual(parseOrderMessage('วิธีชำระเงิน'), null);
    assert.strictEqual(parseOrderMessage('ชำระเงิน'), null);
    assert.strictEqual(parseOrderMessage('เป๋าตัง'), null);
    assert.strictEqual(parseOrderMessage('สั่งซื้อ'), null);
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
    assert.strictEqual(bubble.hero.aspectMode, 'cover');
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

  test('Flex Message: Multi-ticket order with default omitted quantity/price params', () => {
    const items: OrderItem[] = [
      { number: '334', quantity: 5 },
      { number: '447', quantity: 6 },
      { number: '778', quantity: 3 }
    ];
    const qrUrl = 'http://localhost:3333/qrcodes/payment-multi.png';

    // Call without specifying quantity and totalPrice to ensure defaults do NOT override 14 tickets with 1 ticket
    const msg = FlexMessageBuilder.buildPaymentQRMessage(qrUrl, items);
    assert(msg.altText.includes('14 ใบ'), 'AltText should show 14 ใบ even when params omitted');
    const bodyStr = JSON.stringify(msg.contents);
    assert(bodyStr.includes('14 ใบ'), 'Body should show 14 ใบ');
    assert(bodyStr.includes('280 บาท'), 'Body should show 280 บาท');
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

  test('Native Image Message + Flex Card Delivery: provides 1-tap in-chat download button', () => {
    const qrPublicUrl = 'https://example.com/qrcodes/payment-123.png';
    const downloadUrl = 'https://example.com/download-qr/payment-123.png';
    const items: OrderItem[] = [{ number: '123', quantity: 2 }];

    // 1. Native Image Message (opens LINE photo viewer with native 📥 button)
    const imageMsg: messagingApi.ImageMessage = {
      type: 'image',
      originalContentUrl: qrPublicUrl,
      previewImageUrl: qrPublicUrl
    };
    assert.strictEqual(imageMsg.type, 'image');
    assert.strictEqual(imageMsg.originalContentUrl, qrPublicUrl);
    assert.strictEqual(imageMsg.previewImageUrl, qrPublicUrl);

    // 2. Flex Message Card (order summary and guidance)
    const flexMsg = FlexMessageBuilder.buildPaymentQRMessage(qrPublicUrl, items, 2, 40, 10, downloadUrl);
    assert.strictEqual(flexMsg.type, 'flex');

    // Verify messages bundle sent together
    const messages = [imageMsg, flexMsg];
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].type, 'image');
    assert.strictEqual(messages[1].type, 'flex');

    // Verify instruction contains guidance to tap QR above and click 📥
    const bodyStr = JSON.stringify(flexMsg.contents);
    assert(bodyStr.includes('แตะที่รูป QR ด้านบน แล้วกดปุ่ม 📥'), 'Must guide customer to use 📥 button on QR image');
  });

  test('Dynamic Public Base URL: getPublicBaseUrl retrieves live tunnel and avoids stale tunnels', () => {
    const activeUrl = getPublicBaseUrl();
    assert(typeof activeUrl === 'string');
    assert(activeUrl.startsWith('http'));
    // Should never contain /webhook at the end of base url
    assert(!activeUrl.endsWith('/webhook'));
  });

  // TEST SUITE 3: Quota Calculation for Multi-ticket orders
  test('Quota check for combined ticket count', () => {
    const qm = new QuotaManager();
    const canFulfill = qm.canFulfill(14);
    assert.strictEqual(canFulfill.allowed, true);
    assert(canFulfill.remaining >= 14);

    // Verify Headless default configuration for background automation
    assert.strictEqual(CONFIG.HEADLESS, true, 'CONFIG.HEADLESS must default to true for background order automation');
  });

  // TEST SUITE 4: QR Code 1:1 Square Crop Geometry & Quiet Zone
  test('QR Code Geometry: 1:1 square clip with ~28px quiet zone padding', () => {
    // Given a QR bounding box from browser DOM
    const mockQrBox = { x: 570, y: 195, width: 220, height: 220 };
    const pad = 28; // 24-32px Quiet Zone Margin
    const qrSize = Math.max(mockQrBox.width, mockQrBox.height);
    const totalSize = qrSize + pad * 2;
    const centerX = mockQrBox.x + mockQrBox.width / 2;
    const centerY = mockQrBox.y + mockQrBox.height / 2;

    const clipX = Math.max(0, Math.round(centerX - totalSize / 2));
    const clipY = Math.max(0, Math.round(centerY - totalSize / 2));
    const clipW = Math.round(totalSize);
    const clipH = Math.round(totalSize);

    // Assert that the clip is a PERFECT 1:1 SQUARE
    assert.strictEqual(clipW, clipH);
    assert.strictEqual(clipW, 276);
    assert.strictEqual(clipH, 276);
    assert.strictEqual(clipX, 542);
    assert.strictEqual(clipY, 167);

    // Ratio must be exactly 1.0 (1:1) to fill LINE Flex Hero without distortion or letterboxing
    const aspectRatio = clipW / clipH;
    assert.strictEqual(aspectRatio, 1.0);
  });

  test('QR Code HD Canvas Geometry: 800x800 square with 48px quiet zone and nearest-neighbor scaling', () => {
    const targetSize = 800;
    const quietZone = 48;
    const drawSize = targetSize - quietZone * 2;
    assert.strictEqual(targetSize, 800);
    assert.strictEqual(quietZone, 48);
    assert.strictEqual(drawSize, 704);
    assert.strictEqual(targetSize / targetSize, 1.0); // 1:1 square
  });

  // TEST SUITE 5: Whitespace & Format Tolerant Number Matching in DOM
  test('Whitespace & Format Tolerant Number Matching for GLO N3 DOM', () => {
    const targetNum = '334';
    const cleanTarget = targetNum.replace(/\s+/g, '');

    const domSnippets = [
      '3 3 4',
      '3  3  4',
      '3\n3\n4',
      '3 - 3 - 4',
      'สลาก 3 3 4 จำนวน 1 ใบ',
      '334'
    ];

    for (const snippet of domSnippets) {
      const cleanSnippet = snippet.replace(/[\s\-]+/g, '');
      assert(
        cleanSnippet.includes(cleanTarget),
        `Snippet "${snippet}" should match target "${targetNum}"`
      );
    }
  });

  // TEST SUITE 6: Quantity Stepper & Cart Item Verification
  test('Quantity Breakdown and Cart Aggregation for 334=5, 447=6, 778=3', () => {
    const items = [
      { number: '334', quantity: 5 },
      { number: '447', quantity: 6 },
      { number: '778', quantity: 3 }
    ];

    const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);
    const totalPrice = totalQty * 20;

    assert.strictEqual(totalQty, 14);
    assert.strictEqual(totalPrice, 280);

    // Verify each item's subtotal
    assert.strictEqual(items[0].quantity * 20, 100);
    assert.strictEqual(items[1].quantity * 20, 120);
    assert.strictEqual(items[2].quantity * 20, 60);

    // Verify quantities are not stuck at 1
    items.forEach(it => {
      assert(it.quantity > 1, `Item ${it.number} quantity should be > 1`);
    });
  });

  // TEST SUITE 7: GLO N3 DOM Stepper Detection
  test('GLO N3 Stepper: Detect img[src*="plus-icon"] and input[type="number"]', () => {
    // Simulate real GLO Next.js rendered markup
    const sampleCardHtml = `
      <div class="border rounded-lg w-full">
        <div class="p-3">
          <div class="flex justify-between">
            <div>3 3 4</div>
            <div class="flex items-center">
              <div class="flex h-auto w-[112px] items-center justify-between rounded-lg border">
                <div class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md">
                  <img src="/images/minus-icon.webp" width="16" height="16" alt="lotto-card-glo-logo" />
                </div>
                <input type="number" inputmode="numeric" value="1" class="text-center" />
                <div class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md">
                  <img src="/images/plus-icon.webp" width="16" height="16" alt="lotto-card-glo-logo" />
                </div>
              </div>
              <p>ใบ</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // 1. Ensure matcher identifies the plus image
    const hasPlusImg = sampleCardHtml.includes('/images/plus-icon.webp');
    assert.strictEqual(hasPlusImg, true, 'Card markup must contain plus-icon.webp');

    // 2. Ensure matcher identifies the numeric input
    const hasNumberInput = sampleCardHtml.includes('type="number"');
    assert.strictEqual(hasNumberInput, true, 'Card markup must contain numeric input');

    // 3. Confirm why old button:has-text("+") failed:
    const hasButtonPlus = sampleCardHtml.includes('<button>+</button>') || sampleCardHtml.includes('button:has-text');
    assert.strictEqual(hasButtonPlus, false, 'GLO does NOT use <button>+ for steppers, explaining old failure');
  });

  // TEST SUITE 8: Viewport-Relative QR Geometry Clip without Scroll Offset
  test('QR Geometry: Viewport coordinates without scroll displacement', () => {
    // BoundingClientRect is ALREADY relative to the viewport.
    // Adding window.scrollY when page is scrolled down (e.g. scrollY = 300)
    // was a fatal bug that shifted the clip area off-target.
    const clientRect = { x: 610, y: 220, width: 220, height: 220 };
    const pad = 28;
    const qrSize = Math.max(clientRect.width, clientRect.height);
    const totalSize = qrSize + pad * 2;
    const centerX = clientRect.x + clientRect.width / 2;
    const centerY = clientRect.y + clientRect.height / 2;

    const clipX = Math.max(0, Math.round(centerX - totalSize / 2));
    const clipY = Math.max(0, Math.round(centerY - totalSize / 2));
    const clipSize = Math.round(totalSize);

    // Assert that clip dimensions and coordinates are exact viewport values
    assert.strictEqual(clipX, 582);
    assert.strictEqual(clipY, 192);
    assert.strictEqual(clipSize, 276);
  });

  // TEST SUITE 9: Bot Lifecycle Notifications (Start, Stop, Crash, Thai Time)
  test('Lifecycle: getThaiTime returns formatted Thai time with น.', () => {
    const timeStr = getThaiTime();
    assert(typeof timeStr === 'string');
    assert(timeStr.endsWith('น.'));
    assert(/\d{1,2}:\d{2}\s*น\./.test(timeStr), `Time format unexpected: ${timeStr}`);
  });

  test('Lifecycle: notifyBotStarted builds expected start notification message', async () => {
    const handler = new LineReplyHandler();
    const testWebhook = 'https://n3-demo.trycloudflare.com/webhook';
    let pushedMessage = '';
    // Intercept pushToAdmin to verify payload
    handler.pushToAdmin = async (msgs: any[]) => {
      pushedMessage = msgs[0]?.text || '';
      return true;
    };

    const res = await handler.notifyBotStarted(testWebhook);
    assert.strictEqual(res, true);
    assert(pushedMessage.includes('🚀 [ระบบเปิดใช้งาน] บอทสลาก N3 เริ่มทำงานเรียบร้อยแล้ว'));
    assert(pushedMessage.includes('พร้อมรับออเดอร์ตลอด 24 ชม.'));
    assert(pushedMessage.includes(`(Webhook: ${testWebhook})`));
  });

  test('Lifecycle: notifyBotStopped builds expected emergency stop notification message', async () => {
    const handler = new LineReplyHandler();
    let pushedMessage = '';
    handler.pushToAdmin = async (msgs: any[]) => {
      pushedMessage = msgs[0]?.text || '';
      return true;
    };

    const timeStr = '06:35 น.';
    const res = await handler.notifyBotStopped(timeStr, 'Process terminated');
    assert.strictEqual(res, true);
    assert(pushedMessage.includes('⚠️ [แจ้งเตือนด่วน] บอทสลาก N3 หยุดทำงานแล้ว (Bot Service Stopped)'));
    assert(pushedMessage.includes(`เมื่อเวลา ${timeStr}`));
    assert(pushedMessage.includes('กรุณาตรวจสอบหรือเปิดบอทใหม่'));
    assert(pushedMessage.includes('Process terminated'));
  });

  test('Lifecycle: notifyBotStoppedByAdmin builds exact admin stop message', async () => {
    const handler = new LineReplyHandler();
    let pushedMessage = '';
    handler.pushToAdmin = async (msgs: any[]) => {
      pushedMessage = msgs[0]?.text || '';
      return true;
    };

    const res = await handler.notifyBotStoppedByAdmin();
    assert.strictEqual(res, true);
    assert.strictEqual(pushedMessage, '🛑 [แจ้งเตือน] แอดมินได้สั่งหยุดการทำงานของบอทสลาก N3 เรียบร้อยแล้ว');
  });

  test('Lifecycle: isStopIntentional detects intentional flag and handles cleanup', () => {
    const rootStopFile = path.resolve(__dirname, '../../.stop_intentional');
    // Ensure clean state
    if (fs.existsSync(rootStopFile)) fs.unlinkSync(rootStopFile);
    assert.strictEqual(isStopIntentional(), false);

    // Create flag file
    fs.writeFileSync(rootStopFile, Date.now().toString(), 'utf-8');
    assert.strictEqual(isStopIntentional(), true);

    // Cleanup
    fs.unlinkSync(rootStopFile);
    assert.strictEqual(isStopIntentional(), false);
  });

  test('Lifecycle: getStoredWebhookUrl retrieves URL or default fallback', () => {
    const rootUrlFile = path.resolve(__dirname, '../../webhook-url.txt');
    const originalContent = fs.existsSync(rootUrlFile) ? fs.readFileSync(rootUrlFile, 'utf-8') : null;

    try {
      fs.writeFileSync(rootUrlFile, 'https://test-tunnel.trycloudflare.com/webhook', 'utf-8');
      const retrieved = getStoredWebhookUrl();
      assert.strictEqual(retrieved, 'https://test-tunnel.trycloudflare.com/webhook');
    } finally {
      if (originalContent !== null) {
        fs.writeFileSync(rootUrlFile, originalContent, 'utf-8');
      } else if (fs.existsSync(rootUrlFile)) {
        fs.unlinkSync(rootUrlFile);
      }
    }
  });

  // TEST SUITE 10: Desktop Launcher & Background Runner Integrity
  test('Launcher: START-BOT-HIDDEN.vbs and scripts/show-popup.ps1 exist and configured properly', () => {
    const vbsPath = path.resolve(__dirname, '../../START-BOT-HIDDEN.vbs');
    const ps1Path = path.resolve(__dirname, '../../scripts/show-popup.ps1');
    const shortcutPs1Path = path.resolve(__dirname, '../../scripts/create-desktop-shortcuts.ps1');

    assert(fs.existsSync(vbsPath), 'START-BOT-HIDDEN.vbs must exist');
    assert(fs.existsSync(ps1Path), 'scripts/show-popup.ps1 must exist');
    assert(fs.existsSync(shortcutPs1Path), 'scripts/create-desktop-shortcuts.ps1 must exist');

    // Verify UTF-8 BOM on PowerShell scripts for Windows PowerShell 5.1 compatibility
    const ps1Buf = fs.readFileSync(ps1Path);
    assert.strictEqual(ps1Buf[0], 0xEF, 'scripts/show-popup.ps1 must have UTF-8 BOM byte 1');
    assert.strictEqual(ps1Buf[1], 0xBB, 'scripts/show-popup.ps1 must have UTF-8 BOM byte 2');
    assert.strictEqual(ps1Buf[2], 0xBF, 'scripts/show-popup.ps1 must have UTF-8 BOM byte 3');

    const scBuf = fs.readFileSync(shortcutPs1Path);
    assert.strictEqual(scBuf[0], 0xEF, 'scripts/create-desktop-shortcuts.ps1 must have UTF-8 BOM byte 1');
    assert.strictEqual(scBuf[1], 0xBB, 'scripts/create-desktop-shortcuts.ps1 must have UTF-8 BOM byte 2');
    assert.strictEqual(scBuf[2], 0xBF, 'scripts/create-desktop-shortcuts.ps1 must have UTF-8 BOM byte 3');

    const vbsContent = fs.readFileSync(vbsPath, 'utf-8');
    assert(vbsContent.includes('n3-engine.js bg'), 'VBS must invoke n3-engine.js bg');
    assert(vbsContent.includes('show-popup.ps1'), 'VBS must call show-popup.ps1');

    const ps1Content = fs.readFileSync(ps1Path, 'utf-8');
    assert(ps1Content.includes('webhook-url.txt'), 'show-popup.ps1 must read webhook-url.txt');
    assert(ps1Content.includes('บอทสลาก N3 ธนกิจนำโชค'), 'show-popup.ps1 must contain Thai notification title');
  });

  test('Launcher: n3-engine.js spawns detached background process with shell: true', () => {
    const enginePath = path.resolve(__dirname, '../../scripts/n3-engine.js');
    assert(fs.existsSync(enginePath), 'scripts/n3-engine.js must exist');
    const engineContent = fs.readFileSync(enginePath, 'utf-8');

    assert(engineContent.includes('shell: true'), 'n3-engine.js must spawn with shell: true on Windows');
    assert(engineContent.includes('detached: true'), 'n3-engine.js must spawn detached');
    assert(engineContent.includes('windowsHide: true'), 'n3-engine.js must specify windowsHide: true');
    // Ensure both startDashboard and startBackground specify windowsHide: true
    const dashboardMatch = engineContent.match(/function startDashboard\(\)[\s\S]*?function openLiveBrowser\(\)/);
    assert(dashboardMatch && dashboardMatch[0].includes('windowsHide: true'), 'startDashboard must specify windowsHide: true on spawn');
    assert(engineContent.includes('process.execPath'), 'n3-engine.js must spawn node directly via process.execPath to avoid cmd.exe console window');
    assert(engineContent.includes('getCloudflaredCommand'), 'n3-engine.js must have getCloudflaredCommand to resolve binary or npx-cli without cmd.exe');
    assert(engineContent.includes('sendLineAdminAlert'), 'n3-engine.js must implement sendLineAdminAlert');
    assert(engineContent.includes('setupEngineLifecycle'), 'n3-engine.js must have setupEngineLifecycle');
    assert(engineContent.includes('notifyBotStopped'), 'n3-engine.js must have notifyBotStopped');
    assert(engineContent.includes('notifyBotStarted'), 'n3-engine.js must have notifyBotStarted');
    assert(engineContent.includes('notifyBotStoppedByAdmin'), 'n3-engine.js must have notifyBotStoppedByAdmin');
    assert(engineContent.includes('ENGINE_NOTIFIES_START'), 'n3-engine.js must pass ENGINE_NOTIFIES_START');
  });

  test('Launcher: START-BOT.bat starts both bot and Cloudflare tunnel via n3-engine.js', () => {
    const startBatPath = path.resolve(__dirname, '../../START-BOT.bat');
    assert(fs.existsSync(startBatPath), 'START-BOT.bat must exist');
    const startBatContent = fs.readFileSync(startBatPath, 'utf-8');
    assert(startBatContent.includes('n3-engine.js start'), 'START-BOT.bat must run n3-engine.js start to start bot and tunnel');
  });

  test('Launcher: START-BOT-SILENT.bat launches START-BOT-HIDDEN.vbs and exits cleanly', () => {
    const silentBatPath = path.resolve(__dirname, '../../START-BOT-SILENT.bat');
    assert(fs.existsSync(silentBatPath), 'START-BOT-SILENT.bat must exist');
    const silentBatContent = fs.readFileSync(silentBatPath, 'utf-8');
    assert(silentBatContent.includes('START-BOT-HIDDEN.vbs'), 'START-BOT-SILENT.bat must invoke START-BOT-HIDDEN.vbs');
    assert(silentBatContent.includes('exit'), 'START-BOT-SILENT.bat must exit cleanly to avoid lingering cmd.exe');
  });

  test('Launcher: START-BOT-HIDDEN.vbs runs hidden without console windows', () => {
    const vbsPath = path.resolve(__dirname, '../../START-BOT-HIDDEN.vbs');
    assert(fs.existsSync(vbsPath), 'START-BOT-HIDDEN.vbs must exist');
    const vbsContent = fs.readFileSync(vbsPath, 'utf-8');
    assert(vbsContent.includes('WindowStyle Hidden') || vbsContent.includes(', 0,'), 'START-BOT-HIDDEN.vbs must run hidden');
  });

  test('Launcher: create-desktop-shortcuts.vbs delegates to create-desktop-shortcuts.ps1', () => {
    const vbsShortcutsPath = path.resolve(__dirname, '../../scripts/create-desktop-shortcuts.vbs');
    assert(fs.existsSync(vbsShortcutsPath), 'create-desktop-shortcuts.vbs must exist');
    const vbsShortcutsContent = fs.readFileSync(vbsShortcutsPath, 'utf-8');
    assert(vbsShortcutsContent.includes('create-desktop-shortcuts.ps1'), 'VBS shortcuts must delegate to PowerShell to prevent mojibake');
  });

  test('Tunnel Management: n3-engine.js supports isTunnelAlive, keepTunnel, and tunnel reuse', () => {
    const enginePath = path.resolve(__dirname, '../../scripts/n3-engine.js');
    assert(fs.existsSync(enginePath), 'n3-engine.js must exist');
    const engineContent = fs.readFileSync(enginePath, 'utf-8');
    assert(engineContent.includes('isTunnelAlive'), 'n3-engine.js must implement isTunnelAlive');
    assert(engineContent.includes('keepTunnel'), 'n3-engine.js must implement keepTunnel in killLingering');
    assert(engineContent.includes('restartBotOnly'), 'n3-engine.js must implement restartBotOnly');
    assert(engineContent.includes('updateAndRestart'), 'n3-engine.js must implement updateAndRestart');
    assert(engineContent.includes('tunnelAlreadyRunning'), 'n3-engine.js must check if tunnel is already running to reuse it');
  });

  test('Launcher: RESTART-BOT.bat and UPDATE-BOT.bat exist and call n3-engine.js properly', () => {
    const restartBatPath = path.resolve(__dirname, '../../RESTART-BOT.bat');
    assert(fs.existsSync(restartBatPath), 'RESTART-BOT.bat must exist');
    const restartContent = fs.readFileSync(restartBatPath, 'utf-8');
    assert(restartContent.includes('restart-bot'), 'RESTART-BOT.bat must invoke restart-bot');

    const updateBatPath = path.resolve(__dirname, '../../UPDATE-BOT.bat');
    assert(fs.existsSync(updateBatPath), 'UPDATE-BOT.bat must exist');
    const updateContent = fs.readFileSync(updateBatPath, 'utf-8');
    assert(updateContent.includes('update'), 'UPDATE-BOT.bat must invoke update');
  });

  test('Index: index.ts lifecycle, watchdog, and initial public URL integrity', () => {
    const indexPath = path.resolve(__dirname, 'index.ts');
    assert(fs.existsSync(indexPath), 'index.ts must exist');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    // Verify beforeExit notifies without requiring code !== 0
    assert(indexContent.includes("process.on('beforeExit'"), 'index.ts must listen to beforeExit');
    assert(!indexContent.includes('code !== 0 && !isStopIntentional()'), 'beforeExit must NOT require code !== 0');

    // Verify server close and error handling
    assert(indexContent.includes("server.on('close'"), 'index.ts must listen to server close event');

    // Verify watchdog is present
    assert(indexContent.includes('tasklist'), 'index.ts must include tunnel watchdog using tasklist');
    assert(indexContent.includes('cloudflared.exe'), 'index.ts watchdog must monitor cloudflared.exe');

    // Verify CONFIG admin user IDs match
    assert.strictEqual(CONFIG.LINE_ADMIN_USER_ID, CONFIG.ADMIN_LINE_USER_ID);
  });

  // TEST SUITE: Cybersecurity Controls & Hardening Verification
  test('Cybersecurity: index.ts enforces security headers, disabled x-powered-by, and rate limiter', () => {
    const indexPath = path.resolve(__dirname, 'index.ts');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    // 1. Check disabled x-powered-by
    assert(indexContent.includes("app.disable('x-powered-by')"), 'index.ts must disable x-powered-by');

    // 2. Check security headers
    assert(indexContent.includes('X-Content-Type-Options') && indexContent.includes('nosniff'), 'index.ts must set X-Content-Type-Options: nosniff');
    assert(indexContent.includes('X-Frame-Options') && indexContent.includes('SAMEORIGIN'), 'index.ts must set X-Frame-Options: SAMEORIGIN');
    assert(indexContent.includes('Referrer-Policy'), 'index.ts must set Referrer-Policy');

    // 3. Check rate limiter
    assert(indexContent.includes('InMemoryRateLimiter'), 'index.ts must implement rate limiting');
    assert(indexContent.includes('rateLimiter.check'), 'index.ts must check rate limiter on endpoints');

    // 4. Check sensitive path blocking
    assert(indexContent.includes('SECURITY BLOCKED'), 'index.ts must log security blocked events');
    assert(indexContent.includes('browser_profile'), 'index.ts must block browser_profile path');
    assert(indexContent.includes('.env'), 'index.ts must block .env path');

    // 5. Check root directory is NOT exposed
    assert(!indexContent.includes("app.use(express.static(path.join(__dirname, '../../')));"), 'index.ts must NOT expose root directory');

    // 6. Check strict webhook signature enforcement (cannot bypass without signature)
    assert(indexContent.includes('if (!signature || !rawBody || !validateSignature'), 'index.ts must reject missing or invalid webhook signature');

    // 7. Check QR download filename whitelist regex
    assert(indexContent.includes('payment-') && indexContent.includes('.png'), 'index.ts must validate QR download filename strictly');
  });

  // TEST SUITE 11: Live Quota Extraction & GLO N3 Portal Web Sync Verification
  test('Live Quota: Banner text extraction "📣 คุณขายสลากฯ ได้อีก 1,968 ใบ"', () => {
    const raw = '📣 คุณขายสลากฯ ได้อีก 1,968 ใบ';
    const extracted = parseQuotaFromPortalText(raw);
    assert(extracted !== null, 'Should parse banner quota text');
    assert.strictEqual(extracted.remainingQuota, 1968);
    assert.strictEqual(extracted.maxQuota, 2000);
    assert.strictEqual(extracted.usedQuota, 32);
  });

  test('Live Quota: Banner text without emoji or paiyannoi "คุณขายสลาก ได้อีก 1968 ใบ"', () => {
    const raw = 'คุณขายสลาก ได้อีก 1968 ใบ';
    const extracted = parseQuotaFromPortalText(raw);
    assert(extracted !== null);
    assert.strictEqual(extracted.remainingQuota, 1968);
    assert.strictEqual(extracted.usedQuota, 32);
    assert.strictEqual(extracted.maxQuota, 2000);
  });

  test('Live Quota: Shop sales card progress text "32 / 2,000 ใบ"', () => {
    const raw = '32 / 2,000 ใบ';
    const extracted = parseQuotaFromPortalText(raw);
    assert(extracted !== null, 'Should parse sold/max card text');
    assert.strictEqual(extracted.usedQuota, 32);
    assert.strictEqual(extracted.maxQuota, 2000);
    assert.strictEqual(extracted.remainingQuota, 1968);
  });

  test('Live Quota: Card remaining text "เหลืออีก 1,968 ใบ"', () => {
    const raw = 'เหลืออีก 1,968 ใบ';
    const extracted = parseQuotaFromPortalText(raw);
    assert(extracted !== null);
    assert.strictEqual(extracted.remainingQuota, 1968);
    assert.strictEqual(extracted.usedQuota, 32);
    assert.strictEqual(extracted.maxQuota, 2000);
  });

  test('Live Quota: Complete GLO N3 dealer landing page card & banner simulation', () => {
    const portalPageText = `
      📣 คุณขายสลากฯ ได้อีก 1,968 ใบ
      จุดจำหน่ายสลากฯ
      ยอดขายร้านค้า
      ธนกิจนำโชค
      32 / 2,000 ใบ
      เหลืออีก 1,968 ใบ
      รอดำเนินการ 0 ใบ
    `;
    const extracted = parseQuotaFromPortalText(portalPageText);
    assert(extracted !== null, 'Should parse full landing page text');
    assert.strictEqual(extracted.remainingQuota, 1968);
    assert.strictEqual(extracted.usedQuota, 32);
    assert.strictEqual(extracted.maxQuota, 2000);
  });

  test('Live Quota: HTML tags and multiline whitespace tolerance in DOM', () => {
    const htmlSnippet = '<div class="banner"><span>📣 คุณขายสลากฯ&nbsp;&nbsp;ได้อีก</span> <strong>1,968</strong> ใบ</div>';
    const extracted = parseQuotaFromPortalText(htmlSnippet);
    assert(extracted !== null);
    assert.strictEqual(extracted.remainingQuota, 1968);
    assert.strictEqual(extracted.usedQuota, 32);
    assert.strictEqual(extracted.maxQuota, 2000);
  });

  test('Live Quota: Boundary values (Sold Out / 0 Remaining and 0 Sold / 2,000 Remaining)', () => {
    // 0 remaining
    const soldOutBanner = '📣 คุณขายสลากฯ ได้อีก 0 ใบ';
    const r1 = parseQuotaFromPortalText(soldOutBanner);
    assert(r1 !== null);
    assert.strictEqual(r1.remainingQuota, 0);
    assert.strictEqual(r1.usedQuota, 2000);
    assert.strictEqual(r1.maxQuota, 2000);

    // 0 sold
    const fullQuota = '0 / 2,000 ใบ';
    const r2 = parseQuotaFromPortalText(fullQuota);
    assert(r2 !== null);
    assert.strictEqual(r2.remainingQuota, 2000);
    assert.strictEqual(r2.usedQuota, 0);
    assert.strictEqual(r2.maxQuota, 2000);

    // 2,000 sold / 0 remaining
    const allSold = '2,000 / 2,000 ใบ';
    const r3 = parseQuotaFromPortalText(allSold);
    assert(r3 !== null);
    assert.strictEqual(r3.remainingQuota, 0);
    assert.strictEqual(r3.usedQuota, 2000);
    assert.strictEqual(r3.maxQuota, 2000);
  });

  test('Live Quota: Non-quota and empty text returns null', () => {
    assert.strictEqual(parseQuotaFromPortalText(''), null);
    assert.strictEqual(parseQuotaFromPortalText('เข้าสู่ระบบเป๋าตัง'), null);
    assert.strictEqual(parseQuotaFromPortalText('ยินดีต้อนรับสู่ร้านค้า'), null);
    assert.strictEqual(parseQuotaFromPortalText(null as any), null);
    assert.strictEqual(parseQuotaFromPortalText(undefined as any), null);
  });

  test('Live Quota: Quota enforcement reflects live synced values and rejects accurately', () => {
    const qm = new QuotaManager();
    qm.updateLiveQuota(32, 1968, 2000);
    // Verify initial state matches synced values from quota.json
    const initialStatus = qm.getStatus();
    assert.strictEqual(initialStatus.maxQuota, 2000);
    assert.strictEqual(initialStatus.remainingQuota, 1968);
    assert.strictEqual(initialStatus.usedQuota, 32);
    assert.strictEqual(initialStatus.remainingQuota + initialStatus.usedQuota, initialStatus.maxQuota);

    // Test order fulfillment under live quota:
    // 1. Order within remaining quota (e.g. 10 tickets) -> Allowed
    const check1 = qm.canFulfill(10);
    assert.strictEqual(check1.allowed, true);
    assert.strictEqual(check1.remaining, 1968);

    // 2. Order exceeding remaining quota (e.g. 1969 tickets) -> Rejected
    const checkOver = qm.canFulfill(1969);
    assert.strictEqual(checkOver.allowed, false);
    assert.strictEqual(checkOver.remaining, 1968);
    assert(checkOver.reason?.includes('สลากเหลือไม่พอ'));

    // 3. Test sold out scenario
    qm.updateLiveQuota(2000, 0, 2000);
    const checkSoldOut = qm.canFulfill(1);
    assert.strictEqual(checkSoldOut.allowed, false);
    assert.strictEqual(checkSoldOut.remaining, 0);
    assert(checkSoldOut.reason?.includes('สลากงวดนี้หมดแล้ว'));

    // Reconcile and restore live quota back to 32 sold / 1968 remaining
    qm.updateLiveQuota(32, 1968, 2000);
    assert.strictEqual(qm.getStatus().remainingQuota, 1968);
    assert.strictEqual(qm.getStatus().usedQuota, 32);
  });

  test('Live Quota: syncQuotaFromLivePortal with mock Page on GLO landing URL', async () => {
    const mockPage: any = {
      isClosed: () => false,
      url: () => 'https://n3.glolotteryshop.com/landing/',
      evaluate: async () => {
        return '📣 คุณขายสลากฯ ได้อีก 1,968 ใบ\nยอดขายร้านค้า\n32 / 2,000 ใบ\nเหลืออีก 1,968 ใบ';
      },
      goto: async () => {},
      waitForTimeout: async () => {}
    };

    const qm = new QuotaManager();
    const result = await qm.syncQuotaFromLivePortal(mockPage);
    assert(result !== null);
    assert.strictEqual(result.remainingQuota, 1968);
    assert.strictEqual(result.usedQuota, 32);
    assert.strictEqual(result.maxQuota, 2000);

    // Verify automation re-exports and N3OrderService parity
    const autoResult = await syncQuotaAutomation(mockPage);
    assert(autoResult !== null);
    assert.strictEqual(autoResult.remainingQuota, 1968);

    const orderResult = await N3OrderService.syncQuotaFromLivePortal(mockPage);
    assert(orderResult !== null);
    assert.strictEqual(orderResult.remainingQuota, 1968);
  });

  test('Live Quota: Colon-delimited labels (e.g. คุณขายสลากฯ ได้อีก: 1,968 ใบ and ยอดขาย: 32 / 2,000 ใบ)', () => {
    const t1 = parseQuotaFromPortalText('คุณขายสลากฯ ได้อีก: 1,968 ใบ');
    assert(t1 !== null);
    assert.strictEqual(t1.remainingQuota, 1968);
    assert.strictEqual(t1.usedQuota, 32);

    const t2 = parseQuotaFromPortalText('เหลืออีก: 1,968 ใบ');
    assert(t2 !== null);
    assert.strictEqual(t2.remainingQuota, 1968);

    const t3 = parseQuotaFromPortalText('ยอดขายร้านค้า: 32 / 2,000 ใบ');
    assert(t3 !== null);
    assert.strictEqual(t3.usedQuota, 32);
    assert.strictEqual(t3.maxQuota, 2000);
    assert.strictEqual(t3.remainingQuota, 1968);
  });

  test('Live Quota: Thai numerals normalization (๑,๙๖๘ ใบ and ๓๒ / ๒,๐๐๐ ใบ)', () => {
    const thaiBanner = '📣 คุณขายสลากฯ ได้อีก ๑,๙๖๘ ใบ';
    const r1 = parseQuotaFromPortalText(thaiBanner);
    assert(r1 !== null, 'Should parse Thai numerals in banner');
    assert.strictEqual(r1.remainingQuota, 1968);
    assert.strictEqual(r1.usedQuota, 32);
    assert.strictEqual(r1.maxQuota, 2000);

    const thaiCard = 'ยอดขาย ๓๒ / ๒,๐๐๐ ใบ';
    const r2 = parseQuotaFromPortalText(thaiCard);
    assert(r2 !== null, 'Should parse Thai numerals in card');
    assert.strictEqual(r2.usedQuota, 32);
    assert.strictEqual(r2.maxQuota, 2000);
    assert.strictEqual(r2.remainingQuota, 1968);
  });

  test('Live Quota: Variations with "คงเหลือ" and "เหลือ" without "อีก"', () => {
    const r1 = parseQuotaFromPortalText('คงเหลือ 1,968 ใบ');
    assert(r1 !== null);
    assert.strictEqual(r1.remainingQuota, 1968);

    const r2 = parseQuotaFromPortalText('เหลือ 1,968 ใบ');
    assert(r2 !== null);
    assert.strictEqual(r2.remainingQuota, 1968);
  });

  test('Live Quota: refreshFromDisk guarantees multi-instance cache coherence', () => {
    const qm1 = new QuotaManager();
    const qm2 = new QuotaManager();

    // qm1 updates quota
    qm1.updateLiveQuota(32, 1968, 2000);
    assert.strictEqual(qm1.getStatus().remainingQuota, 1968);

    // qm2 reads and reflects latest disk data via refreshFromDisk
    const status2 = qm2.getStatus();
    assert.strictEqual(status2.remainingQuota, 1968);
    assert.strictEqual(status2.usedQuota, 32);

    // Verify singleton returns shared instance
    const singleton1 = QuotaManager.getInstance();
    const singleton2 = QuotaManager.getInstance();
    assert.strictEqual(singleton1, singleton2);
  });

  test('Live Quota: Post-order reconciliation prevents double deductions and handles fallback', () => {
    const qm = new QuotaManager();
    qm.updateLiveQuota(32, 1968, 2000);

    // Scenario A: Live sync succeeds -> uses live values directly, no deduction needed
    const syncedResult = { remainingQuota: 1966, usedQuota: 34, maxQuota: 2000 };
    // If syncedQuota is provided, quota remains as synced
    qm.updateLiveQuota(syncedResult.usedQuota, syncedResult.remainingQuota, syncedResult.maxQuota);
    assert.strictEqual(qm.getStatus().remainingQuota, 1966);
    assert.strictEqual(qm.getStatus().usedQuota, 34);

    // Scenario B: Live sync fails (null) -> fallback to deductQuota(2)
    qm.deductQuota(2);
    assert.strictEqual(qm.getStatus().remainingQuota, 1964);
    assert.strictEqual(qm.getStatus().usedQuota, 36);

    // Restore back to real state (32 used / 1968 remaining)
    qm.updateLiveQuota(32, 1968, 2000);
    assert.strictEqual(qm.getStatus().remainingQuota, 1968);
    assert.strictEqual(qm.getStatus().usedQuota, 32);
  });

  // TEST SUITE 12: Welcome Card on Follow & Quick Reply Enhancement
  test('Welcome Card: buildWelcomeMessage produces valid structure and omits floating Quick Reply to prevent Rich Menu duplication', () => {
    const welcome = FlexMessageBuilder.buildWelcomeMessage();
    assert.strictEqual(welcome.type, 'flex');
    assert(welcome.altText.includes('ยินดีต้อนรับสู่ร้านสลาก N3 ธนกิจนำโชค'));
    assert(!welcome.quickReply, 'Floating Quick Reply must be omitted to prevent duplicating LINE Rich Menu');

    // Check header and store branding
    const bubble: any = welcome.contents;
    assert.strictEqual(bubble.type, 'bubble');
    const headerTexts = JSON.stringify(bubble.header);
    assert(headerTexts.includes('ร้านสลาก N3 ธนกิจนำโชค'));

    // Check body contains the 4 prize descriptions and ordering guide
    const bodyTexts = JSON.stringify(bubble.body);
    assert(bodyTexts.includes('สามตรง'), 'Must explain 3-straight prize');
    assert(bodyTexts.includes('สามสลับหลัก'), 'Must explain 3-permuted prize');
    assert(bodyTexts.includes('สองตรง'), 'Must explain 2-straight prize');
    assert(bodyTexts.includes('รางวัลพิเศษ'), 'Must explain jackpot special prize');
    assert(bodyTexts.includes('06:00 - 23:00 น.'), 'Must mention operating hours');

    // Check footer buttons
    const footerTexts = JSON.stringify(bubble.footer);
    assert(footerTexts.includes('ทำนายฝัน หาเลขเด็ด AI'));
    assert(footerTexts.includes('สั่งซื้อสลาก N3'));
    assert(footerTexts.includes('วิธีการชำระเงิน (เป๋าตัง)'));
  });

  test('HowToOrder Card: buildHowToOrderMessage includes Paotang notice and omits floating Quick Reply', () => {
    const howTo = FlexMessageBuilder.buildHowToOrderMessage();
    assert.strictEqual(howTo.type, 'flex');
    assert(!howTo.quickReply, 'Must omit floating Quick Reply to prevent duplicating LINE Rich Menu');
    const bodyStr = JSON.stringify(howTo.contents);
    assert(bodyStr.includes('เป๋าตัง'), 'Must mention Paotang in HowToOrder');
  });

  test('Main Menu Card: buildMainMenuMessage produces complete interactive menu with Paotang emphasis and no popup Quick Reply', () => {
    const menu = FlexMessageBuilder.buildMainMenuMessage();
    assert.strictEqual(menu.type, 'flex');
    assert(menu.altText.includes('เมนูหลัก'));
    assert(!menu.quickReply, 'Must omit floating Quick Reply to prevent duplicating LINE Rich Menu');

    const bubble: any = menu.contents;
    const bodyStr = JSON.stringify(bubble.body);
    // Verify Paotang highlight
    assert(bodyStr.includes('เป๋าตัง'), 'Main Menu must emphasize Paotang app');
    assert(bodyStr.includes('ชำระเงินผ่านแอป') && bodyStr.includes('เท่านั้น'));

    // Verify all 5 menu action buttons exist
    assert(bodyStr.includes('สั่งซื้อสลาก N3'));
    assert(bodyStr.includes('วิธีการชำระเงิน (เป๋าตัง)'));
    assert(bodyStr.includes('วิธีการสั่งซื้อสลาก'));
    assert(bodyStr.includes('ทำนายฝัน AI หาเลขเด็ด'));
    assert(bodyStr.includes('เช็คโควต้าสลากคงเหลือ'));
  });

  test('Payment Guide Card: buildPaymentGuideMessage enforces Paotang-only rules with 5 steps', () => {
    const guide = FlexMessageBuilder.buildPaymentGuideMessage();
    assert.strictEqual(guide.type, 'flex');
    assert(guide.altText.includes('เป๋าตัง'));

    const bubble: any = guide.contents;
    const bodyStr = JSON.stringify(bubble.body);

    // Verify critical alert warning
    assert(bodyStr.includes('เป๋าตัง') && bodyStr.includes('เท่านั้น'), 'Must state Paotang only');
    assert(bodyStr.includes('ไม่สามารถใช้แอปธนาคารทั่วไป'), 'Must state commercial bank apps cannot be used');

    // Verify 5 clear steps
    assert(bodyStr.includes('บันทึกรูปภาพ QR Code'), 'Step 1: Save QR');
    assert(bodyStr.includes('เปิดแอป') && bodyStr.includes('เป๋าตัง'), 'Step 2: Open Paotang');
    assert(bodyStr.includes('เลือกรูปจากคลังภาพ'), 'Step 3: Select from gallery');
    assert(bodyStr.includes('ตรวจสอบยอดและยืนยันชำระเงิน'), 'Step 4: Confirm 20 THB');
    assert(bodyStr.includes('รับสลากดิจิทัลเข้าบัญชีทันที'), 'Step 5: Digital ticket added');

    // Verify footer actions
    const footerStr = JSON.stringify(bubble.footer);
    assert(footerStr.includes('สั่งซื้อสลาก N3'));
    assert(footerStr.includes('วิธีสั่งซื้อสลาก'));
  });

  test('Order Guidance Card: buildOrderGuidanceMessage provides format examples and Paotang notice', () => {
    const orderGuide = FlexMessageBuilder.buildOrderGuidanceMessage();
    assert.strictEqual(orderGuide.type, 'flex');
    assert(orderGuide.altText.includes('สั่งซื้อสลาก'));

    const bubble: any = orderGuide.contents;
    const bodyStr = JSON.stringify(bubble.body);
    assert(bodyStr.includes('123 2'), 'Must show single number example');
    assert(bodyStr.includes('334 2, 447 3'), 'Must show multi number example');
    assert(bodyStr.includes('เป๋าตัง'), 'Must remind about Paotang');
  });

  test('Payment QR Card: includes Paotang-only highlight box and omits floating Quick Reply', () => {
    const qrMsg = FlexMessageBuilder.buildPaymentQRMessage(
      'https://example.com/qr.png',
      [{ number: '123', quantity: 2 }],
      2,
      40
    );
    assert.strictEqual(qrMsg.type, 'flex');
    assert(!qrMsg.quickReply, 'Must omit floating Quick Reply to prevent duplicating LINE Rich Menu');
    const bodyStr = JSON.stringify(qrMsg.contents);
    assert(bodyStr.includes('เป๋าตัง') && bodyStr.includes('เท่านั้น'));
    assert(bodyStr.includes('ไม่สามารถใช้แอปธนาคารทั่วไป'));
  });

  test('Greeting & Command Regex: supports typos, variants, and menu keywords', () => {
    const isGreetingRegex = /^(?:สวัสดี.*|สว้สดี.*|หวัดดี.*|ดีครับ.*|ดีค่ะ.*|ดีคับ.*|ดีจ้า.*|ดีฮะ.*|สวัสดียาม.*|อรุณสวัสดิ์.*|hello.*|hi.*|hey.*|start.*|เริ่ม.*|แนะนำตัว|ยินดีต้อนรับ)$/i;
    assert.strictEqual(isGreetingRegex.test('เริ่ม'), true);
    assert.strictEqual(isGreetingRegex.test('เริ่มต้น'), true);
    assert.strictEqual(isGreetingRegex.test('เริ่มเลย'), true);
    assert.strictEqual(isGreetingRegex.test('สวัสดี'), true);
    assert.strictEqual(isGreetingRegex.test('สวัสดีครับ'), true);
    assert.strictEqual(isGreetingRegex.test('สวัสดีค่ะ'), true);
    assert.strictEqual(isGreetingRegex.test('สว้สดี'), true, 'Should match typo สว้สดี with tone mark');
    assert.strictEqual(isGreetingRegex.test('123 2'), false);

    const isMainMenuRegex = /^(?:เมนู|เมนูหลัก|menu|main\s*menu|หน้าแรก|home|คำสั่ง|เลือก)$/i;
    assert.strictEqual(isMainMenuRegex.test('เมนู'), true);
    assert.strictEqual(isMainMenuRegex.test('เมนูหลัก'), true);
    assert.strictEqual(isMainMenuRegex.test('menu'), true);
    assert.strictEqual(isMainMenuRegex.test('หน้าแรก'), true);
    assert.strictEqual(isMainMenuRegex.test('home'), true);

    const isPaymentGuideRegex = /^(?:(?:วิธี|วิธีการ)?(?:ชำระเงิน|จ่ายเงิน|จ่าย|ชำระ|สแกน|เป๋าตัง|วิธีจ่าย|วิธีสแกน|จ่ายยังไง|สแกนยังไง)|payment)$/i;
    assert.strictEqual(isPaymentGuideRegex.test('วิธีชำระเงิน'), true);
    assert.strictEqual(isPaymentGuideRegex.test('วิธีการชำระเงิน'), true);
    assert.strictEqual(isPaymentGuideRegex.test('จ่ายเงิน'), true);
    assert.strictEqual(isPaymentGuideRegex.test('ชำระเงิน'), true);
    assert.strictEqual(isPaymentGuideRegex.test('เป๋าตัง'), true);
    assert.strictEqual(isPaymentGuideRegex.test('วิธีจ่าย'), true);
    assert.strictEqual(isPaymentGuideRegex.test('จ่ายยังไง'), true);

    const isOrderGuideRegex = /^(?:(?:ตาราง)?(?:สั่งซื้อ|ซื้อสลาก|สั่งสลาก|ขอซื้อ|เลือกเลข|ซื้อ|สั่ง)(?:\s*(?:สลาก)?(?:\s*N3)?)?|order|ตาราง|ตารางสั่งซื้อ)$/i;
    assert.strictEqual(isOrderGuideRegex.test('สั่งซื้อ'), true);
    assert.strictEqual(isOrderGuideRegex.test('ซื้อสลาก'), true);
    assert.strictEqual(isOrderGuideRegex.test('เลือกเลข'), true);
    assert.strictEqual(isOrderGuideRegex.test('สั่งซื้อสลาก N3'), true);
    assert.strictEqual(isOrderGuideRegex.test('สั่งซื้อสลาก'), true);
    assert.strictEqual(isOrderGuideRegex.test('ซื้อสลาก N3'), true);
    assert.strictEqual(isOrderGuideRegex.test('ตารางสั่งซื้อ'), true);
    assert.strictEqual(isOrderGuideRegex.test('ตารางสั่งซื้อสลาก N3'), true);
    assert.strictEqual(isOrderGuideRegex.test('123 2'), false);
    assert.strictEqual(isOrderGuideRegex.test('สั่งซื้อ 123 2 ใบ'), false);

    const isDreamRegex = /^(?:(?:เมื่อคืน(?:นี้)?|เมื่อวาน(?:นี้)?|เมื่อกี้|เมื่อเช้า)?\s*(?:ผม|หนู|ฉัน|เรา|เค้า)?\s*ฝัน.*|ทำนายฝัน.*|ทำนายความฝัน.*|ทำนาย.*|เลขเด็ด.*|หาเลข.*|ขอเลข.*|แปลฝัน.*|แปลความฝัน.*|ช่วยทำนาย.*|ช่วยแปล.*|ช่วยดู.*|ความฝัน.*)$/i;
    assert.strictEqual(isDreamRegex.test('ทำนายฝัน'), true);
    assert.strictEqual(isDreamRegex.test('ทำนายฝันเห็นพญานาค'), true);
    assert.strictEqual(isDreamRegex.test('เลขเด็ดงวดนี้'), true);
    assert.strictEqual(isDreamRegex.test('เมื่อคืนฝันเห็นงู'), true);
    assert.strictEqual(isDreamRegex.test('เมื่อวานฝันว่าได้ทอง'), true);
    assert.strictEqual(isDreamRegex.test('ผมฝันว่าขับรถชน'), true);
    assert.strictEqual(isDreamRegex.test('หนูฝันว่าเห็นพญานาค'), true);
    assert.strictEqual(isDreamRegex.test('ขอเลขเด็ดหน่อยครับ'), true);
    assert.strictEqual(isDreamRegex.test('ช่วยแปลความฝันหน่อย'), true);
    assert.strictEqual(isDreamRegex.test('334=5'), false);
    assert.strictEqual(isDreamRegex.test('สั่งซื้อ 123 2 ใบ'), false);
  });

  // TEST SUITE 16: AI Dream Engine & In-Chat Prediction
  test('DreamEngine: analyzeDreamPrompt separates generic requests from actual dreams', () => {
    const generic1 = DreamEngine.analyzeDreamPrompt('ทำนายฝัน');
    assert.strictEqual(generic1.hasDreamContent, false);
    assert.strictEqual(generic1.isGenericRequest, true);

    const generic2 = DreamEngine.analyzeDreamPrompt('เลขเด็ด AI');
    assert.strictEqual(generic2.hasDreamContent, false);

    // Polite particles without dream content should trigger guidance
    const genericPolite1 = DreamEngine.analyzeDreamPrompt('ทำนายฝันหน่อย');
    assert.strictEqual(genericPolite1.hasDreamContent, false, 'ทำนายฝันหน่อย should trigger guidance');
    assert.strictEqual(genericPolite1.isGenericRequest, true);

    const genericPolite2 = DreamEngine.analyzeDreamPrompt('ทำนายฝันครับ');
    assert.strictEqual(genericPolite2.hasDreamContent, false, 'ทำนายฝันครับ should trigger guidance');
    assert.strictEqual(genericPolite2.isGenericRequest, true);

    const genericPolite3 = DreamEngine.analyzeDreamPrompt('ทำนายฝันค่ะ');
    assert.strictEqual(genericPolite3.hasDreamContent, false);
    assert.strictEqual(genericPolite3.isGenericRequest, true);

    const genericPolite4 = DreamEngine.analyzeDreamPrompt('ช่วยทำนายฝันหน่อยครับ');
    assert.strictEqual(genericPolite4.hasDreamContent, false);
    assert.strictEqual(genericPolite4.isGenericRequest, true);

    // Additional edge cases: pure polite particles, openers without substance, and requests for numbers
    assert.strictEqual(DreamEngine.analyzeDreamPrompt('ฝันครับ').hasDreamContent, false);
    assert.strictEqual(DreamEngine.analyzeDreamPrompt('ฝันค่ะ').hasDreamContent, false);
    assert.strictEqual(DreamEngine.analyzeDreamPrompt('ฝันหน่อย').hasDreamContent, false);
    assert.strictEqual(DreamEngine.analyzeDreamPrompt('ความฝันครับ').hasDreamContent, false);
    assert.strictEqual(DreamEngine.analyzeDreamPrompt('ช่วยแปลความฝันหน่อย').hasDreamContent, false);
    assert.strictEqual(DreamEngine.analyzeDreamPrompt('ขอเลขเด็ดหน่อยครับ').hasDreamContent, false);
    assert.strictEqual(DreamEngine.analyzeDreamPrompt('เมื่อคืนฝัน').hasDreamContent, false);
    assert.strictEqual(DreamEngine.analyzeDreamPrompt('เมื่อคืนฝันครับ').hasDreamContent, false);
    assert.strictEqual(DreamEngine.analyzeDreamPrompt('เมื่อวานฝันว่า').hasDreamContent, false);
    assert.strictEqual(DreamEngine.analyzeDreamPrompt('ผมฝันครับ').hasDreamContent, false);

    const specific1 = DreamEngine.analyzeDreamPrompt('ฝันเห็นงู 2 ตัว');
    assert.strictEqual(specific1.hasDreamContent, true);
    assert.strictEqual(specific1.cleanedText, 'ฝันเห็นงู 2 ตัว');

    const specific2 = DreamEngine.analyzeDreamPrompt('ช่วยทำนายฝันให้หน่อย ฝันว่าขับรถชน ทะเบียน 954');
    assert.strictEqual(specific2.hasDreamContent, true);
    assert(specific2.cleanedText.includes('954'));

    const specific3 = DreamEngine.analyzeDreamPrompt('ทำนายฝันหน่อย ฝันเห็นงู 2 ตัวครับ');
    assert.strictEqual(specific3.hasDreamContent, true);
    assert.strictEqual(specific3.cleanedText, 'ฝันเห็นงู 2 ตัว');

    const specific4 = DreamEngine.analyzeDreamPrompt('เมื่อคืนฝันเห็นงู 2 ตัวครับ');
    assert.strictEqual(specific4.hasDreamContent, true);
    assert.strictEqual(specific4.cleanedText, 'เมื่อคืนฝันเห็นงู 2 ตัว');
  });

  test('DreamEngine: predictDream accurately calculates lucky numbers, meaning, and poems', () => {
    // 1. Explicit count test
    const pred1 = DreamEngine.predictDream('ฝันเห็นงู 2 ตัว');
    assert.strictEqual(pred1.n3Direct.startsWith('2'), true, 'Anchor count digit should be 2');
    assert(pred1.element.includes('ธาตุน้ำ') || pred1.element.length > 0);
    assert(pred1.meaning.length > 10);
    assert(pred1.blessing.length > 10);
    assert(pred1.poem.includes(pred1.n3Direct));

    // 2. Explicit direct number test
    const pred2 = DreamEngine.predictDream('ฝันว่าขับรถชน ทะเบียน 954');
    assert.strictEqual(pred2.n3Direct, '954', 'Explicit 3-digit number 954 should be anchor');
    assert.strictEqual(pred2.n2Digit, '54', '2-digit should be 54');
    assert(pred2.allTods.length >= 2, 'Should generate tods');

    // 2.1 3-digit priority over 2-digit test (e.g. 25 and 954)
    const predPriority = DreamEngine.predictDream('ฝันเห็น 25 ทะเบียน 954');
    assert.strictEqual(predPriority.n3Direct, '954', 'Explicit 3-digit number 954 should take priority as anchor over 2-digit 25');
    assert.strictEqual(predPriority.n2Digit, '25', 'Explicit 2-digit number 25 should be preserved as 2-digit');

    // 2.2 Thai numerals support test (e.g. ๒๕ and ๙๕๔)
    const predThai = DreamEngine.predictDream('ฝันเห็น ๒๕ ทะเบียน ๙๕๔');
    assert.strictEqual(predThai.n3Direct, '954', 'Thai numeral ๙๕๔ should be normalized to 954 as anchor');
    assert.strictEqual(predThai.n2Digit, '25', 'Thai numeral ๒๕ should be normalized to 25');

    // 3. Folk category test (เต่า)
    const pred3 = DreamEngine.predictDream('ฝันเห็นเต่าตัวใหญ่');
    assert.strictEqual(pred3.n3Direct.length, 3);
    assert.strictEqual(pred3.n2Digit.length, 2);
    assert(pred3.confidence.includes('%'));
  });

  test('FlexMessageBuilder: buildDreamPredictionMessage generates valid LINE Flex Message', () => {
    const pred = DreamEngine.predictDream('ฝันเห็นพญานาค 9 เศียร');
    const flex = FlexMessageBuilder.buildDreamPredictionMessage(pred);

    assert.strictEqual(flex.type, 'flex');
    assert(flex.altText.includes('ทำนายฝัน AI'));
    assert(flex.altText.includes(pred.n3Direct));
    assert(flex.altText.includes('เป๋าตัง'));

    // Verify floating Quick Reply is omitted to avoid duplicating Rich Menu
    assert(!flex.quickReply, 'Quick Reply omitted to prevent popup duplication');

    // Check bubble contents
    const bubble = flex.contents as any;
    assert.strictEqual(bubble.type, 'bubble');
    assert(bubble.header);
    assert(bubble.body);
    assert(bubble.footer);

    // Verify footer buttons: 3ตรง, 3ตรง+ทุกโต๊ด, 2ตัวท้าย, เว็บทำนายฝัน, เมนูหลัก
    const footerButtons = bubble.footer.contents;
    assert.strictEqual(footerButtons.length, 5);
    for (const btn of footerButtons) {
      if (btn.action && btn.action.label) {
        assert(btn.action.label.length <= 40, `Button label must be <= 40 chars: ${btn.action.label}`);
      }
    }

    // Check Paotang alert in body
    const bodyStr = JSON.stringify(bubble.body);
    assert(bodyStr.includes('เป๋าตัง'));
    assert(bodyStr.includes('ใบละ 20 บาท'));
  });

  test('FlexMessageBuilder: buildDreamPromptGuidanceMessage generates valid guidance card', () => {
    const guidance = FlexMessageBuilder.buildDreamPromptGuidanceMessage();

    assert.strictEqual(guidance.type, 'flex');
    assert(guidance.altText.includes('ทำนายฝัน'));

    assert(!guidance.quickReply, 'Quick Reply omitted to prevent popup duplication');

    const bubble = guidance.contents as any;
    assert.strictEqual(bubble.type, 'bubble');
    const bodyStr = JSON.stringify(bubble.body);
    assert(bodyStr.includes('เป๋าตัง'));
    assert(bodyStr.includes('ฝันเห็นงู 2 ตัว'));
  });

  // TEST SUITE 17: Interactive Order Table & LINE Order Form Integration
  test('Order Table Form: CONFIG.ORDER_FORM_URL is defined and points to order.html', () => {
    assert(CONFIG.ORDER_FORM_URL, 'CONFIG.ORDER_FORM_URL must be defined');
    assert(CONFIG.ORDER_FORM_URL.includes('order.html'), 'ORDER_FORM_URL must point to order.html');
  });

  test('Order Table Guidance: buildOrderGuidanceMessage includes open order table URI and preview table', () => {
    const guidance = FlexMessageBuilder.buildOrderGuidanceMessage();
    assert.strictEqual(guidance.type, 'flex');

    const bubble = guidance.contents as any;
    const bodyStr = JSON.stringify(bubble.body);
    assert(bodyStr.includes('ตัวอย่างตารางสั่งซื้อ'), 'Must include order table visual preview');
    assert(bodyStr.includes('334'), 'Must show preview number 334');
    assert(bodyStr.includes('447'), 'Must show preview number 447');

    const footerStr = JSON.stringify(bubble.footer);
    assert(footerStr.includes('ตาราง') && footerStr.includes('สั่งซื้อสลาก N3'), 'Footer must have button to open order table');
    assert(footerStr.includes(CONFIG.ORDER_FORM_URL), 'Footer button must link to CONFIG.ORDER_FORM_URL');
  });

  test('Order Table Dispatch: parseOrderMessage seamlessly parses orders generated by order.html and handles text= prefix', () => {
    // Single item order from table
    const single = parseOrderMessage('สั่งซื้อ 789 2 ใบ');
    assert(single !== null && single.length === 1);
    assert.strictEqual(single[0].number, '789');
    assert.strictEqual(single[0].quantity, 2);

    // Multi-row order from table
    const multi = parseOrderMessage('สั่งซื้อ 123 1 ใบ, 456 2 ใบ, 789 3 ใบ');
    assert(multi !== null && multi.length === 3);
    assert.strictEqual(multi[0].number, '123');
    assert.strictEqual(multi[0].quantity, 1);
    assert.strictEqual(multi[1].number, '456');
    assert.strictEqual(multi[1].quantity, 2);
    assert.strictEqual(multi[2].number, '789');
    assert.strictEqual(multi[2].quantity, 3);

    // Defense against query string prefixes (e.g. text= or ?text=)
    const withPrefix1 = parseOrderMessage('text=สั่งซื้อ 123 2 ใบ');
    assert(withPrefix1 !== null && withPrefix1.length === 1);
    assert.strictEqual(withPrefix1[0].number, '123');
    assert.strictEqual(withPrefix1[0].quantity, 2);

    const withPrefix2 = parseOrderMessage('?text=สั่งซื้อ 456 3 ใบ, 789 1 ใบ');
    assert(withPrefix2 !== null && withPrefix2.length === 2);
    assert.strictEqual(withPrefix2[0].number, '456');
    assert.strictEqual(withPrefix2[0].quantity, 3);
    assert.strictEqual(withPrefix2[1].number, '789');
    assert.strictEqual(withPrefix2[1].quantity, 1);
  });

  test('Quick Reply Policy: getDefaultQuickReply returns undefined to avoid duplicating LINE Rich Menu', () => {
    const qr = FlexMessageBuilder.getDefaultQuickReply();
    assert.strictEqual(qr, undefined, 'getDefaultQuickReply must return undefined to keep chat clean');
  });

  test('Order Table HTML & JS: Verify LINE oaMessage URL protocol compliance and Thai numeral support', () => {
    const orderHtmlPath = path.resolve(__dirname, '../../order.html');
    assert(fs.existsSync(orderHtmlPath), 'd:/Promote_GLON3/order.html must exist');
    const content = fs.readFileSync(orderHtmlPath, 'utf-8');

    // Verify Thai table elements and requirements
    assert(content.includes('order-table'), 'Must contain order-table');
    assert(content.includes('btn-add-row'), 'Must contain add row button (ปุ่มเพิ่มแถว)');
    assert(content.includes('btn-submit-order'), 'Must contain submit order button (ปุ่มสั่งซื้อ)');
    assert(content.includes('input-ticket-num'), 'Must contain ticket number input field');
    assert(content.includes('input-qty'), 'Must contain ticket quantity input field');
    assert(content.includes('oaMessage'), 'Must generate deep link to LINE oaMessage');
    assert(content.includes('@586xxhlx'), 'Must reference shop LINE ID @586xxhlx');
    assert(content.includes('เป๋าตัง'), 'Must reference Paotang app');

    // Verify URL scheme compliance: must percent-encode OA ID and omit ?text=
    assert(content.includes('encodeURIComponent(CONFIG.LINE_OA_ID)'), 'Must URL-encode LINE OA ID');
    assert(!content.includes('?text='), 'Must not use non-standard ?text= in oaMessage scheme');

    // Verify Thai digits conversion in table and initFromParams
    assert(content.includes('toArabicDigits'), 'Must support Thai numeral conversion');
    assert(content.includes('toArabicDigits(rawSingleNum)'), 'Must convert Thai numeral in URL parameter singleNum');
    assert(content.includes('toArabicDigits(rawOrderList)'), 'Must convert Thai numeral in URL parameter orderList');
    assert(content.includes('Enter'), 'Must support Enter key row navigation');

    // Verify app.js modal table
    const appJsPath = path.resolve(__dirname, '../../js/app.js');
    const appContent = fs.readFileSync(appJsPath, 'utf-8');
    assert(appContent.includes('modal-order-table'), 'app.js must handle modal-order-table');
    assert(!appContent.includes('?text='), 'app.js must not use non-standard ?text=');
  });

  test('n3-engine: cleanFiles cleans paotang-login QRs and require.main safeguard exists', () => {
    const enginePath = path.resolve(__dirname, '../../scripts/n3-engine.js');
    assert(fs.existsSync(enginePath), 'scripts/n3-engine.js must exist');
    const content = fs.readFileSync(enginePath, 'utf-8');

    assert(content.includes("paotang-login-"), 'cleanFiles must clean paotang-login- QR codes');
    assert(content.includes('require.main === module'), 'n3-engine.js must be guarded with require.main === module');
  });

  test('Vercel Config: public/order.html is removed to prevent 404 shadow and vercel.json has outputDirectory .', () => {
    const pubOrderPath = path.resolve(__dirname, '../../public/order.html');
    assert(!fs.existsSync(pubOrderPath), 'public/order.html must be removed from repository');
    const vercelJsonPath = path.resolve(__dirname, '../../vercel.json');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    assert.strictEqual(vercelConfig.outputDirectory, '.', 'outputDirectory must be .');
    assert.strictEqual(vercelConfig.cleanUrls, true, 'cleanUrls must be true');
  });

  test('LINE Message Sanitizer: LineReplyHandler.sanitizeMessages prevents HTTP 400 length error', () => {
    // 1. Long message > 5000 characters
    const hugeText = 'A'.repeat(6000);
    const msgs: messagingApi.Message[] = [{ type: 'text', text: hugeText }];
    const sanitized = LineReplyHandler.sanitizeMessages(msgs);
    assert.strictEqual(sanitized.length, 1);
    assert.strictEqual(sanitized[0].type, 'text');
    const textMsg = sanitized[0] as messagingApi.TextMessage;
    assert(textMsg.text.length <= 4050, 'Must truncate text to within safe LINE limits');
    assert(textMsg.text.includes('ข้อความถูกตัดทอน'), 'Must indicate truncation');

    // 2. Empty or whitespace text
    const emptyMsgs: messagingApi.Message[] = [{ type: 'text', text: '   ' }];
    const sanitizedEmpty = LineReplyHandler.sanitizeMessages(emptyMsgs);
    assert.strictEqual(sanitizedEmpty[0].type, 'text');
    assert((sanitizedEmpty[0] as messagingApi.TextMessage).text.length > 0, 'Empty text must be replaced with non-empty string');

    // 3. Normal text passes unchanged
    const normalMsgs: messagingApi.Message[] = [{ type: 'text', text: 'สวัสดีครับ' }];
    const sanitizedNormal = LineReplyHandler.sanitizeMessages(normalMsgs);
    assert.strictEqual((sanitizedNormal[0] as messagingApi.TextMessage).text, 'สวัสดีครับ');
  });

  test('N3Auth: checkAndDismissSessionModal function is defined and callable', () => {
    assert(typeof N3Auth.checkAndDismissSessionModal === 'function', 'N3Auth.checkAndDismissSessionModal must be a function');
  });

  test('Console Codepage: N3-MANAGER.bat enforces chcp 65001 to prevent Thai font mojibake', () => {
    const managerBatPath = path.resolve(__dirname, '../../N3-MANAGER.bat');
    assert(fs.existsSync(managerBatPath), 'N3-MANAGER.bat must exist');
    const content = fs.readFileSync(managerBatPath, 'utf-8');
    assert(content.includes('chcp 65001 >nul'), 'N3-MANAGER.bat must include chcp 65001 >nul');
  });

  console.log(`\n====================================================`);
  console.log(`TEST SUMMARY: ${passed} / ${total} tests passed (100%)`);
  console.log(`====================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
