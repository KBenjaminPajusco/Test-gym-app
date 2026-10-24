"use strict";
// Pont Android : abonnement Premium (Google Play Billing), publicités (AdMob), impression, partage, bouton retour.
// Hors de l'appli Android (navigateur), tout est débloqué et sans publicité.
const Native = (() => {
  const cap = window.Capacitor, cfg = window.APP_CONFIG || {};
  const isNative = !!cap?.isNativePlatform?.();
  const K = "palier-premium-v1";
  const listeners = new Set();
  let premium = !isNative, offers = [], storeState = isNative ? "loading" : "off", lastError = "";
  if (isNative) { try { premium = JSON.parse(localStorage.getItem(K))?.on === true; } catch { /* premier lancement */ } }

  const emit = () => listeners.forEach((f) => { try { f(); } catch { /* écouteur en erreur */ } });
  function setPremium(on) {
    if (on === premium) return;
    premium = on;
    try { localStorage.setItem(K, JSON.stringify({ on, t: Date.now() })); } catch { /* stockage indisponible */ }
    applyAds(); emit();
  }
  // sans bundler, le pont natif expose les plugins dans Capacitor.Plugins (registerPlugin n'existe pas toujours)
  const plugin = (n) => cap.Plugins?.[n] || cap.registerPlugin?.(n);

  // ---------- abonnement ----------
  const periodLabel = (p) => ({ P1W: "semaine", P1M: "mois", P3M: "trimestre", P6M: "semestre", P1Y: "an" }[p] || "");
  function readOffers(product) {
    offers = (product?.offers || []).map((o) => {
      const phases = o.pricingPhases || [], rec = phases[phases.length - 1] || {};
      const trial = phases.length > 1 && phases[0].recurrenceMode === "FINITE_RECURRING" && !phases[0].priceMicros ? phases[0] : null;
      return { offer: o, price: rec.price || "", period: periodLabel(rec.billingPeriod), trial: trial ? trial.billingPeriod : "" };
    }).filter((o) => o.price);
  }
  async function initStore() {
    const CdvPurchase = window.CdvPurchase;
    if (!CdvPurchase) { storeState = "error"; lastError = "Module d'achat indisponible"; emit(); return; }
    const { store, ProductType, Platform } = CdvPurchase;
    const id = cfg.subscriptionId;
    store.register([{ id, type: ProductType.PAID_SUBSCRIPTION, platform: Platform.GOOGLE_PLAY }]);
    const refresh = () => {
      const p = store.get(id, Platform.GOOGLE_PLAY);
      if (p) { readOffers(p); }
      if (storeState === "ready" || storeState === "loading") setPremium(!!store.owned(id));
      emit();
    };
    // Sans serveur de validation, on acquitte l'achat nous-mêmes (obligatoire sous 3 jours côté Google).
    store.when().productUpdated(refresh).approved((t) => t.finish()).finished(refresh);
    store.error((e) => { lastError = e?.message || String(e); emit(); });
    try {
      await store.initialize([Platform.GOOGLE_PLAY]);
      storeState = "ready"; refresh();
    } catch (e) { storeState = "error"; lastError = e?.message || String(e); emit(); }
  }
  async function buy(offer) {
    const err = await offer.order();
    if (err) { lastError = err.message || "Achat annulé"; return false; }
    return true;
  }
  async function restore() {
    try { await window.CdvPurchase.store.restorePurchases(); } catch (e) { lastError = e?.message || String(e); }
    const { store } = window.CdvPurchase;
    setPremium(!!store.owned(cfg.subscriptionId)); emit();
  }

  // ---------- publicités ----------
  let adsReady = false, adsOn = false;
  const TEST_AD = /^ca-app-pub-3940256099942544\//.test(cfg.adBannerId || "");
  function adPad(h) { document.documentElement.style.setProperty("--ad-h", (h || 0) + "px"); document.body.classList.toggle("has-ad", h > 0); }
  async function initAds() {
    try {
      const AdMob = plugin("AdMob");
      AdMob.addListener("bannerAdSizeChanged", (s) => adPad(s.height));
      AdMob.addListener("bannerAdFailedToLoad", () => adPad(0));
      // consentement (RGPD / EEE) avant toute publicité
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === "REQUIRED") await AdMob.showConsentForm();
      await AdMob.initialize();
      adsReady = true; applyAds();
    } catch { /* pas de pub : l'appli reste utilisable */ }
  }
  async function applyAds() {
    if (!isNative || !adsReady) return;
    const AdMob = plugin("AdMob");
    try {
      if (premium && adsOn) { adsOn = false; await AdMob.removeBanner(); adPad(0); }
      else if (!premium && !adsOn) {
        adsOn = true;
        await AdMob.showBanner({ adId: cfg.adBannerId, adSize: "ADAPTIVE_BANNER", position: "BOTTOM_CENTER", margin: 0, isTesting: TEST_AD });
      }
    } catch { adsOn = false; }
  }

  // ---------- impression / partage / retour ----------
  async function print(name) {
    if (!isNative) { window.print(); return; }
    await plugin("Print").print({ name });
  }
  async function share(opts) { await plugin("Share").share(opts); }
  function onBack(handler) {
    if (!isNative) return;
    try { plugin("App").addListener("backButton", () => handler()); } catch { /* le bouton Retour garde son comportement par défaut */ }
  }
  const exitApp = () => plugin("App").exitApp();

  if (isNative) {
    document.documentElement.classList.add("native");
    // cordova-plugin-purchase (CdvPurchase) n'existe qu'une fois l'événement « deviceready » passé
    let started = false;
    const startStore = () => { if (!started) { started = true; initStore(); } };
    const go = () => {
      initAds();
      if (window.CdvPurchase) startStore();
      else { document.addEventListener("deviceready", startStore, { once: true }); setTimeout(startStore, 8000); }
    };
    if (document.readyState === "complete") go(); else window.addEventListener("load", go);
  }

  return {
    isNative, cfg,
    get premium() { return premium; },
    get offers() { return offers; },
    get storeState() { return storeState; },
    get error() { return lastError; },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    buy, restore, print, share, onBack, exitApp,
  };
})();
