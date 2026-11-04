/* ══════════════════════════════════════════════════════
   BREWS.CO — THEME ENGINE
   Lets the shop pick one accent color; every warm brown/caramel
   variable in css/styles.css gets hue-rotated to match while
   keeping each variable's original saturation & lightness, so
   contrast/readability stays exactly as designed.
   Also supports swapping the page background photo.
   Loaded on every page, right after css/styles.css, so the
   saved theme applies before first paint (no flash).
══════════════════════════════════════════════════════ */
(function () {
  const ACCENT_KEY = "brewsThemeAccent"; // hex string
  const BG_KEY     = "brewsThemeBg";     // data URL string

  // Must mirror the :root values in css/styles.css
  const BASE = {
    espresso:   "#1C0A00",
    roast:      "#3D1F0A",
    mahogany:   "#6B3D1E",
    caramel:    "#C4813A",
    honey:      "#D4A55A",
    pearl:      "#FFFCF5",
    cream:      "#FDF5E8",
    parchment:  "#F5E4C8",
    latte:      "#E2C9A8",
    mochaccino: "#C4A07A",
    bark:       "#9A7050",
    dust:       "#B89870",
    dusk:       "#EED9BE",
  };
  // The body::before wash overlay reuses these three hues at fixed alphas —
  // rotating them keeps the background wash matching the accent instead of
  // staying a fixed hardcoded brown underneath everything else.
  const TINT_SOURCE = { tint1: ["cream", 0.78], tint2: ["parchment", 0.72], tint3: ["dusk", 0.76] };
  // Extra literal hexes baked into gradients (not standalone --vars)
  const GRAD_HEX = {
    ctaDark: "#8B4A1A",   // 3rd stop of --grad-cta
    darkA:   "#2D1106",   // --grad-dark stop 1
    darkB:   "#4A1E08",   // --grad-dark stop 2
    darkC:   "#3D1A07",   // --grad-dark stop 3
  };

  function hexToHsl(hex) {
    const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;
    if (max === min) { h = s = 0; }
    else {
      const d = max-min;
      s = l > 0.5 ? d/(2-max-min) : d/(max+min);
      switch (max) {
        case r: h = (g-b)/d + (g<b?6:0); break;
        case g: h = (b-r)/d + 2; break;
        default: h = (r-g)/d + 4;
      }
      h /= 6;
    }
    return { h: h*360, s: s*100, l: l*100 };
  }

  function hslToHex(h, s, l) {
    h = ((h%360)+360)%360; s/=100; l/=100;
    const c = (1-Math.abs(2*l-1))*s, x = c*(1-Math.abs((h/60)%2-1)), m = l-c/2;
    let r,g,b;
    if      (h<60)  { r=c; g=x; b=0; }
    else if (h<120) { r=x; g=c; b=0; }
    else if (h<180) { r=0; g=c; b=x; }
    else if (h<240) { r=0; g=x; b=c; }
    else if (h<300) { r=x; g=0; b=c; }
    else            { r=c; g=0; b=x; }
    const toHex = v => Math.round((v+m)*255).toString(16).padStart(2,"0");
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }

  const REF_HUE = hexToHsl(BASE.caramel).h;

  function rotateHex(hex, deltaHue) {
    const { h, s, l } = hexToHsl(hex);
    if (s < 2) return hex; // near-grayscale — a hue shift wouldn't do anything visible
    return hslToHex(h + deltaHue, s, l);
  }

  function hexToRgb(hex) {
    return { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) };
  }

  function applyAccent(accentHex) {
    const deltaHue = hexToHsl(accentHex).h - REF_HUE;
    const root = document.documentElement.style;
    const rotated = {};
    Object.entries(BASE).forEach(([k,v]) => {
      rotated[k] = rotateHex(v, deltaHue);
      root.setProperty("--" + k, rotated[k]);
    });
    const rg = {};
    Object.entries(GRAD_HEX).forEach(([k,v]) => { rg[k] = rotateHex(v, deltaHue); });
    root.setProperty("--grad-cta",  `linear-gradient(135deg, ${rotated.honey} 0%, ${rotated.caramel} 40%, ${rg.ctaDark} 100%)`);
    root.setProperty("--grad-dark", `linear-gradient(160deg, ${rg.darkA} 0%, ${rg.darkB} 50%, ${rg.darkC} 100%)`);
    root.setProperty("--grad-card", `linear-gradient(145deg, ${rotated.pearl} 0%, ${rotated.cream} 100%)`);
    Object.entries(TINT_SOURCE).forEach(([varName, [baseKey, alpha]]) => {
      const { r, g, b } = hexToRgb(rotated[baseKey]);
      root.setProperty("--" + varName.replace("tint","tint-"), `rgba(${r},${g},${b},${alpha})`);
    });
  }

  function resetAccent() {
    const root = document.documentElement.style;
    Object.keys(BASE).forEach(k => root.removeProperty("--" + k));
    ["--grad-cta","--grad-dark","--grad-card","--tint-1","--tint-2","--tint-3"].forEach(k => root.removeProperty(k));
  }

  // Background photo is applied via an injected <style> tag (works even
  // before <body> exists, so there's no flash of the default photo).
  function bgStyleTag() {
    let tag = document.getElementById("brews-bg-override");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "brews-bg-override";
      document.head.appendChild(tag);
    }
    return tag;
  }
  const NOISE_URL = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E\")";

  function applyBackground(dataUrl) {
    const tag = bgStyleTag();
    if (!dataUrl) { tag.textContent = ""; return; }
    tag.textContent = `body {
      background-image: ${NOISE_URL}, url("${dataUrl}") !important;
      background-size: 200px 200px, cover !important;
      background-attachment: local, fixed !important;
      background-position: 0 0, center center !important;
    }`;
  }

  // Apply whatever was saved, immediately.
  const savedAccent = localStorage.getItem(ACCENT_KEY);
  const savedBg     = localStorage.getItem(BG_KEY);
  if (savedAccent) applyAccent(savedAccent);
  if (savedBg)     applyBackground(savedBg);

  // Public API used by the Theme settings UI (pos.html)
  window.BrewsTheme = {
    BASE, REF_HUE,
    getAccent: () => localStorage.getItem(ACCENT_KEY) || BASE.caramel,
    getBackground: () => localStorage.getItem(BG_KEY) || "",
    setAccent(hex) { localStorage.setItem(ACCENT_KEY, hex); applyAccent(hex); },
    resetAccent() { localStorage.removeItem(ACCENT_KEY); resetAccent(); },
    setBackground(dataUrl) { localStorage.setItem(BG_KEY, dataUrl); applyBackground(dataUrl); },
    clearBackground() { localStorage.removeItem(BG_KEY); applyBackground(""); },
  };
})();
