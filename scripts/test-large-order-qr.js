const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { N3OrderService } = require('../bot-service/dist/automation/n3-order');

test('100-number QR captures use a short unique filename and can be saved', () => {
  const numbers = Array.from({ length: 100 }, (_, i) => String(i).padStart(3, '0'));
  const legacyName = `payment-${numbers.join('-')}-${Date.now()}.png`;
  assert(legacyName.length > 255, 'Old 100-number filenames exceed filesystem component limits');
  const dir = fs.mkdtempSync(path.join(__dirname, '../bot-service/data/qr-large-order-test-'));
  try {
    const filename = N3OrderService.createPaymentQrFileName();
    assert.equal(filename.length, 48);
    assert.match(filename, /^payment-[\w.-]+\.png$/i, 'Compatible with QR download route');
    assert.notEqual(filename, N3OrderService.createPaymentQrFileName());
    const output = path.join(dir, filename);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(output, png);
    assert.deepEqual(fs.readFileSync(output), png);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
