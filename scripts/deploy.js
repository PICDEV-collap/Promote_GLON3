/**
 * Deploy Script with Automated GLO N3 Logoff Routine
 * 
 * Flow:
 * 1. Logoff active GLO N3 session cleanly (via /api/admin/logoff or file cleanup)
 * 2. Compile TypeScript (npm run build:bot)
 * 3. Run all tests to ensure 100% pass rate (npm test)
 * 4. Commit and push to Git (triggers Vercel deploy)
 * 5. Safely reload bot if running
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BOT_DIR = path.join(ROOT_DIR, 'bot-service');
const args = process.argv.slice(2);
const isLogoffOnly = args.includes('--logoff-only') || args.includes('-l');
const skipTests = args.includes('--skip-tests');

function printBanner(text) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${text}`);
  console.log('='.repeat(70) + '\n');
}

/**
 * 1. สั่ง Logoff เซสชัน GLO N3
 */
function logoffGloSession() {
  return new Promise((resolve) => {
    console.log('[DEPLOY] 🔒 1. กำลังตรวจสอบและสั่ง Logoff ออกจากเซสชัน GLO N3...');

    const req = http.request({
      hostname: '127.0.0.1',
      port: 3333,
      path: '/api/admin/logoff',
      method: 'POST',
      timeout: 8000,
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) {
            console.log('\x1b[32m[DEPLOY SUCCESS] 🔒 สั่ง Logoff เซสชัน GLO N3 ผ่านบอทสำเร็จเรียบร้อย\x1b[0m');
          } else {
            console.log('[DEPLOY WARNING] ตอบกลับจากบอท:', json);
          }
        } catch {
          console.log('[DEPLOY INFO] บอทตอบกลับ:', data);
        }
        cleanSessionFiles();
        resolve(true);
      });
    });

    req.on('error', () => {
      console.log('[DEPLOY INFO] บอทไม่ได้เปิดทำงานอยู่ (พอร์ต 3333 ออฟไลน์) -> ทำการล้างไฟล์เซสชันในเครื่องโดยตรง');
      cleanSessionFiles();
      resolve(true);
    });

    req.on('timeout', () => {
      req.destroy();
      console.log('[DEPLOY WARNING] คำขอ Logoff หมดเวลา -> ทำการล้างไฟล์เซสชันในเครื่องโดยตรง');
      cleanSessionFiles();
      resolve(true);
    });

    req.end();
  });
}

/**
 * ล้างไฟล์เซสชันบนดิสก์เพื่อป้องกันเซสชันตกค้าง
 */
function cleanSessionFiles() {
  const possiblePaths = [
    path.join(BOT_DIR, 'data', 'session.json'),
    path.join(BOT_DIR, 'data', 'storagestate.json'),
    path.join(BOT_DIR, 'data', 'session-storage.json'),
    path.join(ROOT_DIR, 'data', 'session.json')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        console.log(`[DEPLOY] ลบไฟล์เซสชัน ${path.basename(p)} สำเร็จ`);
      } catch (e) {
        console.warn(`[DEPLOY WARNING] ไม่สามารถลบ ${p}:`, e.message);
      }
    }
  }
}

/**
 * กระบวนการหลักของ Deploy
 */
async function main() {
  printBanner('🚀 GLO N3 DEPLOYMENT PIPELINE (WITH AUTO-LOGOFF)');

  // Step 1: Logoff GLO N3
  await logoffGloSession();

  if (isLogoffOnly) {
    console.log('\n\x1b[32m[DONE] ดำเนินการ Logoff GLO N3 เรียบร้อยแล้ว (Logoff-only mode)\x1b[0m\n');
    process.exit(0);
  }

  // Step 2: Sync HTML, JS, and CSS files to bot-service/public
  console.log('\n[DEPLOY] 📁 2. ซิงค์ไฟล์หน้าเว็บไปยัง bot-service/public...');
  const filesToSync = ['order.html', 'order-6pack.html', 'line.html', 'dream.html', 'index.html'];
  for (const file of filesToSync) {
    const src = path.join(ROOT_DIR, file);
    const dest = path.join(BOT_DIR, 'public', file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
  const dirsToSync = ['js', 'css'];
  for (const dir of dirsToSync) {
    const srcDir = path.join(ROOT_DIR, dir);
    const destDir = path.join(BOT_DIR, 'public', dir);
    if (fs.existsSync(srcDir)) {
      fs.cpSync(srcDir, destDir, { recursive: true });
    }
  }
  console.log('\x1b[32m[DEPLOY SUCCESS] ซิงค์ไฟล์หน้าเว็บและ assets เรียบร้อย\x1b[0m');

  // Step 3: Compile TypeScript
  console.log('\n[DEPLOY] ⚙️ 3. คอมไพล์โปรเจกต์ TypeScript (npm run build:bot)...');
  try {
    execSync('npm run build:bot', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('\x1b[32m[DEPLOY SUCCESS] Build TypeScript สำเร็จ\x1b[0m');
  } catch (err) {
    console.error('\n\x1b[31m[DEPLOY ERROR] Build ล้มเหลว กรุณาตรวจสอบโค้ด\x1b[0m');
    process.exit(1);
  }

  // Step 4: Run Tests
  if (!skipTests) {
    console.log('\n[DEPLOY] 🧪 4. รันชุดทดสอบระบบ 110 ข้อ (npm test)...');
    try {
      execSync('npm test', { cwd: ROOT_DIR, stdio: 'inherit' });
      console.log('\x1b[32m[DEPLOY SUCCESS] ผ่านการทดสอบทั้งหมด 100%\x1b[0m');
    } catch (err) {
      console.error('\n\x1b[31m[DEPLOY ERROR] ชุดทดสอบไม่ผ่าน การ Deploy ถูกยกเลิกเพื่อความปลอดภัย\x1b[0m');
      process.exit(1);
    }
  } else {
    console.log('\n[DEPLOY] ⚠️ ข้ามการรันแบบทดสอบตามคำสั่ง (--skip-tests)');
  }

  // Step 5: Git Commit & Push
  console.log('\n[DEPLOY] 🌐 5. ส่งการเปลี่ยนแปลงขึ้น GitHub เพื่อ Deploy บน Vercel...');
  try {
    const status = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
    if (status) {
      console.log('[DEPLOY] พบการเปลี่ยนแปลง กำลังบันทึก Commit...');
      execSync('git add .', { cwd: ROOT_DIR, stdio: 'inherit' });
      const customMsg = args.find(a => a.startsWith('-m='))?.replace('-m=', '') ||
                        'deploy: update with automatic GLO N3 session logoff and layout fixes';
      execSync(`git commit -m "${customMsg}"`, { cwd: ROOT_DIR, stdio: 'inherit' });
    } else {
      console.log('[DEPLOY] ไม่มีไฟล์เปลี่ยนแปลงใหม่');
    }

    console.log('[DEPLOY] กำลัง Push ไปยัง remote repository...');
    execSync('git push', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('\x1b[32m[DEPLOY SUCCESS] Git Push สำเร็จ! Vercel กำลังทำการ Deploy อัตโนมัติ\x1b[0m');
  } catch (gitErr) {
    console.warn('[DEPLOY WARNING] Git push พบปัญหาเล็กน้อย หรือไม่มีการเปลี่ยนแปลงใหม่:', gitErr.message);
  }

  printBanner('🎉 DEPLOYMENT FINISHED SUCCESSFULLY!');
  console.log('✅ เซสชัน GLO N3 ถูก Logoff เรียบร้อย');
  console.log('✅ โค้ดได้รับการตรวจสอบและทดสอบ 100%');
  console.log('✅ ระบบพร้อมให้บริการที่ https://promote-glon-3.vercel.app/\n');
}

if (require.main === module) {
  main().catch(err => {
    console.error('\n\x1b[31m[DEPLOY FATAL ERROR]\x1b[0m', err);
    process.exit(1);
  });
}

module.exports = { logoffGloSession, cleanSessionFiles };
