/**
 * GLO N3 Generative Dream Art Canvas Engine
 * Renders Ultra-Luxury 1080x1080 High-DPI Celestial Dreamscape Art
 * Generates custom sacred motifs, glowing auroras, starfields, and constellation runes
 */

const DreamArtGenerator = (function () {
  'use strict';

  /**
   * Helper to draw glowing starfield particles
   */
  function drawStarfield(ctx, width, height, count = 120) {
    ctx.save();
    for (let i = 0; i < count; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const radius = Math.random() * 2.2 + 0.5;
      const alpha = Math.random() * 0.75 + 0.25;

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Occasional sparkling cross star
      if (i % 12 === 0) {
        ctx.strokeStyle = `rgba(254, 240, 138, ${alpha * 0.8})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - radius * 4, y);
        ctx.lineTo(x + radius * 4, y);
        ctx.moveTo(x, y - radius * 4);
        ctx.lineTo(x, y + radius * 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Helper to draw Sacred Mandala & Ray Halo
   */
  function drawMandalaRays(ctx, cx, cy, radius, rayCount = 16, color = 'rgba(250, 204, 21, 0.25)') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    for (let i = 0; i < rayCount; i++) {
      const angle = (i * Math.PI * 2) / rayCount;
      const x1 = cx + Math.cos(angle) * (radius * 0.4);
      const y1 = cy + Math.sin(angle) * (radius * 0.4);
      const x2 = cx + Math.cos(angle) * radius;
      const y2 = cy + Math.sin(angle) * radius;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Concentric sacred rings
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
    ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Motif 1: Naga / Dragon / Serpent Motif
   */
  function drawNagaMotif(ctx, cx, cy, size) {
    ctx.save();
    // Emerald & Gold Radiant Aura
    const aura = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.85);
    aura.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
    aura.addColorStop(0.5, 'rgba(250, 204, 21, 0.25)');
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(cx - size, cy - size, size * 2, size * 2);

    // Spiraling Serpentine Waves
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 6; a += 0.05) {
      const r = (size * 0.1) + (a * size * 0.035);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * (r * 0.75) + Math.sin(a * 3) * 15;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Sacred Naga Crest & Jewel in Center
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(cx, cy - 30, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 35;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Motif 2: Buddha / Sacred Temple / Monk
   */
  function drawSacredTempleMotif(ctx, cx, cy, size) {
    ctx.save();
    // Golden Dharmachakra Halo
    const halo = ctx.createRadialGradient(cx, cy, 20, cx, cy, size * 0.8);
    halo.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
    halo.addColorStop(0.6, 'rgba(217, 119, 6, 0.25)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - size, cy - size, size * 2, size * 2);

    drawMandalaRays(ctx, cx, cy, size * 0.7, 24, 'rgba(254, 240, 138, 0.4)');

    // Sacred Lotus Base
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.35, size * 0.5, size * 0.15, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Central Radiant Flame
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.3);
    ctx.quadraticCurveTo(cx + 35, cy, cx, cy + 40);
    ctx.quadraticCurveTo(cx - 35, cy, cx, cy - size * 0.3);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Motif 3: Oceanic / Water / Fish
   */
  function drawOceanicMotif(ctx, cx, cy, size) {
    ctx.save();
    // Sapphire & Cyan Bioluminescent Vortex
    const vortex = ctx.createRadialGradient(cx, cy, 20, cx, cy, size * 0.85);
    vortex.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
    vortex.addColorStop(0.5, 'rgba(16, 185, 129, 0.25)');
    vortex.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = vortex;
    ctx.fillRect(cx - size, cy - size, size * 2, size * 2);

    // Flowing Aquatic Waves
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.75)';
    ctx.lineWidth = 3;
    for (let w = 0; w < 4; w++) {
      ctx.beginPath();
      for (let x = cx - size * 0.8; x <= cx + size * 0.8; x += 10) {
        const y = cy - 80 + w * 50 + Math.sin((x + w * 40) * 0.02) * 30;
        if (x === cx - size * 0.8) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Motif 4: Solar / Fire / Phoenix
   */
  function drawSolarFireMotif(ctx, cx, cy, size) {
    ctx.save();
    const flare = ctx.createRadialGradient(cx, cy, 30, cx, cy, size * 0.8);
    flare.addColorStop(0, 'rgba(239, 68, 68, 0.55)');
    flare.addColorStop(0.4, 'rgba(245, 158, 11, 0.35)');
    flare.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = flare;
    ctx.fillRect(cx - size, cy - size, size * 2, size * 2);

    // Radiant Solar Flare Petals
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI * 2) / 12;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const tipX = cx + Math.cos(angle) * (size * 0.65);
      const tipY = cy + Math.sin(angle) * (size * 0.65);
      ctx.quadraticCurveTo(cx + Math.cos(angle + 0.3) * (size * 0.35), cy + Math.sin(angle + 0.3) * (size * 0.35), tipX, tipY);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Motif 5: Celestial Elephant / Majestic Beast
   */
  function drawCelestialBeastMotif(ctx, cx, cy, size) {
    ctx.save();
    const aura = ctx.createRadialGradient(cx, cy, 30, cx, cy, size * 0.8);
    aura.addColorStop(0, 'rgba(168, 85, 247, 0.45)');
    aura.addColorStop(0.5, 'rgba(234, 179, 8, 0.25)');
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(cx - size, cy - size, size * 2, size * 2);

    drawMandalaRays(ctx, cx, cy, size * 0.65, 12, 'rgba(216, 180, 254, 0.35)');

    // Celestial Crescent Crown
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy - 40, size * 0.32, 0.2 * Math.PI, 0.8 * Math.PI, false);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Main Render Method
   * Generates a 1080x1080 High-Res PNG Data URL
   */
  function generateDreamArtDataUrl(prediction, options = {}) {
    const width = options.width || 1080;
    const height = options.height || 1080;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const promptText = (prediction && prediction.prompt) || 'นิมิตโชคลาภมหาเศรษฐี';
    const meaning = (prediction && prediction.meaning) || '';
    const digits = (prediction && prediction.luckyDigitsPrimary) || ['5', '9', '8'];
    const threeStraight = (prediction && prediction.threeStraight) || '598';
    const category = (prediction && prediction.category) || '';

    // 1. Deep Celestial Space Background
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width * 0.75);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.6, '#090d16');
    bgGrad.addColorStop(1, '#020408');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Starfield & Cosmic Dust
    drawStarfield(ctx, width, height, 150);

    // 3. Category Motif Selection
    const cx = width / 2;
    const cy = height * 0.44;
    const motifSize = width * 0.38;

    if (/งู|พญานาค|มังกร/i.test(promptText) || /สัตว์เลื้อยคลาน/i.test(category)) {
      drawNagaMotif(ctx, cx, cy, motifSize);
    } else if (/พระ|วัด|สงฆ์|โบสถ์|หลวงพ่อ/i.test(promptText) || /สิ่งศักดิ์สิทธิ์/i.test(category)) {
      drawSacredTempleMotif(ctx, cx, cy, motifSize);
    } else if (/ปลา|น้ำ|ทะเล|แม่น้ำ|ฝน/i.test(promptText) || /น้ำ/i.test(category)) {
      drawOceanicMotif(ctx, cx, cy, motifSize);
    } else if (/ไฟ|เพลิง|ควัน|ทอง/i.test(promptText) || /ไฟ/i.test(category)) {
      drawSolarFireMotif(ctx, cx, cy, motifSize);
    } else if (/ช้าง|เสือ|สัตว์/i.test(promptText)) {
      drawCelestialBeastMotif(ctx, cx, cy, motifSize);
    } else {
      drawMandalaRays(ctx, cx, cy, motifSize * 0.8, 16, 'rgba(250, 204, 21, 0.3)');
      drawNagaMotif(ctx, cx, cy, motifSize * 0.85);
    }

    // 4. Floating Celestial Lucky Glyphs (Astro Runes)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '800 52px "Prompt", sans-serif';
    ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 20;

    const glyphRadius = motifSize * 0.88;
    digits.forEach((d, idx) => {
      const angle = (idx * (Math.PI * 2 / digits.length)) - Math.PI / 2;
      const gx = cx + Math.cos(angle) * glyphRadius;
      const gy = cy + Math.sin(angle) * glyphRadius;

      // Glow backing
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.beginPath();
      ctx.arc(gx, gy, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Number text
      ctx.fillStyle = '#fef08a';
      ctx.fillText(d, gx, gy + 18);
    });
    ctx.restore();

    // 5. Luxury Golden Frame & Borders
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, width - 60, height - 60);

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(45, 45, width - 90, height - 90);

    // Corner Ornaments
    const drawCorner = (x, y, dx, dy) => {
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y + dy * 35);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * 35, y);
      ctx.stroke();
    };
    drawCorner(30, 30, 1, 1);
    drawCorner(width - 30, 30, -1, 1);
    drawCorner(30, height - 30, 1, -1);
    drawCorner(width - 30, height - 30, -1, -1);
    ctx.restore();

    // 6. Typography & Overlay Details (Bottom Banner)
    ctx.save();
    ctx.textAlign = 'center';

    // Top Title
    ctx.font = '700 28px "Prompt", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('✦ นิมิตหมายมงคลถอดรหัส AI ✦', width / 2, 90);

    ctx.font = '900 42px "Prompt", sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 15;
    const cleanPrompt = promptText.length > 24 ? promptText.substring(0, 24) + '...' : promptText;
    ctx.fillText(`"${cleanPrompt}"`, width / 2, 145);

    // Bottom Badge: 3 Straight Combo Highlight
    const boxY = height - 190;
    const boxW = width - 120;
    const boxH = 130;
    const boxX = (width - boxW) / 2;

    const boxGrad = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
    boxGrad.addColorStop(0, 'rgba(15, 23, 42, 0.92)');
    boxGrad.addColorStop(1, 'rgba(30, 41, 59, 0.92)');
    ctx.fillStyle = boxGrad;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inside Box Text
    ctx.font = '700 26px "Prompt", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('🎯 ชุดเลขมงคล 3 ตัวตรง N3', width / 2, boxY + 45);

    ctx.font = '900 56px "Prompt", sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(threeStraight, width / 2, boxY + 105);

    // Footer Watermark
    ctx.font = '500 20px "Prompt", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillText('ร้านสลาก N3 ธนกิจนำโชค • promote-glon-3.vercel.app', width / 2, height - 25);
    ctx.restore();

    return canvas.toDataURL('image/png');
  }

  return {
    generateDreamArtDataUrl
  };
})();

// Attach to window
if (typeof window !== 'undefined') {
  window.DreamArtGenerator = DreamArtGenerator;
}
