/* ==========================================================================
   GLO N3 - Next Draw Countdown & Schedule Engine
   Calculates 1st & 16th Monthly Draws (14:30 TH Time)
   ========================================================================== */

const N3Countdown = (function () {
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  /**
   * Calculates the exact Next Draw Date Object
   */
  function getNextDrawDate() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    let targetYear = currentYear;
    let targetMonth = currentMonth;
    let targetDay = 1;

    // Check if before 1st at 14:30
    if (currentDate < 1 || (currentDate === 1 && (currentHour < 14 || (currentHour === 14 && currentMinute < 30)))) {
      targetDay = 1;
    }
    // Check if between 1st 14:30 and 16th 14:30
    else if (currentDate < 16 || (currentDate === 16 && (currentHour < 14 || (currentHour === 14 && currentMinute < 30)))) {
      targetDay = 16;
    }
    // After 16th 14:30 -> Next month 1st
    else {
      targetDay = 1;
      targetMonth = currentMonth + 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear = currentYear + 1;
      }
    }

    return new Date(targetYear, targetMonth, targetDay, 14, 30, 0);
  }

  /**
   * Formats Thai date string e.g. "16 กันยายน 2569 (14:30 น.)"
   */
  function formatThaiDrawDate(dateObj) {
    const day = dateObj.getDate();
    const month = thaiMonths[dateObj.getMonth()];
    const thaiYear = dateObj.getFullYear() + 543;
    return `${day} ${month} ${thaiYear} (เวลา 14:30 น.)`;
  }

  /**
   * Calculates remaining countdown numbers
   */
  function calculateRemainingTime() {
    const targetDate = getNextDrawDate();
    const now = new Date();
    const diffMs = targetDate - now;

    if (diffMs <= 0) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isLive: true,
        targetDateText: formatThaiDrawDate(targetDate)
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
      targetDateText: formatThaiDrawDate(targetDate)
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

  return {
    getNextDrawDate,
    formatThaiDrawDate,
    calculateRemainingTime,
    startTicker
  };
})();
