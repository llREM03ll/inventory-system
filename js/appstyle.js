/**
 * appstyle.js
 * Per-device font and text size. Loaded in <head> on every page so the
 * saved choice applies before first paint.
 */
(function () {
  const KEY = "brewsAppStyle";
  const FONTS = {
    default: { label: "Default",  css: "" },
    system:  { label: "System",   css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
    rounded: { label: "Rounded",  css: "ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif" },
    elegant: { label: "Elegant",  css: "'Cormorant Garamond', Georgia, serif" },
    serif:   { label: "Serif",    css: "Georgia, 'Times New Roman', serif" },
    mono:    { label: "Mono",     css: "ui-monospace, Menlo, Consolas, monospace" },
  };
  const SIZES = { 88: "Small", 100: "Normal", 112: "Large", 125: "XL" };

  function get() {
    try { return Object.assign({ font: "default", size: 100 }, JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch { return { font: "default", size: 100 }; }
  }

  function apply(st) {
    let tag = document.getElementById("brews-style-override");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "brews-style-override";
      document.head.appendChild(tag);
    }
    const f = (FONTS[st.font] || FONTS.default).css;
    tag.textContent =
      `html { font-size: ${st.size}%; }` +
      (f ? `html body, html body *:not(.brand):not(.brand-sub) { font-family: ${f} !important; }` : "");
  }

  apply(get());

  window.BrewsStyle = {
    FONTS, SIZES, get,
    set(patch) {
      const st = Object.assign(get(), patch);
      localStorage.setItem(KEY, JSON.stringify(st));
      apply(st);
    },
    reset() { localStorage.removeItem(KEY); apply(get()); },
  };
})();
