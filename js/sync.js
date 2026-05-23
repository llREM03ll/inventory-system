/**
 * sync.js — Firebase Firestore sync for BREWS.CO
 * Role-aware: Workers push data only, Managers push settings only.
 * Both always pull everything. Uses { merge: true } so pushes
 * never overwrite each other's fields in Firestore.
 */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC7mrSF39Z95nkZUb1ZJ_Cz_c0rf_lz1-Y",
  authDomain:        "brews-co.firebaseapp.com",
  projectId:         "brews-co",
  storageBucket:     "brews-co.firebasestorage.app",
  messagingSenderId: "616181567630",
  appId:             "1:616181567630:web:bd1d78bf8ced49f29f39df",
};

const SHOP_DOC  = "shops/brews-co-main";
const SYNC_TS   = "brewsLastSync";
const ROLE_KEY  = "brewsDeviceRole"; // "worker" | "manager"

// ── Key splits ────────────────────────────────────────────────────────────────
// Workers push these — shift history, order logs, stock data
const DATA_KEYS = [
  "inventoryHistory",
  "brewsOrderLog",
  "brewsFlavorOOS",
  "brewsLastEndingCups",
  "brewsOrderRetention",
];

// Managers push these — prices, salary formula, flavors
const SETTINGS_KEYS = [
  "brewsSettings",
];

// ── Role helpers (global) ─────────────────────────────────────────────────────
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

function _restoreLocalData(data) {
  Object.entries(data).forEach(([k, v]) => {
    if (!k.startsWith("_") && v != null) localStorage.setItem(k, v);
  });
}

// ── Push: role-aware, always uses { merge: true } ─────────────────────────────
async function syncPush() {
  const db = _initDB();
  if (!db) throw new Error("Firebase unavailable — check your connection.");

  const role = getDeviceRole();
  let data;

  if (role === "manager") {
    // Managers push settings only — leaves history/orders untouched in cloud
    data = _collectKeys(SETTINGS_KEYS);
    data._settingsPushedAt = new Date().toISOString();
  } else {
    // Workers push data + dynamic monthly expense keys — leaves settings untouched
    data = _collectKeys(DATA_KEYS);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("brewsMonthlyExp_")) data[k] = localStorage.getItem(k);
    }
    data._dataPushedAt = new Date().toISOString();
  }

  // merge: true — fields not in this push are left untouched in Firestore
  await db.doc(SHOP_DOC).set(data, { merge: true });
  const ts = new Date().toISOString();
  localStorage.setItem(SYNC_TS, ts);
  return ts;
}

// ── Pull: always pulls everything ─────────────────────────────────────────────
async function syncPull() {
  const db = _initDB();
  if (!db) throw new Error("Firebase unavailable — check your connection.");
  const snap = await db.doc(SHOP_DOC).get();
  if (!snap.exists) throw new Error("No cloud data found yet.\nPush from another device first.");
  const data = snap.data();
  _restoreLocalData(data);
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
