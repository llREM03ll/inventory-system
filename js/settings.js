/**
 * settings.js
 * Central configurable settings with defaults.
 * All hardcoded business values live here.
 */

const SETTINGS_KEY = "brewsSettings";

const SETTINGS_DEFAULTS = {
  // ── Drink prices ─────────────────────────────────
  prices: {
    M:29, L:39, S:25,
    MC:35, LC:45,
    HC:45,
    FTM:29, FTL:39,
  },
  // ── Addon prices ─────────────────────────────────
  addonPrices: {
    "Pearl":6, "Nata":6, "Coffee Jelly":6,
    "Oreo":6, "Cream Cheese":10, "Espresso Shot":6,
  },
  // ── Salary formula ───────────────────────────────
  salaryBase:           350,   // base daily pay
  salaryBonusThreshold: 3000,  // cup sales needed to unlock bonus
  salaryBonusPerK:      50,    // bonus per ₱1,000 above threshold
  // ── Quota notification ────────────────────────────
  quotaStart:           3000,  // first toast fires here
  // ── Low stock warning ─────────────────────────────
  lowStock:             5,     // cups remaining before yellow warning
  // ── Sound ────────────────────────────────────────
  soundEnabled:         true,
  // ── Flavors ──────────────────────────────────────
  flavors: {
    milktea: [
      "Chocolate","Red Velvet","Dark Chocolate","Choco Kisses","Nutella","Black Forest","Mocha",
      "Taro","Cheesecake","Strawberry","Mango Cheesecake","Winter Melon","Okinawa",
      "Salted Caramel","Matcha","Cookies & Cream","Cappuccino","Avocado",
      "Buko Pandan","Vanilla","Hokkaido"
    ],
    fruittea: [
      "Lychee","Blueberry","Green Apple","Mango",
      "Four Seasons","Passion Fruit","Lemon","Kiwi","Strawberry Ft"
    ],
    icedcoffee: [
      "Caramel Macchiato","Vanilla","Matcha","Dark Chocolate",
      "Salted Caramel","Mocha","Spanish Latte","Chocolate","Brewsco"
    ],
    hotcoffee: [
      "Matcha","Chocolate","Brewsko","Caramel Latte","Spanish Latte"
    ],
  },
};

function getSettings() {
  const raw   = readJSON(SETTINGS_KEY, {});
  const saved = raw && typeof raw === "object" ? raw : {};
  const sf    = saved.flavors && typeof saved.flavors === "object" ? saved.flavors : {};

  // Flavor lists: the 4 built-in ones fall back to defaults; any other list
  // (for example one that belongs to a product you added) is kept as saved.
  const flavors = {};
  Object.keys(SETTINGS_DEFAULTS.flavors).forEach(k => {
    flavors[k] = Array.isArray(sf[k]) ? sf[k].map(String) : [...SETTINGS_DEFAULTS.flavors[k]];
  });
  Object.keys(sf).forEach(k => {
    if (!(k in flavors) && Array.isArray(sf[k])) flavors[k] = sf[k].map(String);
  });

  return {
    ...SETTINGS_DEFAULTS,
    ...saved,
    prices:      { ...SETTINGS_DEFAULTS.prices,      ...(saved.prices      || {}) },
    addonPrices: { ...SETTINGS_DEFAULTS.addonPrices, ...(saved.addonPrices || {}) },
    flavors,
  };
}

function saveSettings(s) {
  writeJSON(SETTINGS_KEY, s);
  localStorage.setItem("brewsSettingsModified", new Date().toISOString());
}

function resetSettings() {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.setItem("brewsSettingsModified", new Date().toISOString());
}
