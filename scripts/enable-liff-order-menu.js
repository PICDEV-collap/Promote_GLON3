// Clone the active menu and reuse its image; preserve the old menu for rollback.
const fs = require('fs');
const path = require('path');
require('../bot-service/node_modules/dotenv').config({ path: path.join(__dirname, '../bot-service/.env') });
const { buildOrderMenu } = require('./liff-order-menu');

async function main() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw Error('LINE token is not configured');
  const headers = { Authorization: `Bearer ${token}` };
  async function json(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
    if (!response.ok) throw Error(`LINE API returned ${response.status}`);
    return response.status === 200 && response.headers.get('content-type')?.includes('json') ? response.json() : null;
  }
  const base = 'https://api.line.me/v2/bot';
  const old = await json(`${base}/user/all/richmenu`);
  const existing = await json(`${base}/richmenu/${old.richMenuId}`);
  const spec = buildOrderMenu(existing, process.env.LIFF_ID || '2011462211-WVsuHFk4');
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ previousMenu: old.richMenuId, orderLinks: spec.areas.slice(0, 2).map(a => a.action.uri) }));
    return;
  }
  if (JSON.stringify(existing.areas) === JSON.stringify(spec.areas)) {
    console.log(JSON.stringify({ alreadyEnabled: true, menu: old.richMenuId }));
    return;
  }
  const image = await fetch(`https://api-data.line.me/v2/bot/richmenu/${old.richMenuId}/content`, { headers });
  if (!image.ok) throw Error(`Cannot read existing menu image: ${image.status}`);
  const imageType = image.headers.get('content-type') || 'image/jpeg';
  const imageBytes = Buffer.from(await image.arrayBuffer());
  const backup = path.join(__dirname, '../bot-service/data/diagnostics');
  fs.mkdirSync(backup, { recursive: true });
  fs.writeFileSync(path.join(backup, `richmenu-before-liff-${Date.now()}.json`), JSON.stringify(existing, null, 2));
  const created = await json(`${base}/richmenu`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
  await json(`https://api-data.line.me/v2/bot/richmenu/${created.richMenuId}/content`, { method: 'POST', headers: { 'Content-Type': imageType }, body: imageBytes });
  await json(`${base}/user/all/richmenu/${created.richMenuId}`, { method: 'POST' });
  const active = await json(`${base}/user/all/richmenu`);
  if (active.richMenuId !== created.richMenuId) throw Error('Default menu verification failed');
  const verified = await json(`${base}/richmenu/${active.richMenuId}`);
  if (JSON.stringify(verified.areas) !== JSON.stringify(spec.areas)) throw Error('Menu link verification failed');
  console.log(JSON.stringify({ enabled: true, previousMenuPreserved: old.richMenuId, activeMenu: active.richMenuId, orderLinks: verified.areas.slice(0, 2).map(a => a.action.uri) }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
