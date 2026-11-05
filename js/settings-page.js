/**
 * settings-page.js
 * Settings page. Everything saves as you go, there is no Save button.
 * Sections: Products, Flavors, Add-ons, Pay & Alerts, Appearance, Cloud Sync, Backup.
 */
const OPEN_KEY = "brewsSettingsOpen";

function toast(msg) {
  const t = document.getElementById("settingsToast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1500);
}

const num = id => Math.max(0, parseFloat(document.getElementById(id)?.value) || 0);

// ── Saving ───────────────────────────────────────────────────────────────────
// Always works on a fresh copy so an edit in one section never overwrites another.
function updateSettings(fn) {
  const cur = getSettings();
  fn(cur);
  saveSettings(cur);
  toast("Saved ✓");
}

function savePay() {
  updateSettings(c => {
    c.salaryBase           = num("sp_salaryBase");
    c.salaryBonusThreshold = num("sp_bonusThreshold");
    c.salaryBonusPerK      = num("sp_bonusPerK");
    c.quotaStart           = num("sp_quotaStart");
    c.lowStock             = num("sp_lowStock");
    c.soundEnabled         = document.getElementById("sp_sound").checked;
  });
}

function saveAddons() {
  updateSettings(c => {
    c.addonPrices = {};
    document.querySelectorAll(".saddon-row").forEach(r => {
      const name  = r.querySelector(".saddon-name")?.value?.trim();
      const price = Math.max(0, parseFloat(r.querySelector(".saddon-price")?.value) || 0);
      if (name) c.addonPrices[name] = price;
    });
  });
}
function addAddonRow() {
  document.getElementById("saddonContainer").insertAdjacentHTML("beforeend", `
    <div class="expense-row saddon-row">
      <input class="smodal-input saddon-name" type="text" placeholder="Add-on name" onchange="saveAddons()">
      <input class="smodal-input saddon-price" type="number" inputmode="decimal" min="0" placeholder="₱0" onchange="saveAddons()">
      <button type="button" onclick="this.parentElement.remove();saveAddons();">✕</button>
    </div>`);
}

// ── Flavors ──────────────────────────────────────────────────────────────────
function flavorAdd(key) {
  const input = document.getElementById("sfi_" + key);
  const names = _splitFlavors(input?.value);
  if (!names.length) return;
  updateSettings(c => {
    const list = c.flavors[key] || (c.flavors[key] = []);
    names.forEach(n => { if (!list.some(x => x.toLowerCase() === n.toLowerCase())) list.push(n); });
  });
  renderFlavors();
  document.getElementById("sfi_" + key)?.focus();
}
function flavorRemove(key, i) {
  updateSettings(c => { (c.flavors[key] || []).splice(i, 1); });
  renderFlavors(); renderMenuList();
}
function renderFlavors() {
  const box = document.getElementById("flavorLists");
  if (!box) return;
  const flavors = getSettings().flavors;
  box.innerHTML = flavorListInfo().map(({ key, label }) => {
    const list = flavors[key] || [];
    return `
    <div class="sflavor-cat">
      <div class="sflavor-cat-title">${esc(label)} <small style="color:var(--bark);font-weight:600;">(${list.length})</small></div>
      <div class="sflavor-pills">${list.length
        ? list.map((f, i) => `<span class="sflavor-pill">${esc(f)}<button type="button" class="sflavor-pill-del" onclick="flavorRemove('${esc(key)}',${i})" aria-label="Remove">✕</button></span>`).join("")
        : `<span style="font-size:0.76rem;color:var(--mochaccino);">No flavors yet</span>`}</div>
      <div class="sflavor-add-row">
        <input class="sflavor-add-input" id="sfi_${esc(key)}" type="text" placeholder="Add flavor (or several, separated by commas)"
          onkeydown="if(event.key==='Enter'){flavorAdd('${esc(key)}');event.preventDefault();}">
        <button type="button" class="sflavor-add-btn" onclick="flavorAdd('${esc(key)}')">+ Add</button>
      </div>
    </div>`;
  }).join("");
}

// ── Products ─────────────────────────────────────────────────────────────────
function renderMenuList() {
  const el = document.getElementById("menuManager");
  if (el) renderMenuManager(el);
}
// Called by menu.js after any product add / edit / delete / reorder
window.onMenuChanged = () => { renderMenuList(); renderFlavors(); };

// ── Appearance ───────────────────────────────────────────────────────────────
function setAppFont(k) { window.BrewsStyle.set({ font: k }); renderAppearanceChips(); }
function setAppSize(v) { window.BrewsStyle.set({ size: v }); renderAppearanceChips(); }
function renderAppearanceChips() {
  const st = window.BrewsStyle.get();
  document.getElementById("fontChips").innerHTML = Object.entries(window.BrewsStyle.FONTS).map(([k, f]) =>
    `<button type="button" class="style-opt${st.font === k ? " active" : ""}" onclick="setAppFont('${k}')">${f.label}</button>`).join("");
  document.getElementById("sizeChips").innerHTML = Object.entries(window.BrewsStyle.SIZES).map(([k, l]) =>
    `<button type="button" class="style-opt${st.size === Number(k) ? " active" : ""}" onclick="setAppSize(${k})">${l}</button>`).join("");
}

// ── Cloud sync key ───────────────────────────────────────────────────────────
function renderSyncState() {
  const key = getSyncKey();
  document.getElementById("syncKeyInput").value = key;
  document.getElementById("syncKeyState").innerHTML = key
    ? `<span style="color:var(--success-dark);font-weight:700;">🔒 Private sync key is on.</span> Enter the same key on every device.`
    : `<span style="color:var(--danger-soft);font-weight:700;">⚠ No key set.</span> This device uses the old shared cloud name, which anyone could guess. Generate a key, then Push from this device and enter the same key on the others.`;
}
function saveSyncKey() {
  const v = document.getElementById("syncKeyInput").value.trim();
  if (v && !SYNC_KEY_RE.test(v)) { alert("The sync key must be 16 to 64 letters, numbers, - or _."); return; }
  if (v) localStorage.setItem(SYNC_KEY_STORE, v); else localStorage.removeItem(SYNC_KEY_STORE);
  localStorage.removeItem("brewsLastSync");
  renderSyncState(); toast("Sync key saved ✓");
}
function generateSyncKey() {
  document.getElementById("syncKeyInput").value = makeSyncKey();
  saveSyncKey();
}
function copySyncKey() {
  const k = getSyncKey();
  if (!k) return;
  (navigator.clipboard ? navigator.clipboard.writeText(k) : Promise.reject()).then(() => toast("Key copied")).catch(() => alert("Copy this key:\n\n" + k));
}

// ── Backup & restore ─────────────────────────────────────────────────────────
function isBackupKey(k) { return k !== SYNC_KEY_STORE && (k === "inventoryHistory" || /^brews[A-Za-z0-9_-]*$/.test(k)); }

function exportBackup() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isBackupKey(k)) data[k] = localStorage.getItem(k);
  }
  const blob = new Blob([JSON.stringify({ app: "brews-co", exportedAt: new Date().toISOString(), data })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "brews-backup-" + localDate() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch { alert("That file is not a valid backup."); return; }
    const data = parsed && parsed.app === "brews-co" && parsed.data;
    if (!data || typeof data !== "object") { alert("That file is not a BREWS.CO backup."); return; }
    const keys = Object.keys(data).filter(k => isBackupKey(k) && typeof data[k] === "string");
    if (!keys.length) { alert("The backup has nothing to restore."); return; }
    if (!confirm(`Restore ${keys.length} items from this backup?\n\nIt replaces the matching data on this device.`)) return;
    keys.forEach(k => { try { JSON.parse(data[k]); localStorage.setItem(k, data[k]); } catch {} });
    localStorage.setItem("brewsSettingsModified", new Date().toISOString());
    alert("Backup restored."); location.reload();
  };
  reader.readAsText(file);
}

function confirmResetSettings() {
  if (!confirm("Reset prices, salary, add-ons and flavors to defaults?\n\nYour menu layout and history are not touched. This cannot be undone.")) return;
  resetSettings(); renderAll(); toast("Settings reset");
}

// ── Layout ───────────────────────────────────────────────────────────────────
function fold(id, title, body, open) {
  return `<details class="fold" id="fold_${id}" ${open ? "open" : ""}><summary>${title}</summary><div class="fold-body">${body}</div></details>`;
}
function field(id, label, val, handler) {
  return `<div class="smodal-field"><label class="smodal-label" for="${id}">${label}</label>
    <input class="smodal-input" id="${id}" type="number" inputmode="decimal" min="0" value="${val}" onchange="${handler}"></div>`;
}

function renderAll() {
  const s = getSettings();
  const openSet = new Set(readJSON(OPEN_KEY, ["products"]));

  const addonRows = Object.entries(s.addonPrices).map(([name, price]) => `
    <div class="expense-row saddon-row">
      <input class="smodal-input saddon-name" type="text" value="${esc(name)}" placeholder="Add-on name" onchange="saveAddons()">
      <input class="smodal-input saddon-price" type="number" inputmode="decimal" min="0" value="${esc(price)}" placeholder="₱0" onchange="saveAddons()">
      <button type="button" onclick="this.parentElement.remove();saveAddons();">✕</button>
    </div>`).join("");

  document.getElementById("settingsBody").innerHTML =
    fold("products", "🧋 Products", `
      <div style="font-size:0.76rem;color:var(--bark);margin-bottom:10px;line-height:1.5;">Tap a product to change its name, price, cup, flavors, icon or color. New products can have their own flavor list. Use the arrows to reorder.</div>
      <div id="menuManager"></div>`, openSet.has("products")) +

    fold("flavors", "🏷️ Flavors", `
      <div style="font-size:0.76rem;color:var(--bark);margin-bottom:10px;line-height:1.5;">Every flavor list in one place. A product that has its own list gets its own line here.</div>
      <div id="flavorLists"></div>`, openSet.has("flavors")) +

    fold("addons", "➕ Add-ons", `
      <div id="saddonContainer">${addonRows}</div>
      <button class="add-expense-btn" onclick="addAddonRow()">+ Add Add-on</button>`, openSet.has("addons")) +

    fold("pay", "💰 Pay &amp; Alerts", `
      <div class="smodal-grid-3">
        ${field("sp_salaryBase", "Base Salary (₱)", s.salaryBase, "savePay()")}
        ${field("sp_bonusThreshold", "Bonus at (₱)", s.salaryBonusThreshold, "savePay()")}
        ${field("sp_bonusPerK", "Bonus per ₱1,000", s.salaryBonusPerK, "savePay()")}
      </div>
      <div style="font-size:0.72rem;color:var(--dust);margin:8px 0 14px;line-height:1.5;">Staff earns the base salary when cup sales reach it. At the bonus amount the bonus starts, then repeats for every extra ₱1,000.</div>
      <div class="smodal-grid">
        ${field("sp_quotaStart", "Quota toast at (₱)", s.quotaStart, "savePay()")}
        ${field("sp_lowStock", "Low stock (cups)", s.lowStock, "savePay()")}
      </div>
      <label style="display:flex;align-items:center;gap:10px;padding:14px 0 0;cursor:pointer;">
        <input type="checkbox" id="sp_sound" ${s.soundEnabled ? "checked" : ""} onchange="savePay()" style="width:18px;height:18px;accent-color:var(--caramel);">
        <span style="font-size:0.84rem;color:var(--roast);font-weight:600;">Order sounds 🔔</span>
      </label>`, openSet.has("pay")) +

    fold("look", "🎨 Appearance (this device)", `
      <div class="theme-label">Font</div>
      <div class="style-opts" id="fontChips"></div>
      <div class="theme-label" style="margin-top:12px;">Text Size</div>
      <div class="style-opts" id="sizeChips"></div>
      <div class="theme-section" style="margin-top:18px;">
        <div class="theme-label">Accent Color</div>
        <div class="theme-color-row">
          <input type="color" id="themeColorInput" value="#C4813A" oninput="onThemeColorChange(this.value)">
          <div class="theme-swatches" id="themeSwatches"></div>
        </div>
        <button type="button" class="theme-text-btn" onclick="resetThemeAccent()">Reset to default caramel</button>
      </div>
      <div class="theme-section" style="margin-bottom:0;">
        <div class="theme-label">Background Photo</div>
        <input type="file" accept="image/*" id="themeBgInput" style="display:none;" onchange="onThemeBgSelected(this.files[0])">
        <div style="display:flex;gap:8px;">
          <button type="button" class="theme-upload-btn" onclick="document.getElementById('themeBgInput').click()">📷 Choose Photo</button>
          <button type="button" class="theme-text-btn" id="themeBgClearBtn" style="display:none;flex-shrink:0;" onclick="clearThemeBg()">Remove</button>
        </div>
        <div id="themeBgPreviewWrap" style="display:none;margin-top:10px;">
          <img id="themeBgPreview" alt="" style="width:100%;max-height:120px;object-fit:cover;border-radius:var(--radius-md);border:1.5px solid var(--latte);">
        </div>
      </div>`, openSet.has("look")) +

    fold("sync", "☁️ Cloud Sync", `
      <div id="syncKeyState" style="font-size:0.78rem;color:var(--bark);line-height:1.5;margin-bottom:10px;"></div>
      <input class="smodal-input" id="syncKeyInput" type="text" placeholder="Sync key" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="fold-actions" style="flex-direction:row;flex-wrap:wrap;">
        <button class="fold-btn" style="flex:1;" onclick="saveSyncKey()">Save Key</button>
        <button class="fold-btn" style="flex:1;" onclick="generateSyncKey()">🔑 Generate</button>
        <button class="fold-btn" style="flex:1;" onclick="copySyncKey()">Copy</button>
      </div>`, openSet.has("sync")) +

    fold("data", "💾 Backup &amp; Reset", `
      <div style="font-size:0.76rem;color:var(--bark);margin-bottom:10px;line-height:1.5;">A backup holds your history, orders, settings and menu from this device.</div>
      <div class="fold-actions">
        <button class="fold-btn" onclick="exportBackup()">⬇️ Download Backup</button>
        <input type="file" accept="application/json,.json" id="backupFile" style="display:none" onchange="importBackup(this.files[0])">
        <button class="fold-btn" onclick="document.getElementById('backupFile').click()">⬆️ Restore from Backup</button>
        <button class="fold-btn danger" onclick="confirmResetSettings()">↺ Reset Settings to Default</button>
      </div>
      <div style="font-size:0.68rem;color:var(--dust);margin-top:14px;text-align:center;">BREWS.CO · version 16 · <a href="LICENSE" style="color:var(--bark);">License</a> · <a href="vendor/THIRD_PARTY_NOTICES.md" style="color:var(--bark);">Open-source notices</a></div>`, openSet.has("data"));

  // remember which sections are open
  document.querySelectorAll("details.fold").forEach(d => d.addEventListener("toggle", () => {
    writeJSON(OPEN_KEY, [...document.querySelectorAll("details.fold[open]")].map(x => x.id.replace("fold_", "")));
  }));

  renderMenuList();
  renderFlavors();
  renderAppearanceChips();
  renderSyncState();
  renderThemeSection();
}

    // ── Theme (accent color + background photo) ──────────────────────────────
    const THEME_SWATCHES = ["#C4813A","#4A90D9","#4AA88A","#D46A9E","#7C6FD4","#D45A5A","#3D3D3D","#2E8B8B"];

    function renderThemeSection() {
      document.getElementById("themeColorInput").value = window.BrewsTheme.getAccent();
      renderThemeSwatches();
      updateThemeBgUI();
    }

    function renderThemeSwatches() {
      const current = window.BrewsTheme.getAccent().toLowerCase();
      const wrap = document.getElementById("themeSwatches");
      wrap.innerHTML = THEME_SWATCHES.map(c => `
        <button type="button" class="theme-swatch${c.toLowerCase()===current?" active":""}"
          style="background:${c};" onclick="onThemeColorChange('${c}')"></button>
      `).join("");
    }

    function setAppFont(k) { window.BrewsStyle.set({ font: k }); collectFromUI(); renderSettingsModal(); }
    function setAppSize(n) { window.BrewsStyle.set({ size: n }); collectFromUI(); renderSettingsModal(); }

    function onThemeColorChange(hex) {
      window.BrewsTheme.setAccent(hex);
      document.getElementById("themeColorInput").value = hex;
      renderThemeSwatches();
    }

    function resetThemeAccent() {
      window.BrewsTheme.resetAccent();
      document.getElementById("themeColorInput").value = window.BrewsTheme.BASE.caramel;
      renderThemeSwatches();
    }

    function updateThemeBgUI() {
      const bg       = window.BrewsTheme.getBackground();
      const clearBtn = document.getElementById("themeBgClearBtn");
      const wrap     = document.getElementById("themeBgPreviewWrap");
      const preview  = document.getElementById("themeBgPreview");
      if (bg) {
        clearBtn.style.display = "block";
        wrap.style.display     = "block";
        preview.src            = bg;
      } else {
        clearBtn.style.display = "none";
        wrap.style.display     = "none";
        preview.src            = "";
      }
    }

    // Resizes/compresses the chosen photo client-side before storing it
    // (localStorage has a low size ceiling, and a phone photo straight off
    // the camera would blow way past it).
    function onThemeBgSelected(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1280;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            const scale = MAX / Math.max(width, height);
            width  = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
          if (window.BrewsTheme.setBackground(dataUrl)) updateThemeBgUI();
          else alert("That photo was too large to save. Try a smaller image.");
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function clearThemeBg() {
      window.BrewsTheme.clearBackground();
      updateThemeBgUI();
    }


renderAll();
