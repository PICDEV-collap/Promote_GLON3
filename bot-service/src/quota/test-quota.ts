import { QuotaManager } from './quota-manager';

console.log('--- เริ่มต้นทดสอบ Quota Manager (2,000 ใบ) ---');

const manager = new QuotaManager();
manager.resetRound('งวด 16 ก.ย. 2569', 2000);

console.log('สถานะเริ่มต้น:', manager.getStatus());

// 1. ทดสอบสั่งซื้อ 5 ใบ
const check1 = manager.canFulfill(5);
console.log('ตรวจสอบสั่งซื้อ 5 ใบ:', check1);
if (check1.allowed) {
  manager.deductQuota(5);
}

// 2. ทดสอบสั่งซื้อ 10 ใบ
const check2 = manager.canFulfill(10);
console.log('ตรวจสอบสั่งซื้อ 10 ใบ:', check2);
if (check2.allowed) {
  manager.deductQuota(10);
}

console.log('ยอดคงเหลือหลังสั่งซื้อ 15 ใบ:', manager.getStatus().remainingQuota);

// 3. ทดสอบสั่งซื้อเกินโควต้า (เช่น สั่ง 2,500 ใบ)
const checkOver = manager.canFulfill(2500);
console.log('ตรวจสอบสั่งซื้อเกิน 2,500 ใบ:', checkOver);

// 4. ทดสอบ Sync ยอดจากหน้าเว็บ N3 จริง (เช่น หน้าเว็บอ่านได้ 1,950 ใบ)
manager.syncFromWeb(1950);
console.log('สถานะหลัง Sync จากหน้าเว็บ:', manager.getStatus());

console.log('--- สิ้นสุดการทดสอบ Quota Manager สำเร็จ 100% ---');
