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
    const names = ['updateSelectionLimit', 'updateSummary', 'updateGrandTotal', 'getPermutations', 'getSelectedPermutations'];
    const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(ast));
    assert.equal(functions.length, names.length);
    const elements = new Map();
    function element() { return { style: {}, setAttribute() {}, parentElement: { insertAdjacentElement(_, node) { elements.set(node.id, node); } } }; }
    const summaryTickets = element();
    elements.set('grand-total-qty', element());
    elements.set('btn-submit-order', element());
    elements.set('btn-submit-sixpack', element());
    const context = vm.createContext({ document: { getElementById: id => elements.get(id), createElement: element }, summaryTickets, summaryItems: element(), summaryTotal: element(), CONFIG: { PRICE_PER_TICKET: 20 }, rowsData: [{ number: '123', quantity: 99 }], selectedDigits: ['1', '2', '3'], currentSetQty: 1, addedSets: [], permutationKey: '', excludedPermutations: new Set() });
    vm.runInContext(functions.join('\n'), context);
    vm.runInContext('updateSummary()', context);
    const normal = elements.get('normal-selection-limit');
    assert.equal(normal.hidden, true);
    context.rowsData[0].quantity = 250;
    vm.runInContext('updateSummary()', context);
    assert.equal(normal.hidden, true, 'Quantity does not affect the number limit');
    context.rowsData = Array.from({ length: 100 }, (_, i) => ({ number: String(i).padStart(3, '0'), quantity: 2 }));
    vm.runInContext('updateSummary()', context);
    assert.equal(normal.hidden, true);
    assert.equal(elements.get('btn-submit-order').disabled, false);
    context.rowsData.push({ number: '099', quantity: 10 });
    vm.runInContext('updateSummary()', context);
    assert.equal(normal.hidden, true, 'Duplicate numbers count only once');
    context.rowsData.push({ number: '456', quantity: 1 });
    vm.runInContext('updateSummary()', context);
    assert.match(normal.textContent, /ลดอย่างน้อย 1 เลข/);
    assert.equal(elements.get('btn-submit-order').disabled, true);
    context.rowsData = context.rowsData.slice(0, 99);
    vm.runInContext('updateSummary()', context);
    assert.equal(normal.hidden, true);
    assert.equal(elements.get('btn-submit-order').disabled, false);
    context.addedSets = [{ perms: Array.from({ length: 96 }, (_, i) => String(i).padStart(3, '0')), qty: 3 }];
    vm.runInContext('updateGrandTotal()', context);
    const sixpack = elements.get('sixpack-selection-limit');
    assert.equal(sixpack.hidden, false);
    assert.match(sixpack.textContent, /เลือกแล้ว 102 เลข/);
    context.currentSetQty = 2;
    vm.runInContext('updateGrandTotal()', context);
    assert.match(sixpack.textContent, /ลดอย่างน้อย 2 เลข/);
    context.addedSets = [];
    vm.runInContext('updateGrandTotal()', context);
    assert.equal(sixpack.hidden, true);
  });
}
