/**
 * layout.js
 * Fills the shared header and bottom nav from data attributes, so no page
 * needs inline scripts for layout.
 *
 *   <div data-layout-header data-subtitle="History"></div>
 *   <div data-layout-nav="history"></div>
 */
(function () {
  document.querySelectorAll("[data-layout-header]").forEach(el => {
    const d = el.dataset;
    const extra = d.pos === "setup"
      ? `<span style="font-size:0.68rem;color:var(--dust);font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">POS Setup</span>` : "";
    el.outerHTML = renderPageHeader({ subtitle: d.subtitle || "", hideSettings: "hideSettings" in d, extraButtonsHTML: extra });
  });
  document.querySelectorAll("[data-layout-nav]").forEach(el => {
    const d = el.dataset;
    const opts = {};
    if (d.navId) opts.navId = d.navId;
    if ("shiftCurrent" in d) opts.shiftIsCurrentPage = true;
    el.outerHTML = renderBottomNav(d.layoutNav, opts);
    applyBottomNavRole(opts);
  });
})();
