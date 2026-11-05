const FLAVOR_OOS_KEY = "brewsFlavorOOS";
// Storage format:
//   plain "FlavorName"   → shared across milktea, icedcoffee, hotcoffee (same physical containers)
//   "FT:FlavorName"      → fruit tea only (separate containers)

function flavorKey(cat, flavor) {
  if (cat === "fruittea") return "FT:" + flavor;                                   // fruit tea containers
  if (["milktea", "icedcoffee", "hotcoffee"].includes(cat)) return flavor;         // shared containers
  return cat + ":" + flavor;                                                       // a product's own list
}
function getOOSFlavors() {
  const a = readJSON(FLAVOR_OOS_KEY, []);
  return new Set(Array.isArray(a) ? a : []);
}
function saveOOSFlavors(set) {
  localStorage.setItem(FLAVOR_OOS_KEY, JSON.stringify([...set]));
}
function isFlavorOOS(cat, flavor) {
  return getOOSFlavors().has(flavorKey(cat, flavor));
}
function toggleFlavorOOS(cat, flavor) {
  const set = getOOSFlavors();
  const key = flavorKey(cat, flavor);
  if (set.has(key)) set.delete(key); else set.add(key);
  saveOOSFlavors(set);
}

function toggleFlavorOOSBtn(btn) {
  toggleFlavorOOS(btn.dataset.cat, btn.dataset.f);
  renderFlavorSettings();
}

function openFlavorSettings() {
  renderFlavorSettings();
  document.getElementById("flavorSettingsModal").classList.add("open");
}
function closeFlavorSettings() {
  document.getElementById("flavorSettingsModal").classList.remove("open");
  // Refresh drink buttons in case oos status changed
  renderDrinkButtons();
}
function handleFlavorSettingsOverlay(e) {
  if (e.target === document.getElementById("flavorSettingsModal")) closeFlavorSettings();
}

function renderFlavorSettings() {
  const body = document.getElementById("flavorSettingsBody");
  const SHARED_GROUP = ["milktea","icedcoffee","hotcoffee"];

  // Build shared map within the coffee/milktea group
  const sharedMap = {};
  SHARED_GROUP.forEach(cat => {
    (FLAVORS[cat] || []).forEach(f => {
      if (!sharedMap[f]) sharedMap[f] = [];
      sharedMap[f].push(cat);
    });
  });

  body.innerHTML = `
    <div style="background:#fdf5eb;border:1.5px solid var(--latte);border-radius:11px;padding:10px 13px;font-size:0.78rem;color:var(--bark);margin-bottom:14px;line-height:1.55;">
      ☕ Same-named flavors in Milk Tea, Iced Coffee & Hot Coffee share one container — toggling one marks it out across all three. Fruit Tea has separate containers.
    </div>` +
  Object.entries(FLAVORS).map(([cat, flavors]) => {
    const sorted = [...flavors].sort((a,b) => a.localeCompare(b));
    const pills = sorted.map(f => {
      const oos = isFlavorOOS(cat, f);
      return `<button class="fsettings-pill${oos?" oos":""}"
        data-cat="${esc(cat)}" data-f="${esc(f)}" onclick="toggleFlavorOOSBtn(this)">
        <span style="flex:1;text-align:left;">${esc(f)}</span>
        <span class="fsettings-dot"></span>
      </button>`;
    }).join("");
    return `<div class="fsettings-cat">
      <div class="fsettings-cat-title">${esc(flavorLabel(cat))}</div>
      <div class="fsettings-grid">${pills}</div>
    </div>`;
  }).join("");
}

// ════════════════════════════════════════════════════
//  CATALOGUE  (built from settings at runtime)
// ════════════════════════════════════════════════════

function buildCatalogue() {
  const cfg = getSettings();
  DRINKS.length = 0;
  loadMenuDrinks().forEach(d => DRINKS.push(d));

  ADDONS.length = 0;
  Object.entries(cfg.addonPrices).forEach(([name, price]) => ADDONS.push({ name, price }));

  Object.keys(FLAVORS).forEach(k => delete FLAVORS[k]);
  Object.assign(FLAVORS, cfg.flavors);
}

// Called by menu.js after any add / edit / delete / reorder
window.onMenuChanged = () => { buildCatalogue(); renderDrinkButtons(); };

const DRINKS  = [];
const ADDONS  = [];
const FLAVORS = {};


const RECEIPT_MS       = 5500;
const POS_KEY          = "brewsPOSState";
const SHIFT_KEY        = "brewsShiftResult";
const SHIFT_ACTIVE_KEY = "brewsShiftActive";

function getLowStock() { return getSettings().lowStock ?? 5; }
function getQuotaStart() { return getSettings().quotaStart ?? 3000; }

// ════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════
let state = {
  begM:0, begL:0, begS:0, begHC:0,
  currentItems:  [],       // each item now carries its own { addons: {name: qty} }
  orders:        [],
  shiftTotal:    0,
  expenses:      [],
  pendingPaidOnline: false, // Paid Online (GCash) toggle for the order being built
  shiftStartTime: null,  // timestamp ms
};

const GCASH_EXPENSE_NAME = "GCash (Paid Online)";

let flavorToastTimer = null;
let pendingDrink = null;
function showFlavorToast(msg, kind) {
  const t = document.getElementById("flavorToast");
  if (!t) return;
  t.textContent = msg;
  t.classList.toggle("neutral", kind === "neutral");
  t.classList.add("show");
  if (flavorToastTimer) clearTimeout(flavorToastTimer);
  flavorToastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}
let receiptTimer       = null;
let clockInterval      = null;
let nextQuotaThreshold = 0; // set properly on startShift/resumeShift from settings

// ════════════════════════════════════════════════════
//  PERSISTENCE
// ════════════════════════════════════════════════════
function saveState() { localStorage.setItem(POS_KEY, JSON.stringify(state)); }
function loadState() {
  try { const r = localStorage.getItem(POS_KEY); if (r) state = JSON.parse(r); } catch {}
}
function clearPOSState() {
  localStorage.removeItem(POS_KEY);
  localStorage.removeItem(SHIFT_ACTIVE_KEY);
}

// ════════════════════════════════════════════════════
//  SALES TALLY — persistent, all-time best-seller tracking
//  (separate from the shift-scoped order log; never reset by End Shift)
// ════════════════════════════════════════════════════
const SALES_TALLY_KEY = "brewsSalesTally";

function getSalesTally() {
  try { return readJSON(SALES_TALLY_KEY, {}); } catch { return {}; }
}
function saveSalesTally(t) { localStorage.setItem(SALES_TALLY_KEY, JSON.stringify(t)); }

// qtyDelta is a raw cup count (+/-), applied against one cart/order item.
function bumpSalesTallyDelta(item, qtyDelta) {
  if (!qtyDelta) return;
  const tally = getSalesTally();
  const key = item.code + "|" + (item.flavor || "");
  if (!tally[key]) tally[key] = { name: item.name, flavor: item.flavor || "", qty: 0, revenue: 0 };
  const unitRevenue = item.unitPrice + getItemAddonTotal(item); // per-cup, incl. its own add-ons
  tally[key].qty     += qtyDelta;
  tally[key].revenue += unitRevenue * qtyDelta;
  if (tally[key].qty <= 0) delete tally[key];
  saveSalesTally(tally);
}

// Applies a whole order's items at once (sign = +1 to add, -1 to reverse/void/undo).
function bumpSalesTally(items, sign) {
  (items || []).forEach(it => bumpSalesTallyDelta(it, sign * it.qty));
}


// ════════════════════════════════════════════════════
//  ORDER LOG — save full shift orders for history page
// ════════════════════════════════════════════════════
const ORDER_LOG_KEY  = "brewsOrderLog";
const RETENTION_KEY  = "brewsOrderRetention";

function saveOrderLog() {
  const logDate = localDate();
  const logs    = readJSON(ORDER_LOG_KEY, []);
  const idx     = logs.findIndex(l => l.date === logDate);
  const entry   = { date: logDate, orders: state.orders, savedAt: Date.now() };
  if (idx >= 0) logs[idx] = entry; else logs.push(entry);
  localStorage.setItem(ORDER_LOG_KEY, JSON.stringify(logs));
}

function cleanupOrderLogs() {
  const days   = parseInt(localStorage.getItem(RETENTION_KEY) || "7");
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const logs   = readJSON(ORDER_LOG_KEY, []);
  const kept   = logs.filter(l => {
    const ts = l.savedAt || new Date(l.date + "T23:59:59").getTime();
    return ts > cutoff;
  });
  localStorage.setItem(ORDER_LOG_KEY, JSON.stringify(kept));
}

// ════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════
function timeNow() {
  return new Date().toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit"});
}
function vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); }

// Which cup stock an order line uses ("" = none, e.g. food)
function itemCup(i) {
  if (i.cup !== undefined) return i.cup;
  return DRINKS.find(d => d.code === i.code)?.cup || "";
}

// Cups used so far, by cup size
function usedByCup(includeCart) {
  const used = {M:0,L:0,S:0,HC:0};
  const add = i => { const c = itemCup(i); if (c) used[c] = (used[c]||0) + i.qty; };
  state.orders.forEach(o => o.items.forEach(add));
  if (includeCart) state.currentItems.forEach(add);
  return used;
}

function remainingCups() {
  const used = usedByCup(true);
  const del = state.deliveries || {M:0,L:0,S:0,HC:0};
  const dmg = state.damages    || {M:0,L:0,S:0,HC:0};
  return {
    M:  state.begM  + (del.M||0)  - (dmg.M||0)  - (used.M||0),
    L:  state.begL  + (del.L||0)  - (dmg.L||0)  - (used.L||0),
    S:  state.begS  + (del.S||0)  - (dmg.S||0)  - (used.S||0),
    HC: state.begHC + (del.HC||0) - (dmg.HC||0) - (used.HC||0),
  };
}

function getQtyForCode(code) {
  return state.currentItems.filter(i=>i.code===code).reduce((s,i)=>s+i.qty,0);
}

function getItemTotal() {
  return state.currentItems.reduce((s,i) => s + i.unitPrice * i.qty, 0);
}

// Add-ons now live on each cart item (per-cup), e.g. item.addons = { "Pearl": 1 }
// The qty stored is "per cup" and scales with the item's own qty.
function getItemAddonTotal(item) {
  return Object.entries(item.addons || {}).reduce((s,[name,qty]) => {
    const a = ADDONS.find(a=>a.name===name);
    return s + (a ? a.price * qty : 0);
  }, 0);
}

function getAddonTotal() {
  return state.currentItems.reduce((s,item) => s + getItemAddonTotal(item) * item.qty, 0);
}

function getOrderTotal() { return getItemTotal() + getAddonTotal(); }

// ── Per-cup customization helpers ──────────────────────────────────────────
// A cart line is either "plain" (key = code||flavor, can hold many identical cups)
// or "customized" (key = code||flavor#uid, always a single cup with its own
// add-ons + notes). Customizing one cup of a multi-cup line splits it off.
const NOTE_PRESETS = ["Less sugar", "No sugar", "Extra sugar", "Less ice", "No ice", "Extra ice"];
const newUid = () => Math.random().toString(36).slice(2, 8);
const baseKey = key => String(key).split("#")[0];

function itemNoteList(item) {
  const n = [...(item.notes || [])];
  if (item.noteText && item.noteText.trim()) n.push(item.noteText.trim());
  return n;
}
function isCustomized(item) {
  return Object.keys(item.addons || {}).length > 0 || itemNoteList(item).length > 0;
}

// Aggregate an already-placed order's per-item add-ons into a flat { name: totalQty } map
// (totalQty already accounts for each item's cup quantity).
function aggregateOrderAddons(order) {
  const map = {};
  (order.items || []).forEach(it => {
    Object.entries(it.addons || {}).forEach(([name, qty]) => {
      map[name] = (map[name] || 0) + qty * it.qty;
    });
  });
  return map;
}

// ════════════════════════════════════════════════════
//  CLOCK + SHIFT TIMER
// ════════════════════════════════════════════════════
function fmtElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const h     = Math.floor(total / 3600);
  const m     = Math.floor((total % 3600) / 60);
  const s     = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,"0")}m`;
  return `${m}m ${String(s).padStart(2,"0")}s`;
}

function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  // Old saved shifts may have no start time: fall back to the first order, else now
  if (!state.shiftStartTime) state.shiftStartTime = state.orders[0]?.id > 1e12 ? state.orders[0].id : Date.now();
  const tick = () => {
    const clockEl = document.getElementById("posClock");
    if (clockEl) clockEl.textContent = timeNow();
    const timerEl = document.getElementById("shiftTimer");
    if (timerEl && state.shiftStartTime)
      timerEl.textContent = fmtElapsed(Math.max(0, Date.now() - state.shiftStartTime));
  };
  tick();
  clockInterval = setInterval(tick, 1000);
}

// ════════════════════════════════════════════════════
//  SETUP → START SHIFT
// ════════════════════════════════════════════════════
function startShift() {
  const begM  = Math.max(0, +document.getElementById("setupBegM").value  || 0);
  const begL  = Math.max(0, +document.getElementById("setupBegL").value  || 0);
  const begS  = Math.max(0, +document.getElementById("setupBegS").value  || 0);
  const begHC = Math.max(0, +document.getElementById("setupBegHC").value || 0);

  if (begM + begL + begS + begHC === 0) {
    const err = document.getElementById("setupError");
    err.textContent = "⚠ Enter at least one cup count before starting the shift.";
    err.style.display = "block";
    setTimeout(() => { err.style.display = "none"; }, 3500);
    return;
  }

  state.begM  = begM;
  state.begL  = begL;
  state.begS  = begS;
  state.begHC = begHC;
  state.currentItems=[]; state.pendingPaidOnline=false; state.orders=[]; state.shiftTotal=0; state.expenses=[];
  state.deliveries = {M:0,L:0,S:0,HC:0};
  state.damages    = {M:0,L:0,S:0,HC:0};
  state.shiftStartTime = Date.now();
  localStorage.removeItem("brewsShiftMs");
  nextQuotaThreshold = getQuotaStart();
  localStorage.removeItem("brewsResumeShift");
  localStorage.setItem(SHIFT_ACTIVE_KEY, "1");
  saveState(); showPOS();
}

function showSetup() {
  document.getElementById("setupScreen").style.display="flex";
  document.getElementById("posScreen").style.display="none";
  if(clockInterval) clearInterval(clockInterval);
  const resumeSec = document.getElementById("resumeSection");
  if (resumeSec) resumeSec.style.display = localStorage.getItem("brewsResumeShift") ? "block" : "none";
}

function showPOS() {
  document.getElementById("setupScreen").style.display="none";
  document.getElementById("posScreen").style.display="flex";
  renderDrinkButtons(); renderCurrentOrder();
  renderOrdersLog(); updateHeaderStats(); startClock();
  renderPosExpenses();
  renderStockInputs();
  // Attach swipe-to-dismiss on all modal overlays
  attachSwipeToDismiss("receiptModal",        closeReceiptModal);
  attachSwipeToDismiss("endShiftModal",       closeEndShift);
  attachSwipeToDismiss("flavorSettingsModal", closeFlavorSettings);
}

function resumeShift() {
  const raw = localStorage.getItem("brewsResumeShift");
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    state.begM  = s.begM  || 0; state.begL  = s.begL  || 0;
    state.begS  = s.begS  || 0; state.begHC = s.begHC || 0;
    state.orders      = s.orders      || [];
    state.shiftTotal  = s.shiftTotal  || 0;
    state.expenses    = s.expenses    || [];
    state.deliveries = s.deliveries || {M:0,L:0,S:0,HC:0};
    state.damages    = s.damages    || {M:0,L:0,S:0,HC:0};
    // Keep the timer going from where the shift stopped
    state.shiftStartTime = Date.now() - (s.elapsedMs || 0);
    state.currentItems  = [];
    state.pendingPaidOnline = false;
    // Restore correct next quota milestone
    const cupsSoFar = state.orders.reduce((t,o)=>t+o.items.reduce((s,i)=>s+i.unitPrice*i.qty,0),0);
    const qs = getQuotaStart();
    nextQuotaThreshold = Math.max(qs, (Math.floor(cupsSoFar / 1000) + 1) * 1000);
    localStorage.removeItem("brewsResumeShift");
    localStorage.setItem(SHIFT_ACTIVE_KEY, "1");
    saveState(); showPOS();
  } catch { localStorage.removeItem("brewsResumeShift"); }
}

// ════════════════════════════════════════════════════
//  DRINK BUTTONS
// ════════════════════════════════════════════════════
function renderDrinkButtons() {
  const rem  = remainingCups();
  const grid = document.getElementById("drinksGrid");
  grid.innerHTML = "";
  if (menuEditing) { renderMenuEditTiles(grid); return; }

  DRINKS.filter(d => !d.hidden).forEach(d => {
    const qty  = getQtyForCode(d.code);
    const left = d.cup ? (rem[d.cup] ?? 999) : 999;
    const low  = d.cup && left > 0 && left <= getLowStock();
    const out  = d.cup && left <= 0;
    const cls  = ["drink-btn",
      qty > 0 ? "has-qty"   : "",
      low      ? "low-stock" : "",
      out      ? "out-stock" : "",
    ].filter(Boolean).join(" ");

    const btn = document.createElement("button");
    btn.className = cls + (d.color ? " custom" : "");
    if (d.color) btn.style.cssText = drinkTileStyle(d);
    btn.innerHTML = `
      <span class="qty-badge" id="badge-${d.code}">${qty}</span>
      ${drinkIconHTML(d)}
      <span class="drink-btn-code">${d.code}</span>
      <span class="drink-btn-name">${esc(d.name)}</span>
      <span class="drink-btn-price">${fmt(d.price)}</span>
      ${d.cup ? `<span class="stock-pill">${out ? "OUT" : low ? `${left} left` : left}</span>` : ""}
    `;
    attachHold(btn,
      () => { if (out) { vibe("error"); return; } if (d.flav) openFlavorModal(d); else addItemToOrder(d, ""); },
      () => { removeOneCup(d.code); });
    grid.appendChild(btn);
  });
}

// ════════════════════════════════════════════════════
//  FLAVOR MODAL
// ════════════════════════════════════════════════════
function openFlavorModal(drink) {
  pendingDrink = drink;
  document.getElementById("flavorModal").classList.add("open");
  const search = document.getElementById("flavorSearchInput");
  search.value = "";
  refreshFlavorGrid(drink);
}

// Unified tap / press-and-hold handler (pointer events: no duplicate touch+mouse firing).
function attachHold(el, onTap, onHold, ms = 500) {
  let timer = null, fired = false, sx = 0, sy = 0;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener("pointerdown", e => {
    cancel(); fired = false; sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => { timer = null; fired = true; vibrate(40); onHold(); }, ms);
  });
  el.addEventListener("pointermove", e => {
    if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => el.addEventListener(ev, cancel));
  el.addEventListener("contextmenu", e => e.preventDefault());
  el.addEventListener("click", e => {
    if (fired) { fired = false; e.preventDefault(); return; }
    onTap();
  });
}

// Removes one cup of a drink (optionally of a specific flavor) from the current order.
// Plain cups go first so a customized cup isn't lost by accident.
function removeOneCup(code, flavor) {
  const match = i => i.code === code && (flavor === undefined || i.flavor === flavor);
  let idx = -1;
  for (let n = state.currentItems.length - 1; n >= 0; n--) {
    if (match(state.currentItems[n]) && !isCustomized(state.currentItems[n])) { idx = n; break; }
  }
  if (idx < 0) {
    for (let n = state.currentItems.length - 1; n >= 0; n--) {
      if (match(state.currentItems[n])) { idx = n; break; }
    }
  }
  if (idx < 0) return null;
  const it = state.currentItems[idx];
  if (it.qty > 1) it.qty--; else state.currentItems.splice(idx, 1);
  vibe("tap");
  saveState(); renderDrinkButtons(); renderCurrentOrder();
  if (pendingDrink) { refreshFlavorGrid(pendingDrink); showFlavorToast("Removed 1× " + (it.flavor || it.name), "neutral"); }
  return it;
}

function refreshFlavorGrid(drink) {
  document.getElementById("flavorModalTitle").textContent = drink.name;
  document.getElementById("flavorModalSub").textContent   =
    fmt(drink.price) + " per cup  ·  tap to add  ·  hold to remove";

  const cat     = drink.flav || "milktea";
  const flavors = [...(FLAVORS[cat] || [])].sort((a,b) => a.localeCompare(b));
  const grid    = document.getElementById("flavorGrid");
  const keepScroll = grid.parentElement ? grid.parentElement.scrollTop : 0;
  grid.innerHTML = "";

  const countInOrder = (flavor) =>
    state.currentItems.filter(i => i.code === drink.code && i.flavor === flavor)
                       .reduce((s, i) => s + i.qty, 0);

  // No flavor option (always visible, exempt from search filtering)
  const noCount  = countInOrder("");
  const noFlavor = document.createElement("button");
  noFlavor.className = "flavor-btn no-flavor";
  noFlavor.innerHTML = noCount > 0
    ? `No Flavor <span class="flavor-count">${noCount}</span>`
    : "No Flavor";
  attachHold(noFlavor, () => addItemToOrder(drink, ""), () => removeOneCup(drink.code, ""));
  grid.appendChild(noFlavor);

  flavors.forEach(f => {
    const count  = countInOrder(f);
    const oos    = isFlavorOOS(cat, f);
    const btn    = document.createElement("button");
    btn.className = "flavor-btn" + (count > 0 ? " selected" : "") + (oos ? " oos-flavor" : "");
    btn.dataset.name = f.toLowerCase();
    if (oos) {
      btn.style.opacity = ".45"; btn.style.textDecoration = "line-through"; btn.style.cursor = "not-allowed";
      btn.disabled = true;
    }
    btn.innerHTML = count > 0
      ? `<span class="flavor-btn-label">${esc(f)}</span> <span class="flavor-count">${count}</span>`
      : `<span class="flavor-btn-label">${esc(f)}</span>`;
    if (!oos) attachHold(btn, () => addItemToOrder(drink, f), () => removeOneCup(drink.code, f));
    grid.appendChild(btn);
  });

  // Re-apply an active search filter and keep scroll position after re-render
  const q = document.getElementById("flavorSearchInput").value;
  if (q) filterFlavorGrid(q);
  if (grid.parentElement) grid.parentElement.scrollTop = keepScroll;
}

// Live-filters the flavor grid as the person types (name substring match).
function filterFlavorGrid(query) {
  const q     = query.trim().toLowerCase();
  const grid  = document.getElementById("flavorGrid");
  const btns  = grid.querySelectorAll(".flavor-btn:not(.no-flavor)");
  let visible = 0;
  btns.forEach(btn => {
    const match = !q || (btn.dataset.name || "").includes(q);
    btn.style.display = match ? "" : "none";
    if (match) visible++;
  });
  let empty = grid.querySelector(".flavor-empty-msg");
  if (!visible && q) {
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "flavor-empty-msg";
      empty.textContent = "No flavors match “" + query.trim() + "”";
      grid.appendChild(empty);
    }
  } else if (empty) {
    empty.remove();
  }
}

function closeFlavorModal() {
  document.getElementById("flavorModal").classList.remove("open");
  pendingDrink = null;
}

// ════════════════════════════════════════════════════
//  CURRENT ORDER
// ════════════════════════════════════════════════════
function addItemToOrder(drink, flavor) {
  const rem  = remainingCups();
  const left = drink.cup ? (rem[drink.cup] ?? 0) : 999;
  if (left <= 0) {
    vibe("error");
    showFlavorToast(`Out of ${drink.cup} cups!`);
    // Shake the flavor grid
    const grid = document.getElementById("flavorGrid");
    grid.style.animation = "none";
    void grid.offsetWidth;
    grid.style.animation = "shakeGrid .35s ease";
    return;
  }

  vibe("tap"); playSound("tap");
  const key = drink.code + "||" + flavor;
  const existing = state.currentItems.find(i => i.key === key);
  if (existing) { existing.qty++; }
  else {
    state.currentItems.push({ key, code:drink.code, name:drink.name, icon:drink.icon,
      flavor, qty:1, unitPrice:drink.price, cup:drink.cup, addons:{}, notes:[], noteText:"" });
  }
  saveState(); renderDrinkButtons(); renderCurrentOrder();
  const badge = document.getElementById(`badge-${drink.code}`);
  if (badge) { badge.classList.remove("pop"); void badge.offsetWidth; badge.classList.add("pop"); }
  if (document.getElementById("flavorModal").classList.contains("open")) refreshFlavorGrid(drink);
}

function setItemQty(key, qty) {
  vibe("tap");
  if (qty <= 0) state.currentItems = state.currentItems.filter(i => i.key !== key);
  else { const it = state.currentItems.find(i=>i.key===key); if(it) it.qty = qty; }
  saveState(); renderDrinkButtons(); renderCurrentOrder();
}

function clearCurrentOrder() {
  state.currentItems=[]; state.pendingPaidOnline=false;
  document.getElementById("givenInput").value="";
  document.getElementById("changeDisplay").textContent="Change: —";
  saveState(); renderDrinkButtons(); renderCurrentOrder();
}

function itemChipsHTML(item) {
  const addons = Object.entries(item.addons || {})
    .map(([name, qty]) => `<span class="addon-chip">+ ${qty > 1 ? qty + "× " : ""}${esc(name)}</span>`);
  const notes = itemNoteList(item).map(n => `<span class="note-tag">${esc(n)}</span>`);
  return [...addons, ...notes].join("");
}

function renderCurrentOrder() {
  const container = document.getElementById("orderItems");
  const subtotal  = getOrderTotal();
  document.getElementById("orderSubtotal").textContent = fmt(subtotal);
  const placeBtn = document.getElementById("placeOrderBtn");
  placeBtn.disabled    = state.currentItems.length === 0;
  placeBtn.textContent = state.currentItems.length ? `Place Order · ${fmt(subtotal)}` : "Place Order";
  updatePendingPaidOnlineBtn();

  // Undo button visibility
  const undoBtn = document.getElementById("undoBtn");
  if (state.orders.length > 0) undoBtn.classList.add("visible");
  else undoBtn.classList.remove("visible");

  if (!state.currentItems.length) {
    container.innerHTML = `<div class="empty-order">Tap a drink to start an order</div>`;
    updateChange(); return;
  }

  container.innerHTML = state.currentItems.map(item => {
    const chips     = itemChipsHTML(item);
    const lineTotal = (item.unitPrice + getItemAddonTotal(item)) * item.qty;
    const hint      = item.qty > 1 ? "Customize a cup" : "Add-ons & notes";
    return `
    <div class="order-item" data-key="${esc(item.key)}">
      <div class="order-item-info" onclick="openItemAddonModal(this.parentElement.dataset.key)">
        <div class="order-item-name">${esc(item.name)} <span class="order-item-code">${esc(item.code)}</span></div>
        ${item.flavor ? `<div class="order-item-flavor">${esc(item.flavor)}</div>` : ""}
        ${chips
          ? `<div class="order-item-addons">${chips}</div>`
          : `<div class="order-item-addons muted">${hint}</div>`}
      </div>
      <div class="order-item-qty-controls">
        <button class="qty-btn" onclick="event.stopPropagation();setItemQty(this.closest('.order-item').dataset.key, ${item.qty-1})">−</button>
        <span class="order-item-qty">${item.qty}</span>
        <button class="qty-btn" onclick="event.stopPropagation();setItemQty(this.closest('.order-item').dataset.key, ${item.qty+1})">+</button>
      </div>
      <span class="order-item-total">${fmt(lineTotal)}</span>
    </div>
  `; }).join("");

  updateChange();
}

// ════════════════════════════════════════════════════
//  CUSTOMIZE CUP  (add-ons + notes, per cup — tap a line in the current order)
// ════════════════════════════════════════════════════
let pendingAddonItemKey = null;

function currentCustomizeItem() {
  return state.currentItems.find(i => i.key === pendingAddonItemKey);
}

let pendingPickKey = null;

function openCupPicker(key) {
  const item = state.currentItems.find(i => i.key === key);
  if (!item) return;
  pendingPickKey = key;
  document.getElementById("cupPickSub").textContent =
    item.name + (item.flavor ? " · " + item.flavor : "") + " · tap the cup to customize";
  const list = document.getElementById("cupPickList");
  list.innerHTML = "";
  for (let n = 1; n <= item.qty; n++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cup-pick-btn";
    b.innerHTML = `<span>Cup ${n}<span class="cup-pick-sub">${esc(item.flavor || "No flavor")} · ${fmt(item.unitPrice)}</span></span><span class="cup-pick-go">Customize ›</span>`;
    b.addEventListener("click", () => {
      vibe("tap");
      const k = pendingPickKey;
      closeCupPicker();
      openItemAddonModal(k, true);   // that cup leaves the stack
    });
    list.appendChild(b);
  }
  document.getElementById("cupPickModal").classList.add("open");
}

function closeCupPicker() {
  document.getElementById("cupPickModal").classList.remove("open");
  pendingPickKey = null;
}

function openItemAddonModal(key, fromPicker) {
  let item = state.currentItems.find(i => i.key === key);
  if (!item) return;

  // A stack of several cups: let the person choose which cup to customize first.
  if (item.qty > 1 && !fromPicker) { openCupPicker(key); return; }

  if (item.qty > 1) {
    // Split ONE cup off the group so add-ons/notes only affect that cup.
    item.qty--;
    const cup = { ...item, qty: 1, key: baseKey(item.key) + "#" + newUid(),
      addons: { ...(item.addons || {}) }, notes: [...(item.notes || [])], noteText: item.noteText || "" };
    state.currentItems.splice(state.currentItems.indexOf(item) + 1, 0, cup);
    item = cup;
  } else if (!item.key.includes("#")) {
    item.key = item.key + "#" + newUid();
  }
  if (!item.addons) item.addons = {};
  if (!item.notes)  item.notes  = [];
  pendingAddonItemKey = item.key;
  saveState();

  document.getElementById("itemAddonModalTitle").textContent = "Customize Cup";
  document.getElementById("itemAddonModalSub").textContent =
    item.name + (item.flavor ? " · " + item.flavor : "") + " · this cup only";
  document.getElementById("itemNoteInput").value = item.noteText || "";
  document.getElementById("itemAddonModal").classList.add("open");
  renderItemAddonGrid();
  renderItemNoteChips();
  renderCurrentOrder();
}

function closeItemAddonModal() {
  document.getElementById("itemAddonModal").classList.remove("open");
  const item = currentCustomizeItem();
  pendingAddonItemKey = null;
  if (item && !isCustomized(item)) {
    // Nothing was customized: fold the cup back into its plain group.
    const plain = baseKey(item.key);
    const group = state.currentItems.find(i => i.key === plain && i !== item);
    if (group) { group.qty += item.qty; state.currentItems = state.currentItems.filter(i => i !== item); }
    else item.key = plain;
  }
  saveState(); renderDrinkButtons(); renderCurrentOrder();
}

function renderItemAddonGrid() {
  const grid = document.getElementById("itemAddonGrid");
  grid.innerHTML = "";
  const item = currentCustomizeItem();
  if (!item) return;

  ADDONS.forEach(a => {
    const qty  = item.addons[a.name] || 0;
    const pill = document.createElement("div");
    pill.className = "addon-pill" + (qty > 0 ? " active" : "");
    pill.setAttribute("role", "button");
    pill.innerHTML = `<span class="addon-pill-name">${esc(a.name)}${qty > 0 ? ` <span class="addon-pill-qty">×${qty}</span>` : ""}</span>
      <span class="addon-pill-price">+${fmt(a.price)}</span>
      ${qty > 0 ? `<span class="addon-minus" role="button" aria-label="Remove one ${esc(a.name)}">−</span>` : ""}`;
    pill.addEventListener("click", e => {
      vibe("tap");
      if (e.target.closest(".addon-minus")) {
        item.addons[a.name]--;
        if (!item.addons[a.name]) delete item.addons[a.name];
      } else {
        item.addons[a.name] = (item.addons[a.name] || 0) + 1;
      }
      saveState(); renderItemAddonGrid(); renderCurrentOrder();
    });
    grid.appendChild(pill);
  });
}

function renderItemNoteChips() {
  const wrap = document.getElementById("itemNoteChips");
  wrap.innerHTML = "";
  const item = currentCustomizeItem();
  if (!item) return;
  NOTE_PRESETS.forEach(n => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "note-chip" + (item.notes.includes(n) ? " active" : "");
    b.textContent = n;
    b.addEventListener("click", () => {
      vibe("tap");
      const i = item.notes.indexOf(n);
      if (i >= 0) item.notes.splice(i, 1); else item.notes.push(n);
      saveState(); renderItemNoteChips(); renderCurrentOrder();
    });
    wrap.appendChild(b);
  });
}

function onItemNoteInput(value) {
  const item = currentCustomizeItem();
  if (!item) return;
  item.noteText = value;
  saveState(); renderCurrentOrder();
}

// ════════════════════════════════════════════════════
//  PAID ONLINE (GCash) — pending toggle for the order being built
// ════════════════════════════════════════════════════
function togglePendingPaidOnline() {
  vibe("tap");
  state.pendingPaidOnline = !state.pendingPaidOnline;
  saveState();
  updatePendingPaidOnlineBtn();
}

function updatePendingPaidOnlineBtn() {
  const btn = document.getElementById("pendingPaidOnlineBtn");
  if (!btn) return;
  btn.classList.toggle("active", !!state.pendingPaidOnline);
  btn.textContent = state.pendingPaidOnline ? "✓ Paid Online (GCash)" : "Paid Online (GCash)";
}

// ════════════════════════════════════════════════════
//  CHANGE CALCULATOR
// ════════════════════════════════════════════════════
function updateChange() {
  const given    = parseFloat(document.getElementById("givenInput").value) || 0;
  const subtotal = getOrderTotal();
  const display  = document.getElementById("changeDisplay");
  if (!given || subtotal === 0) { display.textContent="Change: —"; display.className="change-display"; return; }
  const change = given - subtotal;
  display.textContent = change >= 0 ? `Change: ${fmt(change)}` : `Short: ${fmt(Math.abs(change))}`;
  display.className   = "change-display" + (change < 0 ? " negative" : "");
}

// ════════════════════════════════════════════════════
//  PLACE ORDER
// ════════════════════════════════════════════════════
function placeOrder() {
  if (!state.currentItems.length) return;
  vibe("place");
  playSound("place");

  const given      = parseFloat(document.getElementById("givenInput").value) || 0;
  const addonTotal = getAddonTotal();
  const total      = getItemTotal() + addonTotal;
  const order = {
    id: state.orders.reduce((m, o) => Math.max(m, o.id || 0), 0) + 1,   // never reuse an id, even after a void
    items: state.currentItems.map(i => ({ ...i, addons: { ...(i.addons||{}) }, notes: [...(i.notes||[])] })), // each cup keeps its own add-ons + notes
    total,
    time: timeNow(),
    given,
    paidOnline: !!state.pendingPaidOnline,
    done: false,
  };

  state.orders.push(order);
  state.shiftTotal += total;
  bumpSalesTally(order.items, 1);
  state.currentItems=[]; state.pendingPaidOnline=false;
  document.getElementById("givenInput").value="";
  saveState();
  syncGcashExpense();

  // Notify at ₱3,000 then every ₱1,000 milestone (cup sales only)
  const _cupSales = computeShiftCupTotal();
  while (_cupSales >= nextQuotaThreshold) {
    showQuotaToast(nextQuotaThreshold);
    nextQuotaThreshold += 1000;
  }

  renderDrinkButtons(); renderCurrentOrder();
  renderOrdersLog(); updateHeaderStats(); showReceipt(order);

  const badge=document.getElementById("ordersCountBadge");
  badge.classList.remove("pulse"); void badge.offsetWidth; badge.classList.add("pulse");
}

// ════════════════════════════════════════════════════
//  MID-SHIFT STOCK (DELIVERIES & DAMAGES)
// ════════════════════════════════════════════════════
function openStockModal()  { vibe("tap"); document.getElementById("stockModal").classList.add("open"); }
function closeStockModal() { document.getElementById("stockModal").classList.remove("open"); }

function saveStockInputs() {
  const g = id => Math.max(0, parseInt(document.getElementById(id)?.value) || 0);
  state.deliveries = { M:g("sDelM"), L:g("sDelL"), S:g("sDelS"), HC:g("sDelHC") };
  state.damages    = { M:g("sDmgM"), L:g("sDmgL"), S:g("sDmgS"), HC:g("sDmgHC") };
  saveState();
  renderDrinkButtons(); // refresh stock counts on drink buttons immediately
  // Update badge in panel header
  const totalDel = Object.values(state.deliveries).reduce((a,b)=>a+b,0);
  const totalDmg = Object.values(state.damages).reduce((a,b)=>a+b,0);
  const badge = document.getElementById("stockBadge");
  if (badge) {
    if (totalDel > 0 || totalDmg > 0) {
      const parts = [];
      if (totalDel > 0) parts.push(`+${totalDel} del`);
      if (totalDmg > 0) parts.push(`−${totalDmg} dmg`);
      badge.textContent = parts.join(" · ");
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  }
}

function renderStockInputs() {
  const del = state.deliveries || {M:0,L:0,S:0,HC:0};
  const dmg = state.damages    || {M:0,L:0,S:0,HC:0};
  const sv = (id, val) => { const el=document.getElementById(id); if(el) el.value = val||""; };
  sv("sDelM",del.M); sv("sDelL",del.L); sv("sDelS",del.S); sv("sDelHC",del.HC);
  sv("sDmgM",dmg.M); sv("sDmgL",dmg.L); sv("sDmgS",dmg.S); sv("sDmgHC",dmg.HC);
  saveStockInputs(); // refresh badge
}

// ════════════════════════════════════════════════════
//  UNDO LAST ORDER
// ════════════════════════════════════════════════════
function undoLastOrder() {
  if (!state.orders.length) return;
  vibe("undo");
  const last = state.orders.pop();
  state.shiftTotal -= last.total;
  bumpSalesTally(last.items, -1);
  saveState(); renderDrinkButtons(); renderCurrentOrder(); renderOrdersLog(); updateHeaderStats();
  if (last.paidOnline) syncGcashExpense();
}

function toggleOrderDone(id) {
  const order = state.orders.find(o => o.id === id);
  if (order) { order.done = !order.done; saveState(); renderOrdersLog(); }
}

// ── Void a specific order (any position, not just the last one) ──────────────
function voidOrder(id) {
  const order = state.orders.find(o => o.id === id);
  if (!order) return;
  if (!confirm(`Void this order (${fmt(order.total)})? This can't be undone.`)) return;
  vibe("undo");
  state.orders = state.orders.filter(o => o.id !== id);
  state.shiftTotal -= order.total;
  bumpSalesTally(order.items, -1);
  saveState();
  renderDrinkButtons(); renderCurrentOrder(); renderOrdersLog(); updateHeaderStats();
  if (order.paidOnline) syncGcashExpense();
}

// ── Paid Online (GCash): toggling a placed order auto adds/removes its total
//    from a dedicated "GCash (Paid Online)" shift expense, so the cash count
//    at end-of-shift only expects the cash-paid orders. ─────────────────────
function toggleOrderPaidOnline(id) {
  vibe("tap");
  const order = state.orders.find(o => o.id === id);
  if (!order) return;
  order.paidOnline = !order.paidOnline;
  syncGcashExpense();
  renderOrdersLog();
  setTimeout(() => {
    const card = document.getElementById("ordercard-" + id);
    if (card) card.classList.add("expanded");
  }, 20);
}

function syncGcashExpense() {
  const total = state.orders.filter(o => o.paidOnline).reduce((s,o) => s + o.total, 0);
  const idx = state.expenses.findIndex(e => e.name === GCASH_EXPENSE_NAME);
  if (total > 0) {
    if (idx >= 0) state.expenses[idx].price = total;
    else state.expenses.push({ name: GCASH_EXPENSE_NAME, price: total });
  } else if (idx >= 0) {
    state.expenses.splice(idx, 1);
  }
  saveState();
  renderPosExpenses();
}

function renderOrdersLog() {
  const list  = document.getElementById("ordersLogList");
  const badge = document.getElementById("ordersCountBadge");
  badge.textContent = state.orders.length;

  if (!state.orders.length) {
    list.innerHTML=`<div class="no-orders">No orders yet</div>`; return;
  }

  // Labels come from the order lines themselves, so added/removed products always show
  const nameOf = {};
  state.orders.forEach(o => o.items.forEach(i => { nameOf[i.code] = i.name; }));
  const CODE_LABELS = nameOf, CODE_SHORT = nameOf;
  const CODE_ORDER = [...DRINKS.map(d => d.code), ...Object.keys(nameOf).filter(c => !DRINKS.some(d => d.code === c))];

  list.innerHTML = [...state.orders].reverse().map(order => {
    // ── Summary line: counts by drink type ──
    const codeCounts = {};
    order.items.forEach(i => { codeCounts[i.code] = (codeCounts[i.code]||0) + i.qty; });
    const desc = CODE_ORDER.filter(c => codeCounts[c])
      .map(c => `${codeCounts[c]}× ${esc(CODE_SHORT[c]||c)}`).join(", ");

    // ── Expanded detail: items grouped by drink type+size ──
    const byCode = {};
    order.items.forEach(i => {
      const g = i.code || "M";
      if (!byCode[g]) byCode[g] = [];
      byCode[g].push(i);
    });

    const editRows = CODE_ORDER.filter(g => byCode[g]?.length).map(g => {
      const groupItems = byCode[g];
      const groupQty   = groupItems.reduce((s, i) => s + i.qty, 0);

      const rows = groupItems.map(i => `
        <div class="order-edit-row">
          <div class="order-edit-name">
            ${i.flavor ? esc(i.flavor) : `<em style="opacity:.45;font-style:italic">No Flavor</em>`}
            ${itemChipsHTML(i) ? `<div class="order-edit-chips order-item-addons">${itemChipsHTML(i)}</div>` : ""}
          </div>
          <div class="order-edit-qty-wrap">
            <button class="order-edit-btn remove"
              onclick="event.stopPropagation();editOrderItem(${order.id},'${i.key.replace(/'/g,"\\'")}','dec')">−</button>
            <span class="order-edit-qty">${i.qty}</span>
            <button class="order-edit-btn"
              onclick="event.stopPropagation();editOrderItem(${order.id},'${i.key.replace(/'/g,"\\'")}','inc')">+</button>
          </div>
          <span class="order-edit-total">${fmt((i.unitPrice+getItemAddonTotal(i))*i.qty)}</span>
        </div>`).join("");

      return `<div style="margin-bottom:2px;">
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:5px 14px 3px;background:var(--parchment);
          border-top:1px solid rgba(226,201,168,0.4);border-bottom:1px solid rgba(226,201,168,0.4);">
          <span style="font-size:0.63rem;font-weight:800;letter-spacing:0.09em;
            text-transform:uppercase;color:var(--mahogany);">${esc(CODE_LABELS[g]||g)}</span>
          <span style="font-size:0.62rem;font-weight:600;color:var(--dust);letter-spacing:0;">
            ${groupQty} cup${groupQty > 1 ? "s" : ""}
          </span>
        </div>
        ${rows}
      </div>`;
    }).join("");

    const addonRows = Object.entries(aggregateOrderAddons(order)).map(([name,qty])=>{
      const a=ADDONS.find(a=>a.name===name);
      return `<div class="order-log-detail-row"><span>${qty}× ${esc(name)}</span><span>${fmt((a?.price||0)*qty)}</span></div>`;
    }).join("");

    const totalRow = `<div class="order-log-detail-row" style="font-weight:700;color:var(--mahogany);border-top:1px solid var(--latte);margin-top:6px;padding-top:6px;"><span>Total</span><span>${fmt(order.total)}</span></div>`;

    const paymentSection = `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 14px 2px;border-top:1px dashed rgba(226,201,168,0.5);margin-top:4px;">
        <span style="font-size:0.75rem;color:var(--mahogany);font-weight:700;white-space:nowrap;flex-shrink:0;">Given</span>
        <input type="number" id="given-input-${order.id}"
          style="flex:1;min-width:0;padding:5px 9px;border:1.5px solid var(--sand-border);border-radius:8px;
                 font-size:0.84rem;font-family:'Plus Jakarta Sans',sans-serif;
                 background:var(--pearl);color:var(--espresso);"
          value="${order.given || ''}" placeholder="₱0"
          onclick="event.stopPropagation();"
          oninput="event.stopPropagation();updateOrderGiven(${order.id},this.value);">
        <span id="given-change-${order.id}"
          style="font-size:0.82rem;font-weight:700;min-width:82px;text-align:right;
                 font-variant-numeric:tabular-nums;flex-shrink:0;
                 color:${order.given > 0 ? (order.given >= order.total ? 'var(--success-dark)' : 'var(--danger-soft)') : 'var(--bark)'};">
          ${order.given > 0
            ? (order.given >= order.total
                ? `Change: ${fmt(order.given - order.total)}`
                : `Short: ${fmt(order.total - order.given)}`)
            : 'Change: —'}
        </span>
      </div>
      <div style="padding:6px 14px 2px;display:flex;gap:6px;">
        <button class="paid-online-btn small${order.paidOnline?" active":""}" style="flex:1;"
          onclick="event.stopPropagation();toggleOrderPaidOnline(${order.id})">
          ${order.paidOnline ? "✓ Paid Online (GCash)" : "Mark Paid Online (GCash)"}
        </button>
        <button class="void-order-btn" onclick="event.stopPropagation();voidOrder(${order.id})">Void</button>
      </div>`;

    const doneLabel = order.done ? "✓ Done" : "Mark Done";
    return `<div class="order-log-item${order.done?" order-done":""}" id="ordercard-${order.id}" onclick="this.classList.toggle('expanded')">
      <div class="order-log-summary">
        <div class="order-log-left">
          <span class="order-log-num">Order #${order.id} · ${order.time}</span>
          <span class="order-log-desc">${desc}</span>
        </div>
        <div class="order-log-right">
          ${order.paidOnline ? `<span style="font-size:0.62rem;font-weight:700;color:var(--info);background:var(--info-bg);border:1px solid var(--info-border);border-radius:6px;padding:2px 6px;flex-shrink:0;">GCash</span>` : ""}
          <button class="order-done-btn${order.done?" done":""}"
            onclick="event.stopPropagation();toggleOrderDone(${order.id})">${doneLabel}</button>
          <span class="order-log-total">${fmt(order.total)}</span>
          <span class="order-log-chevron">▼</span>
        </div>
      </div>
      <div class="order-log-detail" style="padding:0 0 10px;">
        <div class="order-edit-header" style="padding:6px 14px 4px;">
          <span class="order-edit-label">Cups</span>
          <span style="font-size:0.68rem;color:var(--bark);">tap − / + to edit qty</span>
        </div>
        ${editRows}
        ${addonRows ? `<div style="padding:4px 14px 0;border-top:1px dashed rgba(226,201,168,0.5);margin-top:4px;">${addonRows}</div>` : ""}
        <div style="padding:0 14px;">${totalRow}</div>
        ${paymentSection}
      </div>
    </div>`;
  }).join("");
}

// ── Edit placed order item qty ────────────────────────────────────────────────
function editOrderItem(orderId, itemKey, dir) {
  vibe("tap");
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const item = order.items.find(i => i.key === itemKey);
  if (!item) return;

  if (dir === "inc") {
    const rem = remainingCups();
    if (item.cup && (rem[item.cup] ?? 0) <= 0) { vibe("error"); return; }
    item.qty++;
    bumpSalesTallyDelta(item, 1);
  } else {
    item.qty--;
    bumpSalesTallyDelta(item, -1);
    if (item.qty <= 0) order.items = order.items.filter(i => i.key !== itemKey);
  }

  // Recalculate order total
  const cupTotal   = order.items.reduce((s,i) => s + i.unitPrice * i.qty, 0);
  const addonTotal = order.items.reduce((s,i) => s + getItemAddonTotal(i) * i.qty, 0);
  const diff  = (cupTotal + addonTotal) - order.total;
  order.total = cupTotal + addonTotal;
  state.shiftTotal += diff;

  saveState();
  renderDrinkButtons();
  updateHeaderStats();
  renderOrdersLog();
  if (order.paidOnline) syncGcashExpense();

  // Re-expand the card
  setTimeout(() => {
    const card = document.getElementById("ordercard-" + orderId);
    if (card) card.classList.add("expanded");
  }, 20);
}

// ── Edit the "given" (cash tendered) amount on a placed order ─────────────────
function updateOrderGiven(orderId, value) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.given = parseFloat(value) || 0;
  saveState();
  // Update the inline change display without re-rendering the whole log
  const disp = document.getElementById(`given-change-${orderId}`);
  if (!disp) return;
  const g = order.given, t = order.total;
  if (g > 0) {
    const ch = g - t;
    disp.textContent = ch >= 0 ? `Change: ${fmt(ch)}` : `Short: ${fmt(-ch)}`;
    disp.style.color  = ch >= 0 ? 'var(--success-dark)' : 'var(--danger-soft)';
  } else {
    disp.textContent = 'Change: —';
    disp.style.color  = 'var(--bark)';
  }
}

// ════════════════════════════════════════════════════
//  HEADER STATS
// ════════════════════════════════════════════════════
function computeShiftCupTotal() {
  return state.orders.reduce((s, o) =>
    s + o.items.reduce((si, i) => si + i.unitPrice * i.qty, 0), 0);
}

function showQuotaToast(milestone) {
  vibe("quota");
  playSound("quota");
  const toast = document.getElementById("quotaToast");
  toast.textContent = milestone === 3000
    ? "🎉 Quota hit! ₱3,000 in cup sales!"
    : `🚀 ₱${milestone.toLocaleString()} milestone! Keep it up!`;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 4500);
}

function updateHeaderStats() {
  const cupSales = computeShiftCupTotal();
  document.getElementById("shiftTotalDisplay").textContent = fmt(cupSales);
  document.getElementById("headerOrderCount").textContent  = state.orders.length;
  updateQuotaBar(cupSales);
}

let _barInBonusMode = false; // track so we don't re-trigger the flash on every render

function updateQuotaBar(cupSales) {
  const quota = getQuotaStart();
  const fill  = document.getElementById("quotaBarFill");
  const label = document.getElementById("quotaBarLabel");
  const amt   = document.getElementById("quotaBarAmt");
  if (!fill) return;

  if (cupSales >= quota) {
    const over      = cupSales - quota;
    const intoBlock = over % 1000;
    const bonusPct  = Math.min((intoBlock / 1000) * 100, 100);
    const remaining = 1000 - intoBlock;
    const nextMile  = quota + (Math.floor(over / 1000) + 1) * 1000;

    if (!_barInBonusMode) {
      // ── First time crossing quota: green flash → teal bonus ──
      _barInBonusMode = true;
      fill.className   = "quota-bar-fill hit flashing";
      fill.style.width = "100%";
      setTimeout(() => {
        fill.classList.remove("hit","flashing","exceed");
        fill.classList.add("bonus");
        fill.style.width = (bonusPct || 4) + "%";
        label.textContent = intoBlock === 0
          ? "🚀 Bonus unlocked!"
          : `+₱${Math.ceil(remaining).toLocaleString("en-PH")} to ₱${nextMile.toLocaleString("en-PH")}`;
        amt.textContent = `+${fmt(over)} over`;
      }, 620);
    } else {
      // ── Already in bonus mode: just update width + labels smoothly ──
      fill.className   = "quota-bar-fill bonus";
      fill.style.width = (bonusPct || 4) + "%";
      label.textContent = intoBlock === 0
        ? "🚀 Bonus unlocked!"
        : `+₱${Math.ceil(remaining).toLocaleString("en-PH")} to ₱${nextMile.toLocaleString("en-PH")}`;
      amt.textContent = `+${fmt(over)} over`;
    }

  } else {
    // ── Pre-quota ──
    _barInBonusMode = false;
    const pct       = Math.min((cupSales / quota) * 100, 100);
    const near      = pct >= 80;
    const remaining = quota - cupSales;
    fill.style.width = pct + "%";
    fill.className   = "quota-bar-fill" + (near ? " near" : "");
    label.textContent = near ? "🔥 Almost there!" : "To Quota";
    amt.textContent   = `₱${Math.ceil(remaining).toLocaleString("en-PH")} left`;
  }
}

// ════════════════════════════════════════════════════
//  POS EXPENSES
// ════════════════════════════════════════════════════
function openExpensesModal()  { vibe("tap"); document.getElementById("expensesModal").classList.add("open"); }
function closeExpensesModal() { document.getElementById("expensesModal").classList.remove("open"); }

function updateExpensesBadge() {
  const badge = document.getElementById("expensesBadge");
  if (!badge) return;
  const total = (state.expenses || []).reduce((s, e) => s + (parseFloat(e.price) || 0), 0);
  badge.textContent = total > 0 ? fmt(total) : "";
  badge.style.display = total > 0 ? "inline-block" : "none";
}

function addPosExpenseRow(name="", price="") {
  const container = document.getElementById("posExpensesContainer");
  const isAuto = name === GCASH_EXPENSE_NAME;
  const row = document.createElement("div");
  row.className = "expense-row" + (isAuto ? " auto-expense" : "");
  row.innerHTML = isAuto
    ? `
    <input type="text"   class="exp-name"  value="${esc(name)}" readonly>
    <input type="number" class="exp-price" value="${price}" readonly>
    <span class="exp-auto-tag">auto</span>
  `
    : `
    <input type="text"   class="exp-name"  placeholder="Expense name" value="${esc(name)}">
    <input type="number" class="exp-price" placeholder="₱0"           value="${price}">
    <button type="button" onclick="this.parentElement.remove(); savePosExpenses();">x</button>
  `;
  if (!isAuto) row.addEventListener("input", savePosExpenses);
  container.appendChild(row);
}

function savePosExpenses() {
  const rows = document.querySelectorAll("#posExpensesContainer .expense-row");
  // Preserve the auto-synced GCash row as-is; it's managed by syncGcashExpense().
  const gcash = state.expenses.find(e => e.name === GCASH_EXPENSE_NAME);
  state.expenses = gcash ? [gcash] : [];
  rows.forEach(r => {
    if (r.classList.contains("auto-expense")) return;
    const name  = r.querySelector(".exp-name").value.trim();
    const price = parseFloat(r.querySelector(".exp-price").value) || 0;
    if (name || price) state.expenses.push({name, price});
  });
  saveState();
  updateExpensesBadge();
}

function renderPosExpenses() {
  const container = document.getElementById("posExpensesContainer");
  container.innerHTML = "";
  if (state.expenses.length) state.expenses.forEach(e => addPosExpenseRow(e.name, e.price));
  updateExpensesBadge();
}

// ════════════════════════════════════════════════════
//  RECEIPT MODAL
// ════════════════════════════════════════════════════
function showReceipt(order) {
  document.getElementById("receiptOrderNum").textContent = `Order #${order.id} · ${order.time}`;

  let itemsHTML = order.items.map(i => {
    const itemAddonRows = Object.entries(i.addons||{}).map(([name,qty]) => {
      const a = ADDONS.find(a=>a.name===name);
      return `<div class="receipt-row addon-row"><span>↳ ${qty*i.qty}× ${esc(name)}</span><span>${fmt((a?.price||0)*qty*i.qty)}</span></div>`;
    }).join("");
    const noteList = itemNoteList(i);
    return `
    <div class="receipt-row">
      <span>${i.qty}× ${esc(i.name)} (${esc(i.code)})</span>
      <span>${fmt(i.unitPrice*i.qty)}</span>
    </div>
    ${i.flavor?`<div class="receipt-row flavor-sub"><span>↳ ${esc(i.flavor)}</span></div>`:""}
    ${itemAddonRows}
    ${noteList.length?`<div class="receipt-row note-row"><span>${esc(noteList.join(", "))}</span></div>`:""}
  `; }).join("");

  document.getElementById("receiptItems").innerHTML = itemsHTML;
  document.getElementById("receiptTotal").innerHTML = `<span>Total</span><span>${fmt(order.total)}</span>`;

  // Payment rows (given / change)
  let paymentHTML = "";
  if (order.paidOnline) {
    paymentHTML += `
      <hr class="modal-divider">
      <div class="receipt-row" style="font-weight:700;color:var(--info)"><span>📱 Paid via GCash</span><span></span></div>`;
  }
  if (order.given > 0) {
    const change = order.given - order.total;
    paymentHTML = `
      <hr class="modal-divider">
      <div class="receipt-row" style="color:var(--bark)"><span>Given</span><span>${fmt(order.given)}</span></div>
      <div class="receipt-row" style="font-weight:700;color:${change>=0?"var(--success-dark)":"var(--danger-soft)"}">
        <span>${change>=0?"Change":"Short"}</span><span>${fmt(Math.abs(change))}</span>
      </div>`;
  }
  const paymentEl = document.getElementById("receiptPayment");
  if (paymentEl) paymentEl.innerHTML = paymentHTML;

  const bar = document.getElementById("receiptProgressBar");
  bar.style.transition="none"; bar.style.width="100%";
  document.getElementById("receiptModal").classList.add("open");
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ bar.style.transition=`width ${RECEIPT_MS}ms linear`; bar.style.width="0%"; }));
  if(receiptTimer) clearTimeout(receiptTimer);
  receiptTimer = setTimeout(closeReceiptModal, RECEIPT_MS);
}

function closeReceiptModal() {
  if(receiptTimer){clearTimeout(receiptTimer);receiptTimer=null;}
  document.getElementById("receiptModal").classList.remove("open");
}

// ════════════════════════════════════════════════════
//  END SHIFT
// ════════════════════════════════════════════════════
function computeCupTotals() {
  const t={M:0,L:0,S:0,MC:0,LC:0,HC:0,FTM:0,FTL:0};
  state.orders.forEach(o=>o.items.forEach(i=>{t[i.code]=(t[i.code]||0)+i.qty;}));
  return t;
}

// Everything that isn't a core cup line (M, L, S, HC, MC, LC): Fruit Tea and any product you added.
// These go to Calculate as their own rows, priced exactly as sold.
function computeExtras() {
  const core = new Set(["M","L","S","HC","MC","LC"]);
  const map = {};
  state.orders.forEach(o => o.items.forEach(i => {
    if (core.has(i.code)) return;
    const e = map[i.code] || (map[i.code] = { code: i.code, name: i.name, cup: itemCup(i), qty: 0, total: 0 });
    e.qty += i.qty; e.total += i.unitPrice * i.qty;
  }));
  return Object.values(map);
}

function computeAddonRevenue() {
  return state.orders.reduce((sum,o) =>
    sum + o.items.reduce((s,i) => s + getItemAddonTotal(i) * i.qty, 0), 0);
}

function openEndShift() {
  const t   = computeCupTotals();
  const del = state.deliveries || {M:0,L:0,S:0,HC:0};
  const dmg = state.damages    || {M:0,L:0,S:0,HC:0};
  // Physical remaining = beg + delivered - damaged - used_in_orders
  const u     = usedByCup(false);
  const extras = computeExtras();
  const endM  = state.begM  + (del.M||0)  - (dmg.M||0)  - u.M;
  const endL  = state.begL  + (del.L||0)  - (dmg.L||0)  - u.L;
  const endS  = state.begS  + (del.S||0)  - (dmg.S||0)  - u.S;
  const endHC = state.begHC + (del.HC||0) - (dmg.HC||0) - u.HC;
  const warn  = v => v<0 ? `<span style="color:var(--danger-soft);font-weight:700">${v} ⚠</span>` : v;
  const addonRev = computeAddonRevenue();
  const cupSales = computeShiftCupTotal();
  const expTotal = state.expenses.reduce((s,e)=>s+e.price,0);
  const gcashTotal = state.orders.filter(o=>o.paidOnline).reduce((s,o)=>s+o.total,0);
  const totalDel = (del.M||0)+(del.L||0)+(del.S||0)+(del.HC||0);
  const totalDmg = (dmg.M||0)+(dmg.L||0)+(dmg.S||0)+(dmg.HC||0);
  const delRow = totalDel>0 ? `<div class="end-shift-row" style="color:var(--success-dark);"><span>Delivered</span><span>M+${del.M||0} L+${del.L||0} S+${del.S||0} HC+${del.HC||0}</span></div>` : "";
  const dmgRow = totalDmg>0 ? `<div class="end-shift-row" style="color:var(--danger-soft);"><span>Damaged</span><span>M−${dmg.M||0} L−${dmg.L||0} S−${dmg.S||0} HC−${dmg.HC||0}</span></div>` : "";
  document.getElementById("endShiftSummary").innerHTML=`
    <div class="end-shift-row bold"><span>Orders Placed</span><span>${state.orders.length}</span></div>
    <div class="end-shift-row bold"><span>Cup Sales</span><span>${fmt(cupSales)}</span></div>
    ${addonRev?`<div class="end-shift-row"><span>Add-on Revenue</span><span>+ ${fmt(addonRev)}</span></div>`:""}
    <div class="end-shift-row" style="font-weight:700;border-top:1.5px solid var(--mochaccino);padding-top:8px;margin-top:4px;"><span>Total Revenue</span><span>${fmt(state.shiftTotal)}</span></div>
    ${gcashTotal?`<div class="end-shift-row" style="color:var(--info);"><span>📱 Paid Online (GCash)</span><span>${fmt(gcashTotal)}</span></div>`:""}
    ${expTotal?`<div class="end-shift-row"><span>Expenses (incl. GCash)</span><span>− ${fmt(expTotal)}</span></div>`:""}
    <div class="end-shift-row section-head"><span>Cup Counts → Auto-filled</span><span></span></div>
    ${delRow}${dmgRow}
    <div class="end-shift-row"><span>Medium (M)</span><span>${state.begM} → ${warn(endM)}</span></div>
    <div class="end-shift-row"><span>Large (L)</span><span>${state.begL} → ${warn(endL)}</span></div>
    <div class="end-shift-row"><span>Small (S)</span><span>${state.begS} → ${warn(endS)}</span></div>
    <div class="end-shift-row"><span>Hot Coffee (HC)</span><span>${state.begHC} → ${warn(endHC)}</span></div>
    <div class="end-shift-row"><span>MC Tally</span><span>${t.MC}</span></div>
    <div class="end-shift-row"><span>LC Tally</span><span>${t.LC}</span></div>
    ${extras.map(e => `<div class="end-shift-row"><span>${esc(e.name)}</span><span>${e.qty}</span></div>`).join("")}
  `;
  document.getElementById("endShiftModal").classList.add("open");
}

function closeEndShift() { document.getElementById("endShiftModal").classList.remove("open"); }

function confirmEndShift() {
  const t   = computeCupTotals();
  const del = state.deliveries || {M:0,L:0,S:0,HC:0};
  const dmg = state.damages    || {M:0,L:0,S:0,HC:0};

  // Formula end: beg + del - cups_used_in_orders (no damage — damage is annotation only)
  // Matches how calculate.html treats damageX: shown on receipt but not in formula
  const u = usedByCup(false);
  const formulaEndM  = state.begM  + (del.M||0)  - u.M;
  const formulaEndL  = state.begL  + (del.L||0)  - u.L;
  const formulaEndS  = state.begS  + (del.S||0)  - u.S;
  const formulaEndHC = state.begHC + (del.HC||0) - u.HC;

  // Physical end for carry-over = formula end minus damaged cups
  const physEndM  = formulaEndM  - (dmg.M||0);
  const physEndL  = formulaEndL  - (dmg.L||0);
  const physEndS  = formulaEndS  - (dmg.S||0);
  const physEndHC = formulaEndHC - (dmg.HC||0);

  localStorage.setItem("brewsLastEndingCups", JSON.stringify({
    endM: physEndM, endL: physEndL, endS: physEndS, endHC: physEndHC,
    date: localDate(),
  }));

  localStorage.setItem(SHIFT_KEY, JSON.stringify({
    origBegM: state.begM,  begM: state.begM  + (del.M||0),  endM: formulaEndM,
    origBegL: state.begL,  begL: state.begL  + (del.L||0),  endL: formulaEndL,
    origBegS: state.begS,  begS: state.begS  + (del.S||0),  endS: formulaEndS,
    origBegHC:state.begHC, begHC:state.begHC + (del.HC||0), endHC:formulaEndHC,
    tallyMC:t.MC, tallyLC:t.LC,
    extras: computeExtras(),
    expenses: state.expenses,
    addonRevenue: computeAddonRevenue(),
    deliveredM:del.M||0, deliveredL:del.L||0, deliveredS:del.S||0, deliveredHC:del.HC||0,
    damageM:   dmg.M||0, damageL:   dmg.L||0, damageS:   dmg.S||0, damageHC:   dmg.HC||0,
  }));

  const shiftMs = state.shiftStartTime ? Date.now() - state.shiftStartTime : 0;
  localStorage.setItem("brewsShiftMs", String(shiftMs));

  // Save resumable snapshot so staff can pick up again if needed
  localStorage.setItem("brewsResumeShift", JSON.stringify({
    begM:state.begM, begL:state.begL, begS:state.begS, begHC:state.begHC,
    orders:state.orders, shiftTotal:state.shiftTotal, expenses:state.expenses,
    deliveries: state.deliveries, damages: state.damages,
    elapsedMs: shiftMs,
    savedAt: Date.now(),
  }));
  saveOrderLog();
  clearPOSState();
  if(clockInterval) clearInterval(clockInterval);
  window.location.href="calculate.html";
}

// ════════════════════════════════════════════════════
//  KEY SHORTCUTS
// ════════════════════════════════════════════════════
document.addEventListener("keydown", e => {
  if (e.key==="Escape") { closeFlavorModal(); closeReceiptModal(); closeEndShift(); closeFlavorSettings(); }
});

// ════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════
// Clamp all number inputs to 0+ globally
document.addEventListener("input", e => {
  if (e.target.type === "number") {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v < 0) e.target.value = 0;
  }
});

// ════════════════════════════════════════════════════
//  HAPTIC ENGINE
// ════════════════════════════════════════════════════
function vibe(type) {
  if (!navigator.vibrate) return;
  const patterns = {
    tap:   18,
    add:   25,
    place: [50, 30, 80],
    quota: [80, 40, 80, 40, 120],
    error: [30, 20, 30, 20, 30],
    undo:  40,
  };
  navigator.vibrate(patterns[type] ?? 18);
}

// ════════════════════════════════════════════════════
//  SOUND ENGINE  (Web Audio API — no files needed)
// ════════════════════════════════════════════════════
let _audioCtx = null;
function _getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function playSound(type) {
  const cfg = getSettings();
  if (!cfg.soundEnabled) return;
  try {
    const ctx = _getAudioCtx();
    if (ctx.state === "suspended") ctx.resume();

    if (type === "tap") {
      // Soft click: quick sine burst
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 700;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);

    } else if (type === "place") {
      // Soft double-bell: two descending tones
      [[520, 0, 0.10], [420, 0.10, 0.18]].forEach(([freq, when, end]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + when);
        gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + when + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + end);
        osc.start(ctx.currentTime + when); osc.stop(ctx.currentTime + end + 0.02);
      });

    } else if (type === "quota") {
      // Rising celebration: three ascending tones
      [[440, 0, 0.12], [550, 0.12, 0.26], [660, 0.26, 0.44]].forEach(([freq, when, end]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "triangle"; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + when);
        gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + when + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + end);
        osc.start(ctx.currentTime + when); osc.stop(ctx.currentTime + end + 0.02);
      });
    }
  } catch (e) { /* audio blocked by browser policy — silent fail */ }
}

// ════════════════════════════════════════════════════
//  SWIPE TO DISMISS  (all modal overlays)
// ════════════════════════════════════════════════════
function attachSwipeToDismiss(overlayId, closeFunc) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;
  const modal = overlay.querySelector(".modal");
  if (!modal) return;

  let startY = 0, currentY = 0, dragging = false;

  overlay.addEventListener("touchstart", e => {
    if (e.target === overlay) return; // tapping backdrop = close (existing)
    startY   = e.touches[0].clientY;
    currentY = startY;
    dragging = true;
    modal.style.transition = "none";
  }, { passive: true });

  overlay.addEventListener("touchmove", e => {
    if (!dragging) return;
    currentY  = e.touches[0].clientY;
    const dy  = Math.max(0, currentY - startY); // only allow downward drag
    modal.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  overlay.addEventListener("touchend", () => {
    if (!dragging) return;
    dragging = false;
    const dy = Math.max(0, currentY - startY);
    modal.style.transition = "";
    if (dy > 90) {
      modal.style.transform = "";
      closeFunc();
    } else {
      modal.style.transform = "";
    }
  });
}

// ════════════════════════════════════════════════════
//  OFFLINE INDICATOR
// ════════════════════════════════════════════════════
function setOfflineBanner(offline) {
  const b = document.getElementById("offlineBanner");
  if (b) b.classList.toggle("visible", offline);
}

async function retryConnection() {
  setOfflineBanner(false);
  try {
    if (typeof syncPull === "function") await syncPull();
  } catch (e) {
    setOfflineBanner(true);
  }
}

window.addEventListener("online",  () => setOfflineBanner(false));
window.addEventListener("offline", () => setOfflineBanner(true));
// Initial check
if (!navigator.onLine) setOfflineBanner(true);

buildCatalogue();
loadState();
cleanupOrderLogs();
sessionStorage.setItem('brewsSession', '1');

// ── Scroll lock: while any pop-up is open the page behind it can't scroll ──
(function setupScrollLock() {
  const root = document.documentElement;
  const sync = () => root.classList.toggle("modal-open", !!document.querySelector(".modal-overlay.open"));
  new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
  // iOS ignores overflow:hidden on body for touch scrolling, so also block touchmove
  // unless the finger is inside a pop-up's own scrollable area.
  document.addEventListener("touchmove", e => {
    if (!root.classList.contains("modal-open")) return;
    if (!e.target.closest(".popup-body, .flavor-scroll, .receipt-modal .modal, .end-shift-modal .modal, #flavorSettingsModal .modal")) {
      e.preventDefault();
    }
  }, { passive: false });
  sync();
})();

// ── Restore quota threshold from saved shift so we never fire at ₱0 ──
(function restoreQuotaThreshold() {
  const cupsSoFar = state.orders.reduce(
    (t, o) => t + o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0), 0);
  const qs = getQuotaStart();
  if (cupsSoFar < qs) {
    nextQuotaThreshold = qs;                                          // quota not hit yet
  } else {
    // next unfired milestone above current sales
    nextQuotaThreshold = qs + (Math.floor((cupsSoFar - qs) / 1000) + 1) * 1000;
    _barInBonusMode = true;   // already past quota — skip the flash animation on load
  }
})();

// ── Carryover: use yesterday's ending cups as today's beginning ───────────────
(function initPosCarryover() {
  const raw = localStorage.getItem("brewsLastEndingCups");
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    const wrap = document.getElementById("posCarryoverWrap");
    const meta = document.getElementById("posCarryoverMeta");
    if (wrap) wrap.style.display = "block";
    if (meta) meta.textContent = d.date ? `from ${d.date}` : "";
  } catch {}
})();

function posUseYesterdaysEnding() {
  const raw = localStorage.getItem("brewsLastEndingCups");
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    const map = { setupBegM: d.endM, setupBegL: d.endL, setupBegS: d.endS, setupBegHC: d.endHC };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = val ?? "";
      el.style.transition = "background .4s";
      el.style.background = "var(--success-bg-alt)";
      setTimeout(() => el.style.background = "", 900);
    });
  } catch {}
}
const hasShift = !!localStorage.getItem(SHIFT_ACTIVE_KEY) ||
                 state.orders.length > 0 || state.currentItems.length > 0 ||
                 state.begM || state.begL || state.begS || state.begHC;
if (hasShift) showPOS(); else showSetup();
