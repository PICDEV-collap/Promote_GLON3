/**
 * GLO N3 Official Lottery Sync Script
 * Fetches official draw results directly from GLO API (www.glo.or.th)
 * Updates:
 *   1. data/latest-lottery.json
 *   2. data/n3-historical-draws.json (for Probability & Heatmap Analytics)
 *   3. data/official-draw-schedule.json (advances countdown to next round)
 *   4. Syncs to bot-service/public/data/
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BOT_DATA_DIR = path.join(ROOT_DIR, 'bot-service', 'public', 'data');

const THAI_MONTHS = [
  '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const THAI_DAYS = {
  Sunday: 'อาทิตย์',
  Monday: 'จันทร์',
  Tuesday: 'อังคาร',
  Wednesday: 'พุธ',
  Thursday: 'พฤหัสบดี',
  Friday: 'ศุกร์',
  Saturday: 'เสาร์'
};

function formatThaiDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const thaiYear = y + 543;
  return `${d} ${THAI_MONTHS[m]} ${thaiYear}`;
}

function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dt.getUTCDay()];
}

async function fetchGloLatest() {
  console.log('[GLO SYNC] 🌐 Fetching latest lottery results from www.glo.or.th...');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('https://www.glo.or.th/api/lottery/getLatestLottery', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({}),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`GLO API returned HTTP ${res.status}`);
    }

    const json = await res.json();
    if (!json.status || !json.response) {
      throw new Error('GLO API response format invalid');
    }

    return json.response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function main() {
  console.log('===============================================================================');
  console.log('             GLO N3 OFFICIAL LOTTERY RESULTS SYNCHRONIZER');
  console.log('===============================================================================');

  const raw = await fetchGloLatest();
  const drawDate = raw.date; // e.g. "2026-09-16"
  const drawDateThai = formatThaiDate(drawDate);
  const dayOfWeek = getDayOfWeek(drawDate);
  const dayOfWeekThai = THAI_DAYS[dayOfWeek] || '';

  console.log(`[GLO SYNC] ✅ Successfully fetched draw for: ${drawDate} (${drawDateThai})`);

  // 1. Format latest-lottery.json
  const straight3Num = raw.n3?.straight3?.number?.[0]?.value || '';
  const straight3Price = parseFloat(raw.n3?.straight3?.price || '0');

  const shuffle3Nums = (raw.n3?.shuffle3?.number || []).map(n => n.value).filter(Boolean);
  const shuffle3Price = parseFloat(raw.n3?.shuffle3?.price || '0');

  const straight2Num = raw.n3?.straight2?.number?.[0]?.value || '';
  const straight2Price = parseFloat(raw.n3?.straight2?.price || '0');

  const specialTicket = raw.n3?.special?.number?.[0]?.value || '';
  const specialPrice = parseFloat(raw.n3?.special?.price || '0');

  const firstPrizeNum = raw.data?.first?.number?.[0]?.value || '';
  const firstPrizePrice = parseFloat(raw.data?.first?.price || '6000000');

  const last2Num = raw.data?.last2?.number?.[0]?.value || '';
  const last2Price = parseFloat(raw.data?.last2?.price || '2000');

  const last3fNums = (raw.data?.last3f?.number || []).map(n => n.value).filter(Boolean);
  const last3fPrice = parseFloat(raw.data?.last3f?.price || '4000');

  const last3bNums = (raw.data?.last3b?.number || []).map(n => n.value).filter(Boolean);
  const last3bPrice = parseFloat(raw.data?.last3b?.price || '4000');

  const latestLotteryData = {
    source: "สำนักงานสลากกินแบ่งรัฐบาล (The Government Lottery Office - GLO)",
    officialApi: "https://www.glo.or.th/api/lottery/getLatestLottery",
    status: "completed",
    drawDate: drawDate,
    drawDateThai: drawDateThai,
    period: `งวดประจำวันที่ ${drawDateThai}`,
    n3: {
      straight3: {
        name: "รางวัล 3 ตัวตรง",
        number: straight3Num,
        prize: straight3Price,
        prizeText: `${straight3Price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`,
        description: "เลขตรงกันทุกหลักและตรงตำแหน่ง"
      },
      shuffle3: {
        name: "รางวัล 3 ตัวโต๊ด",
        numbers: shuffle3Nums,
        prize: shuffle3Price,
        prizeText: `${shuffle3Price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`,
        description: "เลขตรงกัน 3 ตัว แต่สลับตำแหน่งกันได้"
      },
      straight2: {
        name: "รางวัล 2 ตัวตรง",
        number: straight2Num,
        prize: straight2Price,
        prizeText: `${straight2Price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`,
        description: "เลขท้าย 2 ตัวตรงกันทุกหลัก"
      },
      specialJackpot: {
        name: "รางวัลพิเศษ (Jackpot)",
        ticketNumber: specialTicket,
        prize: specialPrice,
        prizeText: `${specialPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`,
        description: "สุ่มจากผู้ถูกรางวัล 3 ตัวตรงในงวดนี้"
      }
    },
    gloStandard: {
      firstPrize: {
        name: "รางวัลที่ 1",
        number: firstPrizeNum,
        prize: firstPrizePrice,
        prizeText: `${firstPrizePrice.toLocaleString('en-US')} บาท`
      },
      last2: {
        name: "เลขท้าย 2 ตัว",
        number: last2Num,
        prize: last2Price,
        prizeText: `${last2Price.toLocaleString('en-US')} บาท`
      },
      last3Front: {
        name: "เลขหน้า 3 ตัว",
        numbers: last3fNums,
        prize: last3fPrice,
        prizeText: `${last3fPrice.toLocaleString('en-US')} บาท`
      },
      last3Back: {
        name: "เลขท้าย 3 ตัว",
        numbers: last3bNums,
        prize: last3bPrice,
        prizeText: `${last3bPrice.toLocaleString('en-US')} บาท`
      }
    },
    updatedAt: new Date().toISOString()
  };

  const latestPath = path.join(DATA_DIR, 'latest-lottery.json');
  fs.writeFileSync(latestPath, JSON.stringify(latestLotteryData, null, 2), 'utf8');
  console.log(`[GLO SYNC] 💾 Saved ${latestPath}`);

  // 2. Update n3-historical-draws.json (Probability Center)
  const historicalPath = path.join(DATA_DIR, 'n3-historical-draws.json');
  let historical = [];
  if (fs.existsSync(historicalPath)) {
    try {
      historical = JSON.parse(fs.readFileSync(historicalPath, 'utf8'));
    } catch {}
  }

  const existingIdx = historical.findIndex(h => h.drawDate === drawDate);
  const newHistEntry = {
    drawDate: drawDate,
    drawDateThai: drawDateThai,
    dayOfWeek: dayOfWeek,
    dayOfWeekThai: dayOfWeekThai,
    threeStraight: straight3Num,
    twoStraight: straight2Num,
    threeTod: shuffle3Nums,
    jackpot: specialTicket
  };

  if (existingIdx >= 0) {
    historical[existingIdx] = newHistEntry;
    console.log(`[GLO SYNC] 🔄 Updated existing entry for ${drawDate} in historical draws`);
  } else {
    historical.unshift(newHistEntry);
    console.log(`[GLO SYNC] ✨ Added new entry for ${drawDate} to historical draws`);
  }

  fs.writeFileSync(historicalPath, JSON.stringify(historical, null, 2), 'utf8');
  console.log(`[GLO SYNC] 💾 Saved ${historicalPath} (Total records: ${historical.length})`);

  // 3. Update official-draw-schedule.json
  const schedulePath = path.join(DATA_DIR, 'official-draw-schedule.json');
  if (fs.existsSync(schedulePath)) {
    try {
      const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
      if (schedule && Array.isArray(schedule.schedules)) {
        let upcomingAssigned = false;
        for (const s of schedule.schedules) {
          if (s.drawDate === drawDate) {
            s.status = 'completed';
          } else if (s.drawDate > drawDate && !upcomingAssigned) {
            s.status = 'upcoming';
            upcomingAssigned = true;
          }
        }
        fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2), 'utf8');
        console.log(`[GLO SYNC] 💾 Updated ${schedulePath}`);
      }
    } catch (e) {
      console.warn('[GLO SYNC] ⚠️ Error updating schedule:', e.message);
    }
  }

  // 4. Sync to bot-service/public/data
  if (fs.existsSync(BOT_DATA_DIR)) {
    fs.copyFileSync(latestPath, path.join(BOT_DATA_DIR, 'latest-lottery.json'));
    fs.copyFileSync(historicalPath, path.join(BOT_DATA_DIR, 'n3-historical-draws.json'));
    fs.copyFileSync(schedulePath, path.join(BOT_DATA_DIR, 'official-draw-schedule.json'));
    console.log(`[GLO SYNC] 📁 Synced all datasets to bot-service/public/data/`);
  }

  console.log('===============================================================================');
  console.log('🎉 SYNCHRONIZATION COMPLETE!');
  console.log(`   งวดวันที่: ${drawDateThai}`);
  console.log(`   รางวัล 3 ตัวตรง N3: ${straight3Num} (เงินรางวัล: ${straight3Price.toLocaleString()} บาท)`);
  console.log(`   รางวัล 3 ตัวโต๊ด N3: ${shuffle3Nums.join(', ')} (เงินรางวัล: ${shuffle3Price.toLocaleString()} บาท)`);
  console.log(`   รางวัล 2 ตัวตรง N3: ${straight2Num} (เงินรางวัล: ${straight2Price.toLocaleString()} บาท)`);
  console.log(`   รางวัลพิเศษ Jackpot: ${specialTicket} (เงินรางวัล: ${specialPrice.toLocaleString()} บาท)`);
  console.log(`   รางวัลที่ 1 L6: ${firstPrizeNum}`);
  console.log(`   เลขท้าย 2 ตัว L6: ${last2Num}`);
  console.log('===============================================================================');
}

main().catch(err => {
  console.error('[GLO SYNC ERROR]', err);
  process.exit(1);
});
