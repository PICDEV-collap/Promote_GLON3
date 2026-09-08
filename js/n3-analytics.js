/**
 * GLO N3 Historical Probability & Astrological Analytics Engine
 * Calculates digit heatmaps (Hundreds, Tens, Units), Hot/Cold indicators,
 * Day-of-Week Astrological Matrix, and 1-Click order dispatch.
 */

const N3AnalyticsEngine = (function () {
  'use strict';

  // Day of Week Lucky Matrix (โหราศาสตร์เลขกำลังวันมาตรฐานไทย)
  const DAY_ASTRO_MATRIX = {
    Sunday: {
      nameThai: 'วันอาทิตย์',
      planet: 'ดาวอาทิตย์ (๑)',
      element: 'ธาตุไฟ',
      powerDigits: ['1', '5', '6', '8'],
      secondaryDigits: ['0', '9'],
      luckyColor: '#ef4444',
      luckyPairs: ['15', '56', '68', '18', '85']
    },
    Monday: {
      nameThai: 'วันจันทร์',
      planet: 'ดาวจันทร์ (๒)',
      element: 'ธาตุดิน',
      powerDigits: ['2', '4', '7', '9'],
      secondaryDigits: ['5', '8'],
      luckyColor: '#facc15',
      luckyPairs: ['24', '47', '79', '29', '94']
    },
    Tuesday: {
      nameThai: 'วันอังคาร',
      planet: 'ดาวอังคาร (๓)',
      element: 'ธาตุลม',
      powerDigits: ['3', '5', '7', '8'],
      secondaryDigits: ['1', '4'],
      luckyColor: '#ec4899',
      luckyPairs: ['35', '57', '78', '38', '85']
    },
    Wednesday: {
      nameThai: 'วันพุธ',
      planet: 'ดาวพุธ (๔)',
      element: 'ธาตุน้ำ',
      powerDigits: ['4', '2', '8', '6'],
      secondaryDigits: ['1', '7'],
      luckyColor: '#10b981',
      luckyPairs: ['42', '28', '86', '46', '62']
    },
    Thursday: {
      nameThai: 'วันพฤหัสบดี',
      planet: 'ดาวพฤหัสบดี (๕)',
      element: 'ธาตุดิน/ไม้',
      powerDigits: ['5', '1', '3', '9'],
      secondaryDigits: ['2', '7'],
      luckyColor: '#f97316',
      luckyPairs: ['51', '13', '39', '59', '93']
    },
    Friday: {
      nameThai: 'วันศุกร์',
      planet: 'ดาวศุกร์ (๖)',
      element: 'ธาตุน้ำ/ทอง',
      powerDigits: ['6', '3', '4', '7'],
      secondaryDigits: ['0', '5'],
      luckyColor: '#38bdf8',
      luckyPairs: ['63', '34', '47', '67', '73']
    },
    Saturday: {
      nameThai: 'วันเสาร์',
      planet: 'ดาวเสาร์ (๗)',
      element: 'ธาตุไฟ/ดิน',
      powerDigits: ['7', '1', '5', '8'],
      secondaryDigits: ['2', '6'],
      luckyColor: '#8b5cf6',
      luckyPairs: ['71', '15', '58', '78', '81']
    }
  };

  let historicalDraws = [];

  // Default fallback data if fetch fails
  const DEFAULT_DRAWS = [
    { drawDate: '2026-09-01', drawDateThai: '1 ก.ย. 2569', dayOfWeek: 'Tuesday', threeStraight: '447', twoStraight: '73' },
    { drawDate: '2026-08-16', drawDateThai: '16 ส.ค. 2569', dayOfWeek: 'Sunday', threeStraight: '334', twoStraight: '42' },
    { drawDate: '2026-08-01', drawDateThai: '1 ส.ค. 2569', dayOfWeek: 'Saturday', threeStraight: '778', twoStraight: '85' },
    { drawDate: '2026-07-16', drawDateThai: '16 ก.ค. 2569', dayOfWeek: 'Thursday', threeStraight: '608', twoStraight: '08' },
    { drawDate: '2026-07-01', drawDateThai: '1 ก.ค. 2569', dayOfWeek: 'Wednesday', threeStraight: '519', twoStraight: '19' },
    { drawDate: '2026-06-16', drawDateThai: '16 มิ.ย. 2569', dayOfWeek: 'Tuesday', threeStraight: '892', twoStraight: '92' },
    { drawDate: '2026-06-01', drawDateThai: '1 มิ.ย. 2569', dayOfWeek: 'Monday', threeStraight: '349', twoStraight: '49' },
    { drawDate: '2026-05-16', drawDateThai: '16 พ.ค. 2569', dayOfWeek: 'Saturday', threeStraight: '720', twoStraight: '20' },
    { drawDate: '2026-05-02', drawDateThai: '2 พ.ค. 2569', dayOfWeek: 'Saturday', threeStraight: '158', twoStraight: '58' },
    { drawDate: '2026-04-16', drawDateThai: '16 เม.ย. 2569', dayOfWeek: 'Thursday', threeStraight: '946', twoStraight: '46' },
    { drawDate: '2026-04-01', drawDateThai: '1 เม.ย. 2569', dayOfWeek: 'Wednesday', threeStraight: '623', twoStraight: '23' },
    { drawDate: '2026-03-16', drawDateThai: '16 มี.ค. 2569', dayOfWeek: 'Monday', threeStraight: '583', twoStraight: '83' }
  ];

  async function loadData() {
    try {
      const res = await fetch('data/n3-historical-draws.json?v=' + Date.now());
      if (res.ok) {
        historicalDraws = await res.json();
      } else {
        historicalDraws = DEFAULT_DRAWS;
      }
    } catch (e) {
      console.warn('[N3Analytics] Error loading historical data, using defaults:', e);
      historicalDraws = DEFAULT_DRAWS;
    }
    return historicalDraws;
  }

  /**
   * Calculate full statistical analytics
   */
  function calculateStats(draws = historicalDraws) {
    const list = (draws && draws.length > 0) ? draws : DEFAULT_DRAWS;
    const totalDraws = list.length;

    // Frequencies: 0-9 for Hundreds, Tens, Units, Total
    const freq = {
      hundreds: Array(10).fill(0),
      tens: Array(10).fill(0),
      units: Array(10).fill(0),
      total: Array(10).fill(0),
      twoDigits: Array(10).fill(0)
    };

    const lastSeen = Array(10).fill(-1); // Index of draw where digit last appeared

    list.forEach((draw, idx) => {
      const num = String(draw.threeStraight || '').padStart(3, '0');
      const h = parseInt(num[0], 10);
      const t = parseInt(num[1], 10);
      const u = parseInt(num[2], 10);

      if (!isNaN(h)) { freq.hundreds[h]++; freq.total[h]++; if (lastSeen[h] === -1) lastSeen[h] = idx; }
      if (!isNaN(t)) { freq.tens[t]++; freq.total[t]++; if (lastSeen[t] === -1) lastSeen[t] = idx; }
      if (!isNaN(u)) { freq.units[u]++; freq.total[u]++; if (lastSeen[u] === -1) lastSeen[u] = idx; }

      if (draw.twoStraight) {
        const two = String(draw.twoStraight).padStart(2, '0');
        const t2 = parseInt(two[0], 10);
        const u2 = parseInt(two[1], 10);
        if (!isNaN(t2)) freq.twoDigits[t2]++;
        if (!isNaN(u2)) freq.twoDigits[u2]++;
      }
    });

    // Hot digits (Highest frequency total)
    const hotDigits = [...Array(10).keys()]
      .map(d => ({ digit: d, count: freq.total[d], pct: Math.round((freq.total[d] / (totalDraws * 3)) * 100) }))
      .sort((a, b) => b.count - a.count);

    // Cold / Due digits (Longest absent from recent draws)
    const coldDigits = [...Array(10).keys()]
      .map(d => ({ digit: d, absentDraws: lastSeen[d] === -1 ? totalDraws : lastSeen[d], count: freq.total[d] }))
      .sort((a, b) => b.absentDraws - a.absentDraws);

    // Determine upcoming draw day of week
    const now = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[now.getDay()];
    const astroInfo = DAY_ASTRO_MATRIX[currentDay] || DAY_ASTRO_MATRIX.Tuesday;

    // Generate Recommended High-Probability Combos
    const topHot = hotDigits.slice(0, 3).map(h => String(h.digit));
    const powerD = astroInfo.powerDigits;
    
    // 3 Straight Combos
    const smartCombos = [
      `${topHot[0] || '4'}${topHot[1] || '7'}${powerD[0] || '5'}`,
      `${powerD[0] || '5'}${topHot[0] || '4'}${powerD[1] || '6'}`,
      `${topHot[1] || '7'}${powerD[1] || '6'}${topHot[2] || '9'}`
    ];

    return {
      totalDraws,
      freq,
      hotDigits,
      coldDigits,
      astroInfo,
      smartCombos,
      latestDraw: list[0] || {}
    };
  }

  let currentPositionFilter = 'all'; // 'all' | 'hundreds' | 'tens' | 'units'

  /**
   * Render Interactive Heatmap Table into DOM element with Mobile Position Filters
   */
  function renderHeatmapDOM(containerId, stats, filter = currentPositionFilter) {
    const el = document.getElementById(containerId);
    if (!el) return;
    currentPositionFilter = filter;

    const maxH = Math.max(...stats.freq.hundreds, 1);
    const maxT = Math.max(...stats.freq.tens, 1);
    const maxU = Math.max(...stats.freq.units, 1);
    const maxTot = Math.max(...stats.freq.total, 1);

    const getHeatColor = (val, max) => {
      const ratio = val / max;
      if (ratio >= 0.8) return 'rgba(239, 68, 68, 0.85)'; // High - Crimson
      if (ratio >= 0.5) return 'rgba(234, 179, 8, 0.75)';  // Mid - Gold
      if (ratio >= 0.25) return 'rgba(16, 185, 129, 0.65)'; // Normal - Emerald
      return 'rgba(255, 255, 255, 0.08)';                // Low - Glass
    };

    let colTitleH = filter === 'hundreds' ? 'ความถี่หลักร้อย (100)' : 'หลักร้อย';
    let colTitleT = filter === 'tens' ? 'ความถี่หลักสิบ (10)' : 'หลักสิบ';
    let colTitleU = filter === 'units' ? 'ความถี่หลักหน่วย (1)' : 'หลักหน่วย';

    let html = `
      <!-- Mobile Position Filter Tabs -->
      <div class="heatmap-filter-bar">
        <div class="filter-header-line">
          <span class="filter-label"><i class="fas fa-filter"></i> เลือกมุมมองสถิติ:</span>
          <span class="filter-hint">${filter === 'all' ? 'แสดงครบทุกหลัก (พอดีหน้าจอ)' : 'เจาะลึกเฉพาะหลัก'}</span>
        </div>
        <div class="filter-btn-group">
          <button type="button" class="filter-pill ${filter === 'all' ? 'active' : ''}" onclick="N3AnalyticsEngine.renderWithFilter('${containerId}', 'all')">
            <span class="pill-icon">📊</span> ทุกหลัก
          </button>
          <button type="button" class="filter-pill ${filter === 'hundreds' ? 'active' : ''}" onclick="N3AnalyticsEngine.renderWithFilter('${containerId}', 'hundreds')">
            <span class="pill-icon">💯</span> หลักร้อย
          </button>
          <button type="button" class="filter-pill ${filter === 'tens' ? 'active' : ''}" onclick="N3AnalyticsEngine.renderWithFilter('${containerId}', 'tens')">
            <span class="pill-icon">🔟</span> หลักสิบ
          </button>
          <button type="button" class="filter-pill ${filter === 'units' ? 'active' : ''}" onclick="N3AnalyticsEngine.renderWithFilter('${containerId}', 'units')">
            <span class="pill-icon">🎯</span> หลักหน่วย
          </button>
        </div>
      </div>

      <div class="heatmap-table-wrapper ${filter === 'all' ? 'view-all-columns' : 'view-single-column'}">
        <table class="heatmap-table">
          <thead>
            <tr>
              <th class="th-digit">${filter === 'all' ? 'เลข' : 'ตัวเลข'}</th>
              ${(filter === 'all' || filter === 'hundreds') ? `<th class="th-hundreds">${colTitleH}</th>` : ''}
              ${(filter === 'all' || filter === 'tens') ? `<th class="th-tens">${colTitleT}</th>` : ''}
              ${(filter === 'all' || filter === 'units') ? `<th class="th-units">${colTitleU}</th>` : ''}
              <th class="th-total">${filter === 'all' ? 'รวม' : 'สั่งซื้อ'}</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (let d = 0; d <= 9; d++) {
      const hCount = stats.freq.hundreds[d];
      const tCount = stats.freq.tens[d];
      const uCount = stats.freq.units[d];
      const totCount = stats.freq.total[d];
      const isHot = stats.hotDigits.slice(0, 3).some(h => h.digit === d);

      html += `
        <tr>
          <td class="digit-cell">
            <span class="digit-badge ${isHot ? 'digit-hot' : ''}">${d}</span>
            ${isHot ? '<span class="hot-tag">🔥</span>' : ''}
          </td>
          ${(filter === 'all' || filter === 'hundreds') ? `
          <td class="col-hundreds">
            <div class="heat-bar-box" style="background: ${getHeatColor(hCount, maxH)};">
              <span class="heat-val-full">${hCount} ครั้ง</span>
              <span class="heat-val-compact">${hCount}</span>
              <div class="heat-fill" style="width: ${(hCount / maxH) * 100}%;"></div>
            </div>
          </td>` : ''}
          ${(filter === 'all' || filter === 'tens') ? `
          <td class="col-tens">
            <div class="heat-bar-box" style="background: ${getHeatColor(tCount, maxT)};">
              <span class="heat-val-full">${tCount} ครั้ง</span>
              <span class="heat-val-compact">${tCount}</span>
              <div class="heat-fill" style="width: ${(tCount / maxT) * 100}%;"></div>
            </div>
          </td>` : ''}
          ${(filter === 'all' || filter === 'units') ? `
          <td class="col-units">
            <div class="heat-bar-box" style="background: ${getHeatColor(uCount, maxU)};">
              <span class="heat-val-full">${uCount} ครั้ง</span>
              <span class="heat-val-compact">${uCount}</span>
              <div class="heat-fill" style="width: ${(uCount / maxU) * 100}%;"></div>
            </div>
          </td>` : ''}
          <td class="col-total">
            <button type="button" class="order-digit-btn" onclick="N3AnalyticsEngine.dispatchToOrder('${d}${d}${d}')" title="สั่งซื้อเลข ${d}${d}${d}">
              <span class="btn-text-full"><i class="fas fa-cart-plus"></i> ${totCount} ครั้ง</span>
              <span class="btn-text-compact"><i class="fas fa-cart-shopping"></i> ${totCount}</span>
            </button>
          </td>
        </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    el.innerHTML = html;
  }

  function renderWithFilter(containerId, filter) {
    const stats = calculateStats();
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        renderHeatmapDOM(containerId, stats, filter);
      });
    } else {
      renderHeatmapDOM(containerId, stats, filter);
    }
  }

  /**
   * Helper to dispatch selected numbers directly to Order Form
   */
  function dispatchToOrder(numbers, is6Pack = false) {
    const numArr = Array.isArray(numbers) ? numbers : [numbers];
    const targetPath = is6Pack ? 'order-6pack.html' : 'order.html';
    const params = new URLSearchParams();
    params.set('openExternalBrowser', '1');
    if (numArr.length > 0) {
      params.set('numbers', numArr.join(','));
    }
    window.location.href = `${targetPath}?${params.toString()}`;
  }

  return {
    loadData,
    calculateStats,
    renderHeatmapDOM,
    renderWithFilter,
    dispatchToOrder,
    DAY_ASTRO_MATRIX
  };
})();

// Attach to window
if (typeof window !== 'undefined') {
  window.N3AnalyticsEngine = N3AnalyticsEngine;
}
