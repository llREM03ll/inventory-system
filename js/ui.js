/**
 * ui.js
 * All DOM rendering: calculate results, expense rows, history display, clear.
 * Depends on: InventorySystem.js, storage.js, history.js
 */

let lastRenderContent = "";
let lastRenderDate    = "";

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
  const v = id => +document.getElementById(id).value || 0;

  const system = new InventorySystem();
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

  const totalExpenses = system.expenses + salary;
  html += `<table class="summary">
    <tr class="expense-header">
      <td>Total Expenses:</td>
      <td style="text-align:right">- ${formatMoney(totalExpenses)}</td>
    </tr>
    <tr class="expense-sub">
      <td>Salary + Bonus</td>
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
  renderResults(html);
  saveInputs();
  window.scrollTo({ top: document.getElementById("results").offsetTop - 20, behavior: "smooth" });
}

// ── Save to history ───────────────────────────────────────────────────────────

function saveCurrentResults() {
  if (!lastRenderContent) { alert("Please compute first."); return; }
  const dateInput  = document.getElementById("resultDate");
  const editedDate = dateInput?.value || lastRenderDate || new Date().toISOString().split("T")[0];
  saveHistory(editedDate, lastRenderContent);
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
  addExpenseRow();
  lastRenderContent = ""; lastRenderDate = "";
  clearInputStorage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Render helper ─────────────────────────────────────────────────────────────

function renderResults(contentHTML) {
  const res = document.getElementById("results");
  res.innerHTML = contentHTML + `
    <div class="output-actions">
      <button class="primary" onclick="saveCurrentResults()">Save to History</button>
      <button class="secondary" onclick="window.location.href='calendar.html'">View History</button>
    </div>`;
  delete res.dataset.view;
}
