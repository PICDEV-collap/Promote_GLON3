/* ==========================================================================
   GLO N3 - Dynamic White-label Agent & Affiliate System
   URL Query Parameter Parser, Agent Branding, QR Management, & Quick-Reply Engine
   ========================================================================== */

const AgentSystem = (function () {
  const STORAGE_KEY = 'glo_n3_agent_config';
  const STORAGE_QR_KEY = 'glo_n3_agent_qr';

  const defaultAgent = {
    name: 'GLO N3 Official Partner',
    line: '@glon3',
    tel: '02-528-9999',
    shopUrl: 'https://line.me',
    officialPortalUrl: 'https://n3.glolotteryshop.com',
    isCustomAgent: false
  };

  /**
   * Parse query parameters from URL
   */
  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const shopName = params.get('shop') || params.get('shop_name') || params.get('name');
    const line = params.get('line');
    const tel = params.get('tel') || params.get('phone');
    const shopUrl = params.get('url') || params.get('shop_url');
    const agentId = params.get('agent') || params.get('ref');

    if (shopName || line || tel || shopUrl || agentId) {
      // Build dynamic shop URL if line is specified
      let finalShopUrl = shopUrl;
      if (!finalShopUrl && line) {
        finalShopUrl = line.startsWith('http') ? line : `https://line.me/R/ti/p/${line.startsWith('@') ? line : '@' + line}`;
      }

      return {
        name: shopName || defaultAgent.name,
        line: line || defaultAgent.line,
        tel: tel || defaultAgent.tel,
        shopUrl: finalShopUrl || defaultAgent.shopUrl,
        officialPortalUrl: defaultAgent.officialPortalUrl,
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
        return JSON.parse(saved);
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
    } catch (e) {}
    applyAgentBranding(updated);
    return updated;
  }

  /**
   * QR Code Image Management (Base64)
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
      if (dataUrl) {
        localStorage.setItem(STORAGE_QR_KEY, dataUrl);
      } else {
        localStorage.removeItem(STORAGE_QR_KEY);
      }
      return true;
    } catch (e) {
      console.error('Failed to save QR Code in localStorage:', e);
      return false;
    }
  }

  function clearAgentQR() {
    try {
      localStorage.removeItem(STORAGE_QR_KEY);
    } catch (e) {}
  }

  /**
   * Generate an affiliate link with query params
   */
  function generateAffiliateUrl(shopName, line, tel, shopUrl) {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();

    if (shopName && shopName !== defaultAgent.name) params.set('shop', shopName.trim());
    if (line && line !== defaultAgent.line) params.set('line', line.trim());
    if (tel && tel !== defaultAgent.tel) params.set('tel', tel.trim());
    if (shopUrl && shopUrl !== defaultAgent.shopUrl) params.set('url', shopUrl.trim());

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  /**
   * Quick-Reply Templates Generator for Social & LINE OA
   */
  function getQuickReplyTemplates(featuredNumber = '789') {
    const info = getAgentInfo();
    const shopName = info.name || defaultAgent.name;
    const lineContact = info.line || defaultAgent.line;
    const webUrl = generateAffiliateUrl(info.name, info.line, info.tel, info.shopUrl);

    return [
      {
        id: 'hook-dream',
        title: '🔮 แจกชุดเลขเด็ด N3 & นิมิตฝัน',
        desc: 'เหมาะสำหรับโพสต์กลุ่ม LINE / Facebook เพื่อดึงคนเข้าเว็บและสั่งซื้อ',
        content: `✨ เลขเด็ดสลาก N3 ประจำงวดนี้จาก AI ทำนายฝัน ✨\nชุดเลขมงคลเด่น: [ ${featuredNumber} ] (3 ตรง / 3 โต๊ด / 2 ตัวท้าย)\n\n🛒 สั่งซื้อสลาก N3 ใบละ 20 บาท ถูกต้องตามกฎหมายกับ ${shopName}\n👉 ตรวจดวงและขอรับ QR สแกนซื้อได้ที่: ${webUrl}\n📲 LINE: ${lineContact}`
      },
      {
        id: 'guide-buyer',
        title: '📲 คู่มือวิธีซื้อผ่านเป๋าตัง (ลูกค้าใหม่)',
        desc: 'ส่งให้ลูกค้าที่ยังไม่เคยซื้อสลาก N3 ในแอปเป๋าตัง',
        content: `📌 4 ขั้นตอนง่ายๆ ในการซื้อสลาก N3 (ใบละ 20 บาท) ผ่านแอปเป๋าตัง:\n1. แจ้งเลขที่ต้องการซื้อกับทางร้าน ${shopName} เพื่อรับ QR Code ชำระเงิน\n2. เปิดแอป "เป๋าตัง" เข้าเมนู "สลากกินแบ่งรัฐบาล" -> เลือก "สลากตัวเลขสามหลัก (N3)"\n3. กดปุ่ม "สแกนซื้อสลาก" แล้วสแกนรูป QR Code ที่ทางร้านส่งให้\n4. ตรวจสอบรายการและกดยืนยันชำระเงินผ่าน G-Wallet (20 บ./ใบ)\n\n🎉 สลากจะถูกเก็บในเมนู "สลากของฉัน" ทันที ลุ้นได้ถึง 4 รางวัลใหญ่!`
      },
      {
        id: 'result-alert',
        title: '🏆 แจ้งเตือนตรวจผลรางวัล N3',
        desc: 'ส่งในวันหวยออก (วันที่ 1 และ 16) เพื่อให้ลูกค้ากลับมาตรวจผล',
        content: `🎉 ประกาศผลสลากกินแบ่งรัฐบาล N3 งวดประจำวันนี้!\nใครถูกรางวัล 3 ตรง, 3 โต๊ด, 2 ตัวตรง หรือ รางวัลพิเศษ สามารถตรวจผลและขึ้นเงินรางวัลผ่านแอปเป๋าตังได้เลยครับ 💰\n\n🔮 ตรวจผลย้อนหลังและคำนวณเงินรางวัลได้ที่: ${webUrl}\nขอบคุณที่อุดหนุน ${shopName} ครับ 🙏`
      }
    ];
  }

  /**
   * Inject agent info into UI elements across the page
   */
  function applyAgentBranding(agent = null) {
    const current = agent || getAgentInfo();

    // 1. Update Agent Banner
    const banner = document.getElementById('agent-banner');
    const bannerShopName = document.getElementById('agent-banner-shop-name');
    const bannerLine = document.getElementById('agent-banner-line');
    const bannerTel = document.getElementById('agent-banner-tel');

    if (banner) {
      if (current.isCustomAgent) {
        banner.style.display = 'block';
        if (bannerShopName) bannerShopName.innerText = current.name;
        if (bannerLine) bannerLine.innerText = `LINE: ${current.line}`;
        if (bannerTel) {
          bannerTel.innerText = current.tel ? `โทร: ${current.tel}` : '';
          bannerTel.style.display = current.tel ? 'inline-block' : 'none';
        }
      } else {
        banner.style.display = 'none';
      }
    }

    // 2. Update Shop Buttons Text & Links
    const shopButtons = document.querySelectorAll('.btn-our-shop');
    shopButtons.forEach(btn => {
      if (current.isCustomAgent && current.name) {
        btn.setAttribute('title', `สั่งซื้อกับ ${current.name}`);
      }
    });

    // 3. Update Modals & Inputs
    const shopNameInput = document.getElementById('agent-input-name');
    const shopLineInput = document.getElementById('agent-input-line');
    const shopTelInput = document.getElementById('agent-input-tel');
    const shopUrlInput = document.getElementById('shop-url-input');

    if (shopNameInput && !shopNameInput.value) shopNameInput.value = current.isCustomAgent ? current.name : '';
    if (shopLineInput && !shopLineInput.value) shopLineInput.value = current.isCustomAgent ? current.line : '';
    if (shopTelInput && !shopTelInput.value) shopTelInput.value = current.isCustomAgent ? current.tel : '';
    if (shopUrlInput) shopUrlInput.value = current.shopUrl || defaultAgent.shopUrl;
  }

  return {
    getAgentInfo,
    saveAgentInfo,
    getAgentQR,
    saveAgentQR,
    clearAgentQR,
    generateAffiliateUrl,
    getQuickReplyTemplates,
    applyAgentBranding,
    defaultAgent
  };
})();
