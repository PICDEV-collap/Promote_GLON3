import { CustomerProfile, CustomerLuckyRecord } from '../storage/customer-registry';

export interface DistributedLuckyItem {
  userId: string;
  displayName?: string;
  drawDate: string;
  drawDateThai: string;
  number: string;
  tods: string[];
  n2: string;
  blessing: string;
  element: string;
  elementColor: string;
  quickOrderCommand: string;
  comboOrderCommand: string;
}

/**
 * เมล็ดพันธุ์การสุ่มแบบ Mulberry32 PRNG (Deterministic & Even Distribution)
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * แปลง String วันที่ให้เป็นตัวเลข Seed สำหรับ PRNG
 */
function hashStringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 12345;
}

export class LuckyDistributor {
  private static auspiciousBlessings = [
    'เทพยดาเปิดทางทรัพย์ ลาภลอยหนุนนำ ค้าขายมั่งคั่ง',
    'ดาวศุภเคราะห์ให้โชคใหญ่ มหาเศรษฐีรับทรัพย์ก้อนโต',
    'บารมีพูนผล วาสนายิ่งใหญ่ เงินทองไหลมาเทมาดั่งสายน้ำ',
    'ธาตุทองเกื้อหนุนดวงชะตา มีโชคฉับพลัน ลาภยศบริบูรณ์',
    'ดาวราหูเปิดขุมทรัพย์ เลขมหาเสน่ห์ เหนี่ยวทรัพย์เข้ากระเป๋า',
    'ดวงการเงินเปิดสว่าง โชคลาภพุ่งตรง สมหวังทุกประการ',
    'มงคลมหาโชค หนุนดวงการเสี่ยงทาย รับทรัพย์รับโชคใหญ่',
    'เปิดคลังสมบัติ ปลดหนี้ทวีทรัพย์ โชคดีตลอดทั้งงวด'
  ];

  private static elements = [
    { name: 'ธาตุทอง', color: '#f59e0b', blessingPrefix: '✨ ธาตุทองประกายสิริมงคล' },
    { name: 'ธาตุน้ำ', color: '#06b6d4', blessingPrefix: '🌊 ธาตุน้ำหลั่งไหลดูดทรัพย์' },
    { name: 'ธาตุไม้', color: '#10b981', blessingPrefix: '🌿 ธาตุไม้งอกงามเจริญรุ่งเรือง' },
    { name: 'ธาตุไฟ', color: '#ef4444', blessingPrefix: '🔥 ธาตุไฟพลังงานมหาโชค' },
    { name: 'ธาตุดิน', color: '#d97706', blessingPrefix: '🏔️ ธาตุดินมั่นคงมั่งคั่งถาวร' }
  ];

  /**
   * สร้างชุดตัวเลข 3 หลักที่เป็นไปได้ทั้งหมด (000 - 999) จำนวน 1,000 หมายเลข
   */
  public static generateFullPool(): string[] {
    const pool: string[] = [];
    for (let i = 0; i < 1000; i++) {
      pool.push(String(i).padStart(3, '0'));
    }
    return pool;
  }

  /**
   * คำนวณชุดเลขโต๊ด (สลับหลักทั้งหมดที่ไม่ซ้ำกับเลขตรง)
   */
  public static calculateTods(numStr: string): string[] {
    const d = numStr.split('');
    const permutations = [
      `${d[0]}${d[1]}${d[2]}`,
      `${d[0]}${d[2]}${d[1]}`,
      `${d[1]}${d[0]}${d[2]}`,
      `${d[1]}${d[2]}${d[0]}`,
      `${d[2]}${d[0]}${d[1]}`,
      `${d[2]}${d[1]}${d[0]}`
    ];
    // กรองเฉพาะค่าที่ไม่ซ้ำและไม่ตรงกับตัวเลขตรง
    const unique = Array.from(new Set(permutations));
    return unique.filter(n => n !== numStr);
  }

  /**
   * กระจายสุ่มเลขมงคลให้ลูกค้าแต่ละคนอย่างเป็นธรรม (Non-Colliding Shuffled Bucket)
   * รับประกันว่าลูกค้าแต่ละคนจะได้รับตัวเลขที่ไม่ซ้ำกัน ไม่กระจุกตัวที่เลขใดเลขหนึ่ง
   */
  public static distributeLuckyNumbers(
    customers: CustomerProfile[],
    drawDate: string,
    drawDateThai: string
  ): DistributedLuckyItem[] {
    if (!customers || customers.length === 0) return [];

    // 1. สร้าง Pool ตัวเลข 1,000 หมายเลข (000-999)
    const pool = this.generateFullPool();

    // 2. สับเปลี่ยนลำดับตัวเลข (Fisher-Yates Shuffle) โดยใช้ Seed จากงวดวันที่ + ข้อความนำโชค
    const seed = hashStringToSeed(`${drawDate}-GLO-N3-LUCKY-PROSPERITY`);
    const random = mulberry32(seed);

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const assignedNumbers: DistributedLuckyItem[] = [];
    const usedInThisRound = new Set<string>();

    // 3. วนจ่ายหมายเลขให้ลูกค้าแต่ละคน
    let poolIndex = 0;
    for (const customer of customers) {
      // ตรวจสอบว่าในงวดที่แล้วลูกค้าเคยได้เลขอะไร หากเลขจาก Pool ตรงกับงวดก่อน ให้ขยับไปเลขถัดไป
      const lastAssignment = customer.assignedLuckyNumbers ? Object.values(customer.assignedLuckyNumbers).pop() : undefined;
      const previousNumber = lastAssignment?.number;

      let chosenNumber = pool[poolIndex % pool.length];
      poolIndex++;

      // หากชนกับเลขงวดก่อนและยังมีตัวเลือกเหลือ ให้เลื่อนไปเอาเลขตัวถัดไป
      if (chosenNumber === previousNumber && pool.length > 1) {
        chosenNumber = pool[poolIndex % pool.length];
        poolIndex++;
      }

      usedInThisRound.add(chosenNumber);

      const tods = this.calculateTods(chosenNumber);
      const n2 = chosenNumber.slice(1);

      // สุ่มคำทำนายและธาตุโดยอิงจากตัวเลขและ User ID ให้สอดคล้องกัน
      const itemSeed = hashStringToSeed(`${customer.userId}-${chosenNumber}`);
      const elem = this.elements[itemSeed % this.elements.length];
      const blessingText = this.auspiciousBlessings[itemSeed % this.auspiciousBlessings.length];
      const fullBlessing = `${elem.blessingPrefix} • ${blessingText}`;

      // คำสั่งพิมพ์สั่งซื้อด่วน
      const quickOrderCommand = `${chosenNumber}=1`;
      const comboNumbers = [chosenNumber, ...tods];
      const comboOrderCommand = comboNumbers.map(n => `${n}=1`).join(', ');

      assignedNumbers.push({
        userId: customer.userId,
        displayName: customer.displayName,
        drawDate,
        drawDateThai,
        number: chosenNumber,
        tods,
        n2,
        blessing: fullBlessing,
        element: elem.name,
        elementColor: elem.color,
        quickOrderCommand,
        comboOrderCommand
      });
    }

    return assignedNumbers;
  }

  /**
   * สุ่มเลขเดี่ยวสำหรับคนเดียว (เช่น แอดมินกดทดสอบดูตัวอย่าง)
   */
  public static generateSingleLuckyItem(
    userId: string,
    drawDate: string,
    drawDateThai: string,
    displayName?: string
  ): DistributedLuckyItem {
    const dummy: CustomerProfile = {
      userId,
      displayName,
      status: 'active',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      totalOrders: 0,
      assignedLuckyNumbers: {}
    };

    // ใช้ timestamp ปัจจุบันช่วย randomize เมื่อเป็นโหมดทดสอบ
    const items = this.distributeLuckyNumbers([dummy], `${drawDate}-${Date.now()}`, drawDateThai);
    return items[0];
  }
}
