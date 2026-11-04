/**
 * menu.js
 * The product menu: built-in drinks + products you add yourself.
 * Reorder, rename, icon or photo, tile color, price, hide, add and delete.
 * Saved in localStorage ("brewsMenuLayout") and synced with settings.
 *
 * Used by pos.html (quick edit mode on the Shift screen) and
 * settings.html (full menu manager).
 * Pages can define window.onMenuChanged() to refresh after any change.
 */
const MENU_KEY = "brewsMenuLayout";
let menuEditing = false;

const MENU_CUPS = { "": "No cup (food, snack, etc.)", S: "Small cup", M: "Medium cup", L: "Large cup", HC: "Hot coffee cup" };
const MENU_FLAVS = { "": "No flavor list", milktea: "Milk Tea flavors", fruittea: "Fruit Tea flavors", icedcoffee: "Iced Coffee flavors", hotcoffee: "Hot Coffee flavors" };

const _mesc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const _mfmt = v => "₱" + Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Data ─────────────────────────────────────────────────────────────────────
function getMenuLayout() {
  try {
    const l = JSON.parse(localStorage.getItem(MENU_KEY) || "{}");
    return { order: Array.isArray(l.order) ? l.order : [], items: l.items || {}, custom: Array.isArray(l.custom) ? l.custom : [] };
  } catch { return { order: [], items: {}, custom: [] }; }
}

function saveMenuLayout(l) {
  localStorage.setItem(MENU_KEY, JSON.stringify(l));
  localStorage.setItem("brewsSettingsModified", new Date().toISOString());
}

function builtinDrinks() {
  const p = (typeof getSettings === "function" ? getSettings().prices : null) || {};
  return [
    { code: "M",   name: "Milktea M",     icon: "🧋", price: p.M   ?? 29, cup: "M",  flav: "milktea" },
    { code: "L",   name: "Milktea L",     icon: "🧋", price: p.L   ?? 39, cup: "L",  flav: "milktea" },
    { code: "MC",  name: "Iced Coffee M", icon: "☕", price: p.MC  ?? 35, cup: "M",  flav: "icedcoffee" },
    { code: "LC",  name: "Iced Coffee L", icon: "☕", price: p.LC  ?? 45, cup: "L",  flav: "icedcoffee" },
    { code: "HC",  name: "Hot Coffee",    icon: "☕", price: p.HC  ?? 45, cup: "HC", flav: "hotcoffee" },
    { code: "S",   name: "Milktea S",     icon: "🧋", price: p.S   ?? 25, cup: "S",  flav: "milktea" },
    { code: "FTM", name: "Fruit Tea M",   icon: "🍵", price: p.FTM ?? 29, cup: "M",  flav: "fruittea" },
    { code: "FTL", name: "Fruit Tea L",   icon: "🍵", price: p.FTL ?? 39, cup: "L",  flav: "fruittea" },
  ].map(d => Object.assign(d, { builtin: true }));
}

// Full, ordered product list with all overrides applied.
function loadMenuDrinks() {
  const l = getMenuLayout();
  const list = builtinDrinks().concat(l.custom.map(c => ({
    code: c.code, name: c.name || "New Product", icon: c.icon || "🧋", price: Number(c.price) || 0,
    cup: c.cup || "", flav: c.flav || "", builtin: false,
  })));
  list.forEach(d => {
    const o = l.items[d.code] || {};
    d.defaultName = d.name; d.defaultIcon = d.icon;
    if (o.name) d.name = o.name;
    if (o.icon) d.icon = o.icon;
    d.img = o.img || ""; d.color = o.color || ""; d.hidden = !!o.hidden;
  });
  const pos = c => { const i = l.order.indexOf(c); return i < 0 ? 999 : i; };
  return list.map((d, i) => ({ d, i })).sort((a, b) => (pos(a.d.code) - pos(b.d.code)) || (a.i - b.i)).map(x => x.d);
}

function menuChanged() { if (typeof window.onMenuChanged === "function") window.onMenuChanged(); }

function menuTextColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "";
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#3D1F0A" : "#FFFFFF";
}

function drinkIconHTML(d) {
  return d.img ? `<img class="drink-btn-img" src="${d.img}" alt="">` : `<span class="drink-btn-icon">${_mesc(d.icon)}</span>`;
}
function drinkTileStyle(d) { return d.color ? `--tile-bg:${d.color};--tile-fg:${menuTextColor(d.color)};` : ""; }

// ── POS quick-edit mode ──────────────────────────────────────────────────────
function toggleMenuEdit(on) {
  menuEditing = typeof on === "boolean" ? on : !menuEditing;
  const bar = document.getElementById("menuEditBar");
  const btn = document.getElementById("menuEditBtn");
  if (bar) bar.style.display = menuEditing ? "flex" : "none";
  if (btn) btn.style.display = menuEditing ? "none" : "inline-flex";
  document.getElementById("drinksGrid")?.classList.toggle("editing", menuEditing);
  renderDrinkButtons();
}

function renderMenuEditTiles(grid) {
  DRINKS.forEach(d => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.code = d.code;
    btn.className = "drink-btn editing" + (d.color ? " custom" : "") + (d.hidden ? " is-hidden" : "");
    btn.style.cssText = drinkTileStyle(d);
    btn.innerHTML = `
      <span class="tile-edit-badge">${d.hidden ? "🚫" : "✏️"}</span>
      ${drinkIconHTML(d)}
      <span class="drink-btn-code">${_mesc(d.code)}</span>
      <span class="drink-btn-name">${_mesc(d.name)}</span>
      <span class="drink-btn-price">${_mfmt(d.price)}</span>`;
    grid.appendChild(btn);
  });
  const add = document.createElement("button");
  add.type = "button";
  add.className = "drink-btn add-tile";
  add.innerHTML = `<span class="drink-btn-icon">＋</span><span class="drink-btn-name">Add product</span>`;
  add.onclick = () => openNewProduct();
  grid.appendChild(add);
}

// Drag to reorder. Mouse: drag after 6px. Touch: press and hold briefly, then drag.
// A press that never really moves counts as a tap and opens the editor.
(function setupMenuDrag() {
  let grid = null, el = null, ghost = null, timer = null, dragging = false;
  let sx = 0, sy = 0, offX = 0, offY = 0, travel = 0, pType = "mouse";

  function begin() {
    dragging = true; travel = 0;
    const r = el.getBoundingClientRect();
    offX = sx - r.left; offY = sy - r.top;
    ghost = el.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.width = r.width + "px"; ghost.style.height = r.height + "px";
    ghost.style.left = r.left + "px"; ghost.style.top = r.top + "px";
    document.body.appendChild(ghost);
    el.classList.add("drag-source");
  }
  function end() {
    clearTimeout(timer); timer = null;
    if (ghost) { ghost.remove(); ghost = null; }
    if (el) el.classList.remove("drag-source");
    el = null; dragging = false;
  }

  document.addEventListener("pointerdown", e => {
    const g = document.getElementById("drinksGrid");
    if (!menuEditing || !g || !g.contains(e.target)) return;
    const t = e.target.closest(".drink-btn");
    if (!t || !t.dataset.code) return;
    grid = g; el = t; dragging = false; travel = 0;
    sx = e.clientX; sy = e.clientY; pType = e.pointerType;
    if (pType !== "mouse") timer = setTimeout(() => { timer = null; begin(); }, 220);
  });

  document.addEventListener("pointermove", e => {
    if (!el) return;
    const dist = Math.hypot(e.clientX - sx, e.clientY - sy);
    if (!dragging) {
      if (dist > 6) {
        if (pType === "mouse") begin();
        else { clearTimeout(timer); timer = null; el = null; } // finger is scrolling
      }
      return;
    }
    travel = Math.max(travel, dist);
    ghost.style.left = (e.clientX - offX) + "px";
    ghost.style.top  = (e.clientY - offY) + "px";
    if (e.clientY < 90) window.scrollBy(0, -10);
    else if (e.clientY > window.innerHeight - 150) window.scrollBy(0, 10);

    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(".drink-btn");
    if (over && over !== el && grid.contains(over) && over.dataset.code) {
      const tiles = [...grid.children];
      if (tiles.indexOf(el) < tiles.indexOf(over)) over.after(el); else over.before(el);
    }
  });

  document.addEventListener("touchmove", e => { if (dragging) e.preventDefault(); }, { passive: false });

  document.addEventListener("pointerup", () => {
    if (!el) return;
    const code = el.dataset.code;
    const realDrag = dragging && travel > 12;
    if (realDrag) {
      const l = getMenuLayout();
      l.order = [...grid.children].map(c => c.dataset.code).filter(Boolean);
      saveMenuLayout(l);
      const byCode = Object.fromEntries(DRINKS.map(d => [d.code, d]));
      const re = l.order.map(c => byCode[c]).filter(Boolean);
      DRINKS.length = 0; re.forEach(d => DRINKS.push(d));
    }
    end();
    if (!realDrag && code) openMenuItemEditor(code);
  });
  document.addEventListener("pointercancel", end);
})();

// ── Item editor sheet ────────────────────────────────────────────────────────
const MENU_SWATCHES = ["#FDF5E8", "#F5E4C8", "#C4813A", "#6B3D1E", "#4A90D9", "#4AA88A", "#D46A9E", "#7C6FD4", "#D45A5A", "#F2C94C"];
let _mi = null; // { code, isNew, builtin, name, icon, img, color, hidden, price, cup, flav }

function openMenuItemEditor(code) {
  const d = loadMenuDrinks().find(x => x.code === code);
  if (!d) return;
  _mi = { code, isNew: false, builtin: d.builtin, name: d.name, icon: d.icon, img: d.img || "", color: d.color || "",
          hidden: !!d.hidden, price: d.price, cup: d.cup, flav: d.flav, defaultName: d.defaultName, defaultIcon: d.defaultIcon };
  showMenuSheet();
}

function openNewProduct() {
  const l = getMenuLayout();
  const used = new Set(builtinDrinks().map(d => d.code).concat(l.custom.map(c => c.code)));
  let n = 1; while (used.has("P" + n)) n++;
  _mi = { code: "P" + n, isNew: true, builtin: false, name: "", icon: "🧋", img: "", color: "", hidden: false, price: 0, cup: "", flav: "" };
  showMenuSheet();
}

function showMenuSheet() {
  let sheet = document.getElementById("menuItemSheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "menuItemSheet";
    sheet.className = "mi-overlay";
    sheet.addEventListener("click", e => { if (e.target === sheet) closeMenuItemEditor(); });
    document.body.appendChild(sheet);
  }
  renderMenuItemEditor();
  sheet.classList.add("open");
}

function closeMenuItemEditor() {
  document.getElementById("menuItemSheet")?.classList.remove("open");
  _mi = null;
}

function renderMenuItemEditor() {
  const sheet = document.getElementById("menuItemSheet");
  const m = _mi;
  const prev = m.img ? `<img class="mi-prev-img" src="${m.img}" alt="">` : `<span class="mi-prev-emoji">${_mesc(m.icon)}</span>`;
  const opts = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${v}</option>`).join("");
  const stockFields = m.builtin
    ? `<div class="mi-note">Cup and flavor list are fixed for built-in products. Use "Show on menu" to remove it from the menu.</div>`
    : `<label class="mi-label">Cup used (stock)</label>
       <select class="mi-input" onchange="_mi.cup=this.value">${opts(MENU_CUPS, m.cup)}</select>
       <label class="mi-label">Flavors</label>
       <select class="mi-input" onchange="_mi.flav=this.value">${opts(MENU_FLAVS, m.flav)}</select>`;

  sheet.innerHTML = `
    <div class="mi-sheet">
      <div class="mi-title">${m.isNew ? "New Product" : "Edit " + _mesc(m.code)}</div>

      <label class="mi-label">Name</label>
      <input class="mi-input" type="text" value="${_mesc(m.name)}" maxlength="24" placeholder="Product name" oninput="_mi.name=this.value">

      <label class="mi-label">Price (₱)</label>
      <input class="mi-input" type="number" inputmode="decimal" value="${m.price || ""}" placeholder="0" oninput="_mi.price=parseFloat(this.value)||0">

      ${stockFields}

      <label class="mi-label">Icon</label>
      <div class="mi-row">
        <div class="mi-prev">${prev}</div>
        <input class="mi-input" id="miIcon" type="text" value="${_mesc(m.icon)}" maxlength="4" style="width:72px;text-align:center;"
          oninput="_mi.icon=this.value||'🧋';_mi.img='';renderMenuItemEditor();document.getElementById('miIcon').focus();">
        <input type="file" accept="image/*" id="miFile" style="display:none" onchange="onMenuImagePicked(this.files[0])">
        <button type="button" class="mi-btn" onclick="document.getElementById('miFile').click()">📷 Photo</button>
        ${m.img ? `<button type="button" class="mi-btn" onclick="_mi.img='';renderMenuItemEditor()">Remove</button>` : ""}
      </div>

      <label class="mi-label">Tile Color</label>
      <div class="mi-row" style="flex-wrap:wrap;">
        <input type="color" id="miColor" value="${m.color || "#FDF5E8"}" oninput="_mi.color=this.value;renderMenuItemEditor()">
        ${MENU_SWATCHES.map(c => `<button type="button" class="mi-swatch${m.color.toLowerCase() === c.toLowerCase() ? " active" : ""}" style="background:${c}" onclick="_mi.color='${c}';renderMenuItemEditor()"></button>`).join("")}
        <button type="button" class="mi-btn" onclick="_mi.color='';renderMenuItemEditor()">Default</button>
      </div>

      <label class="mi-check">
        <input type="checkbox" ${m.hidden ? "" : "checked"} onchange="_mi.hidden=!this.checked">
        <span>Show on menu</span>
      </label>

      <div class="mi-actions">
        ${m.isNew ? "" : m.builtin
          ? `<button type="button" class="mi-btn" onclick="resetMenuItem()">Reset</button>`
          : `<button type="button" class="mi-btn danger" onclick="deleteMenuItem()">🗑 Delete</button>`}
        <span style="flex:1"></span>
        <button type="button" class="mi-btn" onclick="closeMenuItemEditor()">Cancel</button>
        <button type="button" class="mi-btn primary" onclick="saveMenuItem()">Save</button>
      </div>
    </div>`;
}

// Crops to a small square so it stays light for storage and sync
function onMenuImagePicked(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const S = 96, c = document.createElement("canvas");
      c.width = c.height = S;
      const side = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
      _mi.img = c.toDataURL("image/jpeg", 0.82);
      renderMenuItemEditor();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function saveMenuItem() {
  const m = _mi; if (!m) return;
  const name = (m.name || "").trim();
  if (!name) { alert("Please enter a product name."); return; }
  const l = getMenuLayout();

  if (m.builtin) {
    l.items[m.code] = {
      name: name !== m.defaultName ? name : "",
      icon: m.icon && m.icon !== m.defaultIcon ? m.icon : "",
      img: m.img || "", color: m.color || "", hidden: !!m.hidden,
    };
    const s = getSettings(); s.prices[m.code] = m.price; saveSettings(s);
  } else {
    const c = { code: m.code, name, icon: m.icon || "🧋", price: m.price, cup: m.cup, flav: m.flav };
    const i = l.custom.findIndex(x => x.code === m.code);
    if (i >= 0) l.custom[i] = c; else l.custom.push(c);
    l.items[m.code] = { img: m.img || "", color: m.color || "", hidden: !!m.hidden };
    if (m.isNew && !l.order.length) l.order = loadMenuDrinks().map(x => x.code);
    if (m.isNew && !l.order.includes(m.code)) l.order.push(m.code);
  }
  saveMenuLayout(l);
  closeMenuItemEditor();
  menuChanged();
}

function resetMenuItem() {
  const m = _mi; if (!m) return;
  const l = getMenuLayout();
  delete l.items[m.code];
  saveMenuLayout(l);
  closeMenuItemEditor();
  menuChanged();
}

function deleteMenuItem() {
  const m = _mi; if (!m) return;
  if (!confirm(`Delete "${m.name || m.code}" from the menu?\n\nPast orders and reports keep their records.`)) return;
  const l = getMenuLayout();
  l.custom = l.custom.filter(c => c.code !== m.code);
  delete l.items[m.code];
  l.order = l.order.filter(c => c !== m.code);
  saveMenuLayout(l);
  closeMenuItemEditor();
  menuChanged();
}

function resetMenuLayout() {
  if (!confirm("Reset the whole menu to default?\n\nThis removes products you added and clears custom names, icons and colors.")) return;
  localStorage.removeItem(MENU_KEY);
  localStorage.setItem("brewsSettingsModified", new Date().toISOString());
  menuChanged();
}

// ── Menu manager list (used on the Settings page) ───────────────────────────
function renderMenuManager(container) {
  const list = loadMenuDrinks();
  container.innerHTML = list.map((d, i) => `
    <div class="mm-row${d.hidden ? " is-hidden" : ""}">
      <button type="button" class="mm-main" onclick="openMenuItemEditor('${d.code}')">
        <span class="mm-icon">${d.img ? `<img src="${d.img}" alt="">` : _mesc(d.icon)}</span>
        <span class="mm-text"><b>${_mesc(d.name)}</b><small>${_mesc(d.code)} · ${_mfmt(d.price)}${d.cup ? " · " + d.cup + " cup" : ""}${d.hidden ? " · hidden" : ""}</small></span>
      </button>
      <button type="button" class="mm-move" ${i === 0 ? "disabled" : ""} onclick="moveMenuItem('${d.code}',-1)" aria-label="Move up">▲</button>
      <button type="button" class="mm-move" ${i === list.length - 1 ? "disabled" : ""} onclick="moveMenuItem('${d.code}',1)" aria-label="Move down">▼</button>
    </div>`).join("") + `
    <button type="button" class="add-expense-btn" onclick="openNewProduct()">+ Add Product</button>
    <button type="button" class="theme-text-btn" style="margin-top:8px;" onclick="resetMenuLayout()">Reset menu to default</button>`;
}

function moveMenuItem(code, dir) {
  const codes = loadMenuDrinks().map(d => d.code);
  const i = codes.indexOf(code), j = i + dir;
  if (i < 0 || j < 0 || j >= codes.length) return;
  [codes[i], codes[j]] = [codes[j], codes[i]];
  const l = getMenuLayout(); l.order = codes; saveMenuLayout(l);
  menuChanged();
}
