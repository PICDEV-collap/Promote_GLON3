/* ==========================================================================
   GLO N3 - Prize Structure & Odds Calculator Engine
   Official GLO N3 Regulations Simulator (20 THB / Ticket)
   ========================================================================== */

const N3Calculator = (function () {
  const TICKET_PRICE = 20; // 20 THB per ticket

  /**
   * Calculates prize pool allocation based on ticket count or total pool size
   */
  function calculatePrizePool(totalSalesTHB) {
    const prizePoolTotal = totalSalesTHB * 0.60; // 60% allocated for prizes

    const n3DirectPool = prizePoolTotal * 0.30;   // 30% for 3-Direct
    const n3TodPool = prizePoolTotal * 0.30;      // 30% for 3-Tod
    const n2DirectPool = prizePoolTotal * 0.39;   // 39% for 2-Direct
    const specialJackpotPool = prizePoolTotal * 0.01; // 1% for Special Jackpot

    return {
      totalSales: totalSalesTHB,
      ticketCount: totalSalesTHB / TICKET_PRICE,
      prizePoolTotal: prizePoolTotal,
      n3DirectPool: n3DirectPool,
      n3TodPool: n3TodPool,
      n2DirectPool: n2DirectPool,
      specialJackpotPool: specialJackpotPool
    };
  }

  /**
   * Formats numbers to Thai Baht currency string
   */
  function formatBaht(amount) {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 0
    }).format(amount);
  }

  return {
    TICKET_PRICE,
    calculatePrizePool,
    formatBaht
  };
})();
