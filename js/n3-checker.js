/* ==========================================================================
   GLO N3 - Prize Checker, Historical Draw Statistics, & Lucky Roller Engine
   ========================================================================== */

const N3Checker = (function () {
  // Historical & Simulated GLO N3 Draws
  const drawHistory = [
    {
      id: '2026-09-01',
      dateText: '1 กันยายน 2569 (งวดล่าสุด)',
      winning3Direct: '789',
      specialJackpotTicket: '789-082419',
      totalSales: 18500000,
      prizeDirect3: 42500,
      prizeTod3: 7800,
      prizeDirect2: 1450,
      prizeJackpot: 185000
    },
    {
      id: '2026-08-16',
      dateText: '16 สิงหาคม 2569',
      winning3Direct: '532',
      specialJackpotTicket: '532-041938',
      totalSales: 16200000,
      prizeDirect3: 38200,
      prizeTod3: 6900,
      prizeDirect2: 1280,
      prizeJackpot: 162000
    },
    {
      id: '2026-08-01',
      dateText: '1 สิงหาคม 2569',
      winning3Direct: '904',
      specialJackpotTicket: '904-099120',
      totalSales: 15400000,
      prizeDirect3: 35000,
      prizeTod3: 6300,
      prizeDirect2: 1190,
      prizeJackpot: 154000
    },
    {
      id: '2026-07-16',
      dateText: '16 กรกฎาคม 2569',
      winning3Direct: '618',
      specialJackpotTicket: '618-051122',
      totalSales: 14800000,
      prizeDirect3: 33400,
      prizeTod3: 5900,
      prizeDirect2: 1120,
      prizeJackpot: 148000
    },
    {
      id: '2026-07-01',
      dateText: '1 กรกฎาคม 2569',
      winning3Direct: '247',
      specialJackpotTicket: '247-019344',
      totalSales: 13900000,
      prizeDirect3: 31500,
      prizeTod3: 5600,
      prizeDirect2: 1080,
      prizeJackpot: 139000
    }
  ];

  // Day Power Numbers (กำลังวันศาสตร์พยากรณ์ไทย)
  const dayPowerNumbers = {
    0: { day: 'วันอาทิตย์', power: '๑, ๘, ๔', hotDigits: ['1', '8', '4', '7'] },
    1: { day: 'วันจันทร์', power: '๒, ๙, ๕', hotDigits: ['2', '9', '5', '8'] },
    2: { day: 'วันอังคาร', power: '๓, ๐, ๖', hotDigits: ['3', '0', '6', '1'] },
    3: { day: 'วันพุธ', power: '๔, ๒, ๘', hotDigits: ['4', '2', '8', '5'] },
    4: { day: 'วันพฤหัสบดี', power: '๕, ๓, ๙', hotDigits: ['5', '3', '9', '2'] },
    5: { day: 'วันศุกร์', power: '๖, ๔, ๑', hotDigits: ['6', '4', '1', '3'] },
    6: { day: 'วันเสาร์', power: '๗, ๕, ๒', hotDigits: ['7', '5', '2', '4'] }
  };

  /**
   * Helper: checks if strA is a permutation of strB
   */
  function isPermutation(strA, strB) {
    if (strA.length !== strB.length) return false;
    return strA.split('').sort().join('') === strB.split('').sort().join('');
  }

  /**
   * Check a 3-digit number against a specified draw
   */
  function checkN3Prize(inputNumber, drawId) {
    const cleanNum = (inputNumber || '').toString().trim();
    if (!/^\d{3}$/.test(cleanNum)) {
      return {
        success: false,
        error: 'กรุณากรอกตัวเลขให้ครบ 3 หลัก (000-999)'
      };
    }

    const draw = drawHistory.find(d => d.id === drawId) || drawHistory[0];
    const winning = draw.winning3Direct;

    const prizesWon = [];
    let totalEstimatedPrize = 0;

    // Check 3 Direct
    const isDirect3 = cleanNum === winning;
    if (isDirect3) {
      prizesWon.push({
        type: '3-DIRECT',
        title: 'รางวัล 3 ตัวตรง 🎉',
        amount: draw.prizeDirect3,
        description: `ตรงกับเลขรางวัล 3 ตัวตรง (${winning}) ครบทุกหลักและตรงตำแหน่ง`
      });
      totalEstimatedPrize += draw.prizeDirect3;
    }

    // Check 3 Tod (same digits different order)
    const isTod3 = !isDirect3 && isPermutation(cleanNum, winning);
    if (isTod3) {
      prizesWon.push({
        type: '3-TOD',
        title: 'รางวัล 3 ตัวโต๊ด ✨',
        amount: draw.prizeTod3,
        description: `ตัวเลขตรงกับ ${winning} แต่สลับตำแหน่งกัน`
      });
      totalEstimatedPrize += draw.prizeTod3;
    }

    // Check 2 Direct (last 2 digits match)
    const input2 = cleanNum.slice(1);
    const winning2 = winning.slice(1);
    const isDirect2 = input2 === winning2;
    if (isDirect2) {
      prizesWon.push({
        type: '2-DIRECT',
        title: 'รางวัล 2 ตัวตรง 🌟',
        amount: draw.prizeDirect2,
        description: `2 ตัวท้าย (${input2}) ตรงกับ 2 ตัวท้ายของรางวัล 3 ตัวตรง`
      });
      totalEstimatedPrize += draw.prizeDirect2;
    }

    const isWinner = prizesWon.length > 0;

    return {
      success: true,
      inputNumber: cleanNum,
      drawDate: draw.dateText,
      winningNumber: winning,
      isWinner: isWinner,
      prizesWon: prizesWon,
      totalPrize: totalEstimatedPrize,
      hasJackpotChance: isDirect3,
      message: isWinner
        ? `ยินดีด้วยครับ! สลาก N3 เลข ${cleanNum} ถูกรางวัลรวม ${prizesWon.length} ประเภท!`
        : `เสียใจด้วยครับ สลาก N3 เลข ${cleanNum} ยังไม่ถูกรางวัลในงวดนี้ ลองวิเคราะห์ฝันหาเลขใหม่อีกครั้ง!`
    };
  }

  /**
   * Get dynamic statistics of Hot and Cold digits
   */
  function getNumberStatistics() {
    const digitCounts = { '0': 12, '1': 15, '2': 18, '3': 22, '4': 19, '5': 25, '6': 17, '7': 28, '8': 24, '9': 29 };

    // Process actual history
    drawHistory.forEach(d => {
      d.winning3Direct.split('').forEach(digit => {
        digitCounts[digit] = (digitCounts[digit] || 0) + 3;
      });
    });

    const sortedDigits = Object.entries(digitCounts).sort((a, b) => b[1] - a[1]);
    const hotDigits = sortedDigits.slice(0, 4).map(([d, cnt]) => ({ digit: d, count: cnt }));
    const coldDigits = sortedDigits.slice(-4).reverse().map(([d, cnt]) => ({ digit: d, count: cnt }));

    const currentDay = new Date().getDay();
    const todayPower = dayPowerNumbers[currentDay] || dayPowerNumbers[1];

    return {
      hotDigits,
      coldDigits,
      todayPower
    };
  }

  /**
   * Generates a 3D lucky randomized 3-digit combination
   */
  function rollLucky3Digits() {
    const d1 = Math.floor(Math.random() * 10).toString();
    const d2 = Math.floor(Math.random() * 10).toString();
    const d3 = Math.floor(Math.random() * 10).toString();
    const fullNumber = `${d1}${d2}${d3}`;

    const auspices = [
      'มหาเศรษฐีเงินล้าน รับโชคก้อนโต',
      'บารมีพูนผล โชคลาภพัดพามา',
      'รับทรัพย์ฉับพลัน ลาภลอยหนุนนำ',
      'เทพยดาอำนวยพร วาสนายิ่งใหญ่',
      'เงินทองไหลมาเทมา ค้าขายมั่งคั่ง'
    ];

    const randomAuspice = auspices[Math.floor(Math.random() * auspices.length)];

    return {
      d1,
      d2,
      d3,
      fullNumber,
      todPermutations: [`${d1}${d3}${d2}`, `${d2}${d1}${d3}`].filter((v, i, a) => a.indexOf(v) === i && v !== fullNumber).join(', ') || `${d3}${d2}${d1}`,
      auspice: randomAuspice
    };
  }

  return {
    drawHistory,
    checkN3Prize,
    getNumberStatistics,
    rollLucky3Digits
  };
})();
