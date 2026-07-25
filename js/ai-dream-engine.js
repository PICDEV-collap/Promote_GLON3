/* ==========================================================================
   GLO N3 - AI Dream Interpreter & Numerology Engine
   Symbol Tokenizer, Astro-Numerology Algorithm, & N3 Ticket Generator
   ========================================================================== */

const AIDreamEngine = (function () {
  // Comprehensive Thai Dream Symbols & Astro-Numerology Dictionary
  const dreamDictionary = [
    {
      keywords: ['งู', 'พญานาค', 'งูใหญ่', 'งูเขียว', 'งูเห่า', 'งูจงอ่าง', 'มังกร'],
      element: 'ธาตุน้ำ / ดาวเกตุ (๙)',
      luckyDigitsPrimary: ['5', '6', '9'],
      luckyDigitsSecondary: ['1', '8'],
      meaning: 'ฝันเห็นงูหรือพญานาค ถือเป็นนิมิตหมายมงคลยิ่งใหญ่ สื่อถึงโชคลาภก้อนโต การเจริญด้วยลาภยศและวาสนา หากเป็นคนโสดมีเกณฑ์พบพูนคู่บารมี หากเสี่ยงโชคสลาก N3 มีเกณฑ์รับโชคจากเลขตระกูล 5, 6, 9',
      blessing: 'แนะนำให้ทำบุญถวายสังฆทานน้ำดื่ม หรือร่วมสร้างอุโบสถเพื่อเปิดทิศทางโชคลาภ'
    },
    {
      keywords: ['ขี้', 'อุจจาระ', 'สาดขี้', 'เหยียบขี้', 'ขี้ใส่', 'สิ่งปฏิกูล'],
      element: 'ธาตุดิน / ดาวเสาร์ (๗)',
      luckyDigitsPrimary: ['0', '8', '5'],
      luckyDigitsSecondary: ['7', '3'],
      meaning: 'โบราณท่านว่า ฝันเห็นอุจจาระ จับขี้ หรือสัมผัสสิ่งปฏิกูล ถือเป็นนิมิตโชคลาภเงินทองมหาศาลทับตัว ยิ่งฝันว่าเปรอะเปื้อนตัว ยิ่งสื่อถึงเงินทองไหลมาเทมา ทรัพย์สินเพิ่มพูนอย่างไม่คาดฝัน',
      blessing: 'แนะนำทำบุญบริจาคค่าน้ำประปา หรือทำความสะอาดลานวัดเพื่อต้อนรับทรัพย์ใหญ่'
    },
    {
      keywords: ['พระ', 'เหรียญพระ', 'พระพุทธรูป', 'วัด', 'พระสงฆ์', 'เกจิ', 'สามเณร', 'โบสถ์'],
      element: 'ธาตุไฟ / ดาวพฤหัสบดี (๕)',
      luckyDigitsPrimary: ['9', '8', '5'],
      luckyDigitsSecondary: ['1', '7'],
      meaning: 'ฝันเห็นพระสงฆ์ พระพุทธรูป หรือสถานที่ศักดิ์สิทธิ์ เป็นนิมิตมงคลแห่งการปกปักรักษาและเมตตามหานิยม เทพยดาอารักษ์กำลังอำนวยพร ความเจ็บไข้จะหาย สิ่งมืดมัวจะสว่างไสว',
      blessing: 'แนะนำตักบาตรเช้าหรือร่วมทำบุญค่าน้ำค่าไฟวัด เสริมบารมีรับโชคใหญ่ N3'
    },
    {
      keywords: ['ปลา', 'จับปลา', 'ปลาทอง', 'ช้อนปลา', 'ปลาตัวใหญ่', 'แหจับปลา', 'ตกปลา'],
      element: 'ธาตุน้ำ / ดาวจันทร์ (๒)',
      luckyDigitsPrimary: ['8', '7', '2'],
      luckyDigitsSecondary: ['3', '6'],
      meaning: 'ฝันว่าจับปลาได้จำนวนมาก หรือเห็นปลาว่ายน้ำแหวกว่ายอย่างสมบูรณ์ สื่อถึงการไหลมาเทมาของเงินทองและโภคทรัพย์ เป็นช่วงดวงชะตารับโชค N3 เด่นชัด',
      blessing: 'แนะนำปล่อยปลาหน้าแผง หรือทำบุญไถ่ชีวิตสัตว์เพื่อสะสมทุนบุญ'
    },
    {
      keywords: ['น้ำ', 'น้ำท่วม', 'ทะเล', 'แม่น้ำ', 'น้ำตก', 'ฝนตก', 'น้ำใส'],
      element: 'ธาตุน้ำ / ดาวจันทร์ (๒)',
      luckyDigitsPrimary: ['2', '4', '8'],
      luckyDigitsSecondary: ['0', '6'],
      meaning: 'ฝันเห็นน้ำท่วม น้ำไหล หรือทะเลกว้างใหญ่ หมายถึงการไหลวนของทรัพย์สมบัติ การงานราบรื่น ปัญหาอุปสรรคจะถูกชะล้างไปพร้อมโชคลาภที่พัดพาเข้ามา',
      blessing: 'แนะนำบริจาคค่าน้ำประปาวัด หรือบริจาคเครื่องดื่มให้คนยากไร้'
    },
    {
      keywords: ['ไฟ', 'ไฟไหม้', 'เพลิง', 'ควัน', 'เถ้าถ่าน'],
      element: 'ธาตุไฟ / ดาวอาทิตย์ (๑)',
      luckyDigitsPrimary: ['1', '4', '0'],
      luckyDigitsSecondary: ['7', '3'],
      meaning: 'ฝันเห็นไฟไหม้ หรือแสงเพลิงสว่างไสว สื่อถึงการผันเปลี่ยนดวงชะตาจากร้ายกลายเป็นดี โชคลาภจะเข้ามาอย่างรวดเร็วฉับพลันแบบไม่คาดฝัน',
      blessing: 'แนะนำเติมน้ำมันตะเกียง หรือถวายหลอดไฟสังฆทานเพื่อเพิ่มความสว่างไสวในดวงชะตา'
    },
    {
      keywords: ['ศพ', 'คนตาย', 'โลงศพ', 'งานศพ', 'กระดูก', 'วิญญาณ', 'ผี'],
      element: 'ธาตุดิน / ดาวเสาร์ (๗)',
      luckyDigitsPrimary: ['0', '4', '7'],
      luckyDigitsSecondary: ['6', '9'],
      meaning: 'โบราณว่าฝันเห็นศพ คนตาย หรืองานศพ ถือเป็นโชคใหญ่ตรงข้ามกับภาพที่เห็น สื่อถึงการหมดเคราะห์ การต่ออายุวัฒนะ และจะได้ลาภลอยจากการเสี่ยงโชคสลาก N3',
      blessing: 'แนะนำบริจาคเงินซื้อโลงศพไร้ญาติ หรือทำบุญผ้าห่อศพ'
    },
    {
      keywords: ['เด็ก', 'อุ้มเด็ก', 'คลอดบุตร', 'เด็กทารก', 'เด็กผู้ชาย', 'เด็กผู้หญิง'],
      element: 'ธาตุลม / ดาวพุธ (๔)',
      luckyDigitsPrimary: ['3', '1', '7'],
      luckyDigitsSecondary: ['4', '9'],
      meaning: 'ฝันเห็นเด็กทารก หรือได้อุ้มเด็ก สื่อถึงข่าวดี นิมิตใหม่ การเริ่มต้นโครงการที่จะสร้างกำไรมหัศจรรย์ และมักให้โชคลาภบริสุทธิ์',
      blessing: 'แนะนำบริจาคสิ่งของให้มูลนิธิเด็กอ่อน หรือทุนการศึกษา'
    },
    {
      keywords: ['รถ', 'รถยนต์', 'ขับรถ', 'รถชน', 'ขี่มอเตอร์ไซค์', 'ทะเบียนรถ'],
      element: 'ธาตุลม / ดาวอังคาร (๓)',
      luckyDigitsPrimary: ['4', '7', '3'],
      luckyDigitsSecondary: ['2', '8'],
      meaning: 'ฝันเกี่ยวกับยานพาหนะ การเดินทาง หรือรถยนต์ สื่อถึงการเคลื่อนไหวของดวงชะตา การปรับเปลี่ยนตำแหน่งหน้าที่การงาน และมักเชื่อมโยงกับตัวเลขใกล้ตัว',
      blessing: 'แนะนำกรวดน้ำให้เจ้ากรรมนายเวรและเทวดารักษาตัวยานพาหนะ'
    },
    {
      keywords: ['บ้าน', 'สร้างบ้าน', 'บ้านใหม่', 'หลังคา', 'ห้องนอน'],
      element: 'ธาตุดิน / ดาวเสาร์ (๗)',
      luckyDigitsPrimary: ['5', '9', '4'],
      luckyDigitsSecondary: ['1', '6'],
      meaning: 'ฝันเกี่ยวกับบ้าน หรือเคหสถาน สื่อถึงความมั่นคงในชีวิต ทรัพย์สินเงินทองที่จะเพิ่มพูนแน่นหนา มีเกณฑ์ได้รับโชคจากที่อยู่อาศัย',
      blessing: 'แนะนำกวาดลานวัด หรือร่วมสร้างอาคารสาธารณประโยชน์'
    },
    {
      keywords: ['ช้าง', 'ขี่ช้าง', 'ช้างเผือก', 'งาช้าง'],
      element: 'ธาตุดิน / ดาวพฤหัสบดี (๕)',
      luckyDigitsPrimary: ['9', '3', '1'],
      luckyDigitsSecondary: ['5', '7'],
      meaning: 'ฝันเห็นช้าง สัตว์ใหญ่ทรงพลัง สื่อถึงการได้รับความเมตตาจากผู้ใหญ่ การได้มงคลวาสนาสูงส่ง ประสบความสำเร็จในลาภยศ',
      blessing: 'แนะนำให้อาหารสัตว์ หรือทำบุญศูนย์อนุรักษ์ช้าง'
    },
    {
      keywords: ['เสือ', 'จระเข้', 'สิงโต', 'สัตว์ร้าย'],
      element: 'ธาตุไฟ / ดาวอังคาร (๓)',
      luckyDigitsPrimary: ['3', '8', '1'],
      luckyDigitsSecondary: ['4', '7'],
      meaning: 'ฝันเห็นเสือ จระเข้ หรือสัตว์น่าเกรงขาม สื่อถึงพลังอำนาจ ชัยชนะเหนืออุปสรรคทั้งปวง และการได้รับโชคลาภจากการเสี่ยงโชคก้อนใหญ่',
      blessing: 'แนะนำไหว้ศาลเจ้าพ่อเสือ หรือทำบุญไถ่ชีวิตโคกระบือ'
    },
    {
      keywords: ['สุนัข', 'หมา', 'แมว', 'สัตว์เลี้ยง'],
      element: 'ธาตุลม / ดาวพุธ (๔)',
      luckyDigitsPrimary: ['4', '7', '2'],
      luckyDigitsSecondary: ['5', '8'],
      meaning: 'ฝันเห็นสุนัขหรือแมว สื่อถึงมิตรบริวารนำโชค ความจงรักภักดี และข่าวดีจากญาติมิตรใกล้ชิดที่จะนำพาโชคลาภมาให้',
      blessing: 'แนะนำบริจาคอาหารสัตว์พิการหรือสุนัขจรจัด'
    },
    {
      keywords: ['เงิน', 'ทอง', 'ธนบัตร', 'แหวนทอง', 'สมบัติ', 'แก้วแหวนเงินทอง'],
      element: 'ธาตุทอง / ดาวศุกร์ (๖)',
      luckyDigitsPrimary: ['6', '2', '9'],
      luckyDigitsSecondary: ['5', '8'],
      meaning: 'ฝันว่าได้รับเงิน ได้ทองคำ หรือขุดพบทรัพย์สมบัติ สื่อถึงการได้รับลาภลอยอย่างตรงไปตรงมา ลาภลอยจากการเสี่ยงโชคสลาก N3 เด่นชัดอย่างยิ่ง',
      blessing: 'แนะนำอธิษฐานจิตแบ่งปันทานบารมีเมื่อได้รับโชคใหญ่'
    }
  ];

  // Safe fallback entry for unmapped dreams
  const defaultEntry = {
    keywords: ['สัญลักษณ์สวรรค์'],
    element: 'ธาตุจักรวาล / สุริยคราสมงคล',
    luckyDigitsPrimary: ['7', '8', '9'],
    luckyDigitsSecondary: ['3', '5'],
    meaning: 'ฝันของคุณเต็มไปด้วยสัญลักษณ์แห่งพลังจักรวาลและการหยั่งรู้ทางจิตวิญญาณ แม้คำในฝันจะซับซ้อน แต่พลังดาวโคจรดวงชะตากำลังเปิดรับโชคใหญ่ของ N3 ในงวดนี้',
    blessing: 'แนะนำตั้งจิตตั้งสมาธิ 1 นาที แล้วอธิษฐานเบื้องหน้าพระประธาน'
  };

  /**
   * Tokenizes user dream input text and matches against dictionary
   */
  function analyzeDreamText(text) {
    if (!text || text.trim().length === 0) {
      return { matched: [defaultEntry], rawText: '' };
    }

    const cleanText = text.trim();
    const matchedEntries = [];

    dreamDictionary.forEach(entry => {
      const hasMatch = entry.keywords.some(kw => cleanText.includes(kw));
      if (hasMatch) {
        matchedEntries.push(entry);
      }
    });

    if (matchedEntries.length === 0) {
      matchedEntries.push(defaultEntry);
    }

    return {
      matched: matchedEntries,
      rawText: cleanText
    };
  }

  /**
   * Deterministic yet dynamic hash function based on dream text & current day
   */
  function hashString(str) {
    let hash = 0;
    const fullStr = str + '-' + new Date().getDate() + '-' + new Date().getMonth();
    for (let i = 0; i < fullStr.length; i++) {
      const char = fullStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Generates full N3 lucky numbers & predictions based on dream input
   */
  function generatePrediction(dreamInput) {
    const analysis = analyzeDreamText(dreamInput);
    const primaryMatch = analysis.matched[0] || defaultEntry;
    const seed = hashString(analysis.rawText || 'magic-dream');

    // Combine digits pool safely
    let pool = [];
    analysis.matched.forEach(m => {
      if (m && m.luckyDigitsPrimary && m.luckyDigitsSecondary) {
        pool.push(...m.luckyDigitsPrimary, ...m.luckyDigitsSecondary);
      }
    });
    if (pool.length < 5) pool.push('9', '8', '5', '3', '1');

    // Pick 3 digits for N3 Direct
    const d1 = pool[seed % pool.length] || '7';
    const d2 = pool[(seed + 3) % pool.length] || '8';
    const d3 = pool[(seed + 7) % pool.length] || '9';

    const n3Direct = `${d1}${d2}${d3}`;

    // Create 3 Tod permutations
    const tod1 = `${d1}${d3}${d2}`;
    const tod2 = `${d2}${d1}${d3}`;
    const n3Tod = [n3Direct, tod1, tod2].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(', ');

    // Pick 2 digits for N3 2-Digit
    const n2Digit = `${d2}${d3}`;

    // Calculate Confidence percentage (92.5% - 99.8%)
    const confidence = ((seed % 74) / 10 + 92.5).toFixed(1);

    // Combine all descriptions if multiple keywords matched
    let combinedMeaning = primaryMatch.meaning || defaultEntry.meaning;
    if (analysis.matched.length > 1) {
      combinedMeaning += ' นอกจากนี้สัญลักษณ์เสริมยังชี้ถือกำเนิดพละกำลังมหาศาล สอดรับกับตัวเลขหลักของ N3';
    }

    // Safe extraction of matched symbols string
    const symbolsStr = analysis.matched
      .map(m => (m && m.keywords && m.keywords.length > 0 ? m.keywords[0] : 'สัญลักษณ์มงคล'))
      .join(', ');

    return {
      dreamText: analysis.rawText || 'ความฝันมงคลสวรรค์',
      element: primaryMatch.element || defaultEntry.element,
      n3Direct: n3Direct,
      n3Tod: n3Tod,
      n2Digit: n2Digit,
      confidence: `${confidence}%`,
      meaning: combinedMeaning,
      blessing: primaryMatch.blessing || defaultEntry.blessing,
      matchedSymbols: symbolsStr
    };
  }

  return {
    analyzeDreamText,
    generatePrediction,
    dreamDictionary
  };
})();
