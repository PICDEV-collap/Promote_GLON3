/* ==========================================================================
   GLO N3 - Agent Poster & Banner Marketing Studio (Canvas Engine)
   Renders High-DPI Marketing Posters for Social Media & Storefronts
   With Dynamic Agent QR Code Embedding & GLO Official Compliance
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
   * Helper to load Image from src
   */
  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  /**
   * Render Poster Async with QR Code support
   */
  async function renderPosterAsync(config) {
    const isStory = config.ratio === 'story';
    const width = 1080;
    const height = isStory ? 1920 : 1080;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const theme = config.theme || 'gold';
    const shopName = config.shopName || 'ร้านสลาก N3 ธนกิจนำโชค';
    const drawDate = config.drawDate || 'งวดประจำวันที่ 1 และ 16';
    const featuredNumbers = config.numbers || ['789', '532', '904'];
    const contactLine = config.line || '@586xxhlx';
    const contactTel = config.tel || '';
    const customHeadline = config.headline || 'สลากกินแบ่งรัฐบาล N3 (3 หลัก) ใบละ 20 บาท';
    const qrSrc = config.qrImage || (typeof AgentSystem !== 'undefined' ? AgentSystem.getAgentQR() : null);

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
    let currentY = isStory ? 140 : 110;

    // GLO Pill Badge
    ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(width / 2 - 240, currentY - 45, 480, 56, 28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = '700 24px "Prompt", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦ สลากกินแบ่งรัฐบาล GLO N3 (3 หลัก) ✦', width / 2, currentY - 8);

    currentY += isStory ? 90 : 70;

    // Shop Name
    drawGlowText(
      ctx,
      shopName,
      width / 2,
      currentY,
      '900 50px "Prompt", sans-serif',
      '#ffffff',
      'rgba(255, 215, 0, 0.6)',
      25
    );

    currentY += isStory ? 55 : 45;

    // Draw Date Pill
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 24px "Kanit", sans-serif';
    ctx.fillText(`${drawDate} • ใบละ 20 บาท`, width / 2, currentY);

    currentY += isStory ? 80 : 55;

    // Headline
    ctx.fillStyle = theme === 'emerald' ? '#34d399' : '#ffd700';
    ctx.font = '700 30px "Prompt", sans-serif';
    ctx.fillText(customHeadline, width / 2, currentY);

    // 4. Featured 3-Digit Balls Section
    currentY += isStory ? 110 : 80;

    drawGlowText(
      ctx,
      '★ ชุดเลขเด็ด N3 คัดพิเศษประจำงวด ★',
      width / 2,
      currentY,
      '700 26px "Prompt", sans-serif',
      '#ffffff',
      'rgba(16, 185, 129, 0.5)',
      15
    );

    currentY += isStory ? 100 : 70;

    // Draw 3 Big Number Cards
    const boxWidth = 280;
    const boxHeight = isStory ? 150 : 120;
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
      ctx.font = '600 18px "Prompt", sans-serif';
      ctx.fillText(`ชุดที่ ${idx + 1} (3 ตัวตรง)`, bx + boxWidth / 2, by + 32);

      // Digits
      drawGlowText(
        ctx,
        numStr,
        bx + boxWidth / 2,
        by + boxHeight - 24,
        '900 58px "Prompt", sans-serif',
        theme === 'emerald' ? '#34d399' : '#ffd700',
        'rgba(255, 215, 0, 0.7)',
        20
      );
    });

    currentY += boxHeight + (isStory ? 80 : 50);

    // 5. Official 4 Prizes Allocation Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    const propWidth = 940;
    const propHeight = isStory ? 210 : 140;
    ctx.beginPath();
    ctx.roundRect(width / 2 - propWidth / 2, currentY, propWidth, propHeight, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = '700 24px "Prompt", sans-serif';
    ctx.fillText('🏆 สัดส่วนเงินรางวัล 60% ของยอดขาย (สำนักงานสลากกินแบ่งรัฐบาล) 🏆', width / 2, currentY + 38);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '400 20px "Kanit", sans-serif';
    ctx.fillText('• 3 ตรง (22.5%)   • 3 โต๊ด (14.7%)   • 2 ตรง (22.4%)   • แจ็กพอตพิเศษ (0.4%)', width / 2, currentY + 80);

    ctx.fillStyle = '#34d399';
    ctx.font = '500 19px "Kanit", sans-serif';
    ctx.fillText('✓ สลากดิจิทัล N3 ใบละ 20 บาท • สแกนซื้อผ่านแอปเป๋าตัง สะดวก ปลอดภัย 100%', width / 2, currentY + 115);

    // 6. QR Code Section (if Story layout or space permits)
    const qrImg = await loadImage(qrSrc);
    if (isStory && qrImg) {
      currentY += propHeight + 60;
      const qrSize = 220;
      const qrX = width / 2 - qrSize / 2;
      const qrY = currentY;

      // QR White Background Card
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 20);
      ctx.fill();

      // Draw QR Image
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      ctx.fillStyle = '#ffd700';
      ctx.font = '700 22px "Prompt", sans-serif';
      ctx.fillText('📲 สแกน QR ผ่านแอป "เป๋าตัง" เพื่อสั่งซื้อทันที', width / 2, qrY + qrSize + 46);
    }

    // 7. Footer Contact & Compliance
    const footerY = height - (isStory ? 160 : 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px "Prompt", sans-serif';
    const contactText = contactTel ? `🛒 สั่งซื้อกับเรา: LINE ${contactLine}  |  โทร: ${contactTel}` : `🛒 สั่งซื้อกับเรา: LINE ${contactLine}`;
    ctx.fillText(contactText, width / 2, footerY);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 18px "Kanit", sans-serif';
    ctx.fillText('สแกนสั่งซื้อผ่านแอปพลิเคชัน "เป๋าตัง" (เมนูสลากตัวเลขสามหลัก N3)', width / 2, footerY + 36);

    // GLO Compliance Badge Line
    ctx.fillStyle = '#f59e0b';
    ctx.font = '500 16px "Kanit", sans-serif';
    ctx.fillText('⚠️ คำเตือน: ห้ามจำหน่ายแก่บุคคลที่มีอายุต่ำกว่า 20 ปีบริบูรณ์ • ไม่จำหน่ายในสถานศึกษา • เล่นอย่างมีสติ', width / 2, footerY + 70);

    return canvas.toDataURL('image/png');
  }

  /**
   * Render Poster Sync wrapper
   */
  function renderPoster(config) {
    // For synchronous calls, we render without waiting for image or use existing canvas
    return renderPosterAsync(config);
  }

  /**
   * Trigger download/save of generated poster
   */
  async function downloadPoster(config) {
    const dataUrl = await renderPosterAsync(config);
    const filename = `GLO-N3-Poster-${config.ratio || 'square'}-${Date.now()}.png`;
    const title = 'โปสเตอร์โปรโมทร้านสลาก N3';
    const text = 'โปสเตอร์ประชาสัมพันธ์จุดจำหน่ายสลาก N3 ร้านสลาก N3 ธนกิจนำโชค ใบละ 20 บาท';

    if (typeof window !== 'undefined' && window.ImageSaver) {
      await window.ImageSaver.saveImage({ dataUrl, filename, title, text });
      return dataUrl;
    }

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return dataUrl;
  }

  return {
    renderPoster,
    renderPosterAsync,
    downloadPoster
  };
})();
