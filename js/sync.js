/**
 * sync.js — Firebase Firestore sync for BREWS.CO
 *
 * WORKER  → push: DATA_KEYS only   | pull: SETTINGS_KEYS only
 * MANAGER → push: SETTINGS_KEYS only | pull: everything
 *
 * Uses { merge:true } so pushes never wipe the other role's fields.
 */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC7mrSF39Z95nkZUb1ZJ_Cz_c0rf_lz1-Y",
  authDomain:        "brews-co.firebaseapp.com",
  projectId:         "brews-co",
  storageBucket:     "brews-co.firebasestorage.app",
  messagingSenderId: "616181567630",
  appId:             "1:616181567630:web:bd1d78bf8ced49f29f39df",
};

const SHOP_DOC = "shops/brews-co-main";
const SYNC_TS  = "brewsLastSync";
const ROLE_KEY = "brewsDeviceRole"; // "worker" | "manager"  — never synced

// Worker pushes these (shift output) — settings are untouched in Firestore
const DATA_KEYS = [
  "inventoryHistory",
  "brewsOrderLog",
  "brewsFlavorOOS",
  "brewsLastEndingCups",
  "brewsOrderRetention",
];

// Manager pushes these (config) — history/orders are untouched in Firestore
const SETTINGS_KEYS = [
  "brewsSettings",
];

// ── Role helpers ──────────────────────────────────────────────────────────────
function getDeviceRole() {
  return localStorage.getItem(ROLE_KEY) || "worker";
}
function setDeviceRole(role) {
  localStorage.setItem(ROLE_KEY, role === "manager" ? "manager" : "worker");
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

function _collectKeys(keys) {
  const data = {};
  keys.forEach(k => {
    const v = localStorage.getItem(k);
    if (v != null) data[k] = v;
  });
  return data;
}

function _restoreKeys(data, keys) {
  // Only restore the specified keys — leaves everything else untouched locally
  keys.forEach(k => {
    if (data[k] != null) localStorage.setItem(k, data[k]);
  });
}

// ── Push ──────────────────────────────────────────────────────────────────────
// Worker  → pushes DATA_KEYS      (history, orders, OOS flags, etc.)
// Manager → pushes SETTINGS_KEYS  (prices, salary, flavors)
async function syncPush() {
  const db = _initDB();
  if (!db) throw new Error("Firebase unavailable — check your connection.");

  const role = getDeviceRole();
  let data;

  if (role === "manager") {
    data = _collectKeys(SETTINGS_KEYS);
    data._settingsPushedAt = new Date().toISOString();
  } else {
    data = _collectKeys(DATA_KEYS);
    // Also grab dynamic monthly expense keys
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("brewsMonthlyExp_")) data[k] = localStorage.getItem(k);
    }
    data._dataPushedAt = new Date().toISOString();
  }

  // merge:true — fields not in this push are left untouched in Firestore
  await db.doc(SHOP_DOC).set(data, { merge: true });
  const ts = new Date().toISOString();
  localStorage.setItem(SYNC_TS, ts);
  return ts;
}

// ── Pull ──────────────────────────────────────────────────────────────────────
// Worker  → pulls SETTINGS_KEYS only  (prices/flavors refresh, history untouched locally)
// Manager → pulls everything           (to see latest history from all workers)
async function syncPull() {
  const db = _initDB();
  if (!db) throw new Error("Firebase unavailable — check your connection.");

  const snap = await db.doc(SHOP_DOC).get();
  if (!snap.exists) throw new Error("No cloud data found yet.\nPush from another device first.");

  const data = snap.data();
  const role = getDeviceRole();

  if (role === "manager") {
    // Restore everything except internal Firestore timestamps
    Object.entries(data).forEach(([k, v]) => {
      if (!k.startsWith("_") && v != null) localStorage.setItem(k, v);
    });
  } else {
    // Workers only restore settings — local history/orders are never overwritten
    _restoreKeys(data, SETTINGS_KEYS);
  }

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
