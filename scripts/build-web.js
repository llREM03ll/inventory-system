// Copies the web app into www/ so Capacitor can pack it into the Android app.
// The service worker is left out: the APK already holds every file.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const out = path.join(root, "www");
const files = ["index.html", "calculate.html", "pos.html", "calendar.html", "settings.html", "manifest.json", "Image1.jpg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "LICENSE"];
const dirs = ["css", "js", "fonts", "vendor"];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
files.forEach(f => { if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(out, f)); });
dirs.forEach(d => fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true }));
console.log("web app copied to www/");
