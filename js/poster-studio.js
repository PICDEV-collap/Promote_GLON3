/* ==========================================================================
   GLO N3 - Agent Poster & Banner Marketing Studio (Canvas Engine)
   Renders High-DPI Marketing Posters for Social Media & Storefronts
   ========================================================================== */

const PosterStudio = (function () {
  /**
   * Helper to draw text with shadow
   */
  function drawGlowText(ctx, text, x, y, font, color, glowColor, glowBlur = 15) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * Render Poster to Canvas Data URL
   */
  function renderPoster(config) {
    const isStory = config.ratio === 'story';
    const width = 1080;
    const height = isStory ? 1920 : 1080;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const theme = config.theme || 'gold';
    const shopName = config.shopName || 'ร้านสลาก N3 มหามงคล';
    const drawDate = config.drawDate || '1 กันยายน 2569';
    const featuredNumbers = config.numbers || ['789', '532', '904'];
    const contactLine = config.line || '@glon3';
    const contactTel = config.tel || '02-528-9999';
    const customHeadline = config.headline || 'สลากกินแบ่งรัฐบาล N3 (3 หลัก) ใบละ 20 บาท';

    // 1. Background Fill by Theme
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    if (theme === 'emerald') {
      bgGrad.addColorStop(0, '#051914');
      bgGrad.addColorStop(0.5, '#0a2e23');
      bgGrad.addColorStop(1, '#020d0a');
    } else if (theme === 'midnight') {
      bgGrad.addColorStop(0, '#060d1f');
      bgGrad.addColorStop(0.5, '#0b1b3d');
      bgGrad.addColorStop(1, '#030712');
    } else {
      // Gold theme
      bgGrad.addColorStop(0, '#0a0d18');
      bgGrad.addColorStop(0.5, '#151c30');
      bgGrad.addColorStop(1, '#05070e');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Nebula Accents
    const radial = ctx.createRadialGradient(width / 2, height * 0.4, 50, width / 2, height * 0.4, width * 0.6);
    radial.addColorStop(0, theme === 'emerald' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 215, 0, 0.2)');
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);

    // 2. Borders & Corner Accents
    const margin = 35;
    ctx.strokeStyle = theme === 'emerald' ? '#10b981' : '#ffd700';
    ctx.lineWidth = 4;
    ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(margin + 15, margin + 15, width - (margin + 15) * 2, height - (margin + 15) * 2);

    // 3. Top Header: GLO Official Badge & Shop Name
    let currentY = isStory ? 160 : 120;

    // GLO Pill Badge
    ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(width / 2 - 220, currentY - 45, 440, 56, 28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = '700 24px "Prompt", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦ สลากกินแบ่งรัฐบาล GLO N3 ✦', width / 2, currentY - 8);

    currentY += isStory ? 100 : 75;

    // Shop Name
    drawGlowText(
      ctx,
      shopName,
      width / 2,
      currentY,
      '900 52px "Prompt", sans-serif',
      '#ffffff',
      'rgba(255, 215, 0, 0.6)',
      25
    );

    currentY += isStory ? 60 : 45;

    // Draw Date Pill
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 26px "Kanit", sans-serif';
    ctx.fillText(`งวดประจำวันที่ ${drawDate} • ใบละ 20 บาท`, width / 2, currentY);

    currentY += isStory ? 90 : 60;

    // Headline
    ctx.fillStyle = theme === 'emerald' ? '#34d399' : '#ffd700';
    ctx.font = '700 32px "Prompt", sans-serif';
    ctx.fillText(customHeadline, width / 2, currentY);

    // 4. Featured 3-Digit Balls Section
    currentY += isStory ? 130 : 90;

    drawGlowText(
      ctx,
      '★ ชุดเลขเด็ด N3 คัดพิเศษประจำงวด ★',
      width / 2,
      currentY,
      '700 28px "Prompt", sans-serif',
      '#ffffff',
      'rgba(16, 185, 129, 0.5)',
      15
    );

    currentY += isStory ? 110 : 80;

    // Draw 3 Big Number Cards / Balls
    const boxWidth = 280;
    const boxHeight = isStory ? 160 : 130;
    const startX = width / 2 - (boxWidth * 3 + 30 * 2) / 2;

    featuredNumbers.slice(0, 3).forEach((numStr, idx) => {
      const bx = startX + idx * (boxWidth + 30);
      const by = currentY;

      // Card Box
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.strokeStyle = theme === 'emerald' ? 'rgba(16, 185, 129, 0.7)' : 'rgba(255, 215, 0, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(bx, by, boxWidth, boxHeight, 20);
      ctx.fill();
      ctx.stroke();

      // Card Title
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 20px "Prompt", sans-serif';
      ctx.fillText(`ชุดที่ ${idx + 1} (3 ตัวตรง)`, bx + boxWidth / 2, by + 36);

      // Digits
      drawGlowText(
        ctx,
        numStr,
        bx + boxWidth / 2,
        by + boxHeight - 28,
        '900 64px "Prompt", sans-serif',
        theme === 'emerald' ? '#34d399' : '#ffd700',
        'rgba(255, 215, 0, 0.7)',
        20
      );
    });

    currentY += boxHeight + (isStory ? 100 : 60);

    // 5. 4 Prizes Value Proposition
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    const propWidth = 920;
    const propHeight = isStory ? 240 : 160;
    ctx.beginPath();
    ctx.roundRect(width / 2 - propWidth / 2, currentY, propWidth, propHeight, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = '700 26px "Prompt", sans-serif';
    ctx.fillText('🏆 ลุ้นรับ 4 รางวัลใหญ่ สัดส่วนเงินรางวัล 60% ของยอดขาย 🏆', width / 2, currentY + 45);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '400 22px "Kanit", sans-serif';
    ctx.fillText('• 3 ตัวตรง (30%)   • 3 ตัวโต๊ด (30%)   • 2 ตัวตรง (39%)   • แจ็กพอตพิเศษ (1%)', width / 2, currentY + 95);

    if (isStory) {
      ctx.fillStyle = '#34d399';
      ctx.font = '500 22px "Kanit", sans-serif';
      ctx.fillText('✓ สลากดิจิทัลถูกต้องตามกฎหมาย 100% ซื้อตรงผ่านร้านค้าและแอปเป๋าตัง', width / 2, currentY + 160);
      ctx.fillText('✓ รับเงินรางวัลเต็มจำนวน ปลอดภัย ตรวจผลรางวัลอัตโนมัติ', width / 2, currentY + 200);
    }

    // 6. Footer Contact & QR Placeholder
    const footerY = height - (isStory ? 220 : 140);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px "Prompt", sans-serif';
    ctx.fillText(`🛒 สั่งซื้อกับเรา: LINE ${contactLine}  |  โทร: ${contactTel}`, width / 2, footerY);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 20px "Kanit", sans-serif';
    ctx.fillText('แสกนสั่งซื้อผ่านแอปพลิเคชัน "เป๋าตัง" หรือติดต่อหน้าร้านค้าของเราได้ตลอด 24 ชม.', width / 2, footerY + 45);

    return canvas.toDataURL('image/png');
  }

  /**
   * Trigger download of generated poster
   */
  function downloadPoster(config) {
    const dataUrl = renderPoster(config);
    const link = document.createElement('a');
    link.download = `GLO-N3-Poster-${config.ratio || 'square'}-${Date.now()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return {
    renderPoster,
    downloadPoster
  };
})();
