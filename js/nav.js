/**
 * nav.js
 * Shared bottom-nav renderer. Previously this markup (and the role logic
 * that hid it entirely for managers) was copy-pasted into index.html,
 * pos.html, calendar.html and calculate.html independently, with drift
 * between copies (calendar.html even had two separate blocks doing the
 * same manager-check, one of which was dead code).
 *
 * Managers now get their own tab bar (Home / History / Settings) instead
 * of no nav at all — index.html and calendar.html pick the right variant
 * based on role before rendering. pos.html and calculate.html redirect
 * managers away before render, so they only ever need the worker variant.
 */
(function () {
  const NAV_ITEMS_WORKER = [
    { page: "calculate", href: "calculate.html", icon: "🧮", label: "Calculate" },
    { page: "shift",     href: "pos.html",       icon: "🧋", label: "Shift", shift: true },
    { page: "history",   href: "calendar.html",  icon: "📅", label: "History" },
  ];

  const NAV_ITEMS_MANAGER = [
    { page: "home",     href: "index.html",    icon: "🏠", label: "Home" },
    { page: "history",  href: "calendar.html", icon: "📅", label: "History" },
    { page: "settings", icon: "⚙️", label: "Settings", action: true },
  ];

  /**
   * Renders the <nav> markup as an HTML string.
   * @param {string} active - "calculate" | "shift" | "history" | "home" | "settings"
   * @param {object} [opts]
   * @param {string}  [opts.navId] - id to put on the <nav> element
   *   (index.html reads #bottomNav elsewhere to live-toggle it from Settings)
   * @param {boolean} [opts.shiftIsCurrentPage] - true only on pos.html: the
   *   Shift tab renders as an inert, already-active <span> instead of a
   *   link, matching pos.html's original markup exactly.
   * @param {string}  [opts.variant] - "worker" (default) | "manager"
   */
  window.renderBottomNav = function (active, opts) {
    opts = opts || {};
    const idAttr = opts.navId ? ` id="${opts.navId}"` : "";
    const items = opts.variant === "manager" ? NAV_ITEMS_MANAGER : NAV_ITEMS_WORKER;

    const itemsHTML = items.map(item => {
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

  /**
   * Post-render touch-ups: workers see the Shift tab swap to "↩ Shift" once
   * a shift is active. Managers no longer need any hide logic here — the
   * correct variant is chosen at render time instead.
   */
  window.applyBottomNavRole = function (opts) {
    opts = opts || {};
    if (opts.shiftIsCurrentPage) return true;
    if (getDeviceRole() === "manager") return true;

    if (localStorage.getItem("brewsShiftActive")) {
      const label = document.getElementById("shiftNavLabel");
      const btn   = document.getElementById("shiftNavBtn");
      if (label) label.textContent = "↩ Shift";
      if (btn)   btn.title = "Return to active shift";
    }
    return true;
  };
})();
