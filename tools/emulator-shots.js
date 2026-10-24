// Pilote l'appli installée sur l'émulateur Android : on navigue dans la WebView via le débogage Chrome (CDP)
// et on prend les captures avec `adb screencap` (écran complet : barres système + bannière pub native).
// Usage : node tools/emulator-shots.js <dossier de sortie>
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const PKG = "fr.pajusco.mesenchainements";
const out = process.argv[2] || "screens";
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (...a) => execFileSync("adb", a, { encoding: "utf8" }).trim();

async function cdp() {
  let pid = "";
  for (let i = 0; i < 30 && !pid; i++) { try { pid = adb("shell", "pidof", PKG).split(/\s+/)[0]; } catch { /* pas encore lancée */ } if (!pid) await sleep(1000); }
  if (!pid) throw new Error("appli non démarrée");
  adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
  let page;
  for (let i = 0; i < 30 && !page; i++) {
    try { page = (await (await fetch("http://127.0.0.1:9222/json")).json()).find((t) => t.type === "page"); } catch { /* socket pas prête */ }
    if (!page) await sleep(1000);
  }
  if (!page) throw new Error("WebView introuvable");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); wait.get(d.id)?.(d); };
  return (expr) => new Promise((res) => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
}
const shot = (name) => { fs.writeFileSync(path.join(out, name + ".png"), execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 })); console.log("capture", name); };

(async () => {
  adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  const ev = await cdp();
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.click(); return !!e; })()`);
  const step = async (name, sel, ms = 1500) => { if (sel) console.log(sel, JSON.stringify((await click(sel)).result?.result?.value)); await sleep(ms); shot(name); };
  await sleep(6000); // chargement + bannière
  shot("1-accueil");
  await step("2-creer", '[data-act="create"]');
  await click('[data-cdisc="GAF"]'); await sleep(300); await click('[data-capp="sol"]'); await sleep(300); await click('[data-clvl="B1"]'); await sleep(300);
  await step("3-editeur", '[data-act="docreate"]', 2500);
  await step("4-fiche", '[data-act="sheet"]', 2500);
  await step("5-premium", '[data-act="print"]');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
