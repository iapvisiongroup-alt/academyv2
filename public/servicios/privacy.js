(() => {
  const STORAGE_KEY = 'kreateia_cookie_consent_v2';
  const GOOGLE_TAG_ID = 'AW-18195089658';
  let preferences = readPreferences();
  let banner = null;
  let modal = null;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });

  if (preferences?.optional === true) {
    enableOptionalCookies();
  }

  document.addEventListener('DOMContentLoaded', () => {
    createCookieInterface();
    document.querySelectorAll('[data-cookie-settings]').forEach(button => {
      button.addEventListener('click', openSettings);
    });
    if (!preferences) showBanner();
  });

  function createCookieInterface() {
    banner = document.createElement('section');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Preferencias de cookies');
    banner.innerHTML = `
      <div class="cookie-banner-copy">
        <strong>Tu privacidad, sin letra pequeña</strong>
        <p>
          Usamos almacenamiento necesario para que la web funcione. Google Ads y la medición
          solo se activan si los aceptas.
          <a href="/cookies/">Política de cookies</a>
        </p>
      </div>
      <div class="cookie-banner-actions">
        <button type="button" class="cookie-button primary reject" data-cookie-reject>Rechazar opcionales</button>
        <button type="button" class="cookie-button secondary" data-cookie-configure>Configurar</button>
        <button type="button" class="cookie-button primary" data-cookie-accept>Aceptar todas</button>
      </div>
    `;
    document.body.appendChild(banner);

    modal = document.createElement('div');
    modal.className = 'cookie-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <section class="cookie-modal-card" role="dialog" aria-modal="true" aria-labelledby="cookie-modal-title">
        <header>
          <div>
            <span>Centro de privacidad</span>
            <h2 id="cookie-modal-title">Configurar cookies</h2>
          </div>
          <button type="button" class="cookie-modal-close" data-cookie-close aria-label="Cerrar">×</button>
        </header>
        <div class="cookie-modal-body">
          <div class="cookie-choice">
            <div>
              <strong>Necesarias</strong>
              <p>Guardan tu elección de privacidad y permiten las funciones básicas. Siempre activas.</p>
            </div>
            <span class="cookie-required">Siempre activas</span>
          </div>
          <label class="cookie-choice">
            <div>
              <strong>Medición y publicidad</strong>
              <p>Permiten medir campañas de Google Ads y saber qué acciones generan contactos.</p>
            </div>
            <input type="checkbox" data-cookie-optional />
          </label>
          <p class="cookie-detail">
            Puedes retirar el consentimiento en cualquier momento desde “Configurar cookies”
            en el pie de página. Consulta la <a href="/privacidad/">política de privacidad</a>.
          </p>
        </div>
        <footer>
          <button type="button" class="cookie-button primary reject" data-cookie-modal-reject>Rechazar opcionales</button>
          <button type="button" class="cookie-button primary" data-cookie-save>Guardar selección</button>
        </footer>
      </section>
    `;
    document.body.appendChild(modal);

    banner.querySelector('[data-cookie-reject]').addEventListener('click', () => savePreferences(false));
    banner.querySelector('[data-cookie-configure]').addEventListener('click', openSettings);
    banner.querySelector('[data-cookie-accept]').addEventListener('click', () => savePreferences(true));
    modal.querySelector('[data-cookie-close]').addEventListener('click', closeSettings);
    modal.querySelector('[data-cookie-modal-reject]').addEventListener('click', () => savePreferences(false));
    modal.querySelector('[data-cookie-save]').addEventListener('click', () => {
      savePreferences(Boolean(modal.querySelector('[data-cookie-optional]').checked));
    });
    modal.addEventListener('click', event => {
      if (event.target === modal) closeSettings();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeSettings();
    });
  }

  function showBanner() {
    banner?.classList.add('open');
  }

  function openSettings() {
    if (!modal) return;
    modal.querySelector('[data-cookie-optional]').checked = preferences?.optional === true;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cookie-modal-open');
    setTimeout(() => modal.querySelector('[data-cookie-optional]').focus(), 30);
  }

  function closeSettings() {
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cookie-modal-open');
  }

  function savePreferences(optional) {
    preferences = {
      necessary: true,
      optional: Boolean(optional),
      version: 2,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    banner?.classList.remove('open');
    closeSettings();

    window.gtag('consent', 'update', {
      ad_storage: optional ? 'granted' : 'denied',
      analytics_storage: optional ? 'granted' : 'denied',
      ad_user_data: optional ? 'granted' : 'denied',
      ad_personalization: optional ? 'granted' : 'denied',
    });

    if (optional) enableOptionalCookies();
  }

  function enableOptionalCookies() {
    if (document.querySelector(`script[data-google-tag="${GOOGLE_TAG_ID}"]`)) {
      window.gtag('consent', 'update', {
        ad_storage: 'granted',
        analytics_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
      });
      return;
    }

    window.gtag('consent', 'update', {
      ad_storage: 'granted',
      analytics_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    });
    window.gtag('js', new Date());
    window.gtag('config', GOOGLE_TAG_ID);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_TAG_ID)}`;
    script.dataset.googleTag = GOOGLE_TAG_ID;
    document.head.appendChild(script);
  }

  function readPreferences() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return value?.version === 2 ? value : null;
    } catch {
      return null;
    }
  }
})();
