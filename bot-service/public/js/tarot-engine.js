/* ==========================================================================
   GLO N3 - AI Daily Tarot & Birthday Horoscope Numerology Engine
   22 Major Arcana Cards + Astro-Horoscope Synthesis
   ========================================================================== */

const TarotEngine = (function () {
  const tarotCards = [
    { id: 0, name: 'The Fool (คนเจ้าสำราญ)', icon: '🃏', digit: '0', element: 'ธาตุลม', fortune: 'การเริ่มต้นใหม่ที่ไม่คาดคิด โชคลาภจะมาจากความกล้าลองเสี่ยงสิ่งใหม่' },
    { id: 1, name: 'The Magician (ผู้วิเศษ)', icon: '🪄', digit: '1', element: 'ธาตุลม', fortune: 'มีพลังดลบันดาลให้เกิดโชคลาภ ปัญญาเฉียบแหลม หยิบจับอะไรก็เป็นเงินทอง' },
    { id: 2, name: 'The High Priestess (ราชินีพระจันทร์)', icon: '🌙', digit: '2', element: 'ธาตุน้ำ', fortune: 'ลางสังหรณ์แม่นยำดั่งตาเห็น ความฝันและจิตใต้สำนึกจะให้โชคใหญ่ N3' },
    { id: 3, name: 'The Empress (จักรพรรดินี)', icon: '👑', digit: '3', element: 'ธาตุดิน', fortune: 'ความอุดมสมบูรณ์พูนทวี ลาภผลก้อนโต โชคลาภจากเพศหญิงหรือมารดา' },
    { id: 4, name: 'The Emperor (จักรพรรดิ)', icon: '🏛️', digit: '4', element: 'ธาตุไฟ', fortune: 'บารมีสูงส่ง ผู้ใหญ่หนุนนำ มหาโชคจากความมั่นคงและตำแหน่งหน้าที่' },
    { id: 5, name: 'The Hierophant (พระสังฆราช)', icon: '☸️', digit: '5', element: 'ธาตุดิน', fortune: 'สิ่งศักดิ์สิทธิ์คุ้มครอง เลขเด็ดจากวัด พระเกจิ หรือบุญบารมีที่สั่งสม' },
    { id: 6, name: 'The Lovers (คู่รักมหาเสน่ห์)', icon: '💖', digit: '6', element: 'ธาตุลม', fortune: 'โชคลาภจากคนรักหรือคู่ครอง เมตตามหานิยมดึงดูดทรัพย์เข้าหา' },
    { id: 7, name: 'The Chariot (อัศวินรถศึก)', icon: '⚔️', digit: '7', element: 'ธาตุน้ำ', fortune: 'การต่อสู้ฟันฝ่าที่จะนำมาซึ่งชัยชนะ โชคลาภจากการเดินทางและยานพาหนะ' },
    { id: 8, name: 'Strength (หญิงผู้แกร่งกล้า)', icon: '🦁', digit: '8', element: 'ธาตุไฟ', fortune: 'พลังใจเข้มแข็ง ชนะอุปสรรคทั้งปวง ลาภลอยก้อนใหญ่ที่ต้องใช้ความมั่นใจ' },
    { id: 9, name: 'The Hermit (ผู้รู้แจ้ง)', icon: '🕯️', digit: '9', element: 'ธาตุดิน', fortune: 'ปัญญาญาณหยั่งรู้ ความเงียบสงบนำพาเลขนำโชค สมาธิตั้งมั่นรับทรัพย์' },
    { id: 10, name: 'Wheel of Fortune (กงล้อแห่งโชคชะตา)', icon: '🎡', digit: '0', element: 'ธาตุไฟ', fortune: 'โชคชะตาพลิกผันสู่ความร่ำรวย ลาภลอยมหาศาล สลาก N3 นำพาแจ็กพอต' },
    { id: 11, name: 'Justice (ตาชั่งแห่งความยุติธรรม)', icon: '⚖️', digit: '1', element: 'ธาตุลม', fortune: 'ผลกรรมดีกำลังตอบสนอง ได้รับส่วนแบ่งเงินรางวัลที่คู่ควร' },
    { id: 12, name: 'The Hanged Man (ผู้เสียสละ)', icon: '🧘', digit: '2', element: 'ธาตุน้ำ', fortune: 'การมองมุมกลับจะเห็นทางรวย ตัวเลขที่คนอื่นมองข้ามจะกลายเป็นเลขเด็ด' },
    { id: 13, name: 'Death (การสิ้นสุดเพื่อเกิดใหม่)', icon: '⚰️', digit: '3', element: 'ธาตุน้ำ', fortune: 'หมดเคราะห์หมดโศก ลาภลอยก้อนโตตรงข้ามกับภาพร้าย เปลี่ยนชีวิตสู่ความมั่งคั่ง' },
    { id: 14, name: 'Temperance (การประสมธาตุ)', icon: '🏺', digit: '4', element: 'ธาตุไฟ', fortune: 'การปรับสมดุลธาตุ โชคลาภจะไหลมาอย่างต่อเนื่องและสม่ำเสมอ' },
    { id: 15, name: 'The Devil (กิเลสและพลังดึงดูด)', icon: '😈', digit: '5', element: 'ธาตุดิน', fortune: 'เสน่ห์เย้ายวน พลังดึงดูดเงินทองมหาศาล ลาภลอยฉับพลันจากการเสี่ยงโชค' },
    { id: 16, name: 'The Tower (ฟ้าผ่าหอคอย)', icon: '⚡', digit: '6', element: 'ธาตุไฟ', fortune: 'การเปลี่ยนแปลงฉับพลันแบบฟ้าผ่า รับทรัพย์ก้อนโตแบบไม่ทันตั้งตัว' },
    { id: 17, name: 'The Star (ดวงดาวแห่งความหวัง)', icon: '⭐', digit: '7', element: 'ธาตุลม', fortune: 'แสงสว่างนำทาง ความสมหวังในสิ่งที่อธิษฐาน โชคใหญ่จากดาวจร' },
    { id: 18, name: 'The Moon (จันทร์เสี้ยวลึกลับ)', icon: '🌕', digit: '8', element: 'ธาตุน้ำ', fortune: 'นิมิตฝันและลางบอกเหตุในยามค่ำคืน จะกลายเป็นตัวเลข N3 ที่ถูกรางวัล' },
    { id: 19, name: 'The Sun (สุริยันรุ่งโรจน์)', icon: '☀️', digit: '9', element: 'ธาตุไฟ', fortune: 'มหาโชคลาภ ความสำเร็จอันสว่างไสวสูงสุด ถูกรางวัล 3 ตัวตรงรับทรัพย์เต็มที่' },
    { id: 20, name: 'Judgement (การฟื้นคืน)', icon: '🎺', digit: '0', element: 'ธาตุไฟ', fortune: 'การได้รับข่าวดี รางวัลใหญ่ที่รอคอยมานานกำลังปรากฏ' },
    { id: 21, name: 'The World (จักรวาลสมบูรณ์)', icon: '🌍', digit: '1', element: 'ธาตุดิน', fortune: 'ความสำเร็จครบทุกมิติ เงินทองไหลมาเทมา ปิดฉากความยากจนรับโชคใหญ่' }
  ];

  const zodiacSigns = [
    { name: 'ราศีเมษ (13 เม.ย. - 13 พ.ค.)', element: 'ธาตุไฟ', baseDigits: ['1', '9', '4'] },
    { name: 'ราศีพฤษภ (14 พ.ค. - 13 มิ.ย.)', element: 'ธาตุดิน', baseDigits: ['6', '5', '2'] },
    { name: 'ราศีเมถุน (14 มิ.ย. - 14 ก.ค.)', element: 'ธาตุลม', baseDigits: ['4', '7', '8'] },
    { name: 'ราศีกรกฎ (15 ก.ค. - 16 ส.ค.)', element: 'ธาตุน้ำ', baseDigits: ['2', '8', '7'] },
    { name: 'ราศีสิงห์ (17 ส.ค. - 16 ก.ย.)', element: 'ธาตุไฟ', baseDigits: ['1', '3', '9'] },
    { name: 'ราศีกันย์ (17 ก.ย. - 16 ต.ค.)', element: 'ธาตุดิน', baseDigits: ['4', '5', '6'] },
    { name: 'ราศีตุลย์ (17 ต.ค. - 15 พ.ย.)', element: 'ธาตุลม', baseDigits: ['6', '2', '8'] },
    { name: 'ราศีพิจิก (16 พ.ย. - 15 ธ.ค.)', element: 'ธาตุน้ำ', baseDigits: ['3', '8', '0'] },
    { name: 'ราศีธนู (16 ธ.ค. - 13 ม.ค.)', element: 'ธาตุไฟ', baseDigits: ['5', '9', '1'] },
    { name: 'ราศีมังกร (14 ม.ค. - 12 ก.พ.)', element: 'ธาตุดิน', baseDigits: ['7', '0', '4'] },
    { name: 'ราศีกุมภ์ (13 ก.พ. - 13 มี.ค.)', element: 'ธาตุลม', baseDigits: ['8', '7', '3'] },
    { name: 'ราศีมีน (14 มี.ค. - 12 เม.ย.)', element: 'ธาตุน้ำ', baseDigits: ['2', '9', '5'] }
  ];

  /**
   * Draw 3 Random Tarot Cards (Past / Present / Future)
   */
  function draw3Cards() {
    const shuffled = [...tarotCards].sort(() => 0.5 - Math.random());
    const card1 = shuffled[0];
    const card2 = shuffled[1];
    const card3 = shuffled[2];

    const d1 = card1.digit;
    const d2 = card2.digit;
    const d3 = card3.digit;
    const n3Direct = `${d1}${d2}${d3}`;

    const n3Tod = [`${d1}${d3}${d2}`, `${d2}${d1}${d3}`]
      .filter((v, i, a) => a.indexOf(v) === i && v !== n3Direct)
      .join(', ') || `${d3}${d2}${d1}`;

    const n2Digit = `${d2}${d3}`;

    return {
      cards: [
        { role: 'ใบที่ 1: อดีต & พลังหนุน', ...card1 },
        { role: 'ใบที่ 2: ปัจจุบัน & โอกาส', ...card2 },
        { role: 'ใบที่ 3: อนาคต & โชคลาภ', ...card3 }
      ],
      n3Direct,
      n3Tod,
      n2Digit,
      combinedFortune: `ไพ่ทั้งสามใบชี้ถึงพลัง ${card1.name} ผสานกับ ${card3.name} นำพาโชคใหญ่ N3 เลข ${n3Direct} มีโอกาสถูกรางวัลสูงในงวดนี้`
    };
  }

  /**
   * Calculate Birthday Zodiac Numerology
   */
  function calculateZodiacFortune(dayIndex, zodiacIndex) {
    const zodiac = zodiacSigns[zodiacIndex] || zodiacSigns[0];
    const digits = zodiac.baseDigits;
    const n3Direct = `${digits[0]}${digits[1]}${digits[2]}`;
    const n3Tod = `${digits[0]}${digits[2]}${digits[1]}, ${digits[1]}${digits[0]}${digits[2]}`;
    const n2Digit = `${digits[1]}${digits[2]}`;

    return {
      zodiacName: zodiac.name,
      element: zodiac.element,
      n3Direct,
      n3Tod,
      n2Digit,
      advice: `ชาว${zodiac.name} (${zodiac.element}) โชคลาภจะเด่นชัดเมื่อซื้อสลาก N3 ในช่วงบ่าย แนะนำทำบุญเสริมธาตุประจำตัว`
    };
  }

  return {
    tarotCards,
    zodiacSigns,
    draw3Cards,
    calculateZodiacFortune
  };
})();
