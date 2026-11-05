# Security notes

BREWS.CO runs entirely in the browser and keeps data on the device (localStorage).
Cloud sync is optional.

## What is in place

- **Private sync key.** Settings → Cloud Sync lets you set a long random key. The shop's
  cloud document is named after it, so only devices that know the key can reach the data.
  Use it together with `firestore.rules` (no listing, no deleting).
- **No third-party code at runtime.** Firebase, html2canvas and the fonts are bundled in
  `vendor/` and `fonts/`. The Content-Security-Policy on every page blocks scripts, styles and
  connections to anywhere except the app itself and Google's Firestore endpoints.
- **Output escaping.** Product names, flavors, expense names, add-ons and notes are escaped
  before they are shown (`esc()` in `js/util.js`). Colors and images that come from sync are
  validated (`safeColor`, `safeImg`) before they reach CSS or `src`.
- **Safe storage reads.** All localStorage reads go through `readJSON()`, so damaged data
  cannot crash a page. Cloud data is checked before it is saved on a device.
- **Backups.** Settings → Backup & Reset downloads or restores a JSON backup. The sync key
  is never part of a backup or of the cloud data.

## Known limits

- The Firebase web config in `js/sync.js` is public by design. Real protection is the Firestore
  rules plus the sync key. Treat the sync key like a password and rotate it if a phone is lost.
- The CSP still needs `'unsafe-inline'` for scripts because the pages use inline `onclick`
  handlers. Escaping is the main defense for now. Moving handlers to `addEventListener` would
  let the policy drop it.
- Anyone who can open the app on a device can see that device's data. There is no login.

## Reporting a problem

Contact the owner of BREWS.CO directly.
