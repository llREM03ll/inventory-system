/**
 * sync.js - Firebase Firestore sync for BREWS.CO
 *
 * Every device is the same. Push sends history, orders AND settings/menu.
 *
 * History arrays are merged by date (local wins on same-date conflict), so
 * nobody overwrites another device's shift.
 *
 * Settings and menu layout carry a "last edited" time (brewsSettingsModified).
 * Pull only replaces local settings when the cloud copy is newer, so an edit
 * you made on this device is never wiped by the 3-minute auto-pull.
 */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC7mrSF39Z95nkZUb1ZJ_Cz_c0rf_lz1-Y",
  authDomain:        "brews-co.firebaseapp.com",
  projectId:         "brews-co",
  storageBucket:     "brews-co.firebasestorage.app",
  messagingSenderId: "616181567630",
  appId:             "1:616181567630:web:bd1d78bf8ced49f29f39df",
};

// The shop's cloud document. With a sync key (Settings → Cloud Sync) the document name is that
// secret key, so only devices that know it can reach the data. Without one, the old shared
// name is used so existing setups keep working.
const LEGACY_SHOP_ID = "brews-co-main";
const SYNC_KEY_STORE = "brewsSyncKey";
const SYNC_KEY_RE    = /^[A-Za-z0-9_-]{16,64}$/;
function getSyncKey() { const k = localStorage.getItem(SYNC_KEY_STORE) || ""; return SYNC_KEY_RE.test(k) ? k : ""; }
function hasSyncKey() { return !!getSyncKey(); }
function shopDoc() { return "shops/" + (getSyncKey() || LEGACY_SHOP_ID); }
function makeSyncKey() {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function _parseArr(v) { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }
function _validJSON(v) { try { JSON.parse(v); return true; } catch { return false; } }
const SYNC_TS  = "brewsLastSync";
const SETTINGS_MOD_KEY = "brewsSettingsModified";

// Array keys are MERGED, never replaced.
const DATA_KEYS = [
  "inventoryHistory",
  "brewsOrderLog",
  "brewsFlavorOOS",
  "brewsLastEndingCups",
  "brewsOrderRetention",
];

// Shared by every device (prices, salary, flavors, menu layout).
const SETTINGS_KEYS = ["brewsSettings", "brewsMenuLayout"];

// These DATA_KEYS hold arrays of {date,...} objects and use the merge strategy.
const MERGE_ARRAY_KEYS = ["inventoryHistory", "brewsOrderLog"];

// Call this whenever settings or the menu layout are edited.
function markSettingsModified() {
  localStorage.setItem(SETTINGS_MOD_KEY, new Date().toISOString());
}

// ── DB init ───────────────────────────────────────────────────────────────────
let _db = null;
function _initDB() {
  if (_db) return _db;
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    _db = firebase.firestore();
    return _db;
  } catch (e) {
    console.error("Firebase init failed:", e);
    return null;
  }
}

// ── Merge helpers ─────────────────────────────────────────────────────────────
function _mergeByDate(cloudArr, localArr) {
  const map = {};
  (cloudArr || []).forEach(e => { if (e.date) map[e.date] = e; });
  (localArr  || []).forEach(e => { if (e.date) map[e.date] = e; });
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

// ── Push ──────────────────────────────────────────────────────────────────────
async function syncPush() {
  const db = _initDB();
  if (!db) throw new Error("Cloud sync is not available right now.");

  let cloudData = {};
  try {
    const snap = await _db.doc(shopDoc()).get();
    if (snap.exists) cloudData = snap.data();
  } catch (e) {
    console.warn("Could not fetch cloud for merge, pushing local only:", e);
  }

  const data = {};

  // History arrays: merge cloud + local, local wins same date
  MERGE_ARRAY_KEYS.forEach(k => {
    const cloudArr = _parseArr(cloudData[k]);
    const localArr = _parseArr(localStorage.getItem(k));
    const merged   = _mergeByDate(cloudArr, localArr);
    data[k] = JSON.stringify(merged);
    localStorage.setItem(k, data[k]);
  });

  // Other data keys: local wins outright
  DATA_KEYS.filter(k => !MERGE_ARRAY_KEYS.includes(k)).forEach(k => {
    const v = localStorage.getItem(k);
    if (v != null) data[k] = v;
  });

  // Monthly expense keys
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("brewsMonthlyExp_")) data[k] = localStorage.getItem(k);
  }

  // Settings + menu: only push if this device's copy is at least as new as the cloud's
  const localMod = localStorage.getItem(SETTINGS_MOD_KEY) || "";
  const cloudMod = cloudData._settingsPushedAt || "";
  if (localMod && localMod >= cloudMod) {
    SETTINGS_KEYS.forEach(k => {
      const v = localStorage.getItem(k);
      if (v != null) data[k] = v;
    });
    data._settingsPushedAt = localMod;
  }

  data._dataPushedAt = new Date().toISOString();
  await _db.doc(shopDoc()).set(data, { merge: true });

  const ts = new Date().toISOString();
  localStorage.setItem(SYNC_TS, ts);
  return ts;
}

// ── Pull ──────────────────────────────────────────────────────────────────────
async function syncPull() {
  const db = _initDB();
  if (!db) throw new Error("Firebase unavailable. Check your connection.");

  const snap = await _db.doc(shopDoc()).get();
  if (!snap.exists) throw new Error("No cloud data found yet.\nPush from a device first.");

  const data = snap.data();

  // 1. Settings + menu: replace only when the cloud copy is newer
  const localMod = localStorage.getItem(SETTINGS_MOD_KEY) || "";
  const cloudMod = data._settingsPushedAt || "";
  const cloudHasSettings = SETTINGS_KEYS.some(k => data[k] != null);
  if (cloudHasSettings && (!localMod || cloudMod > localMod)) {
    SETTINGS_KEYS.forEach(k => {
      if (typeof data[k] === "string" && _validJSON(data[k])) localStorage.setItem(k, data[k]);
    });
    if (cloudMod) localStorage.setItem(SETTINGS_MOD_KEY, cloudMod);
  }

  // 2. History arrays: merge
  MERGE_ARRAY_KEYS.forEach(k => {
    const cloudArr = _parseArr(data[k]);
    const localArr = _parseArr(localStorage.getItem(k));
    localStorage.setItem(k, JSON.stringify(_mergeByDate(cloudArr, localArr)));
  });

  // 3. Monthly expenses from other devices
  Object.entries(data).forEach(([k, v]) => {
    if (/^brewsMonthlyExp_[\d-]+$/.test(k) && typeof v === "string" && _validJSON(v)) localStorage.setItem(k, v);
  });

  const ts = new Date().toISOString();
  localStorage.setItem(SYNC_TS, ts);
  return ts;
}

function getLastSyncDisplay() {
  const t = localStorage.getItem(SYNC_TS);
  if (!t) return null;
  return new Date(t).toLocaleString("en-PH", {
    month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"
  });
}
