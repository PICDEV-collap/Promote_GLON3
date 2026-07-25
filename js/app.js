/* ==========================================================================
   GLO N3 - Main Application Logic & User Interaction Controller
   Smart Paotang Linker, Official Shop Router, Dream Prediction UI Flow
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  // Navigation Scroll Effect
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  // Sound Toggle Listener
  const btnSound = document.getElementById('btn-sound');
  const soundIcon = document.getElementById('sound-icon');
  if (btnSound) {
    btnSound.addEventListener('click', () => {
      try {
        const isMuted = SoundEngine.toggleMute();
        if (soundIcon) {
          soundIcon.className = isMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
        }
        showToast(isMuted ? 'ปิดเสียงเอฟเฟกต์แล้ว' : 'เปิดเสียงเอฟเฟกต์แล้ว');
        if (!isMuted) SoundEngine.playClick();
      } catch (e) {
        console.warn(e);
      }
    });
  }

  // Shop Link Management System
  const DEFAULT_SHOP_URL = 'https://line.me';
  let currentShopUrl = localStorage.getItem('glo_n3_shop_url') || DEFAULT_SHOP_URL;

  const btnOurShopList = document.querySelectorAll('.btn-our-shop');
  const modalShopConfig = document.getElementById('modal-shop-config');
  const modalShopClose = document.getElementById('modal-shop-close');
  const shopUrlInput = document.getElementById('shop-url-input');
  const btnSaveShopUrl = document.getElementById('btn-save-shop-url');

  if (shopUrlInput) {
    shopUrlInput.value = currentShopUrl;
  }

  btnOurShopList.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      try { SoundEngine.playClick(); } catch (err) {}

      let numberToCopy = '000';
      if (currentPrediction && currentPrediction.n3Direct) {
        numberToCopy = currentPrediction.n3Direct;
      }
      copyToClipboard(numberToCopy);

      showToast(`คัดลอกเลขเด็ด N3 (${numberToCopy}) แล้ว! กำลังนำคุณไปยังร้านค้า...`);

      if (modalShopConfig) {
        modalShopConfig.classList.add('active');
      } else {
        window.open(currentShopUrl, '_blank');
      }
    });
  });

  if (modalShopClose) {
    modalShopClose.addEventListener('click', () => {
      modalShopConfig.classList.remove('active');
    });
  }

  if (btnSaveShopUrl) {
    btnSaveShopUrl.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (err) {}
      const newUrl = (shopUrlInput ? shopUrlInput.value.trim() : '') || DEFAULT_SHOP_URL;
      currentShopUrl = newUrl;
      localStorage.setItem('glo_n3_shop_url', currentShopUrl);
      if (modalShopConfig) modalShopConfig.classList.remove('active');
      showToast('เปิดหน้าร้านค้าของคุณแล้ว!');
      window.open(currentShopUrl, '_blank');
    });
  }

  // Quick Dream Tag Click Handlers
  const tagBtns = document.querySelectorAll('.tag-btn');
  const dreamInput = document.getElementById('dream-input');
  tagBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (err) {}
      if (!dreamInput) return;
      const tagText = btn.dataset.tag || btn.innerText;
      if (dreamInput.value.trim() === '') {
        dreamInput.value = `ฝันเห็น${tagText}`;
      } else {
        dreamInput.value += ` ${tagText}`;
      }
      dreamInput.focus();
    });
  });

  // AI Dream Form Submission & Progress Simulation
  const dreamForm = document.getElementById('dream-form');
  const dreamBoxWrapper = document.getElementById('dream-box-content');
  const scanningOverlay = document.getElementById('scanning-overlay');
  const resultContainer = document.getElementById('result-container');
  const scanStepText = document.getElementById('scan-step-text');
  const progressBarFill = document.getElementById('progress-bar-fill');

  let currentPrediction = null;

  if (dreamForm) {
    dreamForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const inputVal = dreamInput ? dreamInput.value.trim() : '';

      if (!inputVal) {
        showToast('กรุณากรอกความฝันหรือเลือกคีย์เวิร์ดฝันก่อนครับ');
        return;
      }

      try { SoundEngine.playScanChime(); } catch (err) {}

      // UI Switch to Scanning
      if (dreamBoxWrapper) dreamBoxWrapper.style.display = 'none';
      if (resultContainer) resultContainer.style.display = 'none';
      if (scanningOverlay) scanningOverlay.style.display = 'flex';

      const scanSteps = [
        'กำลังสแกนสัญลักษณ์และถอดรหัสนิมิต...',
        'กำลังคำนวณกำลังวันและอิทธิพลดาวจร...',
        'กำลังประมวลผลอัลกอริทึมศาสตร์ตัวเลข N3...',
        'กำลังสรุปผลคำทำนายฉบับเต็ม...'
      ];

      let stepIdx = 0;
      if (progressBarFill) progressBarFill.style.width = '0%';

      const interval = setInterval(() => {
        stepIdx++;
        if (stepIdx < scanSteps.length) {
          if (scanStepText) scanStepText.innerText = scanSteps[stepIdx];
          if (progressBarFill) progressBarFill.style.width = `${(stepIdx / scanSteps.length) * 100}%`;
          try { SoundEngine.playScanChime(); } catch (err) {}
        } else {
          clearInterval(interval);
          if (progressBarFill) progressBarFill.style.width = '100%';

          // Generate Result safely
          try {
            currentPrediction = AIDreamEngine.generatePrediction(inputVal);
            displayPredictionResult(currentPrediction);
          } catch (err) {
            console.error('Prediction Generation Error:', err);
            // Fallback display if error occurs
            if (scanningOverlay) scanningOverlay.style.display = 'none';
            if (dreamBoxWrapper) dreamBoxWrapper.style.display = 'block';
            showToast('เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง');
          }
        }
      }, 500);
    });
  }

  // Display Prediction Results (Defensive & Robust)
  function displayPredictionResult(pred) {
    if (!pred) return;

    if (scanningOverlay) scanningOverlay.style.display = 'none';
    if (resultContainer) resultContainer.style.display = 'block';

    const elDreamTitle = document.getElementById('res-dream-title');
    const elElement = document.getElementById('res-element');
    const elN3Direct = document.getElementById('res-n3-direct');
    const elN3Tod = document.getElementById('res-n3-tod');
    const elN2Digit = document.getElementById('res-n2-digit');
    const elConfidence = document.getElementById('res-confidence');
    const elMeaning = document.getElementById('res-meaning');
    const elBlessing = document.getElementById('res-blessing');

    if (elDreamTitle) elDreamTitle.innerText = `"${pred.dreamText}"`;
    if (elElement) elElement.innerText = pred.element;
    if (elN3Direct) elN3Direct.innerText = pred.n3Direct;
    if (elN3Tod) elN3Tod.innerText = pred.n3Tod;
    if (elN2Digit) elN2Digit.innerText = pred.n2Digit;
    if (elConfidence) elConfidence.innerText = pred.confidence;
    if (elMeaning) elMeaning.innerText = pred.meaning;
    if (elBlessing) elBlessing.innerText = pred.blessing;

    try { SoundEngine.playRevealFanfare(); } catch (err) {}
    showToast('ทำนายฝันและคำนวณเลข N3 สำเร็จแล้ว!');
  }

  // Reset Dream Search
  const btnResetDream = document.getElementById('btn-reset-dream');
  if (btnResetDream) {
    btnResetDream.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (err) {}
      if (resultContainer) resultContainer.style.display = 'none';
      if (dreamBoxWrapper) dreamBoxWrapper.style.display = 'block';
      if (dreamInput) {
        dreamInput.value = '';
        dreamInput.focus();
      }
    });
  }

  // Smart Paotang Link & Copy Action
  const btnBuyPaotang = document.querySelectorAll('.btn-buy-paotang');
  const modalQr = document.getElementById('modal-qr');
  const modalQrClose = document.getElementById('modal-qr-close');

  btnBuyPaotang.forEach(btn => {
    btn.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (err) {}

      let numberToCopy = '000';
      if (currentPrediction && currentPrediction.n3Direct) {
        numberToCopy = currentPrediction.n3Direct;
      }
      copyToClipboard(numberToCopy);

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        showToast(`คัดลอกเลข N3 (${numberToCopy}) แล้ว! กำลังเปิดแอปเป๋าตัง...`);
        setTimeout(() => {
          window.location.href = 'paotang://';
          setTimeout(() => {
            const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            window.location.href = isiOS ? 
              'https://apps.apple.com/th/app/paotang/id1324901416' : 
              'https://play.google.com/store/apps/details?id=th.or.ktb.paotang';
          }, 1800);
        }, 300);
      } else {
        showToast(`คัดลอกเลข N3 (${numberToCopy}) แล้ว! กรุณาสแกน QR Code เพื่อเปิดแอปเป๋าตัง`);
        if (modalQr) modalQr.classList.add('active');
      }
    });
  });

  if (modalQrClose) {
    modalQrClose.addEventListener('click', () => {
      if (modalQr) modalQr.classList.remove('active');
    });
  }

  // Clipboard Utility
  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      SoundEngine.playCopySuccess();
    } catch (e) {
      console.warn('Clipboard copy error:', e);
    }
  }

  // Copy Direct Button Listener
  const btnCopyNum = document.getElementById('btn-copy-num');
  if (btnCopyNum) {
    btnCopyNum.addEventListener('click', () => {
      if (currentPrediction && currentPrediction.n3Direct) {
        copyToClipboard(currentPrediction.n3Direct);
        showToast(`คัดลอกเลขเด็ด 3 ตัวตรง (${currentPrediction.n3Direct}) เรียบร้อยแล้ว!`);
      }
    });
  }

  // Toast Notification System
  function showToast(message) {
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-check-circle" style="color: var(--color-emerald)"></i> <span>${message}</span>`;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // N3 Simulator Calculator Handler
  const calcSalesInput = document.getElementById('calc-sales');
  if (calcSalesInput) {
    function updateCalculator() {
      const sales = parseFloat(calcSalesInput.value) || 1000000;
      const res = N3Calculator.calculatePrizePool(sales);

      const elTickets = document.getElementById('calc-tickets');
      const elPrizeTotal = document.getElementById('calc-prize-total');
      const elN3Direct = document.getElementById('calc-n3-direct');
      const elN3Tod = document.getElementById('calc-n3-tod');
      const elN2Direct = document.getElementById('calc-n2-direct');
      const elSpecial = document.getElementById('calc-special');

      if (elTickets) elTickets.innerText = `${res.ticketCount.toLocaleString()} ใบ`;
      if (elPrizeTotal) elPrizeTotal.innerText = N3Calculator.formatBaht(res.prizePoolTotal);
      if (elN3Direct) elN3Direct.innerText = N3Calculator.formatBaht(res.n3DirectPool);
      if (elN3Tod) elN3Tod.innerText = N3Calculator.formatBaht(res.n3TodPool);
      if (elN2Direct) elN2Direct.innerText = N3Calculator.formatBaht(res.n2DirectPool);
      if (elSpecial) elSpecial.innerText = N3Calculator.formatBaht(res.specialJackpotPool);
    }

    calcSalesInput.addEventListener('input', updateCalculator);
    updateCalculator();
  }
});
