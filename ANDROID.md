# Android app

The Android app is the same web app packed with Capacitor, so every page, setting and the
Firebase sync work exactly as on the web. Nothing to rewrite. The APK is built by GitHub, you
do not need Android Studio.

## Build it

1. Push this folder to a GitHub repository.
2. Open the repo → **Actions** → **Build Android APK** → **Run workflow**.
3. When it finishes (about 5 to 8 minutes), open the run and download **BREWSCO-apk**.
4. Copy `BREWSCO-debug.apk` to the phone and open it. Android will ask to allow installing
   from this source once.

To publish a release with the APK attached, push a tag: `git tag v18.0.0 && git push --tags`.

## Signed release APK (optional, needed for the Play Store)

A debug APK installs fine for your own shops. For the Play Store, or for updates that install
over the old version without uninstalling, sign it with your own key. Keep the key safe: if you
lose it you cannot update the app.

```bash
keytool -genkeypair -v -keystore brews.jks -alias brews -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 brews.jks      # copy the output
```

In the repo go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the base64 text from above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `brews` |
| `ANDROID_KEY_PASSWORD` | the key password |

With these set, the workflow also produces `BREWSCO-release.apk`. Never commit the `.jks` file.

## Firebase

The app uses the Firebase web SDK in `vendor/`, which runs inside the Android WebView, so
**no `google-services.json` is needed** and push/pull work as on the web. Check two things:

- In Google Cloud Console → APIs & Services → Credentials, make sure the browser API key is
  **not** limited to website referrers. The app runs from `https://localhost` inside the APK.
  You can still restrict it to the Firestore, Identity Toolkit and Firebase APIs.
- Publish the rules from `firestore.rules` in Firebase Console → Firestore → Rules.

Use the same sync key on the phone and on the web version.

## Saving files

On Android, backups, CSV exports and receipt images open the share sheet (Save to Files,
Drive, WhatsApp...) instead of a browser download.

## Local build (optional)

Needs Node 20, JDK 17 and the Android SDK.

```bash
npm install
npm run build:web
npm run android:add        # first time only
npm run android:debug      # APK ends up in android/app/build/outputs/apk/debug/
```

When you change the web app, bump `CACHE_NAME` in `service-worker.js` and `version` in
`package.json` before releasing.
