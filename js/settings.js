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
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    // Deep merge saved over defaults
    return {
      ...SETTINGS_DEFAULTS,
      ...saved,
      prices:      { ...SETTINGS_DEFAULTS.prices,      ...(saved.prices      || {}) },
      addonPrices: { ...SETTINGS_DEFAULTS.addonPrices, ...(saved.addonPrices || {}) },
      flavors:     {
        milktea:    (saved.flavors?.milktea    || SETTINGS_DEFAULTS.flavors.milktea),
        fruittea:   (saved.flavors?.fruittea   || SETTINGS_DEFAULTS.flavors.fruittea),
        icedcoffee: (saved.flavors?.icedcoffee || SETTINGS_DEFAULTS.flavors.icedcoffee),
        hotcoffee:  (saved.flavors?.hotcoffee  || SETTINGS_DEFAULTS.flavors.hotcoffee),
      },
    };
  } catch { return { ...SETTINGS_DEFAULTS }; }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function resetSettings() {
  localStorage.removeItem(SETTINGS_KEY);
}
