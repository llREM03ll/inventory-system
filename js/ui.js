/**
 * ui.js
 * All DOM rendering: calculate results, expense rows, history display, clear.
 * Depends on: InventorySystem.js, storage.js, history.js
 */

let lastRenderContent = "";
let lastRenderDate    = "";
let lastRenderData    = null;
let includeNeeds      = true;

// ── Needs helpers ─────────────────────────────────────────────────────────────

function addNeedRow(val = "") {
  const container = document.getElementById("needsContainer");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "expense-row need-row";
  row.innerHTML = `
    <input type="text" class="need-text" placeholder="e.g. Taro syrup, straws, supplies…" value="${val}" style="flex:1;">
    <button type="button" onclick="this.parentElement.remove(); saveInputs();">✕</button>
  `;
  row.addEventListener("input", saveInputs);
  container.appendChild(row);
}

function getAutoCupNeeds() {
  const low = (typeof getSettings === "function") ? (getSettings().lowStock ?? 5) : 5;
  const map = [
    { formId:"endM",  storeKey:"endM",  label:"Medium cups"     },
    { formId:"endL",  storeKey:"endL",  label:"Large cups"      },
    { formId:"endS",  storeKey:"endS",  label:"Small cups"      },
    { formId:"endHC", storeKey:"endHC", label:"Hot Coffee cups" },
  ];

  // Prefer current form fields — they're the most accurate and always available
  const formPresent = map.some(m => {
    const el = document.getElementById(m.formId);
    return el && el.value !== "" && el.value !== null;
  });

  if (formPresent) {
    return map.filter(m => {
      const el = document.getElementById(m.formId);
      const val = el && el.value !== "" ? parseFloat(el.value) : 999;
      return val <= low;
    }).map(m => {
      const el  = document.getElementById(m.formId);
      const val = el && el.value !== "" ? parseFloat(el.value) : 0;
      return { label: m.label, remaining: val };
    });
  }

  // Fall back to POS saved data if form is empty
  const raw = localStorage.getItem("brewsLastEndingCups");
  if (!raw) return [];
  try {
    const d = JSON.parse(raw);
    return map.filter(m => (d[m.storeKey] ?? 999) <= low)
              .map(m => ({ label: m.label, remaining: d[m.storeKey] ?? 0 }));
  } catch { return []; }
}

function getAutoFlavorNeeds() {
  try {
    const oos  = JSON.parse(localStorage.getItem("brewsFlavorOOS") || "[]");
    const seen = new Set();
    return oos.map(key => {
      const name = key.startsWith("FT:") ? key.slice(3) : key;
      if (!name || seen.has(name)) return null;
      seen.add(name);
      return name;
    }).filter(Boolean);
  } catch { return []; }
}

function getNeedsFromUI() {
  const cups    = getAutoCupNeeds();
  const flavors = getAutoFlavorNeeds();
  const items   = [];
  document.querySelectorAll("#needsContainer .need-row .need-text").forEach(el => {
    const t = el.value.trim();
    if (t) items.push(t);
  });
  return { cups, flavors, items };
}

function renderNeedsAutoPreview() {
  const preview = document.getElementById("needsAutoPreview");
  if (!preview) return;
  const cups    = getAutoCupNeeds();
  const flavors = getAutoFlavorNeeds();
  const low     = (typeof getSettings === "function") ? (getSettings().lowStock ?? 5) : 5;

  if (!cups.length && !flavors.length) {
    preview.innerHTML = `<div style="font-size:0.78rem;color:#b08060;font-style:italic;padding:4px 0 8px;">No low-stock cups or out-of-stock flavors detected from POS.</div>`;
    return;
  }
  let html = "";
  if (cups.length) {
    html += `<div style="font-size:0.7rem;font-weight:700;color:#c0665a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">⚠ Low / Out of Cups</div>`;
    html += cups.map(c => `
      <div style="display:flex;align-items:center;justify-content:space-between;
        background:#fff4f0;border:1.5px solid #f0c8b8;border-radius:10px;
        padding:8px 12px;margin-bottom:5px;font-size:0.84rem;">
        <span style="font-weight:600;color:#5c4631;">${c.label}</span>
        <span style="font-size:0.76rem;color:#c0665a;font-weight:700;">${c.remaining} left (≤${low})</span>
      </div>`).join("");
  }
  if (flavors.length) {
    html += `<div style="font-size:0.7rem;font-weight:700;color:#c0665a;text-transform:uppercase;letter-spacing:0.08em;margin:${cups.length?10:0}px 0 6px;">🔴 Out-of-Stock Flavors</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">`;
    html += flavors.map(f => `<span style="background:#fff0f0;border:1.5px solid #f0c0c0;border-radius:20px;padding:4px 10px;font-size:0.76rem;font-weight:600;color:#b05050;">${f}</span>`).join("");
    html += `</div>`;
  }
  preview.innerHTML = html;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoney(value) {
  const num = Number(value) || 0;
  return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function warnIfNeg(val, display) {
  if (Number(val) < 0)
    return `<span style="color:#c0665a;font-weight:700" title="Negative — check inputs">${display} ⚠</span>`;
  return display;
}

function getExpensesFromUI() {
  const rows = document.querySelectorAll("#expensesContainer .expense-row");
  const list = [];
  rows.forEach(row => {
    const name  = row.querySelector(".exp-name").value.trim();
    const price = parseFloat(row.querySelector(".exp-price").value) || 0;
    if (name && price > 0) list.push({ name, price });
  });
  return list;
}

// ── Expense rows ──────────────────────────────────────────────────────────────

function addExpenseRow(name = "", price = "") {
  const container = document.getElementById("expensesContainer");
  const row       = document.createElement("div");
  row.className   = "expense-row";
  row.innerHTML   = `
    <input type="text"   class="exp-name"  placeholder="Item name" value="${name}">
    <input type="number" class="exp-price" placeholder="₱0"        value="${price}">
    <button type="button" onclick="this.parentElement.remove(); saveInputs();">x</button>
  `;
  row.addEventListener("input", saveInputs);
  container.appendChild(row);
}

// ── Calculate ─────────────────────────────────────────────────────────────────

function calculate() {
  const v = id => { const el = document.getElementById(id); return el ? (+el.value || 0) : 0; };

  const cfg    = (typeof getSettings === "function") ? getSettings() : {};
  const system = new InventorySystem(cfg);
  system.setCupsM( v("beginM"),  v("endM"),  v("tallyMC"));
  system.setCupsL( v("beginL"),  v("endL"),  v("tallyLC"));
  system.setCupsS( v("beginS"),  v("endS"));
  system.setCupsHC(v("beginHC"), v("endHC"));
  system.setMC(v("tallyMC"));
  system.setLC(v("tallyLC"));
  system.setExpenses(getExpensesFromUI());
  system.setAddons(v("addons"));

  const totalSales  = system.computeTotalCupSale();
  const salary      = system.computeSalaryBonus(totalSales);
  const grossIncome = system.computeGrossIncome(salary);
  const finalTotal  = system.computeFinalTotal(salary);

  // Damage cups — displayed only, not included in computation
  const dmg = { M: v("damageM"), L: v("damageL"), S: v("damageS"), HC: v("damageHC") };
  const del = { M: v("deliveredM"), L: v("deliveredL"), S: v("deliveredS"), HC: v("deliveredHC") };

  const orderedRows = [
    { item: system.M,  beg: v("beginM"),  end: v("endM"),  dmg: dmg.M  },
    { item: system.L,  beg: v("beginL"),  end: v("endL"),  dmg: dmg.L  },
    { item: system.LC, beg: null,         end: null,        dmg: 0      },
    { item: system.MC, beg: null,         end: null,        dmg: 0      },
    { item: system.HC, beg: v("beginHC"), end: v("endHC"), dmg: dmg.HC },
    { item: system.S,  beg: v("beginS"),  end: v("endS"),  dmg: dmg.S  },
  ];

  const dash = val => (val === null ? "—" : val);
  const today = new Date().toISOString().split("T")[0];
  const existingDate = document.getElementById("resultDate")?.value || today;
  lastRenderDate = existingDate;

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center;
                border-bottom:2px solid #e0c9b8; padding-bottom:8px; margin-bottom:12px;">
      <h3 style="margin:0; border:none;">Results</h3>
      <input type="date" id="resultDate" value="${existingDate}"
        style="border:none; background:transparent; font-size:0.88rem; font-family:inherit;
               color:#9a7a5e; cursor:pointer; text-align:right; padding:0;">
    </div>
    <table>
      <tr><th>Item</th><th>Beg</th><th>Cups</th><th>Price</th><th>End</th><th>Amount</th></tr>
  `;

  let hasNegative = false;
  orderedRows.forEach(({ item, beg, end, dmg }) => {
    if (item.usedCups === 0 && beg === null) return;
    if (item.usedCups < 0) hasNegative = true;

    let displayEnd = dash(end);
    if (end !== null) {
      displayEnd = dmg > 0
        ? `${end - dmg} <span style="font-size:.75em;color:#b08060">(−${dmg} dmg)</span>`
        : `${end}`;
    }

    html += `<tr>
      <td>${item.name}</td>
      <td>${dash(beg)}</td>
      <td>${warnIfNeg(item.usedCups, item.usedCups)}</td>
      <td>${formatMoney(item.price)}</td>
      <td>${displayEnd}</td>
      <td>${warnIfNeg(item.total, formatMoney(item.total))}</td>
    </tr>`;
  });

  html += `<tr class="totals"><td colspan="5">Total Cup Sales</td><td>${warnIfNeg(totalSales, formatMoney(totalSales))}</td></tr></table>`;

  if (hasNegative) {
    html += `<div style="background:#fff4f0;border:1px solid #f0d5c8;border-radius:10px;
                          padding:9px 13px;margin-top:10px;font-size:0.82rem;color:#b05040;line-height:1.5;">
      ⚠ One or more cup counts are negative. Please check your beginning / ending values.
    </div>`;
  }

  const totalDmg = dmg.M + dmg.L + dmg.S + dmg.HC;
  if (totalDmg > 0) {
    const parts = [];
    if (dmg.M)  parts.push(`M ×${dmg.M}`);
    if (dmg.L)  parts.push(`L ×${dmg.L}`);
    if (dmg.S)  parts.push(`S ×${dmg.S}`);
    if (dmg.HC) parts.push(`HC ×${dmg.HC}`);
    html += `<div style="background:#fdf7f0;border:1px solid #e8d5c4;border-radius:10px;
                          padding:9px 13px;margin-top:8px;font-size:0.82rem;color:#9a7a5e;line-height:1.6;">
      🗂 Damage recorded: ${parts.join(", ")} — not counted in sales.
    </div>`;
  }

  const totalDel = del.M + del.L + del.S + del.HC;
  if (totalDel > 0) {
    const parts = [];
    if (del.M)  parts.push(`M ×${del.M}`);
    if (del.L)  parts.push(`L ×${del.L}`);
    if (del.S)  parts.push(`S ×${del.S}`);
    if (del.HC) parts.push(`HC ×${del.HC}`);
    html += `<div style="background:#f0f7f0;border:1px solid #c8e0c8;border-radius:10px;
                          padding:9px 13px;margin-top:8px;font-size:0.82rem;color:#4a7a4a;line-height:1.6;">
      📦 Delivered: ${parts.join(", ")} — recorded for reference.
    </div>`;
  }

  const totalExpenses = system.expenses + salary;
  const salaryLabel = salary === 0
    ? `Salary <span style="font-size:.78em;color:#c0665a;">(below minimum sales)</span>`
    : `Salary + Bonus`;

  html += `<table class="summary">
    <tr class="expense-header">
      <td>Total Expenses:</td>
      <td style="text-align:right">- ${formatMoney(totalExpenses)}</td>
    </tr>
    <tr class="expense-sub">
      <td>${salaryLabel}</td>
      <td style="text-align:right">- ${formatMoney(salary)}</td>
    </tr>
  `;
  system.expensesList.forEach(e => {
    html += `<tr class="expense-sub"><td>${e.name}</td><td style="text-align:right">- ${formatMoney(e.price)}</td></tr>`;
  });
  html += `
    <tr><td style="padding-top:12px;border-top:1px solid #e8d5c4;">Gross Income:</td>
        <td style="text-align:right;padding-top:12px;border-top:1px solid #e8d5c4;">${formatMoney(grossIncome)}</td></tr>
    <tr><td>Add-ons:</td><td style="text-align:right">${formatMoney(system.addons)}</td></tr>
    <tr><td><strong>Final Total:</strong></td><td style="text-align:right"><strong>${formatMoney(finalTotal)}</strong></td></tr>
  </table>`;

  lastRenderContent = html;
  lastRenderData = {
    date:         existingDate,
    rows:         orderedRows.filter(r => !(r.item.usedCups === 0 && r.beg === null)),
    totalSales, salary, grossIncome, finalTotal,
    expenses:     system.expensesList,
    addons:       system.addons,
    dmg, del,
    shiftDuration: (() => {
      try {
        const s = JSON.parse(localStorage.getItem("brewsPOSState") || "{}");
        if (s.shiftStartTime) {
          const ms = Date.now() - s.shiftStartTime;
          const h  = Math.floor(ms / 3600000);
          const m  = Math.floor((ms % 3600000) / 60000);
          return h > 0 ? `${h}h ${m}m` : `${m}m`;
        }
      } catch {}
      return null;
    })(),
  };
  renderResults(html);
  renderNeedsAutoPreview(); // refresh with current form values
  saveInputs();
  window.scrollTo({ top: document.getElementById("results").offsetTop - 20, behavior: "smooth" });
}

// ── Save to history ───────────────────────────────────────────────────────────

function saveCurrentResults() {
  if (!lastRenderContent) { alert("Please compute first."); return; }
  const dateInput  = document.getElementById("resultDate");
  const editedDate = dateInput?.value || lastRenderDate || new Date().toISOString().split("T")[0];
  saveHistory(editedDate, lastRenderContent);

  // Save ending cups for carry-over to next shift
  const v = id => +document.getElementById(id)?.value || 0;
  localStorage.setItem("brewsLastEndingCups", JSON.stringify({
    endM: v("endM"), endL: v("endL"), endS: v("endS"), endHC: v("endHC"),
    date: editedDate,
  }));

  const btn = document.querySelector(".output-actions .primary");
  if (btn) {
    btn.disabled = true; btn.textContent = "Saved ✓";
    btn.style.opacity = "0.65"; btn.style.cursor = "default";
  }
}

// ── Clear all ─────────────────────────────────────────────────────────────────

function clearAll() {
  if (!confirm("Clear all inputs and results?")) return;
  document.querySelectorAll("input").forEach(i => { if (!i.disabled) i.value = ""; });
  document.getElementById("results").innerHTML           = "";
  document.getElementById("expensesContainer").innerHTML = "";
  if (document.getElementById("needsContainer")) document.getElementById("needsContainer").innerHTML = "";
  addExpenseRow();
  lastRenderContent = ""; lastRenderDate = "";
  clearInputStorage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Print Receipt as Image ────────────────────────────────────────────────────

function printReceipt() {
  if (!lastRenderData) { alert("Please compute first."); return; }
  if (typeof html2canvas === "undefined") { alert("Image library not loaded. Refresh and try again."); return; }

  const d = lastRenderData;

  // ── Build filename: MMDDYY_cashonhand ─────────────────────────────────────
  const dp     = (d.date || new Date().toISOString().split("T")[0]).split("-");
  const mmddyy = dp[1] + dp[2] + dp[0].slice(2);
  const cash   = Math.round(d.finalTotal);
  const filename = `${mmddyy}_${cash}.png`;

  // ── Build receipt rows HTML ───────────────────────────────────────────────
  const fmtR = v => "₱" + Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});

  const cupRows = d.rows.map(({ item, beg, end, dmg }) => {
    const endTxt = end === null ? "—"
      : dmg > 0 ? `${end}<span style="color:#b08060;font-size:.78em"> (−${dmg})</span>`
      : `${end}`;
    const neg = item.usedCups < 0;
    return `
      <tr>
        <td style="text-align:left;padding:6px 8px;color:${neg?"#c0665a":"#3d2b1a"};border-bottom:1px solid #f0e4d8;word-break:break-word;">${item.name}</td>
        <td style="text-align:center;padding:6px 4px;color:#7a5c3e;border-bottom:1px solid #f0e4d8;">${beg === null ? "—" : beg}</td>
        <td style="text-align:center;padding:6px 4px;color:${neg?"#c0665a":"#3d2b1a"};font-weight:${neg?700:400};border-bottom:1px solid #f0e4d8;">${item.usedCups}${neg?" ⚠":""}</td>
        <td style="text-align:center;padding:6px 4px;color:#9a7a5e;border-bottom:1px solid #f0e4d8;">${fmtR(item.price)}</td>
        <td style="text-align:center;padding:6px 4px;border-bottom:1px solid #f0e4d8;">${endTxt}</td>
        <td style="text-align:right;padding:6px 8px;color:${neg?"#c0665a":"#3d2b1a"};font-weight:700;border-bottom:1px solid #f0e4d8;">${fmtR(item.total)}</td>
      </tr>`;
  }).join("");

  const expRows = d.expenses.map(e =>
    `<tr><td style="padding:3px 8px 3px 20px;color:#9a7a5e;font-size:.83rem" colspan="2">↳ ${e.name}</td>
         <td style="text-align:right;padding:3px 8px;color:#9a7a5e;font-size:.83rem" colspan="4">− ${fmtR(e.price)}</td></tr>`
  ).join("");

  const dmgNote = (() => {
    const parts = [];
    if (d.dmg.M)  parts.push(`M ×${d.dmg.M}`);
    if (d.dmg.L)  parts.push(`L ×${d.dmg.L}`);
    if (d.dmg.S)  parts.push(`S ×${d.dmg.S}`);
    if (d.dmg.HC) parts.push(`HC ×${d.dmg.HC}`);
    return parts.length ? `<div style="margin:8px 0 2px;padding:8px 12px;background:#fdf7f0;border-radius:8px;font-size:.78rem;color:#9a7a5e;">🗂 Damage: ${parts.join(", ")}</div>` : "";
  })();

  const delNote = (() => {
    const parts = [];
    if (d.del.M)  parts.push(`M ×${d.del.M}`);
    if (d.del.L)  parts.push(`L ×${d.del.L}`);
    if (d.del.S)  parts.push(`S ×${d.del.S}`);
    if (d.del.HC) parts.push(`HC ×${d.del.HC}`);
    return parts.length ? `<div style="margin:2px 0 8px;padding:8px 12px;background:#f0f7f0;border-radius:8px;font-size:.78rem;color:#4a7a4a;">📦 Delivered: ${parts.join(", ")}</div>` : "";
  })();

  // ── Compose receipt element ───────────────────────────────────────────────
  const el = document.createElement("div");
  el.style.cssText = `
    position:fixed; left:-9999px; top:0;
    width:480px; background:#fffaf5;
    font-family:"Inter","Segoe UI",sans-serif;
    padding:36px 32px 40px; box-sizing:border-box;
    color:#3d2b1a;
  `;

  el.innerHTML = `
    <!-- Header -->
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:1.6rem;font-weight:800;letter-spacing:0.12em;color:#7a5c3e;">BREWS.CO</div>
      <div style="font-size:0.62rem;letter-spacing:0.18em;text-transform:uppercase;color:#b08060;margin-top:3px;">Daily Inventory Receipt</div>
      <div style="font-size:0.8rem;color:#9a7a5e;margin-top:7px;">${d.date}${d.shiftDuration ? `<span style="color:#c4a98a;margin-left:10px;font-size:0.72rem;">⏱ ${d.shiftDuration}</span>` : ""}</div>
    </div>

    <!-- Dashed divider -->
    <div style="border-top:1.5px dashed #d4b89e;margin:0 0 16px;"></div>

    <!-- Cup Sales table -->
    <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b08060;margin-bottom:8px;text-align:center;">Cup Sales</div>
    <table style="width:100%;border-collapse:collapse;font-size:0.8rem;table-layout:fixed;">
      <colgroup>
        <col style="width:22%">
        <col style="width:12%">
        <col style="width:12%">
        <col style="width:18%">
        <col style="width:12%">
        <col style="width:24%">
      </colgroup>
      <thead>
        <tr style="background:#f5ede5;">
          <th style="text-align:left;padding:6px 8px;color:#9a7a5e;font-size:.66rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Item</th>
          <th style="text-align:center;padding:6px 4px;color:#9a7a5e;font-size:.66rem;font-weight:700;text-transform:uppercase;">Beg</th>
          <th style="text-align:center;padding:6px 4px;color:#9a7a5e;font-size:.66rem;font-weight:700;text-transform:uppercase;">Cups</th>
          <th style="text-align:center;padding:6px 4px;color:#9a7a5e;font-size:.66rem;font-weight:700;text-transform:uppercase;">Price</th>
          <th style="text-align:center;padding:6px 4px;color:#9a7a5e;font-size:.66rem;font-weight:700;text-transform:uppercase;">End</th>
          <th style="text-align:right;padding:6px 8px;color:#9a7a5e;font-size:.66rem;font-weight:700;text-transform:uppercase;">Amount</th>
        </tr>
      </thead>
      <tbody>${cupRows}</tbody>
      <tfoot>
        <tr style="border-top:2px solid #d4b89e;background:#fdf7f2;">
          <td colspan="5" style="padding:7px 8px;font-weight:700;color:#7a5c3e;font-size:.85rem;">Total Cup Sales</td>
          <td style="text-align:right;padding:7px 8px;font-weight:700;color:#7a5c3e;">${fmtR(d.totalSales)}</td>
        </tr>
      </tfoot>
    </table>

    ${dmgNote}${delNote}

    <!-- Dashed divider -->
    <div style="border-top:1.5px dashed #d4b89e;margin:14px 0;"></div>

    <!-- Breakdown -->
    <table style="width:100%;border-collapse:collapse;font-size:0.84rem;">
      <tr style="border-bottom:1px solid #e8d5c4;">
        <td style="padding:6px 8px;color:#3d2b1a;font-weight:700;">Total Cup Sales</td>
        <td style="text-align:right;padding:6px 8px;color:#3d2b1a;font-weight:700;">${fmtR(d.totalSales)}</td>
      </tr>
      <tr style="border-bottom:1px solid #e8d5c4;">
        <td style="padding:6px 8px;color:#3d2b1a;font-weight:700;">Total Expenses:</td>
        <td style="text-align:right;padding:6px 8px;color:#3d2b1a;font-weight:700;">− ${fmtR(d.salary + d.expenses.reduce((s,e)=>s+e.price,0))}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0e4d8;">
        <td style="padding:3px 8px 3px 22px;color:#9a7a5e;font-size:0.8rem;">Salary + Bonus</td>
        <td style="text-align:right;padding:3px 8px;color:#9a7a5e;font-size:0.8rem;">− ${fmtR(d.salary)}</td>
      </tr>
      ${d.expenses.map(e=>`
      <tr style="border-bottom:1px solid #f0e4d8;">
        <td style="padding:3px 8px 3px 22px;color:#9a7a5e;font-size:0.8rem;">${e.name}</td>
        <td style="text-align:right;padding:3px 8px;color:#9a7a5e;font-size:0.8rem;">− ${fmtR(e.price)}</td>
      </tr>`).join("")}
      <tr style="border-bottom:1px solid #e8d5c4;">
        <td style="padding:6px 8px;color:#5c4631;">Gross Income:</td>
        <td style="text-align:right;padding:6px 8px;color:#5c4631;">${fmtR(d.grossIncome)}</td>
      </tr>
      <tr style="border-bottom:1px solid #e8d5c4;">
        <td style="padding:6px 8px;color:#5c4631;">Add-ons:</td>
        <td style="text-align:right;padding:6px 8px;color:#5c4631;">${fmtR(d.addons)}</td>
      </tr>
      <tr>
        <td style="padding:8px 8px;color:#3d2b1a;font-weight:700;font-size:0.92rem;">Final Total:</td>
        <td style="text-align:right;padding:8px 8px;color:#3d2b1a;font-weight:800;font-size:0.92rem;">${fmtR(d.finalTotal)}</td>
      </tr>
    </table>

    <!-- Footer -->
    <div style="text-align:center;margin-top:20px;font-size:0.62rem;color:#c4a98a;letter-spacing:0.1em;text-transform:uppercase;">
      Generated ${new Date().toLocaleString("en-PH")}
    </div>

    ${(() => {
      if (!includeNeeds) return "";
      const needs = getNeedsFromUI();
      const hasCups    = needs.cups.length > 0;
      const hasFlavors = needs.flavors.length > 0;
      const hasItems   = needs.items.length > 0;
      if (!hasCups && !hasFlavors && !hasItems) return "";

      const cupRows = needs.cups.map(c => `
        <tr style="border-bottom:1px solid #f0e4d8;">
          <td style="padding:5px 8px;font-size:0.82rem;color:#5c4631;">${c.label}</td>
          <td style="text-align:right;padding:5px 8px;font-size:0.82rem;font-weight:700;color:#c0665a;">${c.remaining} left ⚠</td>
        </tr>`).join("");

      const flavorRows = needs.flavors.map(f => `
        <tr style="border-bottom:1px solid #f0e4d8;">
          <td style="padding:5px 8px;font-size:0.82rem;color:#5c4631;">${f}</td>
          <td style="text-align:right;padding:5px 8px;font-size:0.76rem;color:#c0665a;font-weight:600;">Out of stock</td>
        </tr>`).join("");

      const itemRows = needs.items.map(i => `
        <tr style="border-bottom:1px solid #f0e4d8;">
          <td colspan="2" style="padding:5px 8px;font-size:0.82rem;color:#5c4631;">• ${i}</td>
        </tr>`).join("");

      const cupSection = hasCups ? `
        <tr><td colspan="2" style="padding:7px 8px 3px;font-size:0.66rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#b08060;">Cups to Restock</td></tr>
        ${cupRows}` : "";

      const flavorSection = hasFlavors ? `
        <tr><td colspan="2" style="padding:${hasCups?10:7}px 8px 3px;font-size:0.66rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#b08060;">Out-of-Stock Flavors</td></tr>
        ${flavorRows}` : "";

      const otherSection = hasItems ? `
        <tr><td colspan="2" style="padding:${hasCups||hasFlavors?10:7}px 8px 3px;font-size:0.66rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#b08060;">Other Needs</td></tr>
        ${itemRows}` : "";

      return `
        <div style="border-top:1.5px dashed #d4b89e;margin-top:18px;padding-top:14px;">
          <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b08060;text-align:center;margin-bottom:10px;">📋 Needs / Restock</div>
          <table style="width:100%;border-collapse:collapse;">
            ${cupSection}${flavorSection}${otherSection}
          </table>
        </div>`;
    })()}
  `;

  document.body.appendChild(el);

  html2canvas(el, { backgroundColor: "#fffaf5", scale: 2, useCORS: true, logging: false })
    .then(canvas => {
      document.body.removeChild(el);
      const link    = document.createElement("a");
      link.download = filename;
      link.href     = canvas.toDataURL("image/png");
      link.click();
    }).catch(() => {
      if (document.body.contains(el)) document.body.removeChild(el);
      alert("Could not save image. Try again.");
    });
}

// ── Render helper ─────────────────────────────────────────────────────────────

function renderResults(contentHTML) {
  const res = document.getElementById("results");
  res.innerHTML = contentHTML + `
    <div class="output-actions">
      <button class="primary"   onclick="saveCurrentResults()">Save to History</button>
      <button class="secondary" onclick="printReceipt()">📷 Save as Image</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px;">
      <label style="display:flex;align-items:center;gap:7px;font-size:0.82rem;font-weight:600;color:#7a5c3e;cursor:pointer;">
        <input type="checkbox" id="needsToggle" ${includeNeeds?"checked":""} onchange="includeNeeds=this.checked;"
          style="width:16px;height:16px;accent-color:#7a5c3e;cursor:pointer;">
        Include Needs in Receipt Image
      </label>
    </div>`;
  delete res.dataset.view;
  // Refresh auto-detected needs preview
  renderNeedsAutoPreview();
}
