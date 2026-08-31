/* ==========================================================================
   GLO N3 - Dynamic White-label Agent & Affiliate System
   URL Query Parameter Parser, Agent Branding Injector, & Share Link Generator
   ========================================================================== */

const AgentSystem = (function () {
  const STORAGE_KEY = 'glo_n3_agent_config';

  const defaultAgent = {
    name: 'GLO N3 Official Partner',
    line: '@glon3',
    tel: '02-528-9999',
    shopUrl: 'https://line.me',
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
    const updated = {
      ...defaultAgent,
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
   * Generate an affiliate link with query params
   */
  function generateAffiliateUrl(shopName, line, tel) {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();

    if (shopName && shopName !== defaultAgent.name) params.set('shop', shopName.trim());
    if (line && line !== defaultAgent.line) params.set('line', line.trim());
    if (tel && tel !== defaultAgent.tel) params.set('tel', tel.trim());

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
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
    generateAffiliateUrl,
    applyAgentBranding,
    defaultAgent
  };
})();
