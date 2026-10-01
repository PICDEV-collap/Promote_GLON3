const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  // 1. Enable full CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // 2. Load Local Authoritative Datasets
    const schedulePath = path.join(__dirname, '../data', 'official-draw-schedule.json');
    const latestPath = path.join(__dirname, '../data', 'latest-lottery.json');

    let scheduleData = null;
    let latestData = null;

    if (fs.existsSync(schedulePath)) {
      scheduleData = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
    }
    if (fs.existsSync(latestPath)) {
      latestData = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    }

    // 3. Attempt live GLO API check with 3.5s timeout and standard headers
    let liveLatest = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const gloRes = await fetch('https://www.glo.or.th/api/lottery/getLatestLottery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({}),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (gloRes.ok) {
        const json = await gloRes.json();
        if (json.status && json.response) {
          liveLatest = json.response;
        }
      }
    } catch (_) {
      // Graceful fallback: GLO API network timeout / offline
    }

    // 4. Resolve latest lottery info
    let finalLatest = latestData;
    if (liveLatest && liveLatest.n3 && liveLatest.date >= (latestData?.drawDate || '') && /^\d{3}$/.test(liveLatest.n3?.straight3?.number?.[0]?.value || '')) {
      finalLatest = {
        source: 'สำนักงานสลากกินแบ่งรัฐบาล (Official GLO Live API)',
        officialApi: 'https://www.glo.or.th/api/lottery/getLatestLottery',
        status: 'completed',
        drawDate: liveLatest.date,
        drawDateThai: liveLatest.displayDate
          ? `${parseInt(liveLatest.displayDate.date, 10)} ${getThaiMonthName(parseInt(liveLatest.displayDate.month, 10))} ${parseInt(liveLatest.displayDate.year, 10) + 543}`
          : latestData?.drawDateThai,
        period: `งวดประจำวันที่ ${liveLatest.date}`,
        n3: {
          straight3: {
            name: 'รางวัล 3 ตัวตรง',
            number: liveLatest.n3?.straight3?.number?.[0]?.value || latestData?.n3?.straight3?.number,
            prize: parseFloat(liveLatest.n3?.straight3?.price || '0') || latestData?.n3?.straight3?.prize,
            prizeText: `${(parseFloat(liveLatest.n3?.straight3?.price || '0') || latestData?.n3?.straight3?.prize || 0).toLocaleString()} บาท`,
            description: 'เลขตรงกันทุกหลักและตรงตำแหน่ง'
          },
          shuffle3: {
            name: 'รางวัล 3 ตัวโต๊ด',
            numbers: liveLatest.n3?.shuffle3?.number?.map(n => n.value) || latestData?.n3?.shuffle3?.numbers || [],
            prize: parseFloat(liveLatest.n3?.shuffle3?.price || '0') || latestData?.n3?.shuffle3?.prize,
            prizeText: `${(parseFloat(liveLatest.n3?.shuffle3?.price || '0') || latestData?.n3?.shuffle3?.prize || 0).toLocaleString()} บาท`,
            description: 'เลขตรงกัน 3 ตัว แต่สลับตำแหน่งกันได้'
          },
          straight2: {
            name: 'รางวัล 2 ตัวตรง',
            number: liveLatest.n3?.straight2?.number?.[0]?.value || latestData?.n3?.straight2?.number,
            prize: parseFloat(liveLatest.n3?.straight2?.price || '0') || latestData?.n3?.straight2?.prize,
            prizeText: `${(parseFloat(liveLatest.n3?.straight2?.price || '0') || latestData?.n3?.straight2?.prize || 0).toLocaleString()} บาท`,
            description: 'เลขท้าย 2 ตัวตรงกันทุกหลัก'
          },
          specialJackpot: {
            name: 'รางวัลพิเศษ (Jackpot)',
            ticketNumber: liveLatest.n3?.special?.number?.[0]?.value || latestData?.n3?.specialJackpot?.ticketNumber,
            prize: parseFloat(liveLatest.n3?.special?.price || '0') || latestData?.n3?.specialJackpot?.prize,
            prizeText: `${(parseFloat(liveLatest.n3?.special?.price || '0') || latestData?.n3?.specialJackpot?.prize || 0).toLocaleString()} บาท`,
            description: 'สุ่มจากผู้ถูกรางวัล 3 ตัวตรงในงวดนี้'
          }
        },
        gloStandard: {
          firstPrize: {
            name: 'รางวัลที่ 1',
            number: liveLatest.data?.first?.number?.[0]?.value || latestData?.gloStandard?.firstPrize?.number,
            prize: parseFloat(liveLatest.data?.first?.price || '6000000'),
            prizeText: '6,000,000 บาท'
          },
          last2: {
            name: 'เลขท้าย 2 ตัว',
            number: liveLatest.data?.last2?.number?.[0]?.value || latestData?.gloStandard?.last2?.number,
            prize: parseFloat(liveLatest.data?.last2?.price || '2000'),
            prizeText: '2,000 บาท'
          }
        },
        updatedAt: new Date().toISOString()
      };
    }

    // 5. Calculate Next Upcoming Official Draw using Bangkok wall-clock time.
    const upcoming = getNextUpcomingDraw(scheduleData?.schedules, new Date());

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      upcomingDraw: upcoming ? {
        drawDate: upcoming.drawDate,
        thaiDate: upcoming.thaiDate,
        drawTime: upcoming.drawTime || '14:30',
        isPostponed: !!upcoming.isPostponed,
        originalDate: upcoming.originalDate || null,
        postponeReason: upcoming.postponeReason || null,
        period: upcoming.period
      } : null,
      latestLottery: finalLatest,
      scheduleCount: scheduleData?.schedules?.length || 0
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

function getNextUpcomingDraw(schedules, referenceNow = new Date()) {
  if (!Array.isArray(schedules)) return null;

  const now = referenceNow instanceof Date ? referenceNow : new Date(referenceNow);
  const bangkokParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const bangkok = Object.fromEntries(bangkokParts
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, Number(part.value)]));
  const nowTimestamp = Date.UTC(
    bangkok.year,
    bangkok.month - 1,
    bangkok.day,
    bangkok.hour,
    bangkok.minute,
    bangkok.second
  );

  const candidates = schedules.flatMap(schedule => {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(schedule?.drawDate || '');
    if (!dateMatch) return [];

    const [, yearText, monthText, dayText] = dateMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const validDate = new Date(Date.UTC(year, month - 1, day));
    if (validDate.getUTCFullYear() !== year || validDate.getUTCMonth() !== month - 1 || validDate.getUTCDate() !== day) {
      return [];
    }

    const drawTime = schedule.drawTime || '14:30';
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(drawTime);
    if (!timeMatch) return [];
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (hour > 23 || minute > 59) return [];

    return [{
      schedule,
      timestamp: Date.UTC(year, month - 1, day, hour, minute)
    }];
  });

  candidates.sort((a, b) => a.timestamp - b.timestamp);
  return candidates.find(candidate => candidate.timestamp > nowTimestamp)?.schedule || null;
}

module.exports.getNextUpcomingDraw = getNextUpcomingDraw;

function getThaiMonthName(m) {
  const months = [
    '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  return months[m] || '';
}
