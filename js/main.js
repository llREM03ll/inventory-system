/**
 * main.js
 * Entry point — restores saved state, handles auto-fill from POS end shift.
 */

const SHIFT_KEY = "brewsShiftResult";

(function init() {
  const shiftRaw = localStorage.getItem(SHIFT_KEY);

  if (shiftRaw) {
    try {
      const s = JSON.parse(shiftRaw);

      // Cup fields — FTM/FTL are already baked into endM/endL by the POS
      const fields = {
        beginM:  s.begM,  endM:  s.endM,  tallyMC: s.tallyMC,
        beginL:  s.begL,  endL:  s.endL,  tallyLC: s.tallyLC,
        beginS:  s.begS,  endS:  s.endS,
        beginHC: s.begHC, endHC: s.endHC,
      };

      // Stagger fill animation
      let delay = 0;
      Object.entries(fields).forEach(([id, val]) => {
        setTimeout(() => {
          const el = document.getElementById(id);
          if (!el) return;
          el.value = val;
          el.style.transition = "background .4s, box-shadow .4s";
          el.style.background = "#fdf0d8";
          el.style.boxShadow  = "0 0 0 3px rgba(199,162,124,0.3)";
          setTimeout(() => { el.style.background = ""; el.style.boxShadow = ""; }, 1000);
        }, delay);
        delay += 35;
      });

      // Pre-fill expenses from POS shift expenses
      if (s.expenses && s.expenses.length) {
        document.getElementById("expensesContainer").innerHTML = "";
        s.expenses.forEach(e => addExpenseRow(e.name, e.price));
      }

      // Pre-fill addon revenue from POS
      if (s.addonRevenue) {
        setTimeout(() => {
          const el = document.getElementById("addons");
          if (el) {
            el.value = s.addonRevenue;
            el.style.transition = "background .4s";
            el.style.background = "#fdf0d8";
            setTimeout(() => el.style.background = "", 1000);
          }
        }, delay);
      }

      localStorage.removeItem(SHIFT_KEY);
      saveInputs();
      showShiftBanner();
    } catch {}
  } else {
    const saved = restoreInputs();
    if (saved?.expenses?.length) {
      document.getElementById("expensesContainer").innerHTML = "";
      saved.expenses.forEach(e => addExpenseRow(e.name, e.price));
    }
    if (saved?.needs?.length) {
      saved.needs.forEach(n => addNeedRow(n));
    }
  }

  attachInputListeners();
  renderNeedsAutoPreview();
})();

function showShiftBanner() {
  const banner = document.createElement("div");
  banner.style.cssText = `
    background: linear-gradient(135deg, #d4a97c, #7a5c3e); color:#fff;
    text-align:center; padding:10px 16px; font-size:0.84rem; font-weight:600;
    border-radius:12px; margin-bottom:16px; box-shadow:0 3px 10px rgba(122,92,62,0.2);
    opacity:0; transform:translateY(-6px); transition:opacity .35s ease, transform .35s ease;
  `;
  banner.textContent = "✓ Shift data auto-filled — review expenses and compute when ready.";
  const container = document.querySelector(".container");
  container.insertBefore(banner, container.querySelector(".section"));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    banner.style.opacity = "1"; banner.style.transform = "translateY(0)";
  }));
  setTimeout(() => {
    banner.style.opacity = "0"; banner.style.transform = "translateY(-6px)";
    setTimeout(() => banner.remove(), 400);
  }, 5000);
}
