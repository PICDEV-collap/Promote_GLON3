const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../bot-service/node_modules/typescript');

for (const file of ['order.html', 'order-6pack.html', 'line.html', 'bot-service/public/order.html', 'bot-service/public/order-6pack.html', 'bot-service/public/line.html']) {
  test(`${file}: warn immediately for normal and six-pack selections, clear after reduction`, () => {
    const html = fs.readFileSync(file, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
    const ast = ts.createSourceFile(file, scripts, ts.ScriptTarget.Latest, true);
    const names = ['updateSelectionLimit', 'updateSummary', 'updateGrandTotal', 'getPermutations'];
    const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(ast));
    assert.equal(functions.length, names.length);
    const elements = new Map();
    function element() { return { style: {}, setAttribute() {}, parentElement: { insertAdjacentElement(_, node) { elements.set(node.id, node); } } }; }
    const summaryTickets = element();
    elements.set('grand-total-qty', element());
    const context = vm.createContext({ document: { getElementById: id => elements.get(id), createElement: element }, summaryTickets, summaryItems: element(), summaryTotal: element(), CONFIG: { PRICE_PER_TICKET: 20 }, rowsData: [{ number: '123', quantity: 99 }], selectedDigits: ['1', '2', '3'], currentSetQty: 1, addedSets: [] });
    vm.runInContext(functions.join('\n'), context);
    vm.runInContext('updateSummary()', context);
    const normal = elements.get('normal-selection-limit');
    assert.equal(normal.hidden, true);
    context.rowsData[0].quantity = 100;
    vm.runInContext('updateSummary()', context);
    assert.equal(normal.hidden, false);
    assert.match(normal.textContent, /ครบ 100/);
    context.rowsData.push({ number: '456', quantity: 1 });
    vm.runInContext('updateSummary()', context);
    assert.match(normal.textContent, /ลดจำนวนอย่างน้อย 1 ใบ/);
    context.rowsData.pop(); context.rowsData[0].quantity = 98;
    vm.runInContext('updateSummary()', context);
    assert.equal(normal.hidden, true);
    context.addedSets = [{ perms: ['000'], qty: 96 }];
    vm.runInContext('updateGrandTotal()', context);
    const sixpack = elements.get('sixpack-selection-limit');
    assert.equal(sixpack.hidden, false);
    assert.match(sixpack.textContent, /เลือกแล้ว 102 ใบ/);
    context.currentSetQty = 2;
    vm.runInContext('updateGrandTotal()', context);
    assert.match(sixpack.textContent, /ลดจำนวนอย่างน้อย 8 ใบ/);
    context.addedSets = [];
    vm.runInContext('updateGrandTotal()', context);
    assert.equal(sixpack.hidden, true);
  });
}
