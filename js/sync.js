/**
 * sync.js — Firebase Firestore sync for BREWS.CO
 *
 * WORKER  → push: merges history + data  | pull: settings replace + history merge
 * MANAGER → push: settings only          | pull: everything (full replace)
 *
 * History merge rule (both push and pull):
 *   Cloud entries + local entries are combined by date.
 *   Local always wins on same-date conflict — the device that worked that shift
 *   is the source of truth for that day.
 *
 * This means:
 *   - Workers can SEE all shifts from all devices (cross-check) ✓
 *   - Workers can never accidentally overwrite another worker's entry ✓
 *   - Manager sees everything after pulling ✓
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
const ROLE_KEY = "brewsDeviceRole"; // "worker" | "manager" — stored locally, never synced

// Worker pushes/pulls these. Array keys are always MERGED, never replaced.
const DATA_KEYS = [
  "inventoryHistory",
  "brewsOrderLog",
  "brewsFlavorOOS",
  "brewsLastEndingCups",
  "brewsOrderRetention",
];

// Manager pushes only these.
const SETTINGS_KEYS = ["brewsSettings"];

// These DATA_KEYS hold arrays of {date,...} objects and use the merge strategy.
const MERGE_ARRAY_KEYS = ["inventoryHistory", "brewsOrderLog"];

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

// ── Merge helpers ─────────────────────────────────────────────────────────────
// Combines two {date,...} arrays. localArr wins on same-date conflict.
function _mergeByDate(cloudArr, localArr) {
  const map = {};
  (cloudArr || []).forEach(e => { if (e.date) map[e.date] = e; });
  (localArr  || []).forEach(e => { if (e.date) map[e.date] = e; }); // local overwrites cloud
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

// ── Push ──────────────────────────────────────────────────────────────────────
async function syncPush() {
  const db = _initDB();
  if (!db) throw new Error("Firebase unavailable — check your connection.");

  const role = getDeviceRole();

  if (role === "manager") {
    // Manager: push settings only
    const data = {};
    SETTINGS_KEYS.forEach(k => {
      const v = localStorage.getItem(k);
      if (v != null) data[k] = v;
    });
    data._settingsPushedAt = new Date().toISOString();
    await _db.doc(SHOP_DOC).set(data, { merge: true });

  } else {
    // Worker: fetch cloud first so we can merge history arrays
    let cloudData = {};
    try {
      const snap = await _db.doc(SHOP_DOC).get();
      if (snap.exists) cloudData = snap.data();
    } catch (e) {
      console.warn("Could not fetch cloud for merge — pushing local only:", e);
    }

    const data = {};

    // Merge array-based history keys (cloud + local, local wins)
    MERGE_ARRAY_KEYS.forEach(k => {
      const cloudArr = JSON.parse(cloudData[k] || "[]");
      const localArr = JSON.parse(localStorage.getItem(k) || "[]");
      const merged   = _mergeByDate(cloudArr, localArr);
      data[k] = JSON.stringify(merged);
      // Also update local so this worker sees all shifts after pushing
      localStorage.setItem(k, data[k]);
    });

    // Non-array data keys: local wins outright
    DATA_KEYS.filter(k => !MERGE_ARRAY_KEYS.includes(k)).forEach(k => {
      const v = localStorage.getItem(k);
      if (v != null) data[k] = v;
    });

    // Dynamic monthly expense keys
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("brewsMonthlyExp_")) data[k] = localStorage.getItem(k);
    }

    data._dataPushedAt = new Date().toISOString();
    await _db.doc(SHOP_DOC).set(data, { merge: true });
  }

  const ts = new Date().toISOString();
  localStorage.setItem(SYNC_TS, ts);
  return ts;
}

// ── Pull ──────────────────────────────────────────────────────────────────────
async function syncPull() {
  const db = _initDB();
  if (!db) throw new Error("Firebase unavailable — check your connection.");

  const snap = await _db.doc(SHOP_DOC).get();
  if (!snap.exists) throw new Error("No cloud data found yet.\nPush from a device first.");

  const data = snap.data();
  const role = getDeviceRole();

  if (role === "manager") {
    // Manager: full replace — sees everything from all devices
    Object.entries(data).forEach(([k, v]) => {
      if (!k.startsWith("_") && v != null) localStorage.setItem(k, v);
    });

  } else {
    // Worker pull:
    // 1. Settings → replace (so prices/flavors are always current)
    SETTINGS_KEYS.forEach(k => {
      if (data[k] != null) localStorage.setItem(k, data[k]);
    });

    // 2. History arrays → MERGE (worker sees all shifts, but local entries are never lost)
    MERGE_ARRAY_KEYS.forEach(k => {
      const cloudArr = JSON.parse(data[k] || "[]");
      const localArr = JSON.parse(localStorage.getItem(k) || "[]");
      const merged   = _mergeByDate(cloudArr, localArr);
      localStorage.setItem(k, JSON.stringify(merged));
    });

    // 3. Everything else (brewsFlavorOOS, brewsLastEndingCups, etc.) — keep local
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
