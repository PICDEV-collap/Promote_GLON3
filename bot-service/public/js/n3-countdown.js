/* ==========================================================================
   GLO N3 - Next Draw Countdown & Schedule Engine (Official GLO Synchronized)
   Supports official GLO schedule synchronization, holiday postponements
   (e.g., Labor Day May 2, Teacher's Day Jan 17, New Year Jan 2), and
   official latest drawn winning numbers.
   ========================================================================== */

const N3Countdown = (function () {
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const CACHE_KEY = 'glo_n3_official_schedule_v2';
  let syncedUpcoming = null;
  let syncedLatest = null;
  let officialSchedules = [];
  const listeners = [];

  // Try to load cached schedule from localStorage on init
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.upcomingDraw) {
          syncedUpcoming = cached.upcomingDraw;
          syncedLatest = cached.latestLottery;
        }
      }
    }
  } catch (_) {}

  /**
   * Evaluates built-in GLO postponement rules for any year and month.
   * Returns: { day, isPostponed, originalDay, reason }
   */
  function getPostponementRule(year, monthIndex, regularDay) {
    // 1. January:
    // - Jan 1st -> Postponed to Jan 2nd (New Year)
    // - Jan 16th -> Postponed to Jan 17th (National Teacher's Day / วันครู)
    if (monthIndex === 0) {
      if (regularDay === 1) {
        return {
          day: 2,
          isPostponed: true,
          originalDay: 1,
          reason: 'ตรงกับวันขึ้นปีใหม่ (1 ม.ค.) สำนักงานสลากฯ เลื่อนออกรางวัลเป็นวันที่ 2 ม.ค.'
        };
      }
      if (regularDay === 16) {
        return {
          day: 17,
          isPostponed: true,
          originalDay: 16,
          reason: 'ตรงกับวันครูแห่งชาติ (16 ม.ค.) สำนักงานสลากฯ เลื่อนออกรางวัลเป็นวันที่ 17 ม.ค.'
        };
      }
    }

    // 2. May:
    // - May 1st -> Postponed to May 2nd (National Labor Day / วันแรงงาน)
    if (monthIndex === 4) {
      if (regularDay === 1) {
        return {
          day: 2,
          isPostponed: true,
          originalDay: 1,
          reason: 'ตรงกับวันแรงงานแห่งชาติ (1 พ.ค.) สำนักงานสลากฯ เลื่อนออกรางวัลเป็นวันที่ 2 พ.ค.'
        };
      }
    }

    // 3. December:
    // - Late Dec -> Often advanced to Dec 30th (Year-end advance draw)
    if (monthIndex === 11) {
      if (regularDay === 31 || regularDay === 1) {
        return {
          day: 30,
          isPostponed: true,
          originalDay: 1,
          reason: 'งวดส่งท้ายปีเก่าต้อนรับปีใหม่ (ออกรางวัลเร็วขึ้นเป็นวันที่ 30 ธ.ค.)'
        };
      }
    }

    return {
      day: regularDay,
      isPostponed: false,
      originalDay: regularDay,
      reason: null
    };
  }

  /**
   * Calculates the exact Next Draw Date Object, aware of GLO holiday postponements.
   * Accepts optional referenceDate (defaults to now).
   */
  function getNextDrawDate(referenceDate) {
    const now = referenceDate ? new Date(referenceDate) : new Date();
    
    // If we have an official synced upcoming draw from GLO and it's in the future, use it!
    if (syncedUpcoming && syncedUpcoming.drawDate) {
      const [sy, sm, sd] = syncedUpcoming.drawDate.split('-').map(Number);
      const syncedDate = new Date(sy, sm - 1, sd, 14, 30, 0);
      if (syncedDate > now) {
        return {
          dateObj: syncedDate,
          isPostponed: !!syncedUpcoming.isPostponed,
          postponeReason: syncedUpcoming.postponeReason || null,
          isFromOfficialSync: true
        };
      }
    }

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    let targetYear = currentYear;
    let targetMonth = currentMonth;
    let targetDay = 1;

    // Check first draw of the month (account for potential Jan 2 or May 2 postponement)
    const firstDrawRule = getPostponementRule(currentYear, currentMonth, 1);
    const firstDrawDay = firstDrawRule.day;
    const isBeforeFirstDraw = currentDate < firstDrawDay || 
      (currentDate === firstDrawDay && (currentHour < 14 || (currentHour === 14 && currentMinute < 30)));

    if (isBeforeFirstDraw) {
      targetDay = firstDrawDay;
      return {
        dateObj: new Date(targetYear, targetMonth, targetDay, 14, 30, 0),
        isPostponed: firstDrawRule.isPostponed,
        postponeReason: firstDrawRule.reason,
        isFromOfficialSync: false
      };
    }

    // Check second draw of the month (account for potential Jan 17 postponement or Dec 30)
    const secondDrawRule = currentMonth === 11 
      ? getPostponementRule(currentYear, currentMonth, 31) // Dec 30
      : getPostponementRule(currentYear, currentMonth, 16); // e.g. Jan 17 or 16
    
    const secondDrawDay = currentMonth === 11 ? 30 : secondDrawRule.day;
    const isBeforeSecondDraw = currentDate < secondDrawDay || 
      (currentDate === secondDrawDay && (currentHour < 14 || (currentHour === 14 && currentMinute < 30)));

    if (isBeforeSecondDraw) {
      targetDay = secondDrawDay;
      return {
        dateObj: new Date(targetYear, targetMonth, targetDay, 14, 30, 0),
        isPostponed: secondDrawRule.isPostponed,
        postponeReason: secondDrawRule.reason,
        isFromOfficialSync: false
      };
    }

    // After second draw -> Advance to first draw of next month
    targetMonth = currentMonth + 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear = currentYear + 1;
    }

    const nextMonthFirstRule = getPostponementRule(targetYear, targetMonth, 1);
    targetDay = nextMonthFirstRule.day;

    return {
      dateObj: new Date(targetYear, targetMonth, targetDay, 14, 30, 0),
      isPostponed: nextMonthFirstRule.isPostponed,
      postponeReason: nextMonthFirstRule.reason,
      isFromOfficialSync: false
    };
  }

  /**
   * Formats Thai date string e.g. "16 กันยายน 2569 (เวลา 14:30 น.)"
   */
  function formatThaiDrawDate(dateObj) {
    if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
      return '16 กันยายน 2569 (เวลา 14:30 น.)';
    }
    const day = dateObj.getDate();
    const month = thaiMonths[dateObj.getMonth()];
    const thaiYear = dateObj.getFullYear() + 543;
    return `${day} ${month} ${thaiYear} (เวลา 14:30 น.)`;
  }

  /**
   * Calculates remaining countdown numbers
   */
  function calculateRemainingTime(referenceDate) {
    const drawInfo = getNextDrawDate(referenceDate);
    const targetDate = drawInfo.dateObj;
    const now = referenceDate ? new Date(referenceDate) : new Date();
    const diffMs = targetDate - now;

    if (diffMs <= 0) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isLive: true,
        targetDate: targetDate,
        targetDateText: formatThaiDrawDate(targetDate),
        isPostponed: drawInfo.isPostponed,
        postponeReason: drawInfo.postponeReason,
        isFromOfficialSync: drawInfo.isFromOfficialSync,
        latestLottery: syncedLatest
      };
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      days,
      hours,
      minutes,
      seconds,
      isLive: false,
      targetDate: targetDate,
      targetDateText: formatThaiDrawDate(targetDate),
      isPostponed: drawInfo.isPostponed,
      postponeReason: drawInfo.postponeReason,
      isFromOfficialSync: drawInfo.isFromOfficialSync,
      latestLottery: syncedLatest
    };
  }

  /**
   * Starts a 1-second interval ticker
   */
  function startTicker(onTick) {
    if (typeof onTick === 'function') {
      onTick(calculateRemainingTime());
      return setInterval(() => {
        onTick(calculateRemainingTime());
      }, 1000);
    }
    return null;
  }

  /**
   * Asynchronously syncs with official GLO draw schedule API and static dataset.
   * Multi-tier:
   * 1. /api/draw-schedule (serverless / bot proxy with live GLO checking)
   * 2. ./data/official-draw-schedule.json & ./data/latest-lottery.json (static fallback)
   */
  async function syncOfficialSchedule() {
    let payload = null;

    // Tier 1: Try /api/draw-schedule
    try {
      const res = await fetch('/api/draw-schedule', {
        headers: { 'Accept': 'application/json' },
        cache: 'no-cache'
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.success) {
          payload = json;
        }
      }
    } catch (_) {}

    // Tier 2: Static JSON fallback if API route unavailable
    if (!payload) {
      try {
        const [schedRes, latestRes] = await Promise.all([
          fetch('./data/official-draw-schedule.json'),
          fetch('./data/latest-lottery.json')
        ]);
        if (schedRes.ok && latestRes.ok) {
          const sched = await schedRes.json();
          const latest = await latestRes.json();
          
          // Find next upcoming
          const now = new Date();
          let nextSched = null;
          if (sched && Array.isArray(sched.schedules)) {
            officialSchedules = sched.schedules;
            const futures = sched.schedules
              .map(s => {
                const [y, m, d] = s.drawDate.split('-').map(Number);
                return { ...s, dt: new Date(y, m - 1, d, 14, 30, 0) };
              })
              .filter(s => s.dt > now)
              .sort((a, b) => a.dt - b.dt);
            if (futures.length > 0) nextSched = futures[0];
          }

          payload = {
            success: true,
            upcomingDraw: nextSched,
            latestLottery: latest
          };
        }
      } catch (_) {}
    }

    // Tier 3: Apply payload if retrieved
    if (payload) {
      if (payload.upcomingDraw) {
        syncedUpcoming = payload.upcomingDraw;
      }
      if (payload.latestLottery) {
        syncedLatest = payload.latestLottery;
        // Notify N3Checker if available
        if (typeof window !== 'undefined' && window.N3Checker && typeof window.N3Checker.syncLatestResults === 'function') {
          window.N3Checker.syncLatestResults(syncedLatest);
        }
      }

      // Save to localStorage
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            syncedAt: new Date().toISOString(),
            upcomingDraw: syncedUpcoming,
            latestLottery: syncedLatest
          }));
        }
      } catch (_) {}

      // Fire listeners
      listeners.forEach(fn => {
        try { fn(calculateRemainingTime(), syncedLatest); } catch (_) {}
      });

      return {
        success: true,
        upcomingDraw: syncedUpcoming,
        latestLottery: syncedLatest
      };
    }

    return {
      success: false,
      upcomingDraw: null,
      latestLottery: syncedLatest
    };
  }

  function onScheduleUpdated(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function getLatestLotteryData() {
    return syncedLatest;
  }

  function getUpcomingDrawInfo() {
    return syncedUpcoming;
  }

  return {
    getNextDrawDate: (ref) => getNextDrawDate(ref).dateObj,
    getNextDrawDetail: getNextDrawDate,
    formatThaiDrawDate,
    calculateRemainingTime,
    startTicker,
    syncOfficialSchedule,
    onScheduleUpdated,
    getLatestLotteryData,
    getUpcomingDrawInfo,
    getPostponementRule
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = N3Countdown;
}
