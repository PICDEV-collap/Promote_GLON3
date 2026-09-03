/* ==========================================================================
   GLO N3 - Dynamic White-label Agent & Affiliate System
   URL Query Parameter Parser, Agent Branding, QR Management, & Admin Auth Guard
   ========================================================================== */

const AgentSystem = (function () {
  const STORAGE_KEY = 'glo_n3_agent_config';
  const STORAGE_QR_KEY = 'glo_n3_agent_qr';
  const STORAGE_PIN_KEY = 'glo_n3_admin_pin';
  const SESSION_AUTH_KEY = 'glo_n3_admin_session_auth';
  const DEFAULT_PIN = '9999';

  const defaultAgent = {
    name: 'ร้านสลาก N3 ธนกิจนำโชค',
    dealerCode: 'ตัวแทนจำหน่ายสลากกินแบ่งรัฐบาล N3',
    line: '@glon3',
    tel: '02-528-9999',
    location: 'จุดจำหน่ายสลากตัวเลขสามหลัก (N3) ออนไลน์',
    shopUrl: 'https://n3.glolotteryshop.com',
    officialPortalUrl: 'https://n3.glolotteryshop.com',
    salesHours: 'ทุกวัน 06:00 - 23:00 น. (วันหวยออก 06:00 - 14:00 น.)',
    isCustomAgent: true
  };

  /**
   * Parse query parameters from URL
   */
  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const shopName = params.get('shop') || params.get('shop_name') || params.get('name');
    const dealerCode = params.get('dealer') || params.get('code');
    const line = params.get('line');
    const tel = params.get('tel') || params.get('phone');
    const location = params.get('loc') || params.get('location');
    const shopUrl = params.get('url') || params.get('shop_url');
    const agentId = params.get('agent') || params.get('ref');

    if (shopName || dealerCode || line || tel || location || shopUrl || agentId) {
      let finalShopUrl = shopUrl;
      if (!finalShopUrl && line) {
        finalShopUrl = line.startsWith('http') ? line : `https://line.me/R/ti/p/${line.startsWith('@') ? line : '@' + line}`;
      }

      return {
        name: shopName || defaultAgent.name,
        dealerCode: dealerCode || defaultAgent.dealerCode,
        line: line || defaultAgent.line,
        tel: tel || defaultAgent.tel,
        location: location || defaultAgent.location,
        shopUrl: finalShopUrl || defaultAgent.shopUrl,
        officialPortalUrl: defaultAgent.officialPortalUrl,
        salesHours: defaultAgent.salesHours,
        agentId: agentId || '',
        isCustomAgent: true
      };
    }
    return null;
  }

  /**
   * Load current agent info (URL params > localStorage > defaults)
   */
  function getAgentInfo() {
    const fromUrl = parseUrlParams();
    if (fromUrl) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl));
      } catch (e) {}
      return fromUrl;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...defaultAgent, ...JSON.parse(saved) };
      }
    } catch (e) {}

    return defaultAgent;
  }

  /**
   * Save custom agent info
   */
  function saveAgentInfo(info) {
    const current = getAgentInfo();
    const updated = {
      ...defaultAgent,
      ...current,
      ...info,
      isCustomAgent: true
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save agent info to localStorage:', e);
    }
    return updated;
  }

  /**
   * QR Code Image Management
   */
  function getAgentQR() {
    try {
      return localStorage.getItem(STORAGE_QR_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function saveAgentQR(dataUrl) {
    try {
      localStorage.setItem(STORAGE_QR_KEY, dataUrl);
      return true;
    } catch (e) {
      console.error('Failed to save QR Code image:', e);
      return false;
    }
  }

  function clearAgentQR() {
    try {
      localStorage.removeItem(STORAGE_QR_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * ADMIN AUTHENTICATION & PIN MANAGEMENT
   */
  function getStoredPin() {
    try {
      return localStorage.getItem(STORAGE_PIN_KEY) || DEFAULT_PIN;
    } catch (e) {
      return DEFAULT_PIN;
    }
  }

  function isAdminAuthenticated() {
    try {
      return sessionStorage.getItem(SESSION_AUTH_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function verifyAdminPin(inputPin) {
    const storedPin = getStoredPin();
    if (inputPin && inputPin.toString().trim() === storedPin.trim()) {
      try {
        sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
      } catch (e) {}
      return true;
    }
    return false;
  }

  function changeAdminPin(oldPin, newPin) {
    if (!verifyAdminPin(oldPin)) {
      return { success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
    }
    if (!newPin || newPin.toString().trim().length < 4) {
      return { success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 หลัก' };
    }

    try {
      localStorage.setItem(STORAGE_PIN_KEY, newPin.toString().trim());
      return { success: true, message: 'เปลี่ยนรหัสผ่านผู้ดูแลเรียบร้อยแล้ว' };
    } catch (e) {
      return { success: false, message: 'ไม่สามารถบันทึกรหัสผ่านได้' };
    }
  }

  function logoutAdmin() {
    try {
      sessionStorage.removeItem(SESSION_AUTH_KEY);
    } catch (e) {}
  }

  /**
   * Generate Affiliate URL
   */
  function generateAffiliateUrl(name, line, tel, shopUrl, dealerCode, location) {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    if (name) params.set('shop', name);
    if (dealerCode) params.set('dealer', dealerCode);
    if (line) params.set('line', line);
    if (tel) params.set('tel', tel);
    if (location) params.set('loc', location);
    if (shopUrl) params.set('url', shopUrl);
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Quick-Reply Templates
   */
  function getQuickReplyTemplates() {
    const agent = getAgentInfo();
    const currentUrl = window.location.href;
    const shopLine = agent.line || '@glon3';
    const shopName = agent.name || defaultAgent.name;

    return [
      {
        id: 'reply-order',
        title: '🛒 สนใจสั่งซื้อสลาก N3',
        text: `สวัสดีครับ สนใจสั่งซื้อสลาก N3 กับร้าน "${shopName}" ใบละ 20 บาท ไม่มีเลขอั้น\n👉 สามารถพิมพ์บอกเลข 3 ตัวและจำนวนใบในแชทนี้ได้เลยครับ เช่น "123 2ใบ" หรือเปิดแอปเป๋าตังเพื่อสแกนซื้อได้ทันทีครับ`
      },
      {
        id: 'reply-dream',
        title: '🔮 ชวนลูกค้าทำนายฝัน',
        text: `ฝันเห็นอะไรเมื่อคืน? ลองมาแปลความฝันเป็นเลขเด็ด 3 ตัวแม่นๆ ฟรี กับ AI ทำนายฝันร้าน "${shopName}" ได้ที่นี่เลยครับ:\n👉 ${currentUrl}`
      },
      {
        id: 'reply-how-to-buy',
        title: '📖 วิธีซื้อและจ่ายเงินผ่านเป๋าตัง',
        text: `วิธีซื้อสลาก N3 ง่ายๆ ใน 3 ขั้นตอน:\n1. บอกเลขที่ต้องการให้ทางร้าน\n2. นำรูป QR Code ชำระเงินไปเปิดสแกนในแอป "เป๋าตัง"\n3. สลากจะเข้ากระเป๋าในแอปเป๋าตังของคุณทันที ปลอดภัย 100% ครับ!`
      }
    ];
  }

  /**
   * Apply branding across DOM
   */
  function applyAgentBranding() {
    const current = getAgentInfo();

    // 1. Update Affiliate Banner
    const banner = document.getElementById('affiliate-banner');
    const bannerShopName = document.getElementById('affiliate-shop-name');
    const bannerLine = document.getElementById('affiliate-line');
    const bannerTel = document.getElementById('affiliate-tel');

    if (banner) {
      banner.style.display = 'block';
      if (bannerShopName) bannerShopName.innerText = current.name;
      if (bannerLine) bannerLine.innerText = `LINE: ${current.line}`;
      if (bannerTel) {
        bannerTel.innerText = current.tel ? `โทร: ${current.tel}` : '';
        bannerTel.style.display = current.tel ? 'inline-block' : 'none';
      }
    }

    // 2. Update Shop Buttons
    const shopButtons = document.querySelectorAll('.btn-our-shop');
    shopButtons.forEach(btn => {
      if (current.name) {
        btn.setAttribute('title', `สั่งซื้อกับ ${current.name}`);
      }
    });

    // 3. Update Inputs
    const shopNameInput = document.getElementById('agent-input-name');
    const dealerCodeInput = document.getElementById('agent-input-dealer-code');
    const shopLineInput = document.getElementById('agent-input-line');
    const shopTelInput = document.getElementById('agent-input-tel');
    const locationInput = document.getElementById('agent-input-location');
    const shopUrlInput = document.getElementById('shop-url-input');

    if (shopNameInput) shopNameInput.value = current.name;
    if (dealerCodeInput) dealerCodeInput.value = current.dealerCode || '';
    if (shopLineInput) shopLineInput.value = current.line;
    if (shopTelInput) shopTelInput.value = current.tel;
    if (locationInput) locationInput.value = current.location || '';
    if (shopUrlInput) shopUrlInput.value = current.shopUrl || defaultAgent.shopUrl;
  }

  return {
    getAgentInfo,
    saveAgentInfo,
    getAgentQR,
    saveAgentQR,
    clearAgentQR,
    isAdminAuthenticated,
    verifyAdminPin,
    changeAdminPin,
    logoutAdmin,
    generateAffiliateUrl,
    getQuickReplyTemplates,
    applyAgentBranding,
    defaultAgent
  };
})();
