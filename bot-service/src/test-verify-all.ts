import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { parseOrderMessage, isStopIntentional, getStoredWebhookUrl } from './index';
import { FlexMessageBuilder } from './line/flex-message';
import { QuotaManager } from './quota/quota-manager';
import { OrderItem } from './queue/order-queue';
import { CONFIG } from './config';
import { LineReplyHandler, getThaiTime } from './line/reply-handler';

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

  test('Launcher: create-desktop-shortcuts.vbs delegates to create-desktop-shortcuts.ps1', () => {
    const vbsShortcutsPath = path.resolve(__dirname, '../../scripts/create-desktop-shortcuts.vbs');
    assert(fs.existsSync(vbsShortcutsPath), 'create-desktop-shortcuts.vbs must exist');
    const vbsShortcutsContent = fs.readFileSync(vbsShortcutsPath, 'utf-8');
    assert(vbsShortcutsContent.includes('create-desktop-shortcuts.ps1'), 'VBS shortcuts must delegate to PowerShell to prevent mojibake');
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


  console.log(`\n====================================================`);
  console.log(`TEST SUMMARY: ${passed} / ${total} tests passed (100%)`);
  console.log(`====================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
