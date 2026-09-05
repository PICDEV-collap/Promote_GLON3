/**
 * GLO N3 Mobile-First Image Saver Utility
 * Solves silent download failures in LINE In-App Browser & mobile webviews.
 * Supports:
 *  1. Desktop direct downloads via <a download>
 *  2. Mobile Native Web Share API (Level 2) with File payload (triggers iOS/Android Save Image sheet)
 *  3. Interactive Long-Press (Touch & Hold) modal with high-contrast Thai guidance
 *  4. External browser redirection (?openExternalBrowser=1)
 *  5. LINE Webview smart top-banner for 1-tap browser switching
 */

const ImageSaver = (function () {
  'use strict';

  // Environment checks
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || '');
  }

  function isLineWebview() {
    return /Line\//i.test(navigator.userAgent || '');
  }

  /**
   * Convert Data URL to a Blob
   */
  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(';base64,');
    const contentType = parts[0].split(':')[1] || 'image/png';
    const raw = window.atob(parts[1]);
    const uInt8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  }

  /**
   * Check if Web Share API supports sharing image files
   */
  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const testBlob = new Blob([''], { type: 'image/png' });
      const testFile = new File([testBlob], 'test.png', { type: 'image/png' });
      return navigator.canShare({ files: [testFile] });
    } catch (e) {
      return false;
    }
  }

  /**
   * Open current page in default external browser (Safari / Chrome) via LINE's openExternalBrowser parameter
   */
  function openInExternalBrowser(customUrl) {
    try {
      const targetUrl = customUrl ? new URL(customUrl, window.location.href) : new URL(window.location.href);
      targetUrl.searchParams.set('openExternalBrowser', '1');
      window.location.href = targetUrl.toString();
    } catch (e) {
      const base = customUrl || window.location.href;
      const delim = base.includes('?') ? '&' : '?';
      window.location.href = base + delim + 'openExternalBrowser=1';
    }
  }

  /**
   * Trigger classic desktop download
   */
  function triggerDesktopDownload(dataUrl, filename) {
    const link = document.createElement('a');
    link.download = filename || `GLO-N3-${Date.now()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 200);
  }

  /**
   * Main save entry point
   * @param {Object} options
   * @param {string} options.dataUrl - Base64 PNG data URL or image source
   * @param {string} options.filename - Desired filename e.g. GLO-N3-Poster.png
   * @param {string} [options.title] - Title for share sheet / modal
   * @param {string} [options.text] - Description text for share sheet
   */
  async function saveImage(options) {
    const {
      dataUrl,
      filename = `GLO-N3-${Date.now()}.png`,
      title = 'รูปภาพสลาก N3',
      text = 'บันทึกรูปภาพจากร้านสลาก N3 ธนกิจนำโชค'
    } = options;

    if (!dataUrl) {
      console.error('[ImageSaver] Missing dataUrl');
      return;
    }

    // If running on desktop browser (not mobile, not in-app webview):
    if (!isMobile()) {
      triggerDesktopDownload(dataUrl, filename);
      if (typeof window.showToast === 'function') {
        window.showToast('กำลังดาวน์โหลดรูปภาพลงเครื่อง...');
      }
      return;
    }

    // On mobile / LINE In-App Browser:
    // Open dedicated mobile modal showing the image with clear long-press guide & quick actions
    openMobileSaveModal({ dataUrl, filename, title, text });
  }

  /**
   * Open the dedicated Mobile Image Saver Modal
   */
  function openMobileSaveModal({ dataUrl, filename, title, text }) {
    let modal = document.getElementById('modal-image-saver');
    if (!modal) {
      modal = createModalDOM();
      document.body.appendChild(modal);
    }

    const titleEl = modal.querySelector('#image-saver-title');
    const imgEl = modal.querySelector('#image-saver-img');
    const btnShare = modal.querySelector('#btn-image-saver-share');
    const btnExternal = modal.querySelector('#btn-image-saver-external');
    const btnFallbackDl = modal.querySelector('#btn-image-saver-dl');
    const lineBadge = modal.querySelector('#image-saver-line-badge');

    if (titleEl) titleEl.textContent = title;
    if (imgEl) {
      imgEl.src = dataUrl;
      imgEl.alt = title;
    }

    const inLine = isLineWebview();

    // Show LINE badge if opened inside LINE
    if (lineBadge) {
      lineBadge.style.display = inLine ? 'inline-flex' : 'none';
    }

    // Share button handler (Web Share API Level 2)
    if (btnShare) {
      const shareSupported = canShareFiles();
      btnShare.onclick = async () => {
        try {
          if (typeof window.SoundEngine !== 'undefined' && window.SoundEngine.playClick) {
            window.SoundEngine.playClick();
          }
        } catch (e) {}

        if (shareSupported) {
          try {
            const blob = dataUrlToBlob(dataUrl);
            const file = new File([blob], filename, { type: 'image/png' });
            await navigator.share({
              title: title,
              text: text,
              files: [file]
            });
            if (typeof window.showToast === 'function') {
              window.showToast('แชร์ / บันทึกรูปภาพสำเร็จ!');
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.warn('[ImageSaver] Web Share failed, showing long-press tip:', err);
              pulseGuideBanner();
            }
          }
        } else {
          // Fallback: highlight the long-press guide
          pulseGuideBanner();
          if (typeof window.showToast === 'function') {
            window.showToast('👆 แตะค้างที่รูปภาพเพื่อเลือก "บันทึกรูปภาพ"');
          }
        }
      };
    }

    // External browser button handler
    if (btnExternal) {
      btnExternal.onclick = () => {
        try {
          if (typeof window.SoundEngine !== 'undefined' && window.SoundEngine.playClick) {
            window.SoundEngine.playClick();
          }
        } catch (e) {}
        openInExternalBrowser();
      };
    }

    // Fallback direct download
    if (btnFallbackDl) {
      // In LINE Webview on Android/iOS, NEVER show direct download button because LINE displays:
      // "ไม่สามารถดาวน์โหลดไฟล์ได้ โปรดดาวน์โหลดด้วยเบราว์เซอร์อื่น"
      if (inLine) {
        btnFallbackDl.style.display = 'none';
        if (btnExternal) {
          btnExternal.style.flex = '1';
          btnExternal.className = 'btn btn-gold';
          btnExternal.innerHTML = '<i class="fas fa-external-link-alt"></i> เปิดใน Chrome / Safari เพื่อดาวน์โหลด';
        }
      } else {
        btnFallbackDl.style.display = 'inline-flex';
        btnFallbackDl.onclick = () => {
          triggerDesktopDownload(dataUrl, filename);
          if (typeof window.showToast === 'function') {
            window.showToast('เริ่มคำสั่งดาวน์โหลดไฟล์...');
          }
        };
      }
    }

    // Show modal
    modal.classList.add('active');
  }

  function pulseGuideBanner() {
    const banner = document.getElementById('image-saver-guide-banner');
    if (banner) {
      banner.classList.add('pulse-highlight');
      setTimeout(() => banner.classList.remove('pulse-highlight'), 1200);
    }
  }

  /**
   * Close Mobile Image Saver Modal
   */
  function closeModal() {
    const modal = document.getElementById('modal-image-saver');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /**
   * Create modal DOM if not already present in HTML
   */
  function createModalDOM() {
    const div = document.createElement('div');
    div.id = 'modal-image-saver';
    div.className = 'modal-overlay';
    div.innerHTML = `
      <div class="modal-card image-saver-card" style="max-width: 480px; width: 92%; max-height: 90vh; overflow-y: auto; text-align: center;">
        <button type="button" class="modal-close" onclick="ImageSaver.closeModal()">&times;</button>
        
        <div style="margin-bottom: 0.5rem;">
          <span id="image-saver-line-badge" class="badge badge-emerald" style="display: none; font-size: 0.72rem; margin-bottom: 0.4rem;">
            <i class="fab fa-line"></i> LINE In-App Browser
          </span>
          <h3 id="image-saver-title" style="color: var(--color-gold-light); font-size: 1.2rem; margin: 0 0 0.25rem 0;">บันทึกรูปภาพ</h3>
        </div>

        <!-- High-contrast long-press instruction banner -->
        <div id="image-saver-guide-banner" class="image-saver-guide-box">
          <div class="guide-icon-pulse"><i class="fas fa-hand-pointer"></i></div>
          <div class="guide-text">
            <strong>วิธีเซฟภาพลงเครื่อง:</strong> แตะค้างที่รูปภาพด้านล่าง (Long-press) แล้วเลือก <span>"บันทึกรูปภาพ" (Save Image)</span> ลงแกลเลอรีโทรศัพท์
          </div>
        </div>

        <!-- Preview Image Container (touch callout enabled) -->
        <div class="image-saver-img-wrapper">
          <img id="image-saver-img" class="image-saver-img" src="" alt="GLO N3 Preview Image" />
        </div>

        <!-- Action buttons -->
        <div class="image-saver-actions">
          <button type="button" id="btn-image-saver-share" class="btn btn-emerald" style="width: 100%; padding: 0.8rem; font-size: 0.95rem; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <i class="fas fa-share-alt"></i> 📲 เซฟ / แชร์ด้วยระบบมือถือ
          </button>
          
          <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
            <button type="button" id="btn-image-saver-external" class="btn btn-glass" style="flex: 1; font-size: 0.78rem; padding: 0.55rem; color: var(--text-secondary); border-color: rgba(255,255,255,0.15);">
              <i class="fas fa-external-link-alt"></i> เปิดใน Safari/Chrome
            </button>
            <button type="button" id="btn-image-saver-dl" class="btn btn-glass" style="flex: 1; font-size: 0.78rem; padding: 0.55rem; color: var(--text-secondary); border-color: rgba(255,255,255,0.15);">
              <i class="fas fa-download"></i> ดาวน์โหลดตรง
            </button>
          </div>
        </div>
      </div>
    `;

    // Click outside to close
    div.addEventListener('click', (e) => {
      if (e.target === div) {
        closeModal();
      }
    });

    return div;
  }

  /**
   * Top Smart Bar for LINE Users
   */
  function initLineBanner() {
    if (!isLineWebview()) return;
    if (document.getElementById('line-external-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'line-external-bar';
    bar.className = 'line-external-bar';
    bar.innerHTML = `
      <div class="line-external-content">
        <i class="fab fa-line" style="font-size: 1.1rem; color: #fff;"></i>
        <span>เปิดบน <strong>Chrome / Safari</strong> เพื่อบันทึกภาพลงเครื่องได้สะดวก</span>
      </div>
      <button type="button" class="btn-line-open-ext" onclick="ImageSaver.openInExternalBrowser()">
        เปิดในเบราว์เซอร์ <i class="fas fa-external-link-alt"></i>
      </button>
    `;

    if (document.body) {
      document.body.prepend(bar);
    } else {
      document.addEventListener('DOMContentLoaded', () => document.body.prepend(bar));
    }
  }

  // Auto initialize LINE smart bar on page ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLineBanner);
    } else {
      initLineBanner();
    }
  }

  return {
    isMobile,
    isLineWebview,
    canShareFiles,
    saveImage,
    closeModal,
    openInExternalBrowser,
    triggerDesktopDownload
  };
})();

// Attach to window
if (typeof window !== 'undefined') {
  window.ImageSaver = ImageSaver;
}
