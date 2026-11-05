const today    = new Date();
  let curYear    = today.getFullYear();
  let curMonth   = today.getMonth();
  let currentModalDate = "";

  const MONTH_NAMES = ["January","February","March","April","May","June",
                       "July","August","September","October","November","December"];

  function formatMoney(value) {
    return "₱" + Number(value||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function extractFinalTotal(html) {
    const div = document.createElement("div");
    div.innerHTML = cleanHTML(html);
    for (const row of div.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 2 && cells[0].textContent.includes("Final Total"))
        return cells[1].textContent.trim();
    }
    return null;
  }

  function parseMoney(str) {
    return parseFloat((str||"").replace(/[₱,]/g,"")) || 0;
  }

  // ── Monthly Expenses ─────────────────────────────────────────────────────
  function monthKey() {
    return `brewsMonthlyExp_${curYear}-${String(curMonth+1).padStart(2,"0")}`;
  }

  function saveMonthlyExpenses() {
    const rows = document.querySelectorAll("#monthlyExpContainer .expense-row");
    const list = [];
    rows.forEach(r => {
      const name  = r.querySelector(".exp-name").value.trim();
      const price = parseFloat(r.querySelector(".exp-price").value) || 0;
      if (name || price) list.push({name, price});
    });
    localStorage.setItem(monthKey(), JSON.stringify(list));
    renderSummary();
  }

  function loadMonthlyExpenses() {
    try { return readJSON(monthKey(), []); } catch { return []; }
  }

  function addMonthlyExpRow(name="", price="") {
    const container = document.getElementById("monthlyExpContainer");
    const row = document.createElement("div");
    row.className = "expense-row";
    row.innerHTML = `
      <input type="text"   class="exp-name"  placeholder="Expense name" value="${esc(name)}">
      <input type="number" class="exp-price" placeholder="₱0"           value="${price}">
      <button type="button" onclick="this.parentElement.remove(); saveMonthlyExpenses();">x</button>
    `;
    row.addEventListener("input", saveMonthlyExpenses);
    container.appendChild(row);
  }

  function renderMonthlyExpenses() {
    const container = document.getElementById("monthlyExpContainer");
    container.innerHTML = "";
    const list = loadMonthlyExpenses();
    if (list.length) list.forEach(e => addMonthlyExpRow(e.name, e.price));
    else addMonthlyExpRow();
  }

  // ── Calendar ─────────────────────────────────────────────────────────────
  function renderCalendar() {
    document.getElementById("monthTitle").textContent = `${MONTH_NAMES[curMonth]} ${curYear}`;

    const history     = getAllHistory();
    const firstDay    = new Date(curYear, curMonth, 1).getDay();
    const daysInMonth = new Date(curYear, curMonth+1, 0).getDate();
    const todayStr    = localDate(today);

    const entryMap = {};
    history.forEach(h => { entryMap[h.date] = h; });

    // Build set of dates that have saved POS order logs
    const orderLogs  = readJSON(ORDER_LOG_KEY, []);
    const logDateSet = new Set(orderLogs.map(l => l.date));

    const tbody = document.getElementById("calendarBody");
    tbody.innerHTML = "";

    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i += 7) {
      const tr = document.createElement("tr");
      let weekTotal = 0;

      for (let j = 0; j < 7; j++) {
        const cell    = i + j;
        const day     = cell - firstDay + 1;
        const td      = document.createElement("td");

        if (cell < firstDay || day > daysInMonth) {
          td.classList.add("empty");
        } else {
          const dateStr  = `${curYear}-${String(curMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const entry    = entryMap[dateStr];
          const hasLog   = logDateSet.has(dateStr);
          td.innerHTML   = `<span class="day-num">${day}</span>`;

          if (entry) {
            const totalStr = extractFinalTotal(entry.results);
            const totalNum = parseMoney(totalStr);
            weekTotal += totalNum;
            td.classList.add("has-entry");
            if (totalStr) td.innerHTML += `<div class="day-total">${totalStr}</div>`;
          }

          // Dots row — brown dot for inventory save, green dot for order log
          if (entry || hasLog) {
            const dots = `<div class="dots-row">
              ${entry   ? `<span class="day-badge" title="Inventory saved"></span>` : ""}
              ${hasLog  ? `<span class="log-dot"   title="Order log saved"></span>` : ""}
            </div>`;
            td.innerHTML += dots;
            if (!td.classList.contains("has-entry")) td.classList.add("has-entry");
          }

          if (entry) td.addEventListener("click", () => openModal(dateStr, entry));
          else if (hasLog) td.addEventListener("click", () => {
            // The order logs live in a collapsible section: open it first so the scroll can work
            const sec = document.getElementById("orderLogsContainer")?.closest("details");
            if (sec) sec.open = true;
            document.getElementById("orderLogsContainer")
              ?.querySelector(`#logday-${dateStr}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
            // also expand it
            document.getElementById(`logday-${dateStr}`)?.classList.add("expanded");
          });

          if (dateStr === todayStr) td.classList.add("today");
        }

        tr.appendChild(td);
      }

      // Week total cell
      const wtd = document.createElement("td");
      wtd.className = "week-total-cell";
      wtd.innerHTML = weekTotal > 0
        ? `<span class="week-total-val">${formatMoney(weekTotal)}</span>`
        : `<span class="week-total-val zero">—</span>`;
      tr.appendChild(wtd);
      tbody.appendChild(tr);
    }

    renderMonthlyExpenses();
    renderSummary();
    renderPopularFlavors();
  }

  // ── Monthly Summary ───────────────────────────────────────────────────────
  function renderSummary() {
    const history = getAllHistory();
    const prefix  = `${curYear}-${String(curMonth+1).padStart(2,"0")}`;

    let totalRevenue = 0;
    history.forEach(h => {
      if (h.date.startsWith(prefix)) totalRevenue += parseMoney(extractFinalTotal(h.results));
    });

    const expList  = loadMonthlyExpenses().filter(e => e.name && e.price > 0);
    const totalExp = expList.reduce((s,e) => s + e.price, 0);
    const net      = totalRevenue - totalExp;
    const el       = document.getElementById("monthlySummary");

    if (totalRevenue === 0 && expList.length === 0) {
      el.innerHTML = `<h3>Monthly Summary</h3><p class="empty-month">No entries for ${MONTH_NAMES[curMonth]} ${curYear}.</p>`;
      return;
    }

    let html = `<h3>Monthly Summary — ${MONTH_NAMES[curMonth]} ${curYear}</h3>
      <div class="summary-row"><span>Total Daily Revenue</span><span>${formatMoney(totalRevenue)}</span></div>`;

    if (expList.length) {
      html += `<div class="summary-row"><span>Monthly Expenses</span><span>- ${formatMoney(totalExp)}</span></div>`;
      expList.forEach(e => { html += `<div class="summary-row sub"><span>${esc(e.name)}</span><span>- ${formatMoney(e.price)}</span></div>`; });
    }

    html += `<div class="summary-row net"><span>Net Monthly Income</span><span>${formatMoney(net)}</span></div>`;
    el.innerHTML = html;
  }

  // ── Popular Flavors ───────────────────────────────────────────────────────
  const SALES_TALLY_KEY = "brewsSalesTally"; // persistent all-time tally, written by pos.html

  function renderPopularFlavors() {
    const el      = document.getElementById("popularFlavors");
    const prefix  = `${curYear}-${String(curMonth+1).padStart(2,"0")}`;
    const orderLogs = readJSON(ORDER_LOG_KEY, []);
    const monthLogs = orderLogs.filter(l => l.date && l.date.startsWith(prefix));

    // Aggregate this month's saved order logs by drink + flavor.
    const map = {};
    monthLogs.forEach(log => {
      (log.orders || []).forEach(order => {
        (order.items || []).forEach(it => {
          const key = it.code + "|" + (it.flavor || "");
          if (!map[key]) map[key] = { name: it.name, flavor: it.flavor || "", qty: 0, revenue: 0 };
          map[key].qty     += it.qty;
          map[key].revenue += (it.unitPrice || 0) * it.qty; // cup revenue only (add-ons excluded here)
        });
      });
    });
    const rows = Object.values(map).sort((a,b) => b.qty - a.qty).slice(0, 8);

    // All-time favorite, from the tally that never gets pruned by retention.
    let allTimeLine = "";
    try {
      const tally = readJSON(SALES_TALLY_KEY, {});
      const top = Object.values(tally).sort((a,b) => b.qty - a.qty)[0];
      if (top && top.qty > 0) {
        allTimeLine = `<div class="pf-alltime">🏆 All-time favorite: <strong>${esc(top.name)}${top.flavor?" · "+esc(top.flavor):""}</strong> — ${top.qty} cups sold</div>`;
      }
    } catch {}

    if (!rows.length) {
      el.innerHTML = `<h3>🏆 Popular Flavors — ${MONTH_NAMES[curMonth]} ${curYear}</h3>${allTimeLine}
        <p class="empty-month">No saved order logs for this month.<br>
        <span style="font-size:0.76rem;">Order logs are only kept for your current retention window — see below.</span></p>`;
      return;
    }

    let html = `<h3>🏆 Popular Flavors — ${MONTH_NAMES[curMonth]} ${curYear}</h3>${allTimeLine}`;
    html += rows.map((r,i) => `
      <div class="pf-row">
        <span class="pf-rank">${i+1}</span>
        <div class="pf-info">
          <div class="pf-name">${esc(r.name)}</div>
          ${r.flavor ? `<div class="pf-flavor">${esc(r.flavor)}</div>` : ""}
        </div>
        <div class="pf-stats">
          <div class="pf-qty">${r.qty} cup${r.qty===1?"":"s"}</div>
          <div class="pf-revenue">${formatMoney(r.revenue)}</div>
        </div>
      </div>
    `).join("");
    el.innerHTML = html;
  }

  // ── Month nav ─────────────────────────────────────────────────────────────
  function changeMonth(dir) {
    curMonth += dir;
    if (curMonth > 11) { curMonth = 0;  curYear++; }
    if (curMonth < 0)  { curMonth = 11; curYear--; }
    renderCalendar();
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function openModal(dateStr, entry) {
    currentModalDate = dateStr;
    document.getElementById("modalDate").textContent = `Receipt — ${dateStr}`;
    document.getElementById("modalBody").innerHTML   = cleanHTML(entry.results);
    document.getElementById("modalOverlay").classList.add("open");
  }

  function closeModal() {
    document.getElementById("modalOverlay").classList.remove("open");
    currentModalDate = "";
  }

  function handleOverlayClick(e) {
    if (e.target === document.getElementById("modalOverlay")) closeModal();
  }

  function deleteCurrentEntry() {
    if (!currentModalDate) return;
    if (!confirm(`Delete entry for ${currentModalDate}?`)) return;
    deleteHistoryByDate(currentModalDate);
    closeModal();
    renderCalendar();
  }

  function deleteAllHistory() {
    if (!confirm("Delete ALL inventory history and order logs? This cannot be undone.")) return;
    clearAllHistory();
    localStorage.removeItem(ORDER_LOG_KEY);
    renderCalendar();
    renderOrderLogs();
  }

  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  // Swipe to dismiss receipt modal
  (function() {
    const overlay = document.getElementById("modalOverlay");
    const modal   = overlay?.querySelector(".modal");
    if (!overlay || !modal) return;
    let startY = 0, dragging = false, curY = 0;
    overlay.addEventListener("touchstart", e => {
      if (e.target === overlay) return;
      startY = e.touches[0].clientY; curY = startY; dragging = true;
      modal.style.transition = "none";
    }, { passive: true });
    overlay.addEventListener("touchmove", e => {
      if (!dragging) return;
      curY = e.touches[0].clientY;
      const dy = Math.max(0, curY - startY);
      modal.style.transform = `translateY(${dy}px) scale(${1 - dy*0.0005})`;
    }, { passive: true });
    overlay.addEventListener("touchend", () => {
      if (!dragging) return; dragging = false;
      const dy = Math.max(0, curY - startY);
      modal.style.transition = "";
      if (dy > 90) { modal.style.transform = ""; closeModal(); }
      else modal.style.transform = "";
    });
  })();

  // ══════════════════════════════════════════════════════
  //  ORDER LOG RETENTION & DISPLAY
  // ══════════════════════════════════════════════════════
  const ORDER_LOG_KEY  = "brewsOrderLog";
  const RETENTION_KEY  = "brewsOrderRetention";
  const ADDONS_PRICES  = {
    "Pearl":6,"Nata":6,"Coffee Jelly":6,"Oreo":6,"Cream Cheese":10,"Espresso Shot":6
  };

  const RETENTION_OPTIONS = [
    { label: "3 Days",  days: 3  },
    { label: "1 Week",  days: 7  },
    { label: "2 Weeks", days: 14 },
    { label: "1 Month", days: 30 },
  ];

  function getRetentionDays() {
    return parseInt(localStorage.getItem(RETENTION_KEY) || "7");
  }

  function setRetention(days) {
    localStorage.setItem(RETENTION_KEY, days);
    cleanupOrderLogs();
    renderRetentionPills();
    renderOrderLogs();
  }

  function cleanupOrderLogs() {
    const days   = getRetentionDays();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const logs   = readJSON(ORDER_LOG_KEY, []);
    const kept   = logs.filter(l => {
      const ts = l.savedAt || new Date(l.date + "T23:59:59").getTime();
      return ts > cutoff;
    });
    localStorage.setItem(ORDER_LOG_KEY, JSON.stringify(kept));
  }

  function deleteOrderLog(date) {
    if (!confirm(`Delete order log for ${date}?`)) return;
    const logs = readJSON(ORDER_LOG_KEY, []);
    localStorage.setItem(ORDER_LOG_KEY, JSON.stringify(logs.filter(l => l.date !== date)));
    renderOrderLogs();
  }

  function renderRetentionPills() {
    const current = getRetentionDays();
    const container = document.getElementById("retentionPills");
    const note      = document.getElementById("retentionNote");
    container.innerHTML = "";
    RETENTION_OPTIONS.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "retention-pill" + (opt.days === current ? " active" : "");
      btn.textContent = opt.label;
      btn.addEventListener("click", () => setRetention(opt.days));
      container.appendChild(btn);
    });
    const opt = RETENTION_OPTIONS.find(o => o.days === current) || RETENTION_OPTIONS[1];
    note.textContent = `Currently keeping logs for ${opt.label.toLowerCase()}. Older logs are deleted automatically on page load.`;
  }

  function renderOrderLogs() {
    const container = document.getElementById("orderLogsContainer");
    const raw       = localStorage.getItem(ORDER_LOG_KEY);
    const logs      = raw ? JSON.parse(raw) : [];

    if (!logs.length) {
      container.innerHTML = `<div class="log-empty">No saved order logs yet. Logs appear here after you end a shift in the POS.</div>`;
      return;
    }

    // Sort newest first
    const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));

    container.innerHTML = sorted.map(log => {
      const orders    = log.orders || [];
      const dayTotal  = orders.reduce((s, o) => s + (o.total || 0), 0);
      const doneCount = orders.filter(o => o.done).length;

      const orderRows = orders.map(order => {
        const desc = order.items.map(i => `${i.qty}×${esc(i.code)}`).join(", ");
        const flavors = order.items.filter(i => i.flavor).map(i => `${esc(i.code)}: ${esc(i.flavor)}`).join(" · ");
        const addonMap = {};
        order.items.forEach(i => Object.entries(i.addons || {}).forEach(([n, q]) => { addonMap[n] = (addonMap[n] || 0) + q * i.qty; }));
        Object.entries(order.addons || {}).forEach(([n, q]) => { addonMap[n] = (addonMap[n] || 0) + q; });
        const addons  = Object.entries(addonMap).map(([n, q]) => `${q}× ${esc(n)}`).join(", ");
        const cupNotes = order.items.map(i => [...(i.notes || []), (i.noteText || "").trim()].filter(Boolean).join(", ") ? `${esc(i.code)}${i.flavor ? " " + esc(i.flavor) : ""}: ${esc([...(i.notes || []), (i.noteText || "").trim()].filter(Boolean).join(", "))}` : "").filter(Boolean).join(" · ");
        const change  = order.given > 0 ? order.given - order.total : null;
        const isDone  = !!order.done;
        return `
          <div class="log-order-item">
            <span class="log-order-num${isDone ? " done-badge" : ""}">#${order.id}${isDone ? " ✓" : ""}</span>
            <div class="log-order-info">
              <div class="log-order-desc">${desc} — ${formatMoney(order.total)}</div>
              ${flavors ? `<div class="log-order-flavors">🍵 ${flavors}</div>` : ""}
              ${addons  ? `<div class="log-order-addons">+ ${addons}</div>` : ""}
              ${cupNotes ? `<div class="log-order-addons">Notes — ${cupNotes}</div>` : ""}
              ${order.given > 0 ? `<div class="log-order-payment">Given ${formatMoney(order.given)} · ${change >= 0 ? "Change" : "Short"} ${formatMoney(Math.abs(change))}</div>` : ""}
            </div>
            <span class="log-order-total">${order.time || ""}</span>
          </div>`;
      }).join("");

      return `
        <div class="log-day-item" id="logday-${log.date}">
          <div class="log-day-header" onclick="document.getElementById('logday-${log.date}').classList.toggle('expanded')">
            <div class="log-day-left">
              <span class="log-day-date">${log.date}</span>
              <span class="log-day-meta">${orders.length} order${orders.length !== 1 ? "s" : ""} · ${doneCount} done</span>
            </div>
            <div class="log-day-right">
              <span class="log-day-total">${formatMoney(dayTotal)}</span>
              <button class="log-delete-btn" onclick="event.stopPropagation();deleteOrderLog('${log.date}')">🗑</button>
              <span class="log-day-chevron">▼</span>
            </div>
          </div>
          <div class="log-day-body">${orderRows}</div>
        </div>`;
    }).join("");
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  cleanupOrderLogs();
  renderRetentionPills();
  renderOrderLogs();
  renderCalendar();

  // ── Setup ───────────────────────────────────────────────────────────────────
  (function initCal() {
    const pullBtn   = document.getElementById("calPullBtn");
    const exportBtn = document.getElementById("calExportBtn");
    if (pullBtn)   pullBtn.style.display   = "inline-flex";
    if (exportBtn) exportBtn.style.display = "inline-flex";

    // Offline indicator
    const pill = document.getElementById("calOfflinePill");
    function setOffline(v) { if (pill) pill.classList.toggle("visible", v); }
    window.addEventListener("online",  () => setOffline(false));
    window.addEventListener("offline", () => setOffline(true));
    if (!navigator.onLine) setOffline(true);
  })();

  // Pull function
  async function calPullFromCloud() {
    const btn = document.getElementById("calPullBtn");
    if (btn) { btn.disabled = true; btn.textContent = "⬇️ Pulling…"; }
    _showCalToast("Pulling from cloud…", "var(--mahogany)", false);
    try {
      await syncPull();
      cleanupOrderLogs(); renderRetentionPills(); renderOrderLogs(); renderCalendar();
      _showCalToast("✓ History updated from cloud", "var(--success-dark)", true);
    } catch (e) {
      _showCalToast("⚠ " + (e.message || "Pull failed"), "var(--danger-soft)", true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "⬇️ Pull from Cloud"; }
    }
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  function exportHistoryCSV() {
    const history = getAllHistory();
    if (!history.length) { _showCalToast("No history to export", "var(--danger-soft)", true); return; }

    // Parse receipt HTML to extract summary rows
    function parseEntry(html) {
      const d = document.createElement("div");
      d.innerHTML = cleanHTML(html);
      const rows = {};
      d.querySelectorAll("tr").forEach(tr => {
        const cells = tr.querySelectorAll("td");
        if (cells.length >= 2) {
          const key = cells[0].textContent.trim();
          const val = cells[cells.length-1].textContent.replace(/[₱,]/g,"").trim();
          rows[key] = val;
        }
      });
      return rows;
    }

    // Quote every cell, double any quotes, and defuse spreadsheet formulas
    const csvCell = v => {
      let t = String(v ?? "");
      if (/^[=+@]/.test(t)) t = "'" + t;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const lines = [];
    // Header
    lines.push([
      "Date","Total Cup Sales","Salary","Total Expenses","Gross Income","Add-ons","Final Total"
    ].join(","));

    history.forEach(h => {
      const rows = parseEntry(h.results);
      const get  = (...keys) => {
        for (const k of keys) {
          for (const rk of Object.keys(rows)) {
            if (rk.toLowerCase().includes(k.toLowerCase())) return rows[rk] || "0";
          }
        }
        return "0";
      };
      lines.push([
        h.date,
        get("Total Cup Sales"),
        get("Salary"),
        get("Total Expenses"),
        get("Gross Income"),
        get("Add-on"),
        get("Final Total"),
      ].map(csvCell).join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "BREWSCO_history_all_" + localDate() + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    _showCalToast("✓ CSV downloaded", "var(--success-dark)", true);
  }

  function _showCalToast(msg, color, autoDismiss) {
    const t = document.getElementById("calSyncToast");
    if (!t) return;
    clearTimeout(t._timer);
    t.textContent = msg; t.style.background = color; t.style.opacity = "1";
    if (autoDismiss) t._timer = setTimeout(() => { t.style.opacity = "0"; }, 3000);
  }

// On reload go home, unless a shift is active
const _nav = performance.getEntriesByType('navigation')[0];
  if (_nav && _nav.type === 'reload' && !localStorage.getItem('brewsShiftActive')) {
    window.location.replace('index.html');
  }
