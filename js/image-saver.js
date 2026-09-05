/**
 * GLO N3 Mobile-First Image Saver Utility
 * Solves silent download failures in LINE In-App Browser & mobile webviews.
 * Supports:
 *  1. Desktop & Standard Mobile Direct Downloads (Samsung Internet, Chrome, Safari, Firefox) via Blob Object URL
 *  2. Mobile Native Web Share API (Level 2) with File payload (triggers iOS/Android Save Image sheet)
 *  3. Interactive Long-Press (Touch & Hold) modal with high-contrast Thai guidance for restricted webviews
 *  4. External browser redirection (?openExternalBrowser=1) for LINE In-App Browser
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

  function isInAppBrowser() {
    const ua = navigator.userAgent || '';
    return /Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger|Snapchat/i.test(ua);
  }

  /**
   * Convert Data URL, Blob URL, or Image Path (relative / absolute) to a real Blob
   */
  async function srcToBlob(src) {
    if (!src) throw new Error('Missing image src');

    // Case 1: Base64 Data URL
    if (src.startsWith('data:')) {
      const parts = src.split(';base64,');
      const contentType = (parts[0].split(':')[1] || 'image/png').split(';')[0];
      const base64Data = parts[1] || '';
      const raw = window.atob(base64Data);
      const uInt8Array = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      return new Blob([uInt8Array], { type: contentType });
    }

    // Case 2: Fetch image directly (works for same-origin or CORS-enabled URLs and blob: URLs)
    try {
      const res = await fetch(src, { mode: 'cors' });
      if (res.ok) {
        return await res.blob();
      }
    } catch (e) {
      console.warn('[ImageSaver] fetch blob failed, trying canvas fallback:', e);
    }

    // Case 3: Canvas drawing fallback for loaded image
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 400;
          canvas.height = img.naturalHeight || img.height || 400;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob returned null'));
          }, 'image/png');
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image for blob conversion: ' + src));
      img.src = src;
    });
  }

  /**
   * Convert Data URL to a Blob (synchronous helper for base64)
   */
  function dataUrlToBlob(dataUrl) {
    if (dataUrl && dataUrl.startsWith('data:')) {
      const parts = dataUrl.split(';base64,');
      const contentType = parts[0].split(':')[1] || 'image/png';
      const raw = window.atob(parts[1]);
      const uInt8Array = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      return new Blob([uInt8Array], { type: contentType });
    }
    return null;
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
   * Trigger direct download via Blob Object URL
   * Fully supported by Samsung Internet, Android Chrome, Safari, Firefox, and Desktop browsers!
   */
  async function triggerDirectDownload(src, filename) {
    const finalFilename = filename || `GLO-N3-${Date.now()}.png`;
    try {
      const blob = await srcToBlob(src);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = finalFilename;
      link.href = blobUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(blobUrl);
      }, 1500);
      return true;
    } catch (err) {
      console.warn('[ImageSaver] Blob direct download failed, trying standard link fallback:', err);
      try {
        const link = document.createElement('a');
        link.download = finalFilename;
        link.href = src;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
        }, 500);
        return true;
      } catch (fallbackErr) {
        console.error('[ImageSaver] Fallback link download failed:', fallbackErr);
        return false;
      }
    }
  }

  /**
   * Classic trigger download alias
   */
  function triggerDesktopDownload(dataUrl, filename) {
    return triggerDirectDownload(dataUrl, filename);
  }

  /**
   * Main save entry point
   * @param {Object} options
   * @param {string} options.dataUrl - Base64 PNG data URL, blob URL, or image source path
   * @param {string} options.filename - Desired filename e.g. GLO-N3-Poster.png
   * @param {string} [options.title] - Title for share sheet / modal
   * @param {string} [options.text] - Description text for share sheet
   * @param {boolean} [options.forceModal] - Force opening modal instead of direct download
   */
  async function saveImage(options) {
    const {
      dataUrl,
      filename = `GLO-N3-${Date.now()}.png`,
      title = 'รูปภาพสลาก N3',
      text = 'บันทึกรูปภาพจากร้านสลาก N3 ธนกิจนำโชค',
      forceModal = false
    } = options;

    if (!dataUrl) {
      console.error('[ImageSaver] Missing dataUrl');
      return;
    }

    const inLine = isLineWebview();

    // 1. Inside LINE In-App Browser:
    // LINE blocks <a download> and displays download error dialog,
    // so we MUST guide user with 3-tier mobile modal (touch & hold, Web Share API, or openExternalBrowser)
    if (inLine || forceModal) {
      openMobileSaveModal({ dataUrl, filename, title, text });
      return;
    }

    // 2. Standard Mobile & Desktop Browsers (Samsung Internet, Chrome, Safari, Firefox, Edge):
    // Direct download via Blob object URL works natively and saves file to Downloads / Gallery!
    try {
      if (typeof window.showToast === 'function') {
        window.showToast('📥 กำลังบันทึกรูปภาพลงในเครื่อง...', 'info');
      }
      const success = await triggerDirectDownload(dataUrl, filename);
      if (success) {
        if (typeof window.showToast === 'function') {
          window.showToast('✅ บันทึกรูปภาพลงในเครื่องแล้ว! (ดูในแกลเลอรี/ดาวน์โหลด)', 'success');
        }
        return;
      }
    } catch (err) {
      console.warn('[ImageSaver] Direct download failed, falling back to modal:', err);
    }

    // 3. Fallback: If direct download failed on mobile, open the Mobile Save Modal
    if (isMobile()) {
      openMobileSaveModal({ dataUrl, filename, title, text });
    }
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

    // Ensure it is always stacked on top of other modals
    modal.style.zIndex = '10050';

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
            const blob = await srcToBlob(dataUrl);
            const file = new File([blob], filename, { type: blob.type || 'image/png' });
            await navigator.share({
              title: title,
              text: text,
              files: [file]
            });
            if (typeof window.showToast === 'function') {
              window.showToast('แชร์ / บันทึกรูปภาพสำเร็จ!', 'success');
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
        btnFallbackDl.onclick = async () => {
          await triggerDirectDownload(dataUrl, filename);
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
    div.style.zIndex = '10050';
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
    isInAppBrowser,
    canShareFiles,
    srcToBlob,
    saveImage,
    closeModal,
    openInExternalBrowser,
    triggerDirectDownload,
    triggerDesktopDownload
  };
})();

// Attach to window
if (typeof window !== 'undefined') {
  window.ImageSaver = ImageSaver;
}
