/*
 * cheatsheets-pdf.js — prints the level cheat sheets to PDF and checks that each has exactly 1 page on A4 and on US Letter
 * (spec 07 §3). A developer tool: NOT part of `npm run build`.
 *
 * Needs Playwright (e.g. `npm i -D playwright-core` or `npx playwright install chromium`) and a
 * Chromium / Edge / Chrome browser. The page opens from disk (file://), so no server is needed.
 *
 * Usage (from the project folder):
 *   node tools/cheatsheets-pdf.js                 # all cheat sheets in content/cheatsheets/
 *   node tools/cheatsheets-pdf.js a2 b1           # chosen levels
 *   node tools/cheatsheets-pdf.js --out tmp/pdf   # folder for the PDFs (default tmp/cheatsheets-pdf), one per level and paper size
 *   node tools/cheatsheets-pdf.js --browser msedge  # browser channel (msedge, chrome); by default tries them in turn
 *
 * Report: level, number of pages, smallest type size in pt (must be ≥ 9.5 pt). Exit code 1 when a cheat sheet
 * has more than 1 page or type below 9.5 pt — then cut the cheat sheet text (do not make the type smaller).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const MIN_PT = 9.5;
const FORMATS = ["A4", "Letter"]; // spec 07 §3: one page on both

function loadPlaywright() {
  for (const name of ["playwright", "playwright-core"]) {
    try { return require(name); } catch (e) { /* next one */ }
  }
  console.error("Playwright is missing. Install it: npm i -D playwright-core (or npx playwright install chromium).");
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { levels: [], out: path.join(ROOT, "tmp", "cheatsheets-pdf"), browser: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") opts.out = path.resolve(argv[++i]);
    else if (argv[i] === "--browser") opts.browser = argv[++i];
    else if (/^[abc][12]$/i.test(argv[i])) opts.levels.push(argv[i].toLowerCase());
  }
  return opts;
}

async function launch(pw, preferred) {
  const channels = preferred ? [preferred] : [null, "msedge", "chrome"];
  let last = null;
  for (const channel of channels) {
    try { return await pw.chromium.launch(channel ? { channel: channel, headless: true } : { headless: true }); } catch (e) { last = e; }
  }
  console.error("Could not start the browser: " + (last && last.message ? last.message.split("\n")[0] : last));
  process.exit(2);
}

/** Number of PDF pages (/Type /Page objects, without /Pages). */
function pageCount(buf) {
  const m = buf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dir = path.join(ROOT, "content", "cheatsheets");
  const available = fs.existsSync(dir) ? fs.readdirSync(dir).filter(function (f) { return /^[abc][12]\.md$/i.test(f); }).map(function (f) { return f.slice(0, 2).toLowerCase(); }).sort() : [];
  const levels = opts.levels.length ? opts.levels : available;
  if (!levels.length) { console.error("No cheat sheets in content/cheatsheets/."); process.exit(2); }
  fs.mkdirSync(opts.out, { recursive: true });

  const pw = loadPlaywright();
  const browser = await launch(pw, opts.browser);
  const url = pathToFileURL(path.join(ROOT, "index.html")).href;
  let failed = false;
  console.log("Sheet       Pages   Smallest type     PDF");
  for (const level of levels) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", function (e) { errors.push(e.message); });
    await page.goto(url + "#/" + level + "/cheatsheet");
    await page.waitForFunction("window.LM && LM.state && LM.state.profiles && LM.print && LM.handbook", null, { timeout: 15000 });
    await page.evaluate("LM.app.addProfile && !LM.app.getActiveProfile() && LM.app.addProfile('PDF')");
    await page.goto(url + "#/" + level + "/cheatsheet");
    await page.waitForSelector(".cheatsheet.md", { timeout: 15000 });
    await page.evaluate("document.fonts && document.fonts.ready");
    await page.evaluate("LM.print.before()");
    await page.emulateMedia({ media: "print" });
    const pdfs = [];
    for (const format of FORMATS) {
      const file = path.join(opts.out, "cheatsheet-" + level + "-" + format.toLowerCase() + ".pdf");
      const buf = await page.pdf({ path: file, format: format, margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" }, printBackground: true, preferCSSPageSize: true });
      pdfs.push({ format: format, file: file, pages: pageCount(buf) });
    }
    // the smallest type size on the cheat sheet (px → pt), only elements with their own text
    const minPt = await page.evaluate(function () {
      let min = Infinity;
      const root = document.querySelector(".cheatsheet-view");
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.nodeValue.trim()) continue;
        const e = n.parentElement;
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden" || !e.getClientRects().length) continue;
        min = Math.min(min, parseFloat(cs.fontSize) * 0.75);
      }
      return min;
    });
    await ctx.close();
    pdfs.forEach(function (p) {
      const ok = p.pages === 1 && minPt >= MIN_PT - 0.05 && !errors.length;
      if (!ok) failed = true;
      console.log((level.toUpperCase() + " " + p.format).padEnd(12) + String(p.pages).padEnd(8) + (minPt.toFixed(1) + " pt").padEnd(18) + path.relative(ROOT, p.file) + (ok ? "" : "   ← " + (p.pages !== 1 ? "more than 1 page; cut the text" : minPt < MIN_PT ? "type below 9.5 pt" : errors[0])));
    });
  }
  await browser.close();
  console.log(failed ? "\nERROR: not every cheat sheet fits on 1 page (A4 and US Letter)." : "\nOK: every cheat sheet has 1 page on A4 and on US Letter, type ≥ " + MIN_PT + " pt.");
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) { console.error(e); process.exit(2); });
