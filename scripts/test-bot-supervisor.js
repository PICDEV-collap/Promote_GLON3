const test = require('node:test');
const assert = require('node:assert/strict');
const { recoveryDecision } = require('./bot-supervisor');
const base = { paused: false, bots: [], owners: [], browser: true, tunnel: true, attempts: 0 };
test('recover only a missing bot with an available port and project dependencies', () => {
  assert.equal(recoveryDecision(base), 'recover');
  assert.equal(recoveryDecision({ ...base, owners: [999] }), 'foreign-port');
  assert.equal(recoveryDecision({ ...base, bots: [{ pid: 123 }], owners: [123] }), 'inspect-health');
  assert.equal(recoveryDecision({ ...base, bots: [{ pid: 123 }] }), 'inspect-health');
});
test('respect intentional stops, missing dependencies and restart storm limits', () => {
  assert.equal(recoveryDecision({ ...base, paused: true }), 'paused');
  assert.equal(recoveryDecision({ ...base, browser: false }), 'dependencies-missing');
  assert.equal(recoveryDecision({ ...base, tunnel: false }), 'dependencies-missing');
  assert.equal(recoveryDecision({ ...base, attempts: 3 }), 'restart-limit');
});
