/* ==========================================================================
   GLO N3 - Main Application Logic & User Interaction Controller
   Smart Paotang Linker, Official Shop Router, Dream Prediction UI Flow
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  // Navigation Scroll Effect
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // Sound Toggle Listener
  const btnSound = document.getElementById('btn-sound');
  const soundIcon = document.getElementById('sound-icon');
  if (btnSound) {
    btnSound.addEventListener('click', () => {
      const isMuted = SoundEngine.toggleMute();
      if (isMuted) {
        soundIcon.className = 'fas fa-volume-mute';
        showToast('ปิดเสียงเอฟเฟกต์แล้ว');
      } else {
        soundIcon.className = 'fas fa-volume-up';
        SoundEngine.playClick();
        showToast('เปิดเสียงเอฟเฟกต์แล้ว');
      }
    });
  }

  // Shop Link Management System
  const DEFAULT_SHOP_URL = 'https://line.me'; // Default Shop URL (LINE, Webshop, Facebook, etc.)
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
      SoundEngine.playClick();

      // Copy lucky number if available
      let numberToCopy = '000';
      if (currentPrediction) {
        numberToCopy = currentPrediction.n3Direct;
      }
      copyToClipboard(numberToCopy);

      showToast(`คัดลอกเลขเด็ด N3 (${numberToCopy}) แล้ว! กำลังนำคุณไปยังร้านค้าของเรา...`);

      // Open modal if user wants to customize URL or click directly to open
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
      SoundEngine.playClick();
      const newUrl = shopUrlInput.value.trim() || DEFAULT_SHOP_URL;
      currentShopUrl = newUrl;
      localStorage.setItem('glo_n3_shop_url', currentShopUrl);
      modalShopConfig.classList.remove('active');
      showToast('เปิดหน้าร้านค้าของคุณแล้ว!');
      window.open(currentShopUrl, '_blank');
    });
  }

  // Quick Dream Tag Click Handlers
  const tagBtns = document.querySelectorAll('.tag-btn');
  const dreamInput = document.getElementById('dream-input');
  tagBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      SoundEngine.playClick();
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
      const inputVal = dreamInput.value.trim();

      if (!inputVal) {
        showToast('กรุณากรอกความฝันหรือเลือกคีย์เวิร์ดฝันก่อนครับ');
        return;
      }

      SoundEngine.playScanChime();

      // UI Switch to Scanning
      dreamBoxWrapper.style.display = 'none';
      resultContainer.style.display = 'none';
      scanningOverlay.style.display = 'flex';

      const scanSteps = [
        'กำลังสแกนสัญลักษณ์และถอดรหัสนิมิต...',
        'กำลังคำนวณกำลังวันและอิทธิพลดาวจร...',
        'กำลังประมวลผลอัลกอริทึมศาสตร์ตัวเลข N3...',
        'กำลังสรุปผลคำทำนายฉบับเต็ม...'
      ];

      let stepIdx = 0;
      progressBarFill.style.width = '0%';

      const interval = setInterval(() => {
        stepIdx++;
        if (stepIdx < scanSteps.length) {
          scanStepText.innerText = scanSteps[stepIdx];
          progressBarFill.style.width = `${(stepIdx / scanSteps.length) * 100}%`;
          SoundEngine.playScanChime();
        } else {
          clearInterval(interval);
          progressBarFill.style.width = '100%';

          // Generate Result
          currentPrediction = AIDreamEngine.generatePrediction(inputVal);
          displayPredictionResult(currentPrediction);
        }
      }, 700);
    });
  }

  // Display Prediction Results
  function displayPredictionResult(pred) {
    scanningOverlay.style.display = 'none';
    resultContainer.style.display = 'block';

    document.getElementById('res-dream-title').innerText = `"${pred.dreamText}"`;
    document.getElementById('res-element').innerText = pred.element;
    document.getElementById('res-n3-direct').innerText = pred.n3Direct;
    document.getElementById('res-n3-tod').innerText = pred.n3Tod;
    document.getElementById('res-n2-digit').innerText = pred.n2Digit;
    document.getElementById('res-confidence').innerText = pred.confidence;
    document.getElementById('res-meaning').innerText = pred.meaning;
    document.getElementById('res-blessing').innerText = pred.blessing;

    SoundEngine.playRevealFanfare();
    showToast('ทำนายฝันและคำนวณเลข N3 สำเร็จแล้ว!');
  }

  // Reset Dream Search
  const btnResetDream = document.getElementById('btn-reset-dream');
  if (btnResetDream) {
    btnResetDream.addEventListener('click', () => {
      SoundEngine.playClick();
      resultContainer.style.display = 'none';
      dreamBoxWrapper.style.display = 'block';
      dreamInput.value = '';
      dreamInput.focus();
    });
  }

  // Smart Paotang Link & Copy Action
  const btnBuyPaotang = document.querySelectorAll('.btn-buy-paotang');
  const modalQr = document.getElementById('modal-qr');
  const modalQrClose = document.getElementById('modal-qr-close');

  btnBuyPaotang.forEach(btn => {
    btn.addEventListener('click', () => {
      SoundEngine.playClick();

      // Copy lucky number if available
      let numberToCopy = '000';
      if (currentPrediction) {
        numberToCopy = currentPrediction.n3Direct;
      }
      copyToClipboard(numberToCopy);

      // Detect User Device (Mobile vs Desktop)
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        showToast(`คัดลอกเลข N3 (${numberToCopy}) แล้ว! กำลังเปิดแอปเป๋าตัง...`);
        // Try opening Deep Link with fallback
        setTimeout(() => {
          window.location.href = 'paotang://';
          // Fallback timer if app doesn't open in 2s
          setTimeout(() => {
            const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isiOS) {
              window.location.href = 'https://apps.apple.com/th/app/paotang/id1324901416';
            } else {
              window.location.href = 'https://play.google.com/store/apps/details?id=th.or.ktb.paotang';
            }
          }, 1800);
        }, 300);
      } else {
        // Desktop: Open QR Code Popup
        showToast(`คัดลอกเลข N3 (${numberToCopy}) แล้ว! กรุณาสแกน QR Code ด้วยมือถือเพื่อเปิดแอปเป๋าตัง`);
        if (modalQr) modalQr.classList.add('active');
      }
    });
  });

  if (modalQrClose) {
    modalQrClose.addEventListener('click', () => {
      modalQr.classList.remove('active');
    });
  }

  // Clipboard Utility
  function copyToClipboard(text) {
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
  }

  // Copy Direct Button Listener
  const btnCopyNum = document.getElementById('btn-copy-num');
  if (btnCopyNum) {
    btnCopyNum.addEventListener('click', () => {
      if (currentPrediction) {
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

      document.getElementById('calc-tickets').innerText = `${res.ticketCount.toLocaleString()} ใบ`;
      document.getElementById('calc-prize-total').innerText = N3Calculator.formatBaht(res.prizePoolTotal);
      document.getElementById('calc-n3-direct').innerText = N3Calculator.formatBaht(res.n3DirectPool);
      document.getElementById('calc-n3-tod').innerText = N3Calculator.formatBaht(res.n3TodPool);
      document.getElementById('calc-n2-direct').innerText = N3Calculator.formatBaht(res.n2DirectPool);
      document.getElementById('calc-special').innerText = N3Calculator.formatBaht(res.specialJackpotPool);
    }

    calcSalesInput.addEventListener('input', updateCalculator);
    updateCalculator();
  }
});
