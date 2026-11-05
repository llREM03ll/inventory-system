// Clamp all number inputs to 0+
    document.addEventListener("input", e => {
      if (e.target.type === "number") {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v < 0) e.target.value = 0;
      }
    });

    // On reload → go to index (unless a shift is active)
    const _nav = performance.getEntriesByType('navigation')[0];
    if (_nav && _nav.type === 'reload' && !localStorage.getItem('brewsShiftActive')) {
      window.location.replace('index.html');
    }
    if (localStorage.getItem("brewsShiftActive")) {
      document.getElementById("shiftNavLabel").textContent = "↩ Shift";
    }

    // Carry-over button
    (function initCarryover() {
      const raw = localStorage.getItem("brewsLastEndingCups");
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        const wrap = document.getElementById("carryoverWrap");
        const meta = document.getElementById("carryoverMeta");
        wrap.style.display = "block";
        meta.textContent = d.date ? `from ${d.date}` : "";
        window.useYesterdaysEnding = function() {
          const fields = { beginM: d.endM, beginL: d.endL, beginS: d.endS, beginHC: d.endHC };
          Object.entries(fields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.value = val;
            el.style.transition = "background .4s";
            el.style.background = "var(--success-bg-alt)";
            setTimeout(() => el.style.background = "", 900);
          });
          if (typeof saveInputs === "function") saveInputs();
        };
      } catch {}
    })();
