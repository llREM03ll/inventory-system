/**
 * menu.js
 * POS menu customization: reorder (drag like phone icons), rename, change
 * emoji or photo, tile color, show/hide, and price.
 * Layout is saved in localStorage ("brewsMenuLayout") and synced with settings.
 */
const MENU_KEY = "brewsMenuLayout";
let menuEditing = false;

// ── Data ─────────────────────────────────────────────────────────────────────
function getMenuLayout() {
  try {
    const l = JSON.parse(localStorage.getItem(MENU_KEY) || "{}");
    return { order: Array.isArray(l.order) ? l.order : [], items: l.items || {} };
  } catch { return { order: [], items: {} }; }
}

function saveMenuLayout(l) {
  localStorage.setItem(MENU_KEY, JSON.stringify(l));
  localStorage.setItem("brewsSettingsModified", new Date().toISOString());
}

// Applies saved order + overrides to the default drink list (in place).
function applyMenuLayout(drinks) {
  const l = getMenuLayout();
  drinks.forEach(d => {
    const o = l.items[d.code] || {};
    d.defaultName = d.name;
    d.defaultIcon = d.icon;
    if (o.name)  d.name  = o.name;
    if (o.icon)  d.icon  = o.icon;
    d.img    = o.img    || "";
    d.color  = o.color  || "";
    d.hidden = !!o.hidden;
  });
  const pos = c => { const i = l.order.indexOf(c); return i < 0 ? 999 : i; };
  const sorted = drinks.map((d, i) => ({ d, i })).sort((a, b) => (pos(a.d.code) - pos(b.d.code)) || (a.i - b.i)).map(x => x.d);
  drinks.length = 0;
  sorted.forEach(d => drinks.push(d));
}

// Readable text color for a tile background
function menuTextColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "";
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#3D1F0A" : "#FFFFFF";
}

function drinkIconHTML(d) {
  return d.img
    ? `<img class="drink-btn-img" src="${d.img}" alt="">`
    : `<span class="drink-btn-icon">${esc(d.icon)}</span>`;
}

// Inline style for a custom-colored tile
function drinkTileStyle(d) {
  if (!d.color) return "";
  return `--tile-bg:${d.color};--tile-fg:${menuTextColor(d.color)};`;
}

// ── Edit mode ────────────────────────────────────────────────────────────────
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
      <span class="drink-btn-code">${esc(d.code)}</span>
      <span class="drink-btn-name">${esc(d.name)}</span>
      <span class="drink-btn-price">${fmt(d.price)}</span>`;
    grid.appendChild(btn);
  });
}

// Drag to reorder. Mouse: drag after 6px. Touch: press and hold briefly, then drag.
(function setupMenuDrag() {
  let grid = null, el = null, ghost = null, moved = false, timer = null, dragging = false;
  let sx = 0, sy = 0, offX = 0, offY = 0, pType = "mouse";

  function begin(e) {
    dragging = true; moved = true;
    const r = el.getBoundingClientRect();
    offX = sx - r.left; offY = sy - r.top;
    ghost = el.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.width = r.width + "px"; ghost.style.height = r.height + "px";
    ghost.style.left = r.left + "px"; ghost.style.top = r.top + "px";
    document.body.appendChild(ghost);
    el.classList.add("drag-source");
    if (navigator.vibrate) try { navigator.vibrate(25); } catch {}
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
    if (!t) return;
    grid = g; el = t; moved = false; dragging = false;
    sx = e.clientX; sy = e.clientY; pType = e.pointerType;
    if (pType !== "mouse") timer = setTimeout(() => { timer = null; begin(e); }, 220);
  });

  document.addEventListener("pointermove", e => {
    if (!el) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 6) {
        if (pType === "mouse") begin(e);
        else { clearTimeout(timer); timer = null; el = null; } // finger is scrolling instead
      }
      return;
    }
    ghost.style.left = (e.clientX - offX) + "px";
    ghost.style.top  = (e.clientY - offY) + "px";
    if (e.clientY < 90) window.scrollBy(0, -10);
    else if (e.clientY > window.innerHeight - 150) window.scrollBy(0, 10);

    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(".drink-btn");
    if (over && over !== el && grid.contains(over)) {
      const tiles = [...grid.children];
      if (tiles.indexOf(el) < tiles.indexOf(over)) over.after(el); else over.before(el);
    }
  });

  // Stop the page from scrolling while a tile is being dragged on touch screens
  document.addEventListener("touchmove", e => { if (dragging) e.preventDefault(); }, { passive: false });

  document.addEventListener("pointerup", () => {
    if (!el) return;
    const code = el.dataset.code, wasDrag = dragging;
    if (wasDrag) {
      const l = getMenuLayout();
      l.order = [...grid.children].map(c => c.dataset.code);
      saveMenuLayout(l);
      const byCode = Object.fromEntries(DRINKS.map(d => [d.code, d]));
      const re = l.order.map(c => byCode[c]).filter(Boolean);
      DRINKS.length = 0; re.forEach(d => DRINKS.push(d));
    }
    end();
    if (!wasDrag && code) openMenuItemEditor(code);
  });
  document.addEventListener("pointercancel", end);
})();

// ── Item editor sheet ────────────────────────────────────────────────────────
const MENU_SWATCHES = ["#FDF5E8", "#F5E4C8", "#C4813A", "#6B3D1E", "#4A90D9", "#4AA88A", "#D46A9E", "#7C6FD4", "#D45A5A", "#F2C94C"];
let _mi = null; // item being edited: { code, name, icon, img, color, hidden, price }

function openMenuItemEditor(code) {
  const d = DRINKS.find(x => x.code === code);
  if (!d) return;
  _mi = { code, name: d.name, icon: d.icon, img: d.img || "", color: d.color || "", hidden: !!d.hidden, price: d.price };
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
  const prev = m.img ? `<img class="mi-prev-img" src="${m.img}" alt="">` : `<span class="mi-prev-emoji">${esc(m.icon)}</span>`;
  sheet.innerHTML = `
    <div class="mi-sheet">
      <div class="mi-title">Edit ${esc(m.code)}</div>

      <label class="mi-label">Name</label>
      <input class="mi-input" id="miName" type="text" value="${esc(m.name)}" maxlength="24"
        oninput="_mi.name=this.value">

      <label class="mi-label">Price (₱)</label>
      <input class="mi-input" id="miPrice" type="number" inputmode="decimal" value="${esc(m.price)}"
        oninput="_mi.price=parseFloat(this.value)||0">

      <label class="mi-label">Icon</label>
      <div class="mi-row">
        <div class="mi-prev">${prev}</div>
        <input class="mi-input" id="miIcon" type="text" value="${esc(m.icon)}" maxlength="4" style="width:72px;text-align:center;"
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
        <button type="button" class="mi-btn" onclick="resetMenuItem()">Reset item</button>
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
  const d = DRINKS.find(x => x.code === m.code);
  const l = getMenuLayout();
  const name = (m.name || "").trim();
  l.items[m.code] = {
    name:  name && name !== d.defaultName ? name : "",
    icon:  m.icon && m.icon !== d.defaultIcon ? m.icon : "",
    img:   m.img || "",
    color: m.color || "",
    hidden: !!m.hidden,
  };
  if (!l.order.length) l.order = DRINKS.map(x => x.code);
  saveMenuLayout(l);
  if (m.price !== d.price) {
    const s = getSettings(); s.prices[m.code] = m.price; saveSettings(s);
  }
  closeMenuItemEditor();
  buildCatalogue(); renderDrinkButtons();
}

function resetMenuItem() {
  const m = _mi; if (!m) return;
  const l = getMenuLayout();
  delete l.items[m.code];
  saveMenuLayout(l);
  closeMenuItemEditor();
  buildCatalogue(); renderDrinkButtons();
}

function resetMenuLayout() {
  if (!confirm("Reset the menu order, names, icons and colors to default?")) return;
  localStorage.removeItem(MENU_KEY);
  localStorage.setItem("brewsSettingsModified", new Date().toISOString());
  buildCatalogue(); renderDrinkButtons();
}
