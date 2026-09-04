/* ==========================================================================
   GLO N3 - Main Application Logic & Comprehensive Feature Controller
   - PWA Service Worker & Install Prompt Controller
   - Next Draw Real-time Countdown Ticker
   - White-label Dynamic Agent Branding & Affiliate Link Generator
   - AI Dream Engine & Voice-to-Text Speech Recognition
   - High-DPI Social Share Card Generator
   - 3D Mystical Tarot Reading & Birthday Zodiac Numerology
   - N3 Prize Checker & Statistics Engine
   - Agent Poster & Banner Marketing Studio
   - Official Shop Router & Smart Paotang Launcher
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  // -------------------------------------------------------------------------
  // 1. PWA Installation & Service Worker Registrar
  // -------------------------------------------------------------------------
  PWAInstaller.registerServiceWorker();

  const pwaInstallBanner = document.getElementById('pwa-install-banner');
  const btnPwaInstall = document.getElementById('btn-pwa-install');
  const btnPwaClose = document.getElementById('btn-pwa-close');

  PWAInstaller.initInstallPrompt(
    // onPromptReady
    () => {
      if (pwaInstallBanner) pwaInstallBanner.style.display = 'block';
    },
    // onInstalled
    () => {
      if (pwaInstallBanner) pwaInstallBanner.style.display = 'none';
      showToast('🎉 ติดตั้งแอป GLO N3 สำเร็จแล้ว!');
    }
  );

  if (btnPwaInstall) {
    btnPwaInstall.addEventListener('click', async () => {
      try { SoundEngine.playClick(); } catch (e) {}
      const installed = await PWAInstaller.promptInstall();
      if (installed && pwaInstallBanner) {
        pwaInstallBanner.style.display = 'none';
      }
    });
  }

  if (btnPwaClose && pwaInstallBanner) {
    btnPwaClose.addEventListener('click', () => {
      pwaInstallBanner.style.display = 'none';
    });
  }

  // -------------------------------------------------------------------------
  // 2. Real-time Next Draw Countdown Ticker
  // -------------------------------------------------------------------------
  const cdTargetDate = document.getElementById('cd-target-date');
  const cdDays = document.getElementById('cd-days');
  const cdHours = document.getElementById('cd-hours');
  const cdMinutes = document.getElementById('cd-minutes');
  const cdSeconds = document.getElementById('cd-seconds');

  N3Countdown.startTicker((rem) => {
    if (cdTargetDate) cdTargetDate.innerText = rem.targetDateText;
    if (cdDays) cdDays.innerText = String(rem.days).padStart(2, '0');
    if (cdHours) cdHours.innerText = String(rem.hours).padStart(2, '0');
    if (cdMinutes) cdMinutes.innerText = String(rem.minutes).padStart(2, '0');
    if (cdSeconds) cdSeconds.innerText = String(rem.seconds).padStart(2, '0');
  });

  // -------------------------------------------------------------------------
  // 3. White-label Agent System Initialization
  // -------------------------------------------------------------------------
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

  // Mobile Hamburger Drawer Controller
  const btnHamburger = document.getElementById('btn-hamburger');
  const mobileDrawer = document.getElementById('mobile-drawer');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerLinks = document.querySelectorAll('.drawer-link');

  function openMobileDrawer() {
    try { SoundEngine.playClick(); } catch (e) {}
    if (mobileDrawer) {
      mobileDrawer.style.display = 'block';
      requestAnimationFrame(() => {
        mobileDrawer.classList.add('active');
      });
      document.body.style.overflow = 'hidden';
    }
  }

  function closeMobileDrawer() {
    if (mobileDrawer) {
      mobileDrawer.classList.remove('active');
      document.body.style.overflow = '';
      setTimeout(() => {
        if (!mobileDrawer.classList.contains('active')) {
          mobileDrawer.style.display = 'none';
        }
      }, 300);
    }
  }

  if (btnHamburger) btnHamburger.addEventListener('click', openMobileDrawer);
  if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeMobileDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeMobileDrawer);
  drawerLinks.forEach(link => link.addEventListener('click', closeMobileDrawer));

  // Handle URL Query Parameters (e.g. ?dream=งู or ?num=789)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const dreamParam = urlParams.get('dream');
    if (dreamParam) {
      const dreamInputEl = document.getElementById('dream-input');
      const dreamFormEl = document.getElementById('dream-form');
      if (dreamInputEl) {
        dreamInputEl.value = decodeURIComponent(dreamParam);
        const dreamSection = document.getElementById('ai-dream');
        if (dreamSection) dreamSection.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
          if (dreamFormEl) dreamFormEl.dispatchEvent(new Event('submit'));
        }, 700);
      }
    }
  } catch (err) {
    console.warn('URL params parsing error:', err);
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
  // 4. Shop & Agent System Modal Controllers (4 Tabs + QR Support)
  // -------------------------------------------------------------------------
  const DEFAULT_SHOP_URL = 'https://n3.glolotteryshop.com';
  let currentShopUrl = localStorage.getItem('glo_n3_shop_url') || DEFAULT_SHOP_URL;

  const btnOurShopList = document.querySelectorAll('.btn-our-shop');
  const modalShopConfig = document.getElementById('modal-shop-config');
  const modalShopClose = document.getElementById('modal-shop-close');

  // Modal Tabs
  const tabBtnShop = document.getElementById('tab-btn-shop');
  const tabBtnSettings = document.getElementById('tab-btn-settings');
  const tabBtnAffiliate = document.getElementById('tab-btn-affiliate');
  const tabBtnScripts = document.getElementById('tab-btn-scripts');

  const tabContentShop = document.getElementById('tab-content-shop');
  const tabContentSettings = document.getElementById('tab-content-settings');
  const tabContentAffiliate = document.getElementById('tab-content-affiliate');
  const tabContentScripts = document.getElementById('tab-content-scripts');

  // Storefront Tab Elements
  const storefrontShopTitle = document.getElementById('storefront-shop-title');
  const storefrontQrImg = document.getElementById('storefront-qr-img');
  const btnDownloadShopQr = document.getElementById('btn-download-shop-qr');

  // Settings & QR Upload Elements
  const agentInputName = document.getElementById('agent-input-name');
  const agentInputLine = document.getElementById('agent-input-line');
  const agentInputTel = document.getElementById('agent-input-tel');
  const shopUrlInput = document.getElementById('shop-url-input');
  const btnSaveAgentSettings = document.getElementById('btn-save-agent-settings');

  const qrDropzone = document.getElementById('qr-dropzone');
  const qrFileInput = document.getElementById('qr-file-input');
  const qrPreviewBox = document.getElementById('qr-preview-box');
  const qrPreviewThumb = document.getElementById('qr-preview-thumb');
  const btnRemoveQr = document.getElementById('btn-remove-qr');

  // Affiliate & Quick Replies Elements
  const agentGeneratedUrl = document.getElementById('agent-generated-url');
  const btnCopyAffiliateUrl = document.getElementById('btn-copy-affiliate-url');
  const quickRepliesContainer = document.getElementById('quick-replies-container');

  // ควบคุมการแสดงผลแท็บสำหรับผู้ดูแลร้าน (Admin Only)
  function updateAdminTabsVisibility() {
    const isAdmin = AgentSystem.isAdminAuthenticated();
    const adminTabs = document.querySelectorAll('.admin-only-tab');
    adminTabs.forEach(tab => {
      tab.style.display = isAdmin ? 'inline-flex' : 'none';
    });
  }

  // เรียกตรวจสอบสิทธิ์แอดมินตอนเริ่มต้น
  updateAdminTabsVisibility();

  function switchTab(activeTab) {
    // ป้องกันไม่ให้ลูกค้าทั่วไปเข้าแท็บตั้งค่าหากยังไม่ได้ยืนยันรหัส PIN
    if (activeTab !== 'shop' && !AgentSystem.isAdminAuthenticated()) {
      openAdminAuthModal();
      return;
    }

    const tabs = [
      { btn: tabBtnShop, content: tabContentShop },
      { btn: tabBtnSettings, content: tabContentSettings },
      { btn: tabBtnAffiliate, content: tabContentAffiliate },
      { btn: tabBtnScripts, content: tabContentScripts }
    ];

    tabs.forEach(t => {
      if (t.btn) t.btn.classList.remove('active');
      if (t.content) t.content.style.display = 'none';
    });

    if (activeTab === 'shop' && tabBtnShop && tabContentShop) {
      tabBtnShop.classList.add('active');
      tabContentShop.style.display = 'block';
      refreshStorefrontQR();
    } else if (activeTab === 'settings' && tabBtnSettings && tabContentSettings) {
      tabBtnSettings.classList.add('active');
      tabContentSettings.style.display = 'block';
    } else if (activeTab === 'affiliate' && tabBtnAffiliate && tabContentAffiliate) {
      tabBtnAffiliate.classList.add('active');
      tabContentAffiliate.style.display = 'block';
      updateGeneratedAffiliateUrl();
    } else if (activeTab === 'scripts' && tabBtnScripts && tabContentScripts) {
      tabBtnScripts.classList.add('active');
      tabContentScripts.style.display = 'block';
      renderQuickReplies();
    }
  }

  if (tabBtnShop) tabBtnShop.addEventListener('click', () => switchTab('shop'));
  if (tabBtnSettings) tabBtnSettings.addEventListener('click', () => switchTab('settings'));
  if (tabBtnAffiliate) tabBtnAffiliate.addEventListener('click', () => switchTab('affiliate'));
  if (tabBtnScripts) tabBtnScripts.addEventListener('click', () => switchTab('scripts'));

  function refreshStorefrontQR() {
    const agent = AgentSystem.getAgentInfo();

    // 1. ชื่อร้าน
    if (storefrontShopTitle) {
      storefrontShopTitle.innerText = agent.name || 'ร้านสลาก N3 ธนกิจนำโชค';
    }

    // 2. รหัสตัวแทนจำหน่าย GLO
    const dealerCodeEl = document.getElementById('storefront-dealer-code-text');
    if (dealerCodeEl) {
      dealerCodeEl.innerText = agent.dealerCode || 'ตัวแทนจำหน่ายสลากกินแบ่งรัฐบาล N3';
    }

    // 3. จุดจำหน่าย / พิกัดร้าน
    const locationEl = document.getElementById('storefront-location-text');
    if (locationEl) {
      locationEl.innerText = agent.location || 'จุดจำหน่ายสลากตัวเลขสามหลัก (N3) ดิจิทัล ถูกต้องตามกฎหมาย 100%';
    }

    // 4. ลิงก์ปุ่มแชทสั่งซื้อผ่าน LINE
    const lineBtn = document.getElementById('btn-order-line-direct');
    if (lineBtn) {
      let lineLink = 'https://line.me';
      if (agent.line) {
        lineLink = agent.line.startsWith('http') 
          ? agent.line 
          : `https://line.me/R/ti/p/${agent.line.startsWith('@') ? agent.line : '@' + agent.line}`;
      }
      lineBtn.href = lineLink;
      lineBtn.setAttribute('title', `แชทสั่งซื้อสลาก N3 กับ ${agent.name}`);
    }

    // 5. ภาพ QR Code ร้านค้า (LINE Official Account)
    const savedQr = AgentSystem.getAgentQR();
    if (storefrontQrImg) {
      if (savedQr) {
        storefrontQrImg.src = savedQr;
      } else {
        storefrontQrImg.src = 'images/line-qr.png';
      }
    }
  }

  // QR Download Handler
  if (btnDownloadShopQr) {
    btnDownloadShopQr.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (e) {}
      if (storefrontQrImg && storefrontQrImg.src) {
        const link = document.createElement('a');
        link.download = `GLO-N3-Shop-QR-${Date.now()}.png`;
        link.href = storefrontQrImg.src;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('กำลังดาวน์โหลดภาพ QR Code ร้านค้า...');
      }
    });
  }

  // QR Upload via Dropzone or File Input
  if (qrDropzone && qrFileInput) {
    qrDropzone.addEventListener('click', () => qrFileInput.click());

    qrDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      qrDropzone.classList.add('dragover');
    });

    qrDropzone.addEventListener('dragleave', () => {
      qrDropzone.classList.remove('dragover');
    });

    qrDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      qrDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processUploadedQrFile(e.dataTransfer.files[0]);
      }
    });

    qrFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        processUploadedQrFile(e.target.files[0]);
      }
    });
  }

  function processUploadedQrFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('กรุณาอัปโหลดไฟล์รูปภาพ (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      AgentSystem.saveAgentQR(dataUrl);
      updateQrPreviewUI(dataUrl);
      refreshStorefrontQR();
      refreshPosterPreview();
      showToast('🎉 บันทึกภาพ QR Code ร้านค้าสำเร็จแล้ว!');
    };
    reader.readAsDataURL(file);
  }

  function updateQrPreviewUI(dataUrl) {
    if (dataUrl) {
      if (qrPreviewBox) qrPreviewBox.style.display = 'flex';
      if (qrPreviewThumb) qrPreviewThumb.src = dataUrl;
    } else {
      if (qrPreviewBox) qrPreviewBox.style.display = 'none';
      if (qrPreviewThumb) qrPreviewThumb.src = '';
    }
  }

  // Initial QR Preview state
  const existingQr = AgentSystem.getAgentQR();
  if (existingQr) updateQrPreviewUI(existingQr);

  if (btnRemoveQr) {
    btnRemoveQr.addEventListener('click', (e) => {
      e.stopPropagation();
      AgentSystem.clearAgentQR();
      updateQrPreviewUI(null);
      refreshStorefrontQR();
      refreshPosterPreview();
      showToast('ลบภาพ QR Code ร้านค้าแล้ว');
    });
  }

  // Elements สำหรับข้อมูลตัวแทน N3 เพิ่มเติม
  const agentInputDealerCode = document.getElementById('agent-input-dealer-code');
  const agentInputLocation = document.getElementById('agent-input-location');

  // Elements สำหรับระบบ Admin Auth Modal
  const modalAdminAuth = document.getElementById('modal-admin-auth');
  const btnTriggerAdminLogin = document.getElementById('btn-trigger-admin-login');
  const modalAdminAuthClose = document.getElementById('modal-admin-auth-close');
  const btnCancelAdminAuth = document.getElementById('btn-cancel-admin-auth');
  const formAdminAuth = document.getElementById('form-admin-auth');
  const adminPinInput = document.getElementById('admin-pin-input');
  const adminPinError = document.getElementById('admin-pin-error');
  const btnAdminLogout = document.getElementById('btn-admin-logout');
  const btnSaveNewPin = document.getElementById('btn-save-new-pin');
  const agentChangePinInput = document.getElementById('agent-change-pin-input');

  function openAdminAuthModal() {
    if (AgentSystem.isAdminAuthenticated()) {
      switchTab('settings');
      return;
    }
    if (modalAdminAuth) {
      modalAdminAuth.style.display = 'flex';
      if (adminPinInput) {
        adminPinInput.value = '';
        adminPinInput.focus();
      }
      if (adminPinError) adminPinError.style.display = 'none';
    }
  }

  function closeAdminAuthModal() {
    if (modalAdminAuth) modalAdminAuth.style.display = 'none';
  }

  if (btnTriggerAdminLogin) {
    btnTriggerAdminLogin.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (e) {}
      openAdminAuthModal();
    });
  }

  if (modalAdminAuthClose) modalAdminAuthClose.addEventListener('click', closeAdminAuthModal);
  if (btnCancelAdminAuth) btnCancelAdminAuth.addEventListener('click', closeAdminAuthModal);

  // ตรวจสอบรหัส Admin PIN
  if (formAdminAuth) {
    formAdminAuth.addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = adminPinInput ? adminPinInput.value.trim() : '';
      if (AgentSystem.verifyAdminPin(pin)) {
        try { SoundEngine.playSuccess(); } catch (e) {}
        closeAdminAuthModal();
        updateAdminTabsVisibility();
        switchTab('settings');
        showToast('🔓 เข้าสู่ระบบผู้ดูแลร้านสำเร็จ!');
      } else {
        try { SoundEngine.playError(); } catch (e) {}
        if (adminPinError) adminPinError.style.display = 'block';
        if (adminPinInput) {
          adminPinInput.select();
          adminPinInput.focus();
        }
      }
    });
  }

  // เปลี่ยนรหัส Admin PIN
  if (btnSaveNewPin && agentChangePinInput) {
    btnSaveNewPin.addEventListener('click', () => {
      const newPin = agentChangePinInput.value.trim();
      if (newPin.length < 4) {
        showToast('กรุณาระบุรหัส PIN ใหม่อย่างน้อย 4 หลัก');
        return;
      }
      const res = AgentSystem.updateAdminPin 
        ? AgentSystem.updateAdminPin(newPin) 
        : AgentSystem.changeAdminPin('9999', newPin);
      if (res.success) {
        showToast('🎉 เปลี่ยนรหัสผ่าน Admin PIN เรียบร้อยแล้ว!');
        agentChangePinInput.value = '';
      } else {
        showToast(res.message);
      }
    });
  }

  // ออกจากระบบ Admin
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (e) {}
      AgentSystem.logoutAdmin();
      updateAdminTabsVisibility();
      switchTab('shop');
      showToast('🔒 ออกจากระบบผู้ดูแลร้านเรียบร้อยแล้ว');
    });
  }

  // Save Agent Settings Handler (เฉพาะแอดมิน)
  if (btnSaveAgentSettings) {
    btnSaveAgentSettings.addEventListener('click', () => {
      if (!AgentSystem.isAdminAuthenticated()) {
        openAdminAuthModal();
        return;
      }

      try { SoundEngine.playClick(); } catch (e) {}
      const name = agentInputName ? agentInputName.value.trim() : '';
      const dealerCode = agentInputDealerCode ? agentInputDealerCode.value.trim() : '';
      const line = agentInputLine ? agentInputLine.value.trim() : '';
      const tel = agentInputTel ? agentInputTel.value.trim() : '';
      const location = agentInputLocation ? agentInputLocation.value.trim() : '';
      const shopUrl = shopUrlInput ? shopUrlInput.value.trim() : '';

      AgentSystem.saveAgentInfo({ name, dealerCode, line, tel, location, shopUrl });
      AgentSystem.applyAgentBranding();
      refreshStorefrontQR();
      refreshPosterPreview();

      showToast('🎉 บันทึกข้อมูลร้านค้า & QR Code เรียบร้อยแล้ว!');
      switchTab('shop');
    });
  }

  // Affiliate URL Generator
  function updateGeneratedAffiliateUrl() {
    if (!agentGeneratedUrl) return;
    const name = agentInputName ? agentInputName.value : '';
    const dealerCode = agentInputDealerCode ? agentInputDealerCode.value : '';
    const line = agentInputLine ? agentInputLine.value : '';
    const tel = agentInputTel ? agentInputTel.value : '';
    const location = agentInputLocation ? agentInputLocation.value : '';
    const shopUrl = shopUrlInput ? shopUrlInput.value : '';
    agentGeneratedUrl.value = AgentSystem.generateAffiliateUrl(name, line, tel, shopUrl, dealerCode, location);
  }

  [agentInputName, agentInputDealerCode, agentInputLine, agentInputTel, agentInputLocation, shopUrlInput].forEach(input => {
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

  // Quick Replies Renderer
  function renderQuickReplies() {
    if (!quickRepliesContainer) return;
    let numberToUse = '789';
    if (currentPrediction && currentPrediction.n3Direct) {
      numberToUse = currentPrediction.n3Direct;
    }

    const templates = AgentSystem.getQuickReplyTemplates(numberToUse);
    quickRepliesContainer.innerHTML = templates.map(tpl => {
      const title = tpl.title || 'สคริปต์ข้อความ';
      const desc = tpl.desc || '';
      const content = tpl.content || tpl.text || '';
      return `
      <div class="quick-reply-card">
        <div class="quick-reply-header">
          <div>
            <h4>${title}</h4>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${desc}</div>
          </div>
          <button class="btn btn-gold btn-copy-script" data-text="${encodeURIComponent(content)}" style="padding: 0.35rem 0.85rem; font-size: 0.8rem;">
            <i class="fas fa-copy"></i> คัดลอก
          </button>
        </div>
        <div class="quick-reply-text">${escapeHtml(content)}</div>
      </div>
    `;
    }).join('');

    // Wire copy buttons
    const copyBtns = quickRepliesContainer.querySelectorAll('.btn-copy-script');
    copyBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const text = decodeURIComponent(btn.dataset.text);
        copyToClipboard(text);
        showToast('คัดลอกสคริปต์ข้อความตอบแชทแล้ว!');
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Shop button click -> open modal
  btnOurShopList.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      try { SoundEngine.playClick(); } catch (err) {}

      let numberToCopy = '000';
      if (currentPrediction && currentPrediction.n3Direct) {
        numberToCopy = currentPrediction.n3Direct;
      }
      copyToClipboard(numberToCopy);

      showToast(`คัดลอกเลขเด็ด N3 (${numberToCopy}) แล้ว! กำลังเปิดหน้าร้านค้า...`);

      if (modalShopConfig) {
        refreshStorefrontQR();
        switchTab('shop');
        modalShopConfig.classList.add('active');
      }
    });
  });

  if (modalShopClose) {
    modalShopClose.addEventListener('click', () => {
      modalShopConfig.classList.remove('active');
    });
  }

  // -------------------------------------------------------------------------
  // 5. AI Dream Interpreter & Voice Input Engine
  // -------------------------------------------------------------------------
  const dreamInput = document.getElementById('dream-input');
  const btnVoiceInput = document.getElementById('btn-voice-input');
  const voiceStatusHint = document.getElementById('voice-status-hint');

  if (VoiceInputEngine.isSupported && btnVoiceInput) {
    VoiceInputEngine.initRecognition(
      (transcript, isFinal) => {
        if (dreamInput) {
          dreamInput.value = transcript;
          if (isFinal) {
            showToast('บันทึกเสียงความฝันเรียบร้อยแล้ว!');
          }
        }
      },
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
    blessing: 'แนะนำทำบุญถวายสังฆทานน้ำดื่ม หรือร่วมสร้างอุโบสถเพื่อเปิดทิศทางโชคลาภ',
    poem: 'นิมิตฝันแห่งโชคลาภพาพบสุข / สิ่งศักดิ์สิทธิ์ปลดเปลื้องทุกข์ดับตัณหา\nเลขมงคล 789 เด่นในสายตา / รับทรัพย์ใหญ่สลาก N3 สมดั่งใจ'
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
    const elPoemBox = document.getElementById('res-poem-box');

    if (elDreamTitle) elDreamTitle.innerText = `"${pred.dreamText}"`;
    if (elElement) elElement.innerText = pred.element;
    if (elN3Direct) elN3Direct.innerText = pred.n3Direct;
    if (elN3Tod) elN3Tod.innerText = pred.n3Tod;
    if (elN2Digit) elN2Digit.innerText = pred.n2Digit;
    if (elConfidence) elConfidence.innerText = pred.confidence;
    if (elMeaning) elMeaning.innerText = pred.meaning;
    if (elBlessing) elBlessing.innerText = pred.blessing;
    if (elPoemBox && pred.poem) elPoemBox.innerText = pred.poem;

    // 1. Setup Lucky Package UI Presets
    const pkgDescDirect = document.getElementById('pkg-desc-direct');
    const pkgDescCombo = document.getElementById('pkg-desc-combo');
    const pkgPriceCombo = document.getElementById('pkg-price-combo');
    const pkgDescTwo = document.getElementById('pkg-desc-two');

    if (pkgDescDirect) pkgDescDirect.innerHTML = `เลข <span class="num-highlight">${pred.n3Direct}</span> (1 ใบ)`;
    
    // คำนวณรายการโต๊ด
    const todsList = pred.allTods || (pred.n3Tod && pred.n3Tod !== 'ไม่มี (เลขตอง)' ? pred.n3Tod.split(',').map(s => s.trim()) : []);
    const comboPrice = (1 + todsList.length) * 20;
    if (pkgDescCombo) {
      if (todsList.length > 0) {
        pkgDescCombo.innerHTML = `ตรง 1 ใบ + โต๊ด <span class="num-highlight">${todsList.slice(0, 2).join(', ')}${todsList.length > 2 ? '...' : ''}</span> (${todsList.length} ใบ)`;
      } else {
        pkgDescCombo.innerHTML = `ตรง <span class="num-highlight">${pred.n3Direct}</span> (เลขตองไม่มีโต๊ด)`;
      }
    }
    if (pkgPriceCombo) pkgPriceCombo.innerText = `${comboPrice} บาท`;
    if (pkgDescTwo) pkgDescTwo.innerHTML = `สลากท้าย <span class="num-highlight">${pred.n2Digit}</span> (1 ใบ)`;

    // Resolve dynamic LINE OA ID from AgentSystem
    const currentAgentLine = (window.AgentSystem && typeof window.AgentSystem.getAgentInfo === 'function')
      ? window.AgentSystem.getAgentInfo().line
      : (typeof AgentSystem !== 'undefined' && AgentSystem.getAgentInfo ? AgentSystem.getAgentInfo().line : '@586xxhlx');
    const rawLine = currentAgentLine || '@586xxhlx';
    const formattedLine = rawLine.startsWith('@') ? rawLine : '@' + rawLine;
    const dynamicLineOaId = encodeURIComponent(formattedLine);

    // 2. Setup Primary LINE Order Button (1-Click Deep Link)
    const btnOrderLine = document.getElementById('btn-order-dream-line');
    if (btnOrderLine) {
      const defaultOrderMsg = `สั่งซื้อ ${pred.n3Direct} 1 ใบ`;
      btnOrderLine.href = `https://line.me/R/oaMessage/${dynamicLineOaId}/?${encodeURIComponent(defaultOrderMsg)}`;
      btnOrderLine.innerHTML = `<i class="fab fa-line" style="font-size: 1.4rem;"></i> <span>⚡ สั่งซื้อเลขนี้ผ่าน LINE (20 บ.)</span>`;
      btnOrderLine.onclick = () => {
        copyToClipboard(defaultOrderMsg);
        showToast(`📋 คัดลอกคำสั่งซื้อ "${defaultOrderMsg}" แล้ว! กำลังเปิด LINE...`);
      };
    }

    // 3. Setup Package Click Handlers
    const pkgBtnDirect = document.getElementById('pkg-btn-direct');
    const pkgBtnCombo = document.getElementById('pkg-btn-combo');
    const pkgBtnTwo = document.getElementById('pkg-btn-two');

    if (pkgBtnDirect) {
      pkgBtnDirect.onclick = () => {
        const msg = `สั่งซื้อ ${pred.n3Direct} 1 ใบ`;
        copyToClipboard(msg);
        showToast(`🎯 3 ตัวตรง: คัดลอก "${msg}" แล้ว! กำลังเปิด LINE...`);
        window.open(`https://line.me/R/oaMessage/${dynamicLineOaId}/?${encodeURIComponent(msg)}`, '_blank');
      };
    }

    if (pkgBtnCombo) {
      pkgBtnCombo.onclick = () => {
        const orderItems = [`${pred.n3Direct} 1 ใบ`];
        todsList.forEach(t => orderItems.push(`${t} 1 ใบ`));
        const msg = `สั่งซื้อ ${orderItems.join(', ')}`;
        copyToClipboard(msg);
        showToast(`🔄 3 ตรง + ทุกโต๊ด (${comboPrice}บ.): คัดลอกคำสั่งซื้อแล้ว! กำลังเปิด LINE...`);
        window.open(`https://line.me/R/oaMessage/${dynamicLineOaId}/?${encodeURIComponent(msg)}`, '_blank');
      };
    }

    if (pkgBtnTwo) {
      pkgBtnTwo.onclick = () => {
        const msg = `สั่งซื้อ ${pred.n3Direct} 1 ใบ`;
        copyToClipboard(msg);
        showToast(`✌️ ลุ้น 2 ตัวท้าย (${pred.n2Digit}): คัดลอก "${msg}" แล้ว! กำลังเปิด LINE...`);
        window.open(`https://line.me/R/oaMessage/${dynamicLineOaId}/?${encodeURIComponent(msg)}`, '_blank');
      };
    }

    // 4. Update Floating Mobile Bottom Bar Action
    const mobileLineBtn = document.querySelector('.mobile-bar-btn-line');
    if (mobileLineBtn) {
      const mobileMsg = `สั่งซื้อ ${pred.n3Direct} 1 ใบ`;
      mobileLineBtn.href = `https://line.me/R/oaMessage/${dynamicLineOaId}/?${encodeURIComponent(mobileMsg)}`;
      mobileLineBtn.innerHTML = `<i class="fab fa-line" style="font-size: 1.15rem;"></i> สั่งซื้อเลข ${pred.n3Direct} (20บ.)`;
      mobileLineBtn.onclick = () => {
        copyToClipboard(mobileMsg);
        showToast(`คัดลอกคำสั่งซื้อ "${mobileMsg}" แล้ว!`);
      };
    }

    try { SoundEngine.playRevealFanfare(); } catch (err) {}
    showToast('ทำนายฝันและคำนวณเลข N3 สำเร็จแล้ว!');
  }

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
  // 6. Social Share Card Generator & Modals
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
      const pred = currentPrediction;

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
  // 7. 3D Mystical Tarot & Birthday Zodiac Engine Controller
  // -------------------------------------------------------------------------
  const tarotCardWrappers = [
    document.getElementById('tarot-card-1'),
    document.getElementById('tarot-card-2'),
    document.getElementById('tarot-card-3')
  ];

  const tarotIcon1 = document.getElementById('tarot-icon-1');
  const tarotName1 = document.getElementById('tarot-name-1');
  const tarotDigit1 = document.getElementById('tarot-digit-1');
  const tarotDesc1 = document.getElementById('tarot-desc-1');

  const tarotIcon2 = document.getElementById('tarot-icon-2');
  const tarotName2 = document.getElementById('tarot-name-2');
  const tarotDigit2 = document.getElementById('tarot-digit-2');
  const tarotDesc2 = document.getElementById('tarot-desc-2');

  const tarotIcon3 = document.getElementById('tarot-icon-3');
  const tarotName3 = document.getElementById('tarot-name-3');
  const tarotDigit3 = document.getElementById('tarot-digit-3');
  const tarotDesc3 = document.getElementById('tarot-desc-3');

  const tarotResDirect = document.getElementById('tarot-res-direct');
  const tarotResTod = document.getElementById('tarot-res-tod');
  const tarotRes2Digit = document.getElementById('tarot-res-2digit');
  const tarotCombinedFortune = document.getElementById('tarot-combined-fortune');
  const btnDrawTarot = document.getElementById('btn-draw-tarot');
  const btnCopyTarot = document.getElementById('btn-copy-tarot');

  // Toggle card flip on manual card click
  tarotCardWrappers.forEach(card => {
    if (card) {
      card.addEventListener('click', () => {
        try { SoundEngine.playClick(); } catch (e) {}
        card.classList.toggle('flipped');
      });
    }
  });

  let currentTarotDirect = '109';

  function handleDrawTarot() {
    try { SoundEngine.playScanChime(); } catch (e) {}

    // Flip all back first
    tarotCardWrappers.forEach(c => { if (c) c.classList.remove('flipped'); });

    setTimeout(() => {
      const drawn = TarotEngine.draw3Cards();
      currentTarotDirect = drawn.n3Direct;

      // Update Card 1
      if (tarotIcon1) tarotIcon1.innerText = drawn.cards[0].icon;
      if (tarotName1) tarotName1.innerText = drawn.cards[0].name;
      if (tarotDigit1) tarotDigit1.innerText = `เลขเด่น: ${drawn.cards[0].digit}`;
      if (tarotDesc1) tarotDesc1.innerText = drawn.cards[0].fortune;

      // Update Card 2
      if (tarotIcon2) tarotIcon2.innerText = drawn.cards[1].icon;
      if (tarotName2) tarotName2.innerText = drawn.cards[1].name;
      if (tarotDigit2) tarotDigit2.innerText = `เลขเด่น: ${drawn.cards[1].digit}`;
      if (tarotDesc2) tarotDesc2.innerText = drawn.cards[1].fortune;

      // Update Card 3
      if (tarotIcon3) tarotIcon3.innerText = drawn.cards[2].icon;
      if (tarotName3) tarotName3.innerText = drawn.cards[2].name;
      if (tarotDigit3) tarotDigit3.innerText = `เลขเด่น: ${drawn.cards[2].digit}`;
      if (tarotDesc3) tarotDesc3.innerText = drawn.cards[2].fortune;

      // Update Summary
      if (tarotResDirect) tarotResDirect.innerText = drawn.n3Direct;
      if (tarotResTod) tarotResTod.innerText = drawn.n3Tod;
      if (tarotRes2Digit) tarotRes2Digit.innerText = drawn.n2Digit;
      if (tarotCombinedFortune) tarotCombinedFortune.innerText = drawn.combinedFortune;

      // Flip forward sequentially
      tarotCardWrappers.forEach((c, idx) => {
        setTimeout(() => {
          if (c) c.classList.add('flipped');
          try { SoundEngine.playClick(); } catch (e) {}
        }, (idx + 1) * 250);
      });

      setTimeout(() => {
        try { SoundEngine.playRevealFanfare(); } catch (e) {}
        showToast(`เปิดไพ่สำเร็จ! เลขเด็ด N3: ${drawn.n3Direct}`);
      }, 1000);
    }, 400);
  }

  if (btnDrawTarot) {
    btnDrawTarot.addEventListener('click', handleDrawTarot);
  }

  if (btnCopyTarot) {
    btnCopyTarot.addEventListener('click', () => {
      copyToClipboard(currentTarotDirect);
      showToast(`คัดลอกเลขไพ่ยิปซี (${currentTarotDirect}) เรียบร้อยแล้ว!`);
    });
  }

  // Birthday Zodiac Selector
  const zodiacSelect = document.getElementById('zodiac-select');
  const btnCheckZodiac = document.getElementById('btn-check-zodiac');
  const zodiacResultBox = document.getElementById('zodiac-result-box');
  const zodiacResTitle = document.getElementById('zodiac-res-title');
  const zodiacResNum = document.getElementById('zodiac-res-num');
  const zodiacResDesc = document.getElementById('zodiac-res-desc');

  if (zodiacSelect && TarotEngine.zodiacSigns) {
    zodiacSelect.innerHTML = TarotEngine.zodiacSigns.map((z, idx) =>
      `<option value="${idx}">${z.name}</option>`
    ).join('');
  }

  if (btnCheckZodiac) {
    btnCheckZodiac.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (e) {}
      const selectedIdx = parseInt(zodiacSelect ? zodiacSelect.value : '0', 10) || 0;
      const res = TarotEngine.calculateZodiacFortune(0, selectedIdx);

      if (zodiacResultBox) {
        zodiacResultBox.style.display = 'block';
        if (zodiacResTitle) zodiacResTitle.innerText = `${res.zodiacName} (${res.element})`;
        if (zodiacResNum) zodiacResNum.innerText = res.n3Direct;
        if (zodiacResDesc) zodiacResDesc.innerText = `${res.advice} • ชุดเลขโต๊ด: ${res.n3Tod} • 2 ตัวตรง: ${res.n2Digit}`;
        showToast(`วิเคราะห์ตัวเลขชาว ${res.zodiacName} สำเร็จแล้ว!`);
      }
    });
  }

  // -------------------------------------------------------------------------
  // 8. Agent Poster Marketing Studio Controller
  // -------------------------------------------------------------------------
  const posterShopNameInput = document.getElementById('poster-shop-name');
  const posterDrawDateInput = document.getElementById('poster-draw-date');
  const posterNumbersInput = document.getElementById('poster-numbers');
  const posterLineInput = document.getElementById('poster-line');
  const posterTelInput = document.getElementById('poster-tel');
  const btnUpdatePoster = document.getElementById('btn-update-poster');
  const btnDownloadPoster = document.getElementById('btn-download-poster');
  const posterPreviewImg = document.getElementById('poster-preview-img');

  let currentPosterRatio = 'square';
  let currentPosterTheme = 'gold';

  // Sync with current Agent Branding
  const initialAgent = AgentSystem.getAgentInfo();
  if (posterShopNameInput && initialAgent.isCustomAgent) posterShopNameInput.value = initialAgent.name;
  if (posterLineInput && initialAgent.isCustomAgent) posterLineInput.value = initialAgent.line;
  if (posterTelInput && initialAgent.isCustomAgent) posterTelInput.value = initialAgent.tel;

  // Theme & Ratio Chip Selectors
  const ratioChips = document.querySelectorAll('.theme-chip[data-ratio]');
  ratioChips.forEach(chip => {
    chip.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (e) {}
      ratioChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentPosterRatio = chip.dataset.ratio;
      refreshPosterPreview();
    });
  });

  const themeChips = document.querySelectorAll('.theme-chip[data-theme]');
  themeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      try { SoundEngine.playClick(); } catch (e) {}
      themeChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentPosterTheme = chip.dataset.theme;
      refreshPosterPreview();
    });
  });

  function getPosterConfig() {
    const rawNumbers = posterNumbersInput ? posterNumbersInput.value : '789, 532, 904';
    const parsedNumbers = rawNumbers.split(',').map(s => s.trim()).filter(s => s.length > 0);

    return {
      ratio: currentPosterRatio,
      theme: currentPosterTheme,
      shopName: (posterShopNameInput && posterShopNameInput.value.trim()) || AgentSystem.getAgentInfo().name || 'ร้านสลาก N3 ธนกิจนำโชค',
      drawDate: posterDrawDateInput ? posterDrawDateInput.value.trim() : '16 กันยายน 2569',
      numbers: parsedNumbers.length >= 3 ? parsedNumbers : ['789', '532', '904'],
      line: (posterLineInput && posterLineInput.value.trim()) || AgentSystem.getAgentInfo().line || '@glon3',
      tel: (posterTelInput && posterTelInput.value.trim()) || AgentSystem.getAgentInfo().tel || '',
      qrImage: AgentSystem.getAgentQR()
    };
  }

  async function refreshPosterPreview() {
    if (!posterPreviewImg) return;
    try {
      const config = getPosterConfig();
      const posterDataUrl = await PosterStudio.renderPosterAsync(config);
      posterPreviewImg.src = posterDataUrl;
    } catch (e) {
      console.warn('Poster render error:', e);
    }
  }

  if (btnUpdatePoster) {
    btnUpdatePoster.addEventListener('click', async () => {
      try { SoundEngine.playClick(); } catch (e) {}
      await refreshPosterPreview();
      showToast('อัปเดตพรีวิวโปสเตอร์แล้ว!');
    });
  }

  if (btnDownloadPoster) {
    btnDownloadPoster.addEventListener('click', async () => {
      try { SoundEngine.playCopySuccess(); } catch (e) {}
      const config = getPosterConfig();
      await PosterStudio.downloadPoster(config);
      showToast('กำลังดาวน์โหลดรูปภาพโปสเตอร์ High-DPI...');
    });
  }

  // Initial render
  setTimeout(refreshPosterPreview, 200);



  // -------------------------------------------------------------------------
  // 10. Statistics & 3D Lucky Ball Roller
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
  // -------------------------------------------------------------------------
  // 11. General Clipboard Utilities
  // -------------------------------------------------------------------------

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
        const orderText = `สั่งซื้อ ${currentPrediction.n3Direct} 1 ใบ`;
        copyToClipboard(orderText);
        showToast(`📋 คัดลอกคำสั่งซื้อ "${orderText}" เรียบร้อยแล้ว! นำไปส่งใน LINE ได้ทันที`);
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
    toast.className = 'toast success';
    
    const icon = document.createElement('i');
    icon.className = 'fas fa-check-circle toast-icon';
    const span = document.createElement('span');
    span.className = 'toast-text';
    span.textContent = message; // ปลอดภัยต่อ XSS 100% ด้วย textContent

    toast.appendChild(icon);
    toast.appendChild(span);
    toastContainer.appendChild(toast);

    // Trigger transition
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  }

  // -------------------------------------------------------------------------
  // 11.5. Interactive GLO N3 Order Table Modal Controller
  // -------------------------------------------------------------------------
  const modalOrderTable = document.getElementById('modal-order-table');
  const modalOrderClose = document.getElementById('modal-order-close');
  const modalOrderRows = document.getElementById('modal-order-rows');
  const btnModalAddRow = document.getElementById('btn-modal-add-row');
  const btnModalRandRow = document.getElementById('btn-modal-rand-row');
  const btnModalPermute = document.getElementById('btn-modal-permute');
  const btnModalSubmitOrder = document.getElementById('btn-modal-submit-order');
  const modalOrderTotalQty = document.getElementById('modal-order-total-qty');
  const modalOrderTotalPrice = document.getElementById('modal-order-total-price');

  let modalRows = [];
  let modalNextRowId = 1;

  function toArabicDigits(str) {
    const thai = '๐๑๒๓๔๕๖๗๘๙';
    return String(str || '').replace(/[๐-๙]/g, d => thai.indexOf(d));
  }

  function createModalRow(num = '', qty = 1) {
    return {
      id: modalNextRowId++,
      number: toArabicDigits(num).replace(/\D/g, '').slice(0, 3),
      quantity: Math.max(1, Math.min(100, parseInt(qty, 10) || 1))
    };
  }

  function renderModalRows() {
    if (!modalOrderRows) return;
    modalOrderRows.innerHTML = '';

    modalRows.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.id = row.id;
      tr.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
      tr.style.textAlign = 'center';

      const subtotal = row.quantity * 20;
      const isValid = /^\d{3}$/.test(row.number);

      tr.innerHTML = `
        <td style="padding: 0.45rem 0.25rem; text-align: left;">
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: rgba(255,255,255,0.08); font-size: 0.72rem; color: var(--text-secondary);">${idx + 1}</span>
            <input 
              type="tel" 
              inputmode="numeric" 
              maxlength="3" 
              placeholder="000" 
              class="modal-ticket-num" 
              value="${row.number}"
              data-id="${row.id}"
              style="width: 72px; padding: 0.35rem 0.25rem; font-family: var(--font-heading); font-size: 1.15rem; font-weight: 700; text-align: center; letter-spacing: 2px; color: #fff; background: rgba(0,0,0,0.4); border: 1.5px solid ${isValid ? 'var(--color-emerald)' : 'rgba(255,255,255,0.15)'}; border-radius: 6px; outline: none;"
            >
          </div>
        </td>
        <td style="padding: 0.45rem 0.25rem;">
          <div style="display: inline-flex; align-items: center; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden;">
            <button type="button" class="btn-modal-step btn-modal-minus" data-id="${row.id}" style="background: none; border: none; color: var(--color-gold-light); width: 26px; height: 30px; cursor: pointer;" ${row.quantity <= 1 ? 'disabled' : ''}>-</button>
            <input type="number" min="1" max="100" class="modal-qty-input" data-id="${row.id}" value="${row.quantity}" style="width: 36px; text-align: center; font-weight: 700; color: #fff; background: transparent; border: none; outline: none;">
            <button type="button" class="btn-modal-step btn-modal-plus" data-id="${row.id}" style="background: none; border: none; color: var(--color-gold-light); width: 26px; height: 30px; cursor: pointer;" ${row.quantity >= 100 ? 'disabled' : ''}>+</button>
          </div>
        </td>
        <td style="padding: 0.45rem 0.25rem;">
          <span class="modal-row-subtotal" style="font-weight: 700; color: var(--color-emerald-light); font-size: 0.88rem;">${subtotal} ฿</span>
        </td>
        <td style="padding: 0.45rem 0.25rem;">
          <button type="button" class="btn-modal-del" data-id="${row.id}" style="background: none; border: none; color: ${modalRows.length > 1 ? 'var(--color-rose)' : 'var(--text-muted)'}; cursor: pointer; font-size: 0.85rem;" title="ลบ">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      `;

      modalOrderRows.appendChild(tr);
    });

    updateModalSummary();
  }

  function updateModalSummary() {
    const totalQty = modalRows.reduce((sum, r) => sum + (parseInt(r.quantity, 10) || 0), 0);
    const totalPrice = totalQty * 20;

    if (modalOrderTotalQty) modalOrderTotalQty.textContent = `${totalQty.toLocaleString()} ใบ`;
    if (modalOrderTotalPrice) modalOrderTotalPrice.textContent = totalPrice.toLocaleString();
  }

  function addModalRow(num = '', qty = 1, shouldFocus = true) {
    const newRow = createModalRow(num, qty);
    modalRows.push(newRow);
    renderModalRows();

    if (shouldFocus && modalOrderRows) {
      setTimeout(() => {
        const inp = modalOrderRows.querySelector(`.modal-ticket-num[data-id="${newRow.id}"]`);
        if (inp) {
          inp.focus();
          inp.select();
        }
      }, 50);
    }
  }

  // Open Order Modal Trigger
  document.querySelectorAll('.btn-trigger-order-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // If user holds Ctrl or on desktop middle click, allow opening order.html in new tab
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();

      if (modalRows.length === 0) {
        modalRows = [createModalRow()];
      }
      renderModalRows();

      if (modalOrderTable) {
        modalOrderTable.classList.add('active');
        try { SoundEngine.playClick(); } catch (err) {}
      }
    });
  });

  if (modalOrderClose && modalOrderTable) {
    modalOrderClose.addEventListener('click', () => {
      modalOrderTable.classList.remove('active');
    });

    modalOrderTable.addEventListener('click', (e) => {
      if (e.target === modalOrderTable) {
        modalOrderTable.classList.remove('active');
      }
    });
  }

  if (btnModalAddRow) {
    btnModalAddRow.addEventListener('click', () => {
      addModalRow();
      try { SoundEngine.playClick(); } catch (err) {}
    });
  }

  if (btnModalRandRow) {
    btnModalRandRow.addEventListener('click', () => {
      const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const empty = modalRows.find(r => !r.number || r.number.length < 3);
      if (empty) {
        empty.number = rand;
      } else {
        modalRows.push(createModalRow(rand, 1));
      }
      renderModalRows();
      showToast(`🎲 สุ่มเลขมงคล: ${rand}`);
    });
  }

  if (btnModalPermute) {
    btnModalPermute.addEventListener('click', () => {
      const lastFilled = [...modalRows].reverse().find(r => /^\d{3}$/.test(r.number));
      if (!lastFilled) {
        showToast('⚠️ กรุณากรอกเลข 3 หลักในตารางก่อนกดกระจายโต๊ด');
        return;
      }

      const digits = lastFilled.number.split('');
      const perms = new Set();
      function permute(arr, m = []) {
        if (arr.length === 0) {
          perms.add(m.join(''));
        } else {
          for (let i = 0; i < arr.length; i++) {
            const curr = arr.slice();
            const next = curr.splice(i, 1);
            permute(curr.slice(), m.concat(next));
          }
        }
      }
      permute(digits);

      const uniquePerms = Array.from(perms);
      const existingNums = new Set(modalRows.map(r => r.number));
      const toAdd = uniquePerms.filter(num => !existingNums.has(num));

      if (toAdd.length === 0) {
        showToast(`ชุดโต๊ด ${lastFilled.number} (${uniquePerms.length} ประตู) มีอยู่ในตารางครบแล้ว`);
        return;
      }

      toAdd.forEach(num => {
        modalRows.push(createModalRow(num, lastFilled.quantity));
      });

      renderModalRows();
      showToast(`🔄 เพิ่มชุดโต๊ด ${toAdd.length} เลขเรียบร้อยแล้ว`);
    });
  }

  if (modalOrderRows) {
    modalOrderRows.addEventListener('input', (e) => {
      const target = e.target;
      const rowId = parseInt(target.dataset.id, 10);
      const row = modalRows.find(r => r.id === rowId);
      if (!row) return;

      if (target.classList.contains('modal-ticket-num')) {
        let clean = toArabicDigits(target.value).replace(/\D/g, '').slice(0, 3);
        target.value = clean;
        row.number = clean;

        if (/^\d{3}$/.test(clean)) {
          target.style.borderColor = 'var(--color-emerald)';
        } else {
          target.style.borderColor = 'rgba(255,255,255,0.15)';
        }
        updateModalSummary();
      }

      if (target.classList.contains('modal-qty-input')) {
        let raw = toArabicDigits(target.value).replace(/\D/g, '');
        let val = parseInt(raw, 10);
        if (!isNaN(val)) {
          if (val > 100) val = 100;
          row.quantity = val;
        } else {
          row.quantity = 1;
        }
        
        // Update row subtotal and button states in place without DOM re-render
        const tr = target.closest('tr');
        if (tr) {
          const subtotalElem = tr.querySelector('.modal-row-subtotal');
          if (subtotalElem) {
            subtotalElem.textContent = `${row.quantity * 20} ฿`;
          }
          const btnMinus = tr.querySelector('.btn-modal-minus');
          const btnPlus = tr.querySelector('.btn-modal-plus');
          if (btnMinus) btnMinus.disabled = (row.quantity <= 1);
          if (btnPlus) btnPlus.disabled = (row.quantity >= 100);
        }
        updateModalSummary();
      }
    });

    modalOrderRows.addEventListener('blur', (e) => {
      const target = e.target;
      if (target.classList.contains('modal-qty-input')) {
        let val = parseInt(toArabicDigits(target.value), 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 100) val = 100;
        target.value = val;
        const rowId = parseInt(target.dataset.id, 10);
        const row = modalRows.find(r => r.id === rowId);
        if (row) row.quantity = val;
        updateModalSummary();
      }
    }, true);

    modalOrderRows.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const target = e.target;
        if (target.classList.contains('modal-ticket-num')) {
          e.preventDefault();
          const rowId = parseInt(target.dataset.id, 10);
          const currentIndex = modalRows.findIndex(r => r.id === rowId);
          if (currentIndex !== -1) {
            if (currentIndex < modalRows.length - 1) {
              const nextInput = modalOrderRows.querySelector(`.modal-ticket-num[data-id="${modalRows[currentIndex + 1].id}"]`);
              if (nextInput) {
                nextInput.focus();
                nextInput.select();
              }
            } else {
              addModalRow('', 1, true);
            }
          }
        }
      }
    });

    modalOrderRows.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const rowId = parseInt(btn.dataset.id, 10);
      const row = modalRows.find(r => r.id === rowId);
      if (!row) return;

      if (btn.classList.contains('btn-modal-minus')) {
        if (row.quantity > 1) {
          row.quantity -= 1;
          renderModalRows();
        }
      }

      if (btn.classList.contains('btn-modal-plus')) {
        if (row.quantity < 100) {
          row.quantity += 1;
          renderModalRows();
        }
      }

      if (btn.classList.contains('btn-modal-del')) {
        if (modalRows.length > 1) {
          modalRows = modalRows.filter(r => r.id !== rowId);
          renderModalRows();
        } else {
          row.number = '';
          row.quantity = 1;
          renderModalRows();
        }
      }
    });
  }

  if (btnModalSubmitOrder) {
    btnModalSubmitOrder.addEventListener('click', () => {
      let hasError = false;
      let firstInvalid = null;

      modalRows.forEach(r => {
        const inp = modalOrderRows.querySelector(`.modal-ticket-num[data-id="${r.id}"]`);
        if (!/^\d{3}$/.test(r.number)) {
          hasError = true;
          if (inp) {
            inp.style.borderColor = 'var(--color-rose)';
            if (!firstInvalid) firstInvalid = inp;
          }
        }
      });

      if (hasError) {
        showToast('❌ กรุณากรอกเลข 3 หลักให้ครบทุกแถว');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const map = new Map();
      modalRows.forEach(r => {
        map.set(r.number, (map.get(r.number) || 0) + r.quantity);
      });

      const items = Array.from(map.entries()).map(([num, qty]) => `${num} ${qty} ใบ`);
      const cmd = `สั่งซื้อ ${items.join(', ')}`;

      copyToClipboard(cmd);
      showToast(`📋 ส่งคำสั่งซื้อ "${cmd}" เข้าสู่ LINE...`);

      const agentLineModal = (window.AgentSystem && typeof window.AgentSystem.getAgentInfo === 'function')
        ? window.AgentSystem.getAgentInfo().line
        : (typeof AgentSystem !== 'undefined' && AgentSystem.getAgentInfo ? AgentSystem.getAgentInfo().line : '@586xxhlx');
      const rawModalLine = agentLineModal || '@586xxhlx';
      const formattedModalLine = rawModalLine.startsWith('@') ? rawModalLine : '@' + rawModalLine;
      const encodedId = encodeURIComponent(formattedModalLine);
      const lineUrl = `https://line.me/R/oaMessage/${encodedId}/?${encodeURIComponent(cmd)}`;
      if (modalOrderTable) modalOrderTable.classList.remove('active');

      try {
        window.location.href = lineUrl;
      } catch (err) {
        window.open(lineUrl, '_blank');
      }
    });
  }

  // -------------------------------------------------------------------------
  // 12. Official GLO Calculator & Agent Commission Estimator Handler
  // -------------------------------------------------------------------------
  const calcSalesInput = document.getElementById('calc-sales');
  if (calcSalesInput) {
    function updateCalculator() {
      const sales = parseFloat(calcSalesInput.value) || 1000000;
      const res = N3Calculator.calculatePrizePool(sales);

      const elTickets = document.getElementById('calc-tickets');
      const elPrizeTotal = document.getElementById('calc-prize-total');
      const elGovRevenue = document.getElementById('calc-gov-revenue');
      const elN3Direct = document.getElementById('calc-n3-direct');
      const elN3Tod = document.getElementById('calc-n3-tod');
      const elN2Direct = document.getElementById('calc-n2-direct');
      const elSpecial = document.getElementById('calc-special');

      if (elTickets) elTickets.innerText = `${res.ticketCount.toLocaleString()} ใบ`;
      if (elPrizeTotal) elPrizeTotal.innerText = N3Calculator.formatBaht(res.prizePoolTotal);
      if (elGovRevenue) elGovRevenue.innerText = N3Calculator.formatBaht(res.governmentRevenue);
      if (elN3Direct) elN3Direct.innerText = N3Calculator.formatBaht(res.n3DirectPool);
      if (elN3Tod) elN3Tod.innerText = N3Calculator.formatBaht(res.n3TodPool);
      if (elN2Direct) elN2Direct.innerText = N3Calculator.formatBaht(res.n2DirectPool);
      if (elSpecial) elSpecial.innerText = N3Calculator.formatBaht(res.specialJackpotPool);
    }

    calcSalesInput.addEventListener('input', updateCalculator);
    updateCalculator();
  }
});
