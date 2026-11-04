/**
 * header.js
 * Shared top-of-page header: back link + centered brand + optional right-side
 * action slot + a Settings entry point. Previously each page hand-built this
 * (calculate.html didn't even have a back link), which is part of why moving
 * around the app felt inconsistent.
 *
 * Settings is its own page (settings.html).
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

  window.goToSettings = function () { location.href = "settings.html"; };
})();
