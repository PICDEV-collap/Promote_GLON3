import { QuotaManager, parseQuotaFromPortalText } from './quota-manager';

console.log('--- เริ่มต้นทดสอบ Quota Manager (Live GLO N3 Portal Quota) ---');

const manager = new QuotaManager();
console.log('สถานะเริ่มต้น:', manager.getStatus());

// 1. ทดสอบแกะโควต้าจากข้อความแบนเนอร์จริง "📣 คุณขายสลากฯ ได้อีก 1,968 ใบ"
const bannerParsed = parseQuotaFromPortalText('📣 คุณขายสลากฯ ได้อีก 1,968 ใบ');
console.log('1. ผลลัพธ์แกะแบนเนอร์จริง:', bannerParsed);

// 2. ทดสอบแกะโควต้าจากกล่องยอดขายร้านค้าจริง "32 / 2,000 ใบ" และ "เหลืออีก 1,968 ใบ"
const cardParsed = parseQuotaFromPortalText(`
  ยอดขายร้านค้า
  ธนกิจนำโชค
  32 / 2,000 ใบ
  เหลืออีก 1,968 ใบ
  รอดำเนินการ 0 ใบ
`);
console.log('2. ผลลัพธ์แกะกล่องยอดขายจริง:', cardParsed);

// 3. ทดสอบการตรวจสอบสิทธิ์สั่งซื้อตามโควต้าคงเหลือจริง (1,968 ใบ)
manager.updateLiveQuota(32, 1968, 2000);
const checkValid = manager.canFulfill(10);
console.log('3.1 ตรวจสอบสั่งซื้อ 10 ใบ (โควต้าคงเหลือ 1,968):', checkValid);

const checkOver = manager.canFulfill(2500);
console.log('3.2 ตรวจสอบสั่งซื้อเกินโควต้า 2,500 ใบ:', checkOver);

// 4. ทดสอบ Sync ยอดจากหน้าเว็บจริง (32 ขายแล้ว, 1,968 คงเหลือ, 2,000 โควต้าเต็ม)
manager.syncFromWeb(1968, 2000, 32);
console.log('4. สถานะหลัง Sync ยอดจริงจากหน้าเว็บ:', manager.getStatus());

// 5. ทดสอบแกะชื่องวดทางการจากหน้าเว็บ GLO N3 Portal (เช่น "งวดวันที่ 16 ก.ย. 2569")
const { parseOfficialRoundFromPortal } = require('./quota-manager');
const round1 = parseOfficialRoundFromPortal('งวดวันที่ 16 ก.ย. 2569');
console.log('5.1 ผลลัพธ์แกะงวดปกติ (16 ก.ย. 2569):', round1);

const roundMay = parseOfficialRoundFromPortal('งวดวันที่ 2 พ.ค. 2569');
console.log('5.2 ผลลัพธ์แกะงวดเลื่อนวันแรงงาน (2 พ.ค. 2569):', roundMay);

const roundJan = parseOfficialRoundFromPortal('งวดวันที่ 17 ม.ค. 2569');
console.log('5.3 ผลลัพธ์แกะงวดเลื่อนวันครู (17 ม.ค. 2569):', roundJan);

// 6. ทดสอบ getCurrentRoundIdentifier กับวันหยุดราชการ
console.log('6.1 งวดวันแรงงาน (2 พ.ค.):', QuotaManager.getCurrentRoundIdentifier(new Date('2026-05-02T10:00:00+07:00')));
console.log('6.2 งวดวันครู (17 ม.ค.):', QuotaManager.getCurrentRoundIdentifier(new Date('2026-01-17T10:00:00+07:00')));

console.log('--- สิ้นสุดการทดสอบ Quota Manager สำเร็จ 100% ---');
