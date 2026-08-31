/* ==========================================================================
   GLO N3 - High-DPI Social Share Card Generator (Canvas Engine)
   Renders Cyber-Astro Luxury Gold & Emerald Poster for Social Media Sharing
   ========================================================================== */

const ShareCardEngine = (function () {
  /**
   * Helper to wrap text nicely on canvas
   */
  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
    if (!text) return y;
    const words = text.split('');
    let line = '';
    let lineCount = 0;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n];
        y += lineHeight;
        lineCount++;
        if (lineCount >= maxLines - 1) {
          line += '...';
          break;
        }
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
    return y + lineHeight;
  }

  /**
   * Generates a high-res 1080x1350 PNG Data URL using HTML5 Canvas
   */
  function renderCardCanvas(pred, shopInfo = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');

    const shopName = shopInfo.name || 'GLO N3 OFFICIAL PORTAL';
    const shopLine = shopInfo.line || '@glon3';
    const shopTel = shopInfo.tel || '';

    // 1. Background Fill & Nebula Glow
    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1350);
    bgGrad.addColorStop(0, '#070a14');
    bgGrad.addColorStop(0.5, '#0b1329');
    bgGrad.addColorStop(1, '#05070e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1350);

    // Nebula Accents
    const goldGlow = ctx.createRadialGradient(540, 300, 50, 540, 300, 500);
    goldGlow.addColorStop(0, 'rgba(255, 215, 0, 0.12)');
    goldGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = goldGlow;
    ctx.fillRect(0, 0, 1080, 1350);

    const emeraldGlow = ctx.createRadialGradient(800, 900, 50, 800, 900, 450);
    emeraldGlow.addColorStop(0, 'rgba(16, 185, 129, 0.10)');
    emeraldGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = emeraldGlow;
    ctx.fillRect(0, 0, 1080, 1350);

    // 2. Luxury Outer Frame & Gold Border
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, 1000, 1270);

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(55, 55, 970, 1240);

    // Corner Ornaments
    const drawCorner = (x, y, dx, dy) => {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y + dy * 40);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * 40, y);
      ctx.stroke();
    };
    drawCorner(40, 40, 1, 1);
    drawCorner(1040, 40, -1, 1);
    drawCorner(40, 1310, 1, -1);
    drawCorner(1040, 1310, -1, -1);

    // 3. Top Header: GLO N3 Brand
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700';
    ctx.font = '700 32px "Prompt", sans-serif';
    ctx.fillText('✦ สลากกินแบ่งรัฐบาล GLO N3 (3 หลัก) ✦', 540, 110);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 24px "Kanit", sans-serif';
    ctx.fillText('ใบละ 20 บาท • ลุ้นรับ 4 รางวัลใหญ่ • AI ถอดรหัสนิมิตทำนายฝัน', 540, 150);

    // Header Divider Line
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(120, 180);
    ctx.lineTo(960, 180);
    ctx.stroke();

    // 4. Dream Subject & Element
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 48px "Prompt", sans-serif';
    ctx.fillText(`"${pred.dreamText || 'ความฝันมงคล'}"`, 540, 260);

    // Element Badge Box
    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(340, 295, 400, 50, 25);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.font = '500 24px "Kanit", sans-serif';
    ctx.fillText(`✨ ${pred.element || 'ธาตุจักรวาล'}`, 540, 328);

    // 5. Featured 3-Digit Balls (Main Attraction)
    ctx.fillStyle = '#ffd700';
    ctx.font = '700 28px "Prompt", sans-serif';
    ctx.fillText('★ เลขเด็ด 3 ตัวตรง N3 ★', 540, 410);

    // Draw 3 Gold Balls
    const digits = (pred.n3Direct || '789').split('');
    const ballSpacing = 160;
    const startX = 540 - ballSpacing;

    digits.forEach((digit, i) => {
      const bx = startX + i * ballSpacing;
      const by = 510;
      const radius = 65;

      // Ball Outer Glow
      const ballGrad = ctx.createRadialGradient(bx - 20, by - 20, 10, bx, by, radius);
      ballGrad.addColorStop(0, '#fff9c4');
      ballGrad.addColorStop(0.3, '#ffd700');
      ballGrad.addColorStop(0.8, '#d4af37');
      ballGrad.addColorStop(1, '#996515');

      ctx.save();
      ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
      ctx.shadowBlur = 30;
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Ball Ring
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bx, by, radius - 6, 0, Math.PI * 2);
      ctx.stroke();

      // Digit Text
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 70px "Prompt", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(digit, bx, by + 4);
    });

    ctx.textBaseline = 'alphabetic'; // Reset

    // 6. 3 Tod & 2 Direct Boxes Grid
    const boxY = 620;
    // 3 Tod Box
    ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(140, boxY, 380, 130, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#a5f3fc';
    ctx.font = '600 22px "Prompt", sans-serif';
    ctx.fillText('เลขเด็ด 3 ตัวโต๊ด (สลับหลัก)', 330, boxY + 42);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 36px "Prompt", sans-serif';
    ctx.fillText(pred.n3Tod || '798, 879', 330, boxY + 95);

    // 2 Direct Box
    ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(560, boxY, 380, 130, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#a7f3d0';
    ctx.font = '600 22px "Prompt", sans-serif';
    ctx.fillText('เลขเด็ด 2 ตัวตรง N3', 750, boxY + 42);

    ctx.fillStyle = '#34d399';
    ctx.font = '700 36px "Prompt", sans-serif';
    ctx.fillText(pred.n2Digit || '89', 750, boxY + 95);

    // 7. Meaning & Blessing Box
    const textCardY = 780;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(100, textCardY, 880, 280, 18);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd700';
    ctx.font = '700 24px "Prompt", sans-serif';
    ctx.fillText('📜 คำทำนายฝัน & เคล็ดลับเสริมดวง:', 140, textCardY + 45);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '400 22px "Kanit", sans-serif';
    wrapText(ctx, pred.meaning || 'ฝันมงคลนำพาโชคลาภก้อนโต', 140, textCardY + 85, 800, 34, 3);

    ctx.fillStyle = '#34d399';
    ctx.font = '500 22px "Kanit", sans-serif';
    ctx.fillText(`🙏 เสริมบารมี: ${pred.blessing || 'ทำบุญตักบาตรเสริมดวง'}`, 140, textCardY + 200);

    ctx.fillStyle = '#ffd700';
    ctx.font = '600 20px "Prompt", sans-serif';
    ctx.fillText(`⚡ ดรรชนีความแม่นยำ AI: ${pred.confidence || '98.5%'}`, 140, textCardY + 245);

    // 8. Footer & Shop Branding Watermark
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px "Prompt", sans-serif';
    ctx.fillText(`🛒 สั่งซื้อสลาก N3 ได้ที่: ${shopName}`, 540, 1140);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 22px "Kanit", sans-serif';
    let contactLine = `LINE: ${shopLine}`;
    if (shopTel) contactLine += ` • โทร: ${shopTel}`;
    contactLine += ' • สั่งซื้อสะดวกผ่านแอปเป๋าตัง';
    ctx.fillText(contactLine, 540, 1180);

    ctx.fillStyle = '#64748b';
    ctx.font = '400 18px "Kanit", sans-serif';
    ctx.fillText('สำนักงานสลากกินแบ่งรัฐบาล (GLO) • สลาก N3 ดิจิทัลถูกต้องตามกฎหมาย 100%', 540, 1240);

    return canvas.toDataURL('image/png');
  }

  /**
   * Download card image as PNG
   */
  function downloadCard(pred, shopInfo = {}) {
    const dataUrl = renderCardCanvas(pred, shopInfo);
    const link = document.createElement('a');
    link.download = `GLO-N3-AI-Dream-${pred.n3Direct || 'Lucky'}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Share card image using Web Share API if supported
   */
  async function shareCardNative(pred, shopInfo = {}) {
    const dataUrl = renderCardCanvas(pred, shopInfo);

    if (navigator.share && navigator.canShare) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `GLO-N3-${pred.n3Direct || 'Lucky'}.png`, { type: 'image/png' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `เลขเด็ดสลาก N3 จาก AI ทำนายฝัน: ${pred.n3Direct}`,
            text: `ทำนายฝัน "${pred.dreamText}" ได้เลขเด็ด N3: ${pred.n3Direct} (3 ตัวตรง) ซื้อสลากใบละ 20 บาทผ่านแอปเป๋าตังได้เลย!`,
            files: [file]
          });
          return true;
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Native share failed, fallback to download:', err);
        }
      }
    }

    // Fallback: Download file
    downloadCard(pred, shopInfo);
    return false;
  }

  return {
    renderCardCanvas,
    downloadCard,
    shareCardNative
  };
})();
