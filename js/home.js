applyBottomNavRole();

    // ── Splash message ─────────────────────────────────────────────────────────
    const GREETINGS = [
      {e:"☕",msg:"Ready to brew?",sub:"Let's make today count."},
      {e:"🌅",msg:"Good shift starts here",sub:"You got this."},
      {e:"💪",msg:"Brew hard, count harder",sub:"Every cup adds up."},
      {e:"🧋",msg:"Let's get brewing!",sub:"Track it. Own it."},
      {e:"✨",msg:"Another day, another sip",sub:"Make it a great one."},
      {e:"☕",msg:"Rise & brew",sub:"Time to make it happen."},
      {e:"😄",msg:"Cups don't count themselves",sub:"Good thing you do."},
      {e:"🎯",msg:"Today's a good day to sell out",sub:"Let's get to work."},
      {e:"🧋",msg:"Milk tea season, always",sub:"Ready when you are."},
      {e:"🚀",msg:"Let's hit that quota!",sub:"Every peso counts."},
      {e:"✅",msg:"Freshly brewed and ready",sub:"Start when you're set."},
      {e:"🌟",msg:"One shift at a time",sub:"Make it count."},
      {e:"🎶",msg:"Shake it, brew it, count it",sub:"Let's go!"},
      {e:"☕",msg:"The best cup is the next one",sub:"Keep going."},
      {e:"💼",msg:"Grind first, chill later",sub:"Let's have a great shift."},
      {e:"🧋",msg:"Small cups, big dreams",sub:"You're building something real."},
      {e:"🔥",msg:"You're on fire today",sub:"Don't stop now."},
      {e:"⚡",msg:"Charged up and ready",sub:"Let's make this shift legendary."},
      {e:"🎉",msg:"Another chance to be great",sub:"Don't waste it."},
      {e:"🏅",msg:"Champions show up every day",sub:"Even on slow days."},
      {e:"💰",msg:"Every peso counts",sub:"Track it carefully today."},
      {e:"☕",msg:"BREWS.CO is open for business",sub:"Have an amazing shift!"},
      {e:"👑",msg:"You're the barista and the boss",sub:"Act like it."},
      {e:"🌻",msg:"Bloom where you're brewed",sub:"You're exactly where you need to be."},
      {e:"⭐",msg:"Be someone's favorite part of the day",sub:"Start with their order."},
    ];
    const now = new Date();
    const g = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    document.getElementById("homeEmoji").textContent = g.e;
    document.getElementById("homeMsg").textContent   = g.msg;
    document.getElementById("homeSub").textContent   = g.sub;
    document.getElementById("homeDate").textContent  = now.toLocaleDateString("en-PH", { weekday:"long", year:"numeric", month:"long", day:"numeric" });

    // ── Shift card ─────────────────────────────────────────────────────────────
    function renderShiftCard() {
      const card = document.getElementById("shiftCard");
      const active = !!localStorage.getItem("brewsShiftActive");
      const saved  = !!localStorage.getItem("brewsResumeShift");
      if (active) {
        let start = 0;
        try { start = readJSON("brewsPOSState", {}).shiftStartTime || 0; } catch {}
        const ms = start ? Date.now() - start : 0;
        const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
        card.innerHTML = `
          <div class="shift-state"><i class="live"></i>Shift in progress</div>
          <div class="shift-title">${start ? (h > 0 ? h + "h " : "") + m + "m running" : "Shift is running"}</div>
          <div class="shift-sub">Your orders are saved on this device.</div>
          <a href="pos.html" class="shift-btn">Return to Shift →</a>`;
      } else if (saved) {
        card.innerHTML = `
          <div class="shift-state"><i></i>Unfinished shift</div>
          <div class="shift-title">Pick up where you left off</div>
          <div class="shift-sub">Your orders are safe.</div>
          <a href="pos.html" class="shift-btn">Resume Shift →</a>`;
      } else {
        card.innerHTML = `
          <div class="shift-state"><i></i>No active shift</div>
          <div class="shift-title">Ready when you are</div>
          <div class="shift-sub">Enter your beginning cups to start.</div>
          <a href="pos.html" class="shift-btn">Start Shift →</a>`;
      }
    }
    renderShiftCard();
    setInterval(renderShiftCard, 30000);

    // ── Today ──────────────────────────────────────────────────────────────────
    (function renderToday() {
      const today = localDate(now);
      try {
        const hist = readJSON("inventoryHistory", []);
        const e = hist.find(h => h.date === today);
        if (e) {
          const div = document.createElement("div");
          div.innerHTML = cleanHTML(e.results);
          for (const row of div.querySelectorAll("tr")) {
            const c = row.querySelectorAll("td");
            if (c.length >= 2 && c[0].textContent.includes("Final Total")) { document.getElementById("todayTotal").textContent = c[1].textContent.trim(); break; }
          }
        }
        const logs = readJSON("brewsOrderLog", []);
        const l = logs.find(x => x.date === today);
        if (l) document.getElementById("todayOrders").textContent = (l.orders || []).length;
        else {
          const st = readJSON("brewsPOSState", {});
          if (st.orders) document.getElementById("todayOrders").textContent = st.orders.length;
        }
      } catch {}
    })();

    // ── Sync ───────────────────────────────────────────────────────────────────
    function setSyncUI(state, msg) {
      document.getElementById("syncDot").className = "sync-dot " + (state || "");
      document.getElementById("syncStatusText").textContent = msg;
      const busy = state === "busy";
      document.getElementById("syncPushBtn").disabled = busy;
      document.getElementById("syncPullBtn").disabled = busy;
    }
    function initSyncDisplay() {
      const last = getLastSyncDisplay();
      setSyncUI(last ? "ok" : "", last ? "Last synced " + last : "Not synced yet");
    }
    async function doSync(direction) {
      if (direction === "push" && !confirm("Push to cloud?\n\nThis sends this device's history, orders, settings and menu.")) return;
      setSyncUI("busy", direction === "push" ? "Pushing…" : "Pulling…");
      try {
        if (direction === "push") { await syncPush(); setSyncUI("ok", "Pushed " + getLastSyncDisplay()); }
        else                      { await syncPull(); setSyncUI("ok", "Pulled " + getLastSyncDisplay()); }
      } catch (e) {
        setSyncUI("error", "⚠ " + (e.message || "Sync failed"));
        setTimeout(initSyncDisplay, 4000);
      }
    }
    async function autoPull() {
      if (localStorage.getItem("brewsShiftActive")) return;
      setSyncUI("busy", "Auto-syncing…");
      try { await syncPull(); setSyncUI("ok", "Auto-synced " + getLastSyncDisplay()); }
      catch (e) { setSyncUI("error", "⚠ Auto-sync failed"); setTimeout(initSyncDisplay, 3000); }
    }
    initSyncDisplay();
    setTimeout(autoPull, 1500);
    setInterval(autoPull, 3 * 60 * 1000);

    const _pill = document.getElementById("homeOfflinePill");
    const _setOffline = v => _pill.classList.toggle("visible", v);
    window.addEventListener("online",  () => _setOffline(false));
    window.addEventListener("offline", () => _setOffline(true));
    if (!navigator.onLine) _setOffline(true);

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
