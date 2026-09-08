/* ==========================================================================
   GLO N3 - PWA Installation & Service Worker Registrar
   ========================================================================== */

const PWAInstaller = (function () {
  let deferredPrompt = null;

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('GLO N3 ServiceWorker registered successfully:', reg.scope);
          })
          .catch((err) => {
            console.warn('ServiceWorker registration error:', err);
          });
      });
    }
  }

  function initInstallPrompt(onPromptReadyCallback, onInstalledCallback) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (onPromptReadyCallback) onPromptReadyCallback();
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      if (onInstalledCallback) onInstalledCallback();
      console.log('GLO N3 PWA installed successfully');
    });
  }

  async function promptInstall() {
    if (!deferredPrompt) {
      return false;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  }

  return {
    registerServiceWorker,
    initInstallPrompt,
    promptInstall,
    hasDeferredPrompt: () => !!deferredPrompt
  };
})();
