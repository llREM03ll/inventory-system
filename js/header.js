/**
 * header.js
 * Shared top-of-page header: back link + centered brand + optional right-side
 * action slot + a Settings entry point. Previously each page hand-built this
 * (calculate.html didn't even have a back link), which is part of why moving
 * around the app felt inconsistent.
 *
 * Settings itself is NOT duplicated here — it's a large, tightly-integrated
 * system on index.html (prices, flavors, theme, sync, role). Rather than
 * risk that logic by copying it, every other page's Settings icon deep-links
 * to index.html, which auto-opens the same modal on load.
 */
(function () {
  window.renderPageHeader = function (opts) {
    opts = opts || {};
    const backHTML = opts.showBack === false
      ? "<span></span>"
      : `<a href="index.html" class="back-btn">← Back</a>`;
    const extra = opts.extraButtonsHTML || "";
    const settingsHTML = opts.hideSettings
      ? ""
      : `<button class="header-settings-btn" onclick="goToSettings()" title="Settings" aria-label="Settings">⚙️</button>`;

    return `<div class="top-bar">
    ${backHTML}
    <div style="display:flex;gap:8px;align-items:center;">
      ${extra}${settingsHTML}
    </div>
  </div>
  <a href="index.html" style="text-decoration:none;display:block;text-align:center;">
    <div class="brand">BREWS.CO</div>
    <div class="brand-sub">${opts.subtitle || ""}</div>
  </a>`;
  };

  // On index.html this opens the modal in place (no navigation needed).
  // Everywhere else it deep-links home with ?settings=1, which index.html
  // reads on load to auto-open the same modal.
  window.goToSettings = function () {
    const onHome = /(^|\/)index\.html$/.test(location.pathname) || /\/$/.test(location.pathname);
    if (onHome && typeof openSettings === "function") {
      openSettings();
    } else {
      location.href = "index.html?settings=1";
    }
  };
})();
