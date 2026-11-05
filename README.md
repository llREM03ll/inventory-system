# BREWS.CO

Inventory, point of sale and daily reports for a milk tea and coffee shop. Static web app
(HTML, CSS, vanilla JS), installable as a PWA, works offline.

## Pages

| Page | File | Purpose |
|---|---|---|
| Home | `index.html` | Splash, shift status, today's totals, cloud sync |
| Calculate | `calculate.html` | Cup counts, sales, salary and final total |
| Shift (POS) | `pos.html` | Orders, receipts, end of shift |
| History | `calendar.html` | Calendar, monthly summary, order logs |
| Settings | `settings.html` | Products, flavors, add-ons, pay, appearance, sync key, backup |

## Code layout

```
css/styles.css        all styles, fonts declared at the top
fonts/                bundled fonts (OFL)
vendor/               Firebase SDK + html2canvas (bundled, see THIRD_PARTY_NOTICES.md)
js/util.js            shared helpers: esc, fmt, localDate, readJSON, safeColor, safeImg
js/theme.js           accent color and background photo (per device)
js/appstyle.js        font and text size (per device)
js/nav.js header.js layout.js   shared header and bottom nav, filled from data-* attributes
js/settings.js        shop settings with defaults (prices, add-ons, salary, flavors)
js/menu.js            products: built-in + added, order, editor, flavor lists, menu manager
js/sync.js            Firestore push / pull with merge by date and sync key
js/InventorySystem.js calculation model
js/storage.js history.js ui.js main.js calc-page.js     Calculate page
js/pos.js             Shift (POS) page
js/calendar.js        History page
js/home.js            Home page
js/settings-page.js   Settings page
service-worker.js     offline cache (bump CACHE_NAME every release)
```

## How products work

- Built-in products (M, L, MC, LC, HC, S, FTM, FTL) can be renamed, repriced, recolored,
  hidden or reordered.
- You can add products. Each one picks a cup (Small, Medium, Large, Hot, or none) and a
  flavor list: a shared list, its own list, or none. Cups come out of the right cup count
  and the sales show on their own rows in Calculate.
- Flavor lists live in `settings.flavors`. A product's own list is keyed by its code.

## Releasing

1. Bump `CACHE_NAME` in `service-worker.js`.
2. Add any new file to the lists in `service-worker.js`.
3. Deploy the folder as is (GitHub Pages works).

## Cloud sync setup

1. Create a Firestore database and publish `firestore.rules`.
2. On one device: Settings → Cloud Sync → Generate, then Push from Home.
3. On the other devices: enter the same key, then Pull.

## License

Proprietary, see `LICENSE`. Third-party components keep their own licenses.
