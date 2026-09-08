/* ==========================================================================
   GLO N3 - Prize Structure & Agent Commission Calculator Engine
   Official GLO N3 Regulations (20 THB / Ticket, 60% Prize Pool Allocation)
   ========================================================================== */

const N3Calculator = (function () {
  const TICKET_PRICE = 20; // 20 THB per ticket
  const AGENT_COMMISSION_PER_TICKET = 2; // 2 THB per ticket (10% of ticket price)

  /**
   * Calculates official GLO N3 prize pool allocations based on total sales
   * Official GLO Ratios:
   * - 3-Direct (3 ตัวตรง): 22.5% of total sales (37.5% of prize pool)
   * - 3-Tod (3 ตัวสลับหลัก): 14.7% of total sales (24.5% of prize pool)
   * - 2-Direct (2 ตัวตรง): 22.4% of total sales (37.33% of prize pool)
   * - Special Jackpot (รางวัลพิเศษ): 0.4% of total sales (0.67% of prize pool)
   * - Government Treasury (รายได้แผ่นดิน): 23%
   * - Administration & Agent Commission (ค่าบริหารงาน/ตัวแทน): 17%
   */
  function calculatePrizePool(totalSalesTHB) {
    const prizePoolTotal = totalSalesTHB * 0.60; // 60% total prize fund

    const n3DirectPool = totalSalesTHB * 0.225;       // 22.5% of total sales
    const n3TodPool = totalSalesTHB * 0.147;          // 14.7% of total sales
    const n2DirectPool = totalSalesTHB * 0.224;       // 22.4% of total sales
    const specialJackpotPool = totalSalesTHB * 0.004; // 0.4% of total sales

    const governmentRevenue = totalSalesTHB * 0.23;   // 23% Treasury
    const adminAndAgentFee = totalSalesTHB * 0.17;    // 17% Admin & Retailers

    return {
      totalSales: totalSalesTHB,
      ticketCount: totalSalesTHB / TICKET_PRICE,
      prizePoolTotal: prizePoolTotal,
      n3DirectPool: n3DirectPool,
      n3TodPool: n3TodPool,
      n2DirectPool: n2DirectPool,
      specialJackpotPool: specialJackpotPool,
      governmentRevenue: governmentRevenue,
      adminAndAgentFee: adminAndAgentFee
    };
  }

  /**
   * Calculates agent earnings based on ticket volume
   */
  function calculateAgentCommission(ticketCount) {
    const totalSales = ticketCount * TICKET_PRICE;
    const perDrawEarnings = ticketCount * AGENT_COMMISSION_PER_TICKET;
    const monthlyEarnings = perDrawEarnings * 2; // 2 draws per month

    return {
      ticketCount: ticketCount,
      totalSales: totalSales,
      commissionPerTicket: AGENT_COMMISSION_PER_TICKET,
      perDrawEarnings: perDrawEarnings,
      monthlyEarnings: monthlyEarnings
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
    AGENT_COMMISSION_PER_TICKET,
    calculatePrizePool,
    calculateAgentCommission,
    formatBaht
  };
})();
