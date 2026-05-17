/**
 * sync.js — Firebase Firestore sync for BREWS.CO
 * Push/pull all shop data between devices.
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

// Keys to sync — session/POS state excluded intentionally
const SYNC_KEYS = [
  "brewsSettings",
  "inventoryHistory",
  "brewsOrderLog",
  "brewsFlavorOOS",
  "brewsLastEndingCups",
  "brewsOrderRetention",
];

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

function _collectLocalData() {
  const data = {};
  SYNC_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v != null) data[k] = v;
  });
  // Dynamic monthly expense keys
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("brewsMonthlyExp_")) data[k] = localStorage.getItem(k);
  }
  return data;
}

function _restoreLocalData(data) {
  Object.entries(data).forEach(([k, v]) => {
    if (k !== "_pushedAt" && v != null) localStorage.setItem(k, v);
  });
}

async function syncPush() {
  const db = _initDB();
  if (!db) throw new Error("Firebase unavailable — check your connection.");
  const data = _collectLocalData();
  data._pushedAt = new Date().toISOString();
  await db.doc(SHOP_DOC).set(data);
  const ts = new Date().toISOString();
  localStorage.setItem(SYNC_TS, ts);
  return ts;
}

async function syncPull() {
  const db = _initDB();
  if (!db) throw new Error("Firebase unavailable — check your connection.");
  const snap = await db.doc(SHOP_DOC).get();
  if (!snap.exists) throw new Error("No cloud data found yet.\nPush from another device first.");
  const data = snap.data();
  _restoreLocalData(data);
  const ts = new Date().toISOString();
  localStorage.setItem(SYNC_TS, ts);
  return data._pushedAt || ts;
}

function getLastSyncDisplay() {
  const t = localStorage.getItem(SYNC_TS);
  if (!t) return null;
  return new Date(t).toLocaleString("en-PH", {
    month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"
  });
}
