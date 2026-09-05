// Script to generate and register LINE Rich Menu for GLO N3 Bot
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '../bot-service/node_modules/playwright'));
require(path.join(__dirname, '../bot-service/node_modules/dotenv')).config({ path: path.join(__dirname, '../bot-service/.env') });

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!LINE_TOKEN) {
  console.error('ERROR: LINE_CHANNEL_ACCESS_TOKEN is missing in bot-service/.env');
  process.exit(1);
}

const WIDTH = 2500;
const HEIGHT = 1686;
const ROW_H = Math.round(HEIGHT / 2); // 843

const RICH_MENU_SPEC = {
  size: { width: WIDTH, height: HEIGHT },
  selected: true,
  name: 'N3_Thanakit_MainMenu_v2',
  chatBarText: '🏠 เมนูหลัก',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: ROW_H },
      action: { type: 'uri', uri: 'https://liff.line.me/2011462211-WVsuHFk4' }
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: ROW_H },
      action: { type: 'message', text: 'ผลรางวัล' }
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: ROW_H },
      action: { type: 'message', text: 'วิธีสั่งซื้อ' }
    },
    {
      bounds: { x: 0, y: ROW_H, width: 833, height: ROW_H },
      action: { type: 'uri', uri: 'https://promote-glon-3.vercel.app/' }
    },
    {
      bounds: { x: 833, y: ROW_H, width: 834, height: ROW_H },
      action: { type: 'message', text: 'เช็คโควต้า' }
    },
    {
      bounds: { x: 1667, y: ROW_H, width: 833, height: ROW_H },
      action: { type: 'message', text: 'เมนู' }
    }
  ]
};

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 2500px;
    height: 1686px;
    display: grid;
    grid-template-columns: 833px 834px 833px;
    grid-template-rows: 843px 843px;
    background-color: #0b1120;
    font-family: 'Prompt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Sarabun', 'Noto Sans Thai', sans-serif;
    overflow: hidden;
  }
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 28px 24px;
    text-align: center;
    border: 3px solid rgba(255, 255, 255, 0.14);
    cursor: pointer;
  }
  .tile-1 {
    background: linear-gradient(135deg, #0b192e 0%, #1e3a8a 100%);
  }
  .tile-2 {
    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%);
    box-shadow: inset 0 0 80px rgba(250, 204, 21, 0.22);
  }
  .tile-3 {
    background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%);
  }
  .tile-4 {
    background: linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%);
  }
  .tile-5 {
    background: linear-gradient(135deg, #064e3b 0%, #059669 100%);
  }
  .tile-6 {
    background: linear-gradient(135deg, #78350f 0%, #d97706 100%);
    box-shadow: inset 0 0 80px rgba(251, 191, 36, 0.25);
  }
  .icon-box {
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 92px;
    margin-bottom: 20px;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.3);
    border: 2px solid rgba(255, 255, 255, 0.35);
  }
  .title {
    font-size: 88px;
    font-weight: 900;
    color: #ffffff;
    line-height: 1.2;
    margin-bottom: 12px;
    text-shadow: 0 4px 16px rgba(0,0,0,0.6);
    letter-spacing: -0.5px;
    white-space: nowrap;
  }
  .title-gold {
    color: #fef08a;
  }
  .subtitle {
    font-size: 48px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    line-height: 1.3;
    margin-bottom: 26px;
    max-width: 96%;
    text-shadow: 0 2px 8px rgba(0,0,0,0.6);
    white-space: nowrap;
  }
  .badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 82%;
    max-width: 660px;
    padding: 22px 24px;
    border-radius: 9999px;
    font-size: 50px;
    font-weight: 800;
    letter-spacing: 0.5px;
    box-shadow: 0 10px 24px rgba(0,0,0,0.35);
    white-space: nowrap;
  }
  .badge-green { background: #22c55e; color: #ffffff; }
  .badge-red { background: #ef4444; color: #ffffff; }
  .badge-blue { background: #38bdf8; color: #082f49; }
  .badge-purple { background: #e879f9; color: #4a044e; }
  .badge-mint { background: #34d399; color: #064e3b; }
  .badge-gold { background: #fef08a; color: #78350f; font-size: 50px; }
  .badge-trophy {
    background: linear-gradient(135deg, #fef08a 0%, #f59e0b 100%);
    color: #78350f;
    border: 2px solid rgba(254, 240, 138, 0.6);
  }
  .highlight-tag {
    position: absolute;
    top: 26px;
    right: 26px;
    background: rgba(0,0,0,0.45);
    color: #fef08a;
    padding: 10px 24px;
    border-radius: 14px;
    font-size: 32px;
    font-weight: 700;
    border: 1px solid rgba(254, 240, 138, 0.35);
  }
</style>
</head>
<body>
  <!-- TILE 1: สั่งซื้อสลาก N3 -->
  <div class="tile tile-1">
    <div class="highlight-tag">เปิดตารางสั่งซื้อ</div>
    <div class="icon-box">🛒</div>
    <div class="title title-gold">สั่งซื้อสลาก N3</div>
    <div class="subtitle">เปิดตารางกรอกเลข & จำนวนใบ</div>
    <div class="badge badge-green">ใบละ 20 บาท</div>
  </div>

  <!-- TILE 2: ผลการออกรางวัล (NEW!) -->
  <div class="tile tile-2">
    <div class="highlight-tag" style="color: #fef08a; border-color: rgba(254, 240, 138, 0.5);">อัปเดตงวดล่าสุด</div>
    <div class="icon-box" style="background: rgba(254, 240, 138, 0.22); border-color: rgba(254, 240, 138, 0.6);">🏆</div>
    <div class="title title-gold">ผลการออกรางวัล</div>
    <div class="subtitle">3 ตรง • 3 โต๊ด • 2 ตรง • แจ็กพอต</div>
    <div class="badge badge-trophy">ตรวจผลสลาก N3</div>
  </div>

  <!-- TILE 3: วิธีสั่งซื้อ & จ่ายเงิน -->
  <div class="tile tile-3">
    <div class="highlight-tag" style="color: #fecaca; border-color: rgba(239,68,68,0.4);">สำคัญมาก!</div>
    <div class="icon-box">📲</div>
    <div class="title">วิธีซื้อ & จ่ายเงิน</div>
    <div class="subtitle">ขั้นตอนสั่ง & สแกนจ่ายเป๋าตัง</div>
    <div class="badge badge-red">แอปเป๋าตัง เท่านั้น</div>
  </div>

  <!-- TILE 4: ทำนายฝัน AI -->
  <div class="tile tile-4">
    <div class="highlight-tag">แม่นยำ AI</div>
    <div class="icon-box">🔮</div>
    <div class="title title-gold">ทำนายฝัน AI</div>
    <div class="subtitle">วิเคราะห์ความฝัน หาเลขมงคล</div>
    <div class="badge badge-purple">เปิดเว็บทำนายฝัน</div>
  </div>

  <!-- TILE 5: เช็คโควต้าสลาก -->
  <div class="tile tile-5">
    <div class="highlight-tag">เรียลไทม์</div>
    <div class="icon-box">📊</div>
    <div class="title">เช็คโควต้า</div>
    <div class="subtitle">ตรวจสอบสลากคงเหลือประจำงวด</div>
    <div class="badge badge-mint">อัปเดตสดจากกองสลาก</div>
  </div>

  <!-- TILE 6: เมนูหลัก (กดที่นี่ไม่ต้องพิมพ์) -->
  <div class="tile tile-6">
    <div class="highlight-tag" style="color: #ffffff;">กดที่นี่ได้เลย</div>
    <div class="icon-box" style="background: rgba(254, 240, 138, 0.25);">🏠</div>
    <div class="title title-gold">เมนูหลัก</div>
    <div class="subtitle" style="color: #ffffff;">กดดูรวมบริการทั้งหมดไม่ต้องพิมพ์</div>
    <div class="badge badge-gold">⭐ แตะเปิดเมนู ⭐</div>
  </div>
</body>
</html>`;

async function main() {
  console.log('=== LINE RICH MENU SETUP & SYNC ===');
  console.log('1. Rendering 2500x1686 Rich Menu Image via Playwright...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1
  });
  
  await page.setContent(HTML_TEMPLATE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 86 });
  await browser.close();
  
  console.log(`   Image rendered: ${imageBuffer.length.toLocaleString()} bytes (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
  if (imageBuffer.length > 1000000) {
    throw new Error('Image exceeds LINE limit of 1MB');
  }
  
  const outPathPublic = path.join(__dirname, '../public/richmenu.jpg');
  const outPathBot = path.join(__dirname, '../bot-service/public/richmenu.jpg');
  fs.writeFileSync(outPathPublic, imageBuffer);
  fs.writeFileSync(outPathBot, imageBuffer);
  console.log('   Saved image to public/richmenu.jpg and bot-service/public/richmenu.jpg');

  console.log('2. Querying existing Rich Menus from LINE API...');
  const listRes = await fetch('https://api.line.me/v2/bot/richmenu/list', {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` }
  });
  const listData = await listRes.json();
  console.log(`   Found ${listData.richmenus ? listData.richmenus.length : 0} existing rich menus`);

  if (listData.richmenus && listData.richmenus.length > 0) {
    for (const rm of listData.richmenus) {
      console.log(`   Deleting old menu: ${rm.richMenuId} (${rm.name})...`);
      await fetch(`https://api.line.me/v2/bot/richmenu/${rm.richMenuId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${LINE_TOKEN}` }
      });
    }
  }

  console.log('3. Creating new Rich Menu specification...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINE_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(RICH_MENU_SPEC)
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.richMenuId) {
    console.error('Failed to create rich menu:', createData);
    process.exit(1);
  }
  const richMenuId = createData.richMenuId;
  console.log(`   Created Rich Menu ID: ${richMenuId}`);

  console.log('4. Uploading Rich Menu image to LINE API...');
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINE_TOKEN}`,
      'Content-Type': 'image/jpeg'
    },
    body: imageBuffer
  });
  if (!uploadRes.ok) {
    const uploadErr = await uploadRes.text();
    console.error('Failed to upload image:', uploadErr);
    process.exit(1);
  }
  console.log('   Image upload successful!');

  console.log('5. Setting as default Rich Menu for all users...');
  const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}` }
  });
  if (!defaultRes.ok) {
    const defErr = await defaultRes.text();
    console.error('Failed to set default rich menu:', defErr);
    process.exit(1);
  }
  console.log('   Set default rich menu successful!');

  console.log('6. Verifying active default Rich Menu...');
  const checkRes = await fetch('https://api.line.me/v2/bot/user/all/richmenu', {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` }
  });
  const checkData = await checkRes.json();
  console.log('   Active default Rich Menu on LINE:', JSON.stringify(checkData));

  console.log('=== SETUP COMPLETE! ===');
  console.log('All customers now have direct 1-tap access to Main Menu, Ordering, Paotang Payment Guide, and AI Dream Prediction docked at the bottom of their LINE chat!');
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
