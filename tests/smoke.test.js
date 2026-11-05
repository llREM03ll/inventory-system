// Smoke test: serves the app, loads every page in jsdom and checks key flows.
// Run:  npm install && npm test
const http = require("http"), fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const root = path.join(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".md": "text/markdown" };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, ok) => { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) failed++; };

async function load(port, page, pre) {
  const errs = [], vc = new VirtualConsole();
  vc.on("jsdomError", e => errs.push(e.message.slice(0, 200)));
  const dom = await JSDOM.fromURL(`http://localhost:${port}/${page}`, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null; w.scrollTo = () => {}; w.performance.getEntriesByType = () => []; w.confirm = () => true; w.alert = () => {}; pre && pre(w); } });
  await sleep(1200);
  return { dom, w: dom.window, d: dom.window.document, errs };
}

server.listen(0, async () => {
  const port = server.address().port;
  for (const p of ["index.html", "settings.html", "calendar.html", "calculate.html", "pos.html"]) {
    const { dom, errs } = await load(port, p); check(p + " loads without errors", errs.length === 0); dom.window.close();
  }
  let { dom, w, d } = await load(port, "settings.html");
  w.eval('openNewProduct(); _mi.name="Frappe"; _mi.price=70; _mi.cup="L"; onMiFlavChange("own");');
  d.getElementById("miFlavInput").value = "Mocha, Oreo"; w.eval("miAddFlavor(); saveMenuItem();");
  check("new product keeps its own flavor list", JSON.stringify(w.eval("getSettings().flavors.P1")) === '["Mocha","Oreo"]');
  check("settings shows a flavor line for it", d.querySelector("#flavorLists").textContent.includes("Frappe"));
  w.eval('openMenuItemEditor("P1"); deleteMenuItem();');
  check("deleting the product removes its list", !("P1" in w.eval("getSettings().flavors")));
  w.eval("openMenuItemEditor('M')"); const sh = d.getElementById("menuItemSheet");
  sh.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  check("editor ignores the tap that opened it", sh.classList.contains("open"));
  check("localDate is local", w.eval("localDate(new Date(2026,0,5,1,0))") === "2026-01-05");
  check("cleanHTML strips handlers", !w.eval('cleanHTML("<img src=x onerror=alert(1)><script>1</script><b>ok</b>")').match(/onerror|script/));
  dom.window.close();

  // POS: ids stay unique after a void, products without a cup or flavors add straight to the order
  const pre = w => {
    w.localStorage.setItem("brewsShiftActive", "1");
    w.localStorage.setItem("brewsPOSState", JSON.stringify({ begM: 20, begL: 20, begS: 10, begHC: 10, currentItems: [], orders: [], shiftTotal: 0, expenses: [], shiftStartTime: Date.now() - 65000, deliveries: { M: 0, L: 0, S: 0, HC: 0 }, damages: { M: 0, L: 0, S: 0, HC: 0 } }));
    w.localStorage.setItem("brewsMenuLayout", JSON.stringify({ order: [], items: {}, custom: [{ code: "P1", name: "Brownie", icon: "🍫", price: 60, cup: "", flav: "" }] }));
  };
  ({ dom, w, d } = await load(port, "pos.html", pre));
  const order = () => { w.eval('addItemToOrder(DRINKS.find(x=>x.code==="M"),"Mocha"); placeOrder();'); };
  order(); order(); order();
  w.eval("voidOrder(2)"); order();
  const ids = JSON.parse(w.eval("JSON.stringify(state.orders.map(o=>o.id))"));
  check("order ids stay unique after a void", new Set(ids).size === ids.length);
  [...d.querySelectorAll("#drinksGrid .drink-btn")].find(b => b.textContent.includes("Brownie")).click();
  check("no-cup, no-flavor product adds straight to the order", w.eval("state.currentItems.some(i=>i.code==='P1')") && !d.getElementById("flavorModal").classList.contains("open"));
  check("shift timer runs", /^\d+m \d+s$/.test(d.getElementById("shiftTimer").textContent) || /h/.test(d.getElementById("shiftTimer").textContent));
  dom.window.close();
  server.close(); process.exit(failed ? 1 : 0);
});
