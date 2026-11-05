# Third-party notices

BREWS.CO bundles these open-source components so the app works offline and does not
load code or fonts from other websites. Each keeps its own license.

| Component | Version | License | Files |
|---|---|---|---|
| Firebase JS SDK (app + firestore, compat build) | 10.12.2 | Apache-2.0 (https://www.apache.org/licenses/LICENSE-2.0) | `vendor/firebase-app-compat.js`, `vendor/firebase-firestore-compat.js` |
| html2canvas | 1.4.1 | MIT, Copyright (c) 2012 Niklas von Hertzen | `vendor/html2canvas.min.js`, `vendor/licenses/html2canvas-MIT.txt` |
| Plus Jakarta Sans (via @fontsource) | latest-subset | SIL Open Font License 1.1 | `fonts/plus-jakarta-sans-*.woff2`, `vendor/licenses/PlusJakartaSans-OFL.txt` |
| Cormorant Garamond (via @fontsource) | latest-subset | SIL Open Font License 1.1 | `fonts/cormorant-garamond-*.woff2`, `vendor/licenses/CormorantGaramond-OFL.txt` |

Apache-2.0 requires that the license is available to recipients: the full text is at the
URL above. The Firebase files are unmodified copies from the `firebase@10.12.2` npm package.

## Updating a library

1. `npm pack firebase@<version>` (or html2canvas), copy the new file into `vendor/`.
2. Update the version in this table.
3. Bump `CACHE_NAME` in `service-worker.js`.
