/* ==========================================================================
   GLO N3 - Main Application Logic & Feature Controller
   - Smart Paotang Linker & Deep Link Launcher
   - AI Dream Engine & Voice-to-Text Controller
   - High-DPI Social Share Card Generator
   - N3 Prize Checker & Historical Results Engine
   - Statistics & 3D Lucky Ball Roller
   - White-label Dynamic Partner/Affiliate System
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  // 1. White-label Agent System Initialization
  AgentSystem.applyAgentBranding();

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

  // -------------------------------------------------------------------------
  // 2. Shop & Affiliate System Modal Controllers
  // -------------------------------------------------------------------------
  const DEFAULT_SHOP_URL = 'https://line.me';
  let currentShopUrl = localStorage.getItem('glo_n3_shop_url') || DEFAULT_SHOP_URL;

  const btnOurShopList = document.querySelectorAll('.btn-our-shop');
  const modalShopConfig = document.getElementById('modal-shop-config');
  const modalShopClose = document.getElementById('modal-shop-close');
  const shopUrlInput = document.getElementById('shop-url-input');
  const btnSaveShopUrl = document.getElementById('btn-save-shop-url');

  // Affiliate Generator Elements
  const tabBtnShop = document.getElementById('tab-btn-shop');
  const tabBtnAffiliate = document.getElementById('tab-btn-affiliate');
  const tabContentShop = document.getElementById('tab-content-shop');
  const tabContentAffiliate = document.getElementById('tab-content-affiliate');
  const agentInputName = document.getElementById('agent-input-name');
  const agentInputLine = document.getElementById('agent-input-line');
  const agentInputTel = document.getElementById('agent-input-tel');
  const agentGeneratedUrl = document.getElementById('agent-generated-url');
  const btnCopyAffiliateUrl = document.getElementById('btn-copy-affiliate-url');

  // Modal Tabs Switcher
  if (tabBtnShop && tabBtnAffiliate) {
    tabBtnShop.addEventListener('click', () => {
      tabBtnShop.classList.add('active');
      tabBtnAffiliate.classList.remove('active');
      if (tabContentShop) tabContentShop.style.display = 'block';
      if (tabContentAffiliate) tabContentAffiliate.style.display = 'none';
    });

    tabBtnAffiliate.addEventListener('click', () => {
      tabBtnAffiliate.classList.add('active');
      tabBtnShop.classList.remove('active');
      if (tabContentShop) tabContentShop.style.display = 'none';
      if (tabContentAffiliate) tabContentAffiliate.style.display = 'block';
      updateGeneratedAffiliateUrl();
    });
  }

  function updateGeneratedAffiliateUrl() {
    if (!agentGeneratedUrl) return;
    const name = agentInputName ? agentInputName.value : '';
    const line = agentInputLine ? agentInputLine.value : '';
    const tel = agentInputTel ? agentInputTel.value : '';
    agentGeneratedUrl.value = AgentSystem.generateAffiliateUrl(name, line, tel);
  }

  [agentInputName, agentInputLine, agentInputTel].forEach(input => {
    if (input) {
      input.addEventListener('input', updateGeneratedAffiliateUrl);
    }
  });

  if (btnCopyAffiliateUrl) {
    btnCopyAffiliateUrl.addEventListener('click', () => {
      if (agentGeneratedUrl && agentGeneratedUrl.value) {
        copyToClipboard(agentGeneratedUrl.value);
        showToast('คัดลอกลิงก์ตัวแทนร้านค้าของคุณเรียบร้อยแล้ว!');
      }
    });
  }

  if (shopUrlInput) {
    const currentAgent = AgentSystem.getAgentInfo();
    shopUrlInput.value = currentAgent.shopUrl || currentShopUrl;
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
        const agent = AgentSystem.getAgentInfo();
        window.open(agent.shopUrl || currentShopUrl, '_blank');
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

  // -------------------------------------------------------------------------
  // 3. AI Dream Interpreter & Voice Input Engine
  // -------------------------------------------------------------------------
  const dreamInput = document.getElementById('dream-input');
  const btnVoiceInput = document.getElementById('btn-voice-input');
  const voiceStatusHint = document.getElementById('voice-status-hint');

  // Initialize Voice-to-Text if supported
  if (VoiceInputEngine.isSupported && btnVoiceInput) {
    VoiceInputEngine.initRecognition(
      // onResult
      (transcript, isFinal) => {
        if (dreamInput) {
          dreamInput.value = transcript;
          if (isFinal) {
            showToast('บันทึกเสียงความฝันเรียบร้อยแล้ว!');
          }
        }
      },
      // onStateChange
      (isListening) => {
        if (isListening) {
          btnVoiceInput.classList.add('recording');
          if (voiceStatusHint) voiceStatusHint.classList.add('active');
          try { SoundEngine.playClick(); } catch (e) {}
        } else {
          btnVoiceInput.classList.remove('recording');
          if (voiceStatusHint) voiceStatusHint.classList.remove('active');
        }
      },
      // onError
      (err) => {
        console.warn('Voice Input error:', err);
        showToast('เกิดข้อผิดพลาดในการฟังเสียง หรือยังไม่ได้อนุญาตการใช้ไมโครโฟน');
      }
    );

    btnVoiceInput.addEventListener('click', () => {
      VoiceInputEngine.toggleListening();
    });
  } else if (btnVoiceInput) {
    btnVoiceInput.addEventListener('click', () => {
      showToast('เบราว์เซอร์นี้ยังไม่รองรับระบบตรวจจับเสียง กรุณาพิมพ์ความฝันในช่องข้อความครับ');
    });
  }

  // Quick Dream Tag Click Handlers
  const tagBtns = document.querySelectorAll('.tag-btn');
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

  let currentPrediction = {
    dreamText: 'ฝันเห็นงูใหญ่สีทอง',
    element: 'ธาตุน้ำ / ดาวเกตุ (๙)',
    n3Direct: '789',
    n3Tod: '798, 879',
    n2Digit: '89',
    confidence: '98.5%',
    meaning: 'ฝันเห็นงูหรือพญานาค ถือเป็นนิมิตหมายมงคลยิ่งใหญ่ สื่อถึงโชคลาภก้อนโต การเจริญด้วยลาภยศและวาสนา',
    blessing: 'แนะนำทำบุญถวายสังฆทานน้ำดื่ม หรือร่วมสร้างอุโบสถเพื่อเปิดทิศทางโชคลาภ'
  };

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

          try {
            currentPrediction = AIDreamEngine.generatePrediction(inputVal);
            displayPredictionResult(currentPrediction);
          } catch (err) {
            console.error('Prediction Generation Error:', err);
            if (scanningOverlay) scanningOverlay.style.display = 'none';
            if (dreamBoxWrapper) dreamBoxWrapper.style.display = 'block';
            showToast('เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง');
          }
        }
      }, 500);
    });
  }

  // Display Prediction Results
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

  // -------------------------------------------------------------------------
  // 4. Social Share Card Generator & Modals
  // -------------------------------------------------------------------------
  const btnShareCard = document.getElementById('btn-share-card');
  const modalShareCard = document.getElementById('modal-share-card');
  const modalShareClose = document.getElementById('modal-share-close');
  const shareCardPreviewImg = document.getElementById('share-card-preview-img');
  const btnDownloadCardPng = document.getElementById('btn-download-card-png');
  const btnNativeShareCard = document.getElementById('btn-native-share-card');

  if (btnShareCard) {
    btnShareCard.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (err) {}
      const agentInfo = AgentSystem.getAgentInfo();
      const pred = currentPrediction || {
        dreamText: 'ฝันเห็นงูใหญ่สีทอง',
        element: 'ธาตุน้ำ / ดาวเกตุ (๙)',
        n3Direct: '789',
        n3Tod: '798, 879',
        n2Digit: '89',
        confidence: '98.5%',
        meaning: 'ฝันมงคลนำพาโชคลาภก้อนโต',
        blessing: 'ทำบุญตักบาตรเสริมดวง'
      };

      try {
        const cardDataUrl = ShareCardEngine.renderCardCanvas(pred, agentInfo);
        if (shareCardPreviewImg) shareCardPreviewImg.src = cardDataUrl;
        if (modalShareCard) modalShareCard.classList.add('active');
      } catch (err) {
        console.error('Share card render error:', err);
        showToast('เกิดข้อผิดพลาดในการสร้างรูปภาพ');
      }
    });
  }

  if (modalShareClose && modalShareCard) {
    modalShareClose.addEventListener('click', () => {
      modalShareCard.classList.remove('active');
    });
  }

  if (btnDownloadCardPng) {
    btnDownloadCardPng.addEventListener('click', () => {
      try { SoundEngine.playCopySuccess(); } catch (err) {}
      const agentInfo = AgentSystem.getAgentInfo();
      ShareCardEngine.downloadCard(currentPrediction, agentInfo);
      showToast('กำลังดาวน์โหลดรูปภาพการ์ดคำทำนาย...');
    });
  }

  if (btnNativeShareCard) {
    btnNativeShareCard.addEventListener('click', async () => {
      try { SoundEngine.playClick(); } catch (err) {}
      const agentInfo = AgentSystem.getAgentInfo();
      showToast('กำลังเตรียมไฟล์เพื่อแชร์...');
      await ShareCardEngine.shareCardNative(currentPrediction, agentInfo);
    });
  }

  // -------------------------------------------------------------------------
  // 5. N3 Results Checker Controller
  // -------------------------------------------------------------------------
  const checkerDrawSelect = document.getElementById('checker-draw-select');
  const checkerNumberInput = document.getElementById('checker-number-input');
  const btnCheckPrize = document.getElementById('btn-check-prize');
  const checkerResultDisplay = document.getElementById('checker-result-display');
  const checkerResTitle = document.getElementById('checker-res-title');
  const checkerResBadge = document.getElementById('checker-res-badge');
  const checkerResMsg = document.getElementById('checker-res-msg');
  const checkerPrizesList = document.getElementById('checker-prizes-list');

  // Populate Draw Select Dropdown
  if (checkerDrawSelect && N3Checker.drawHistory) {
    checkerDrawSelect.innerHTML = N3Checker.drawHistory.map(d =>
      `<option value="${d.id}">งวด ${d.dateText} (เลข 3 ตรง: ${d.winning3Direct})</option>`
    ).join('');
  }

  function handleCheckPrize() {
    const inputNum = checkerNumberInput ? checkerNumberInput.value.trim() : '';
    const selectedDraw = checkerDrawSelect ? checkerDrawSelect.value : '';

    if (!inputNum || inputNum.length !== 3) {
      showToast('กรุณากรอกเลข 3 หลักให้ถูกต้อง (เช่น 789)');
      if (checkerNumberInput) checkerNumberInput.focus();
      return;
    }

    const checkRes = N3Checker.checkN3Prize(inputNum, selectedDraw);

    if (!checkRes.success) {
      showToast(checkRes.error);
      return;
    }

    if (checkerResultDisplay) {
      checkerResultDisplay.className = checkRes.isWinner ? 'checker-result-box won' : 'checker-result-box lost';
      checkerResultDisplay.style.display = 'block';

      if (checkerResTitle) checkerResTitle.innerText = `ผลการตรวจเลข "${checkRes.inputNumber}"`;
      if (checkerResBadge) {
        checkerResBadge.className = checkRes.isWinner ? 'badge badge-emerald' : 'badge badge-gold';
        checkerResBadge.innerHTML = checkRes.isWinner
          ? '<i class="fas fa-trophy"></i> ถูกรางวัล!'
          : '<i class="fas fa-times-circle"></i> ไม่ถูกรางวัล';
      }
      if (checkerResMsg) checkerResMsg.innerText = checkRes.message;

      if (checkerPrizesList) {
        if (checkRes.isWinner && checkRes.prizesWon.length > 0) {
          checkerPrizesList.innerHTML = checkRes.prizesWon.map(p => `
            <div class="prize-badge-won">
              <div>
                <strong style="color: var(--color-gold); font-size: 0.95rem;">${p.title}</strong>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${p.description}</div>
              </div>
              <div style="text-align: right;">
                <strong style="color: var(--color-emerald-light); font-size: 1.1rem;">${N3Calculator.formatBaht(p.amount)}</strong>
              </div>
            </div>
          `).join('');

          if (checkRes.hasJackpotChance) {
            checkerPrizesList.innerHTML += `
              <div class="prize-badge-won" style="border-left-color: var(--color-emerald); background: rgba(16, 185, 129, 0.15);">
                <div>
                  <strong style="color: var(--color-gold);"><i class="fas fa-crown"></i> สิทธิ์ลุ้นรางวัลพิเศษ Jackpot!</strong>
                  <div style="font-size: 0.8rem; color: var(--text-secondary);">หมายเลข 3 ตัวตรงมีสิทธิ์สุ่มรับแจ็กพอตก้อนโตในงวดนี้</div>
                </div>
              </div>
            `;
          }
        } else {
          checkerPrizesList.innerHTML = `
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">
              * สลาก N3 มี 4 ประเภทรางวัล (3 ตรง, 3 โต๊ด, 2 ตรง และรางวัลพิเศษ) ลองใช้ AI ทำนายฝันเพื่อหาเลขมงคลงวดถัดไป
            </div>
          `;
        }
      }

      if (checkRes.isWinner) {
        try { SoundEngine.playRevealFanfare(); } catch (err) {}
        showToast(`🎉 ยินดีด้วยครับ! ถูกรางวัลรวม ${N3Calculator.formatBaht(checkRes.totalPrize)}`);
      } else {
        try { SoundEngine.playClick(); } catch (err) {}
        showToast(`เลข ${checkRes.inputNumber} ไม่ถูกรางวัลในงวดนี้`);
      }
    }
  }

  if (btnCheckPrize) {
    btnCheckPrize.addEventListener('click', handleCheckPrize);
  }
  if (checkerNumberInput) {
    checkerNumberInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleCheckPrize();
    });
  }

  // -------------------------------------------------------------------------
  // 6. Statistics & 3D Lucky Ball Roller
  // -------------------------------------------------------------------------
  const statHotChips = document.getElementById('stat-hot-chips');
  const statColdChips = document.getElementById('stat-cold-chips');
  const statTodayPower = document.getElementById('stat-today-power');
  const ball1 = document.getElementById('ball-1');
  const ball2 = document.getElementById('ball-2');
  const ball3 = document.getElementById('ball-3');
  const rollerAuspice = document.getElementById('roller-auspice');
  const rollerTodHint = document.getElementById('roller-tod-hint');
  const btnRollLucky = document.getElementById('btn-roll-lucky');
  const btnCopyRolled = document.getElementById('btn-copy-rolled');

  // Load and display statistics
  const stats = N3Checker.getNumberStatistics();
  if (statTodayPower && stats.todayPower) {
    statTodayPower.innerHTML = `<i class="fas fa-calendar-day"></i> ${stats.todayPower.day} • กำลังวัน: ${stats.todayPower.power}`;
  }

  if (statHotChips && stats.hotDigits) {
    statHotChips.innerHTML = stats.hotDigits.map(h =>
      `<span class="digit-chip hot" title="ออกบ่อย ${h.count} ครั้ง"><i class="fas fa-fire"></i> เลข ${h.digit} (${h.count} ครั้ง)</span>`
    ).join('');
  }

  if (statColdChips && stats.coldDigits) {
    statColdChips.innerHTML = stats.coldDigits.map(c =>
      `<span class="digit-chip cold" title="ออกน้อย ${c.count} ครั้ง"><i class="fas fa-snowflake"></i> เลข ${c.digit}</span>`
    ).join('');
  }

  let currentRolledNumber = '789';

  if (btnRollLucky) {
    btnRollLucky.addEventListener('click', () => {
      try { SoundEngine.playScanChime(); } catch (err) {}

      // Animate Balls rolling
      const balls = [ball1, ball2, ball3];
      balls.forEach(b => { if (b) b.classList.add('rolling'); });

      let rollCount = 0;
      const rollInterval = setInterval(() => {
        balls.forEach(b => {
          if (b) b.innerText = Math.floor(Math.random() * 10);
        });
        rollCount++;
        if (rollCount > 8) {
          clearInterval(rollInterval);
          balls.forEach(b => { if (b) b.classList.remove('rolling'); });

          const rolled = N3Checker.rollLucky3Digits();
          currentRolledNumber = rolled.fullNumber;

          if (ball1) ball1.innerText = rolled.d1;
          if (ball2) ball2.innerText = rolled.d2;
          if (ball3) ball3.innerText = rolled.d3;
          if (rollerAuspice) rollerAuspice.innerText = `✨ "${rolled.auspice}"`;
          if (rollerTodHint) rollerTodHint.innerText = `ชุดเลขโต๊ด: ${rolled.todPermutations}`;

          try { SoundEngine.playRevealFanfare(); } catch (err) {}
          showToast(`สุ่มได้เลขมงคล 3 ตัวตรง: ${rolled.fullNumber}`);
        }
      }, 70);
    });
  }

  if (btnCopyRolled) {
    btnCopyRolled.addEventListener('click', () => {
      copyToClipboard(currentRolledNumber);
      showToast(`คัดลอกเลขมงคล (${currentRolledNumber}) เรียบร้อยแล้ว!`);
    });
  }

  // -------------------------------------------------------------------------
  // 7. Native Mobile Paotang Launcher & General Utilities
  // -------------------------------------------------------------------------
  function launchNativePaotangApp() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isAndroid = /android/i.test(userAgent);
    const isiOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;

    if (isAndroid) {
      window.location.href = 'intent://#Intent;scheme=paotang;package=th.or.ktb.paotang;end';
    } else if (isiOS) {
      window.location.href = 'paotang://';
    } else {
      window.open('https://paotang.krungthai.com', '_blank');
    }
  }

  const btnBuyPaotang = document.querySelectorAll('.btn-buy-paotang');
  const modalQr = document.getElementById('modal-qr');
  const modalQrClose = document.getElementById('modal-qr-close');

  btnBuyPaotang.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      try { SoundEngine.playClick(); } catch (err) {}

      let numberToCopy = '000';
      if (currentPrediction && currentPrediction.n3Direct) {
        numberToCopy = currentPrediction.n3Direct;
      }
      copyToClipboard(numberToCopy);

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        showToast(`คัดลอกเลข N3 (${numberToCopy}) แล้ว! กำลังเปิดแอปเป๋าตัง...`);
        launchNativePaotangApp();
      } else {
        showToast(`คัดลอกเลข N3 (${numberToCopy}) แล้ว! สแกน QR Code หรือเปิดแอปเป๋าตัง`);
        if (modalQr) modalQr.classList.add('active');
      }
    });
  });

  if (modalQrClose && modalQr) {
    modalQrClose.addEventListener('click', () => {
      modalQr.classList.remove('active');
    });
  }

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

  const btnCopyNum = document.getElementById('btn-copy-num');
  if (btnCopyNum) {
    btnCopyNum.addEventListener('click', () => {
      if (currentPrediction && currentPrediction.n3Direct) {
        copyToClipboard(currentPrediction.n3Direct);
        showToast(`คัดลอกเลขเด็ด 3 ตัวตรง (${currentPrediction.n3Direct}) เรียบร้อยแล้ว!`);
      }
    });
  }

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

  // -------------------------------------------------------------------------
  // 8. N3 Simulator Calculator Handler
  // -------------------------------------------------------------------------
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
