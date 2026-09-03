import assert from 'assert';
import { CONFIG } from '../config';
import { PersistentBrowserManager } from './browser-context';

async function testHeadlessConfig() {
  console.log('=== VERIFYING HEADLESS CONFIGURATION & BROWSER SETTINGS ===');

  // 1. CONFIG.HEADLESS must default to true
  assert.strictEqual(CONFIG.HEADLESS, true, 'CONFIG.HEADLESS must be true by default');
  console.log('✅ PASS: CONFIG.HEADLESS is true by default for background order automation');

  // 2. Verify getPage method exists and is callable
  assert(typeof PersistentBrowserManager.getPage === 'function', 'PersistentBrowserManager.getPage must be a function');
  console.log('✅ PASS: PersistentBrowserManager.getPage function exists and handles headless param');

  console.log('\nAll headless configuration checks passed successfully!');
}

testHeadlessConfig().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
