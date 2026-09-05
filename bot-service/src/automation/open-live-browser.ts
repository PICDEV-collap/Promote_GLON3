import { PersistentBrowserManager } from './browser-context';
import { SecurityGuard } from './security-guard';
import { CONFIG } from '../config';
import readline from 'readline';

async function openLiveBrowserForDealer() {
  console.log('===================================================================');
  console.log('       OPENING LIVE PERSISTENT BROWSER FOR N3 DEALER LOGIN         ');
  console.log('===================================================================');
  console.log('กำลังเปิดหน้าต่าง Chrome ขึ้นมาบนหน้าจอคอมของคุณ...');

  // ใช้ Persistent Context เพื่อให้ Chrome จำ Session ลงดิสก์ถาวร
  const { context, page } = await PersistentBrowserManager.getPage(false);
  const security = new SecurityGuard();
  security.attachToPage(page);

  try {
    console.log('กำลังเปิดหน้าเว็บ N3: https://n3.glolotteryshop.com/login/');
    await page.goto(CONFIG.N3_LOGIN_URL, { waitUntil: 'networkidle' });

    console.log('\n>>> คำแนะนำ: <<<');
    console.log('1. คลิกปุ่ม "เข้าสู่ระบบด้วยแอปฯ เป๋าตัง"');
    console.log('2. นำแอปเป๋าตังในมือถือมาสแกน QR Code');
    console.log('3. เมื่อเข้าสู่ระบบสำเร็จ (เห็นชื่อร้าน "ธนกิจนำโชค") ให้คลิกที่กล่อง "สลากตัวเลข สามหลัก"');
    console.log('4. หน้าต่างนี้จะไม่ปิดตัวเองอัตโนมัติ คุณสามารถดูหน้าจอขายสลากได้เต็มที่!');
    console.log('5. เมื่อต้องการปิดและเริ่มรันบอท ให้กลับมากดปุ่ม Enter ในหน้าจอดำนี้\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise<void>(resolve => {
      rl.question('--> เมื่อคุณล็อกอินและดูหน้าขายสลากเสร็จแล้ว ให้กด [Enter] เพื่อบันทึกโปรไฟล์และปิด: ', () => {
        rl.close();
        resolve();
      });
    });

    console.log('🎉 บันทึกโปรไฟล์การล็อกอินลงดิสก์เรียบร้อยแล้ว!');

  } catch (err) {
    console.error('[ERROR]', err);
  } finally {
    await PersistentBrowserManager.terminateBrowserProcess();
    console.log('ปิดเบราว์เซอร์เรียบร้อย ข้อมูลการล็อกอินถูกจำไว้ในเครื่องแล้วครับ');
  }
}

openLiveBrowserForDealer();
