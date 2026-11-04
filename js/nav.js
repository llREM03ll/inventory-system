/**
 * nav.js
 * Shared bottom-nav renderer. One nav for everyone:
 * Home / Calculate / Shift / History / Settings.
 */
(function () {
  const NAV_ITEMS = [
    { page: "home",      href: "index.html",     icon: "🏠", label: "Home" },
    { page: "calculate", href: "calculate.html", icon: "🧮", label: "Calculate" },
    { page: "shift",     href: "pos.html",       icon: "🧋", label: "Shift", shift: true },
    { page: "history",   href: "calendar.html",  icon: "📅", label: "History" },
    { page: "settings",  icon: "⚙️", label: "Settings", action: true },
  ];

  /**
   * @param {string} active - "home" | "calculate" | "shift" | "history" | "settings"
   * @param {object} [opts]
   * @param {string}  [opts.navId] - id for the <nav> element
   * @param {boolean} [opts.shiftIsCurrentPage] - true only on pos.html
   */
  window.renderBottomNav = function (active, opts) {
    opts = opts || {};
    const idAttr = opts.navId ? ` id="${opts.navId}"` : "";

    const itemsHTML = NAV_ITEMS.map(item => {
      const activeClass = item.page === active ? " active" : "";

      if (item.shift && opts.shiftIsCurrentPage) {
        return `<span class="bottom-nav-item bottom-nav-shift active">
      <span class="bottom-nav-shift-pill">${item.icon}</span>
      <span class="bottom-nav-label">${item.label}</span>
    </span>`;
      }
      if (item.shift) {
        return `<a href="${item.href}" class="bottom-nav-item bottom-nav-shift${activeClass}" id="shiftNavBtn">
      <span class="bottom-nav-shift-pill">${item.icon}</span>
      <span class="bottom-nav-label" id="shiftNavLabel">${item.label}</span>
    </a>`;
      }
      if (item.action) {
        return `<a href="#" class="bottom-nav-item${activeClass}" onclick="goToSettings(); return false;">
      <span class="bottom-nav-icon">${item.icon}</span>
      <span class="bottom-nav-label">${item.label}</span>
    </a>`;
      }
      return `<a href="${item.href}" class="bottom-nav-item${activeClass}">
      <span class="bottom-nav-icon">${item.icon}</span>
      <span class="bottom-nav-label">${item.label}</span>
    </a>`;
    }).join("\n    ");

    return `<nav class="bottom-nav"${idAttr}>\n    ${itemsHTML}\n  </nav>`;
  };

  // Shift tab turns into "↩ Shift" while a shift is running.
  window.applyBottomNavRole = function (opts) {
    opts = opts || {};
    if (opts.shiftIsCurrentPage) return true;
    if (localStorage.getItem("brewsShiftActive")) {
      const label = document.getElementById("shiftNavLabel");
      const btn   = document.getElementById("shiftNavBtn");
      if (label) label.textContent = "↩ Shift";
      if (btn)   btn.title = "Return to active shift";
    }
    return true;
  };
})();
