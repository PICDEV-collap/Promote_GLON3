const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  // 1. Enable full CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // 2. Load Local Authoritative Datasets
    const schedulePath = path.join(process.cwd(), 'data', 'official-draw-schedule.json');
    const latestPath = path.join(process.cwd(), 'data', 'latest-lottery.json');

    let scheduleData = null;
    let latestData = null;

    if (fs.existsSync(schedulePath)) {
      scheduleData = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
    }
    if (fs.existsSync(latestPath)) {
      latestData = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    }

    // 3. Attempt live GLO API check with strict 1.8s timeout
    let liveLatest = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1800);
      const gloRes = await fetch('https://www.glo.or.th/api/lottery/getLatestLottery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    if (liveLatest && liveLatest.n3) {
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

    // 5. Calculate Next Upcoming Official Draw
    const now = new Date();
    const bkkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    
    // Find next schedule after current time
    let upcoming = null;
    if (scheduleData && Array.isArray(scheduleData.schedules)) {
      const futureList = scheduleData.schedules
        .map(s => {
          const [y, m, d] = s.drawDate.split('-').map(Number);
          const drawDateTime = new Date(y, m - 1, d, 14, 30, 0);
          return { ...s, drawDateTime };
        })
        .filter(s => s.drawDateTime > bkkTime)
        .sort((a, b) => a.drawDateTime - b.drawDateTime);

      if (futureList.length > 0) {
        upcoming = futureList[0];
      }
    }

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

function getThaiMonthName(m) {
  const months = [
    '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  return months[m] || '';
}
