// Run once after `npx cap add android` (the workflow does this for you).
// Sets the version from package.json + build number and tightens the manifest.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const code = parseInt(process.env.VERSION_CODE || "1", 10) || 1;

const gradle = path.join(root, "android/app/build.gradle");
let g = fs.readFileSync(gradle, "utf8");
g = g.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
fs.writeFileSync(gradle, g);

const mf = path.join(root, "android/app/src/main/AndroidManifest.xml");
let m = fs.readFileSync(mf, "utf8");
if (!m.includes("usesCleartextTraffic")) m = m.replace("<application", '<application\n        android:usesCleartextTraffic="false"');
m = m.replace('android:allowBackup="true"', 'android:allowBackup="false"');
fs.writeFileSync(mf, m);
console.log(`Android version ${pkg.version} (code ${code}) set.`);
