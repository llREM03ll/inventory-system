/**
 * storage.js
 * Persists and restores form input state via localStorage.
 */

const INPUT_STORAGE_KEY = "brewsInputState";

const FIELD_IDS = [
  "beginM", "endM", "tallyMC",
  "beginL", "endL", "tallyLC",
  "beginS", "endS",
  "beginHC", "endHC",
  "deliveredM", "deliveredL", "deliveredS", "deliveredHC",
  "damageM", "damageL", "damageS", "damageHC",
  "addons"
];

function saveInputs() {
  const state = {};
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) state[id] = el.value;
  });
  const rows = document.querySelectorAll("#expensesContainer .expense-row");
  state._expenses = [];
  rows.forEach(row => {
    state._expenses.push({
      name:  row.querySelector(".exp-name").value,
      price: row.querySelector(".exp-price").value
    });
  });

  const needRows = document.querySelectorAll("#needsContainer .need-row");
  state._needs = [];
  needRows.forEach(row => {
    const val = row.querySelector(".need-text")?.value?.trim();
    if (val) state._needs.push(val);
  });

  localStorage.setItem(INPUT_STORAGE_KEY, JSON.stringify(state));
}

function restoreInputs() {
  const raw = localStorage.getItem(INPUT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && state[id] !== undefined) el.value = state[id];
    });
    return { expenses: state._expenses || [], needs: state._needs || [] };
  } catch { return null; }
}

function clearInputStorage() {
  localStorage.removeItem(INPUT_STORAGE_KEY);
}

function attachInputListeners() {
  FIELD_IDS.forEach(id => {
    document.getElementById(id)?.addEventListener("input", saveInputs);
  });
  document.getElementById("expensesContainer")?.addEventListener("input", saveInputs);
}
