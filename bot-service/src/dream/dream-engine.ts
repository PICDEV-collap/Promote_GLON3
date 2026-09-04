import * as path from 'path';
import * as fs from 'fs';

export interface DreamPredictionResult {
  dreamText: string;
  element: string;
  n3Direct: string;
  n3Tod: string;
  allTods: string[];
  n2Digit: string;
  confidence: string;
  meaning: string;
  blessing: string;
  matchedSymbols: string;
  poem: string;
  explicitFound?: boolean;
}

export interface DreamPromptAnalysis {
  hasDreamContent: boolean;
  cleanedText: string;
  isGenericRequest: boolean;
}

class DreamEngineService {
  private static instance: DreamEngineService;
  private engine: any = null;

  private constructor() {
    this.loadEngine();
  }

  public static getInstance(): DreamEngineService {
    if (!DreamEngineService.instance) {
      DreamEngineService.instance = new DreamEngineService();
    }
    return DreamEngineService.instance;
  }

  private loadEngine(): void {
    const candidatePaths = [
      path.resolve(__dirname, '../../../js/ai-dream-engine.js'), // from dist/dream/
      path.resolve(__dirname, '../../../../js/ai-dream-engine.js'),
      path.resolve(__dirname, '../../js/ai-dream-engine.js'),    // from src/dream/
      path.resolve(process.cwd(), 'js/ai-dream-engine.js'),
      path.resolve(process.cwd(), '../js/ai-dream-engine.js')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          this.engine = require(p);
          console.log(`[DREAM ENGINE] โหลด AI Dream Engine สำเร็จจาก: ${p}`);
          return;
        } catch (err) {
          console.error(`[DREAM ENGINE ERROR] โหลด engine ไม่สำเร็จจาก ${p}:`, err);
        }
      }
    }

    console.warn('[DREAM ENGINE WARN] ไม่พบไฟล์ js/ai-dream-engine.js จะใช้ mock engine สำรอง');
  }

  public analyzeDreamPrompt(userText: string): DreamPromptAnalysis {
    const trimmed = (userText || '').trim();
    if (!trimmed) {
      return { hasDreamContent: false, cleanedText: '', isGenericRequest: true };
    }

    // 1. Strip trailing polite particles and filler suffixes
    const politeSuffixPattern = /(?:[\s,.-]*(?:ให้หน่อย|หน่อย|ที|ด้วย|ครับ|ค่ะ|คะ|ค้าบ|คับ|จ้า|จ้ะ|จ๋า|ฮะ|นะคะ|นะครับ|นะ|ด้วยครับ|ด้วยค่ะ))+$/i;
    const withoutPolite = trimmed.replace(politeSuffixPattern, '').trim();

    // 2. Pure generic request pattern (with or without polite/helper prefixes)
    const genericPattern = /^(?:(?:ช่วย|ขอ|กรุณา|รบกวน)?\s*(?:ทำนายฝัน|ทำนายความฝัน|ทำนาย|แปลฝัน|แปลความฝัน|ดูดวง|ดูความฝัน|ดูฝัน|ฝัน|ความฝัน)|(?:ขอ|หา)?\s*เลขเด็ด(?:\s*ai)?|(?:ขอ|หา)\s*เลข(?:เด็ด)?|ทำนายฝันai)$/i;
    if (!withoutPolite || genericPattern.test(withoutPolite)) {
      return {
        hasDreamContent: false,
        cleanedText: '',
        isGenericRequest: true
      };
    }

    // 3. Conversational openers without substantive dream content (e.g. "เมื่อคืนฝัน", "เมื่อวานฝันว่า", "ผมฝัน", "หนูฝันว่า")
    const openerOnlyPattern = /^(?:(?:เมื่อคืน(?:นี้)?|เมื่อวาน(?:นี้)?|เมื่อกี้|เมื่อเช้า)\s*(?:ผม|หนู|ฉัน|เรา|เค้า)?\s*(?:ฝันว่า|ฝันเห็น|ฝัน|ความฝัน)?|(?:ผม|หนู|ฉัน|เรา|เค้า)\s*(?:ฝันว่า|ฝันเห็น|ฝัน))$/i;
    if (openerOnlyPattern.test(withoutPolite)) {
      return {
        hasDreamContent: false,
        cleanedText: '',
        isGenericRequest: true
      };
    }

    // 4. Strip leading service prefixes (e.g. "ช่วยทำนายฝันหน่อย", "ทำนายฝันให้หน่อย:", "ช่วยแปลฝัน:")
    let cleaned = withoutPolite
      .replace(/^(?:(?:ช่วย|ขอ|กรุณา|รบกวน)?\s*(?:ทำนายฝัน|ทำนายความฝัน|ทำนาย|แปลฝัน|แปลความฝัน|ดูความฝัน|ดูฝัน|ช่วยแปล|ช่วยดู|ช่วยทำนาย|ดูดวง)\s*(?:ให้หน่อย|หน่อย|ที|ด้วย|จ้า|จ้ะ|ครับ|ค่ะ|คะ|คับ|ค้าบ|ฮะ|นะครับ|นะคะ)*)\s*[:,\s-]*\s*/i, '')
      .trim();

    // 5. Re-check if remaining text consists only of polite particles / filler words / generic keywords
    const onlyParticlesPattern = /^(?:หน่อย|ให้หน่อย|ที|ครับ|ค่ะ|คะ|ค้าบ|คับ|จ้า|จ้ะ|จ๋า|ฮะ|นะ|นะคะ|นะครับ|ด้วย|ด้วยครับ|ด้วยค่ะ|ฝัน|ความฝัน|เลขเด็ด|ขอเลขเด็ด)$/i;
    if (!cleaned || onlyParticlesPattern.test(cleaned) || openerOnlyPattern.test(cleaned)) {
      return {
        hasDreamContent: false,
        cleanedText: '',
        isGenericRequest: true
      };
    }

    const hasContent = cleaned.length >= 2;

    return {
      hasDreamContent: hasContent,
      cleanedText: hasContent ? cleaned : trimmed,
      isGenericRequest: !hasContent
    };
  }

  public predictDream(dreamText: string): DreamPredictionResult {
    if (this.engine && typeof this.engine.generatePrediction === 'function') {
      try {
        return this.engine.generatePrediction(dreamText);
      } catch (e) {
        console.error('[DREAM ENGINE] เกิดข้อผิดพลาดขณะวิเคราะห์:', e);
      }
    }

    const fallbackDirect = '789';
    return {
      dreamText: dreamText || 'ความฝันมงคล',
      element: 'ธาตุน้ำ / ดาวศุกร์ (๖)',
      n3Direct: fallbackDirect,
      n3Tod: '798, 879, 897',
      allTods: ['798', '879', '897', '978', '987'],
      n2Digit: '89',
      confidence: '95.5%',
      meaning: `ความฝันเกี่ยวกับ "${dreamText}" สื่อถึงนิมิตมงคลแห่งโชคลาภ ทรัพย์สินจะหลั่งไหลเข้ามาอย่างต่อเนื่อง`,
      blessing: 'แนะนำให้ทำบุญถวายสังฆทานและกรวดน้ำเพื่อเปิดดวงรับทรัพย์ใหญ่ N3',
      matchedSymbols: 'นิมิตมงคล',
      poem: `นิมิตฝันแห่งโชคลาภพาพบสุข / สิ่งศักดิ์สิทธิ์ปลดเปลื้องทุกข์ดับตัณหา\nเลขมงคล ${fallbackDirect} เด่นในสายตา / รับทรัพย์ใหญ่สลาก N3 สมดั่งใจ`,
      explicitFound: false
    };
  }
}

export const DreamEngine = DreamEngineService.getInstance();
