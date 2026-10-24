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
    // la WebView de l'appli (https://localhost) ; la pub AdMob tourne aussi dans une WebView du même processus
    try {
      const pages = (await (await fetch("http://127.0.0.1:9222/json")).json()).filter((t) => t.type === "page");
      if (i === 0 || i % 10 === 0) console.log("WebViews :", pages.map((t) => t.url).join(" | "));
      page = pages.find((t) => /^https?:\/\/localhost/.test(t.url));
    } catch { /* socket pas prête */ }
    if (!page) await sleep(1000);
  }
  if (!page) throw new Error("WebView introuvable");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const wait = new Map();
  // si la WebView ferme la connexion (crash, rechargement), on le dit au lieu de rester bloqué
  ws.onclose = () => { console.log("CDP : connexion fermée"); for (const f of wait.values()) f({ result: { result: { value: null } } }); };
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id) wait.get(d.id)?.(d);
    else if (d.method === "Runtime.exceptionThrown") console.log("JS EXCEPTION :", JSON.stringify(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    else if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) console.log("CONSOLE " + d.params.type + " :", d.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  ws.send(JSON.stringify({ id: ++id, method: "Runtime.enable" }));
  return (expr) => new Promise((res) => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
}
const shot = (name) => { fs.writeFileSync(path.join(out, name + ".png"), execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 })); console.log("capture", name); };

process.on("exit", (c) => console.log("fin du script, code", c));
(async () => {
  adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  const ev = await cdp();
  // clique dès que l'élément existe (jusqu'à 20 s) ; échoue franchement s'il n'apparaît jamais
  const click = async (sel) => {
    for (let i = 0; i < 40; i++) {
      const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.click(); return !!e; })()`);
      if (r.result?.result?.value) return r;
      await sleep(500);
    }
    throw new Error("élément introuvable : " + sel);
  };
  const step = async (name, sel, ms = 1500) => { if (sel) { await click(sel); console.log("clic", sel); } await sleep(ms); shot(name); };
  await sleep(6000); // chargement + bannière
  const diag = await ev(`(async () => JSON.stringify({ url: location.href, native: typeof Native !== "undefined" && Native.isNative, els: typeof ELS !== "undefined" ? ELS.length : "ELS?", page: typeof state !== "undefined" ? state.page : "state?",
    recap: document.querySelector("#page-recap")?.innerHTML.length, hidden: document.querySelector("#page-recap")?.hidden, body: document.body.innerHTML.length,
    elementsJson: await fetch("elements.json").then((r) => r.status).catch((e) => String(e)) }))()`);
  console.log("DIAG", diag.result?.result?.value ?? JSON.stringify(diag));
  shot("1-accueil");
  await step("2-creer", '[data-act="create"]');
  await click('[data-cdisc="GAF"]'); await sleep(300); await click('[data-capp="sol"]'); await sleep(300); await click('[data-clvl="B1"]'); await sleep(300);
  await step("3-editeur", '[data-act="docreate"]', 2500);
  await step("4-fiche", '[data-act="sheet"]', 2500);
  await step("5-premium", '[data-act="print"]');
  logcat(); process.exit(0);
})().catch((e) => { console.error(e); logcat(); process.exit(1); });
function logcat() { try { console.log(adb("logcat", "-d", "-s", "Capacitor:V", "Capacitor/Console:V", "chromium:E", "AndroidRuntime:E").split("\n").slice(-60).join("\n")); } catch { /* pas de logcat */ } }
