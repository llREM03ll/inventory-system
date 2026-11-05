/**
 * util.js
 * Small shared helpers. Loaded first on every page.
 */

// Escape text before putting it inside HTML (names, flavors, notes, etc.)
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Philippine peso, 2 decimals
const fmt = v => "₱" + Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Today's date as YYYY-MM-DD in LOCAL time.
// (toISOString() uses UTC, which is the previous day from 12am to 8am in the Philippines.)
function localDate(d) {
  d = d || new Date();
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

// localStorage helpers that never throw on bad or missing data
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn("Storage write failed:", key, e); return false; }
}

// Values that can arrive from the cloud are checked before they reach CSS or src attributes
const safeColor = c => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : "");
const safeImg   = u => (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+\/=]+$/i.test(u || "") ? u : "");

// Makes saved or cloud-supplied report HTML safe to show: parsed in an inert document, then
// scripts, frames, inline event handlers and javascript: links are removed.
function cleanHTML(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll("script,iframe,object,embed,link,meta,base,form,svg,math").forEach(n => n.remove());
  doc.body.querySelectorAll("*").forEach(el => {
    [...el.attributes].forEach(a => {
      const n = a.name.toLowerCase(), v = a.value.replace(/\s/g, "").toLowerCase();
      if (n.startsWith("on") || (["href", "src", "action", "formaction", "xlink:href"].includes(n) && /^(javascript|vbscript|data:text)/.test(v))) el.removeAttribute(a.name);
    });
  });
  return doc.body.innerHTML;
}
