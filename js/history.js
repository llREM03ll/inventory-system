/**
 * history.js
 * CRUD helpers for the daily results history stored in localStorage.
 */

const HISTORY_KEY = "inventoryHistory";

function getAllHistory() {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  return history.sort((a, b) => (a.date > b.date ? -1 : 1));
}

function saveHistory(date, results) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  const idx     = history.findIndex(h => h.date === date);
  const entry   = { date, results };
  if (idx >= 0) history[idx] = entry;
  else history.push(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function getHistoryByDate(date) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  return history.find(h => h.date === date) || null;
}

function deleteHistoryByDate(date) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.filter(h => h.date !== date)));
}

function clearAllHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
