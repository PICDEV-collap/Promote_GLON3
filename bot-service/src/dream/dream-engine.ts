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

    const genericPattern = /^(?:ทำนายฝัน|ทำนาย|ฝัน|เลขเด็ด|เลขเด็ด\s*ai|หาเลข|หาเลขเด็ด|ทำนายฝันai)$/i;
    if (genericPattern.test(trimmed)) {
      return {
        hasDreamContent: false,
        cleanedText: '',
        isGenericRequest: true
      };
    }

    let cleaned = trimmed
      .replace(/^(?:ช่วยทำนายฝัน(?:ให้หน่อย|ที|ค้าบ|ครับ|คะ|ค่ะ)?|ช่วยทำนาย(?:ให้หน่อย|ที)?|ทำนายฝัน(?:ให้หน่อย|ที)?|ทำนาย(?:ให้หน่อย|ที)?|ช่วยดูความฝัน|ช่วยแปลฝัน)\s*[:,\s-]*\s*/i, '')
      .trim();

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
