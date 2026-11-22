/*
 * e2e.js — browser smoke tests (stage 1B: routes, level status, trail from the syllabus, generic exams).
 *
 *   node tools/e2e.js            (or: npm run e2e)
 *
 * Needs the playwright-core package (e.g. `npm i --no-save playwright-core`, or NODE_PATH pointing at a copy) and a
 * Chromium / Chrome / Edge browser (CHROME_PATH may name it). Without either the script says so and exits with 0.
 * A dependency-free static server starts by itself.
 *
 * The exam cases serve the fixture exam tools/fixtures/exam-demo/ in place of the empty registry (spec 06 E8):
 * its data files are generated in memory by tools/build/exams.js and answered through request interception.
 */
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function findBrowser() {
  const env = process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const home = os.homedir();
  const cands = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ];
  const pw = path.join(home, "AppData", "Local", "ms-playwright");
  if (fs.existsSync(pw)) {
    fs.readdirSync(pw).filter(function (d) { return /^chromium-\d+$/.test(d); }).sort().reverse().forEach(function (d) {
      cands.unshift(path.join(pw, d, "chrome-win64", "chrome.exe"), path.join(pw, d, "chrome-linux", "chrome"));
    });
  }
  return cands.find(function (p) { return fs.existsSync(p); }) || null;
}

let pw = null;
try { pw = require("playwright-core"); } catch (e) { try { pw = require("playwright"); } catch (e2) { pw = null; } }
const exe = findBrowser();
if (!pw || !exe) {
  console.log("E2E: skipped (" + (!pw ? "no playwright-core package" : "no browser, set CHROME_PATH") + ").");
  process.exit(0);
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".md": "text/markdown" };
const server = http.createServer(function (req, res) {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok  " + name); } catch (e) { failures.push(name); console.log("  FAIL " + name + "\n       " + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

const PROFILE_KEY = "slm.profiles";
const PROFILE = { version: 1, activeId: "p_e2e", profiles: [{ id: "p_e2e", name: "Test Claude", progress: {} }] };

/** The fixture exam as in-memory data files (same code as the build). */
function examFixture() {
  const EX = require(path.join(ROOT, "tools", "build", "exams.js"));
  const EXI = require(path.join(ROOT, "tools", "build", "exercises.js"));
  const r = EX.collect(path.join(ROOT, "tools", "fixtures", "exam-demo"));
  if (r.errors.length) throw new Error("fixture: " + r.errors.join("; "));
  const files = EX.files(r);
  const extra = r.examSets.map(function (x) { return "LM.SETS_INDEX.sets[" + JSON.stringify(x.meta.id) + "] = " + JSON.stringify(EXI.examSetMeta(x)) + ";"; }).join("\n");
  files["data/sets-index.js"] = fs.readFileSync(path.join(ROOT, "data", "sets-index.js"), "utf8") + "\n" + extra + "\n";
  return files;
}

async function main() {
  await new Promise(function (r) { server.listen(0, "127.0.0.1", r); });
  const URL = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true });
  const syllabus = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "syllabus.json"), "utf8"));
  const status = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "levels.json"), "utf8")).levels;
  const a1 = syllabus.levels[0];
  const a1Topics = [].concat.apply([], a1.units.map(function (u) { return u.topics; }));

  async function session(w, h, withProfile, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: w || 1280, height: h || 800 }, reducedMotion: opts.reducedMotion || "no-preference" });
    await ctx.addInitScript(function (args) {
      if (localStorage.getItem("e2e_seeded")) return;
      localStorage.setItem("e2e_seeded", "1");
      if (args.profile) localStorage.setItem(args.key, JSON.stringify(args.profile));
    }, { key: PROFILE_KEY, profile: withProfile ? PROFILE : null });
    if (opts.exams) {
      const files = examFixture();
      await ctx.route("**/data/**", function (route) {
        const rel = new globalThis.URL(route.request().url()).pathname.replace(/^\/+/, "");
        if (files[rel]) return route.fulfill({ status: 200, contentType: "text/javascript", body: files[rel] });
        return route.continue();
      });
    }
    const page = await ctx.newPage();
    page.errs = [];
    page.on("pageerror", function (e) { page.errs.push(e.message); });
    return { ctx: ctx, page: page };
  }
  async function visit(page, hash, wait) { await page.goto(URL + hash); await page.reload(); await page.waitForTimeout(wait || 900); }
  const viewText = function (page) { return page.innerText("#view").then(function (t) { return t.replace(/\s+/g, " ").trim(); }); };
  const progressOf = function (page) { return page.evaluate(function (k) { return JSON.parse(localStorage.getItem(k)).profiles[0].progress; }, PROFILE_KEY); };

  console.log("\nRoutes (spec 02 §6)");
  await test("every route of spec 02 §6 renders something, without JS errors", async function () {
    const s = await session(1280, 800, true);
    const routes = ["#/", "#/today", "#/trail", "#/a1", "#/a2", "#/c2", "#/a1/verbs-gustar", "#/a1/verbs-ser", "#/a1/test", "#/a1/cheatsheet",
      "#/placement", "#/review", "#/review/decks", "#/review/mistakes", "#/review/words", "#/review/session", "#/practice",
      "#/practice/set/a1-verbs-gustar-1", "#/practice/session", "#/practice/weak", "#/lab", "#/writing", "#/writing/phrases", "#/stats", "#/notes"];
    for (const r of routes) {
      await visit(s.page, r, 700);
      const t = await viewText(s.page);
      ok(t.length > 30, r + ": empty view");
      ok(!/Page not found/.test(t), r + ": Page not found");
    }
    ok(!s.page.errs.length, "JS errors: " + s.page.errs[0]);
    await s.ctx.close();
  });
  await test("unknown and legacy routes show Page not found with a link home; no redirects", async function () {
    const s = await session();
    for (const r of ["#/nope", "#/a1/no-such-topic", "#/dzis", "#/szlak", "#/powtorki", "#/cwiczenia", "#/a1/sciaga", "#/certyfikat-c1", "#/exams/exam-demo", "#/fiszki"]) {
      await visit(s.page, r, 600);
      ok(/Page not found/.test(await viewText(s.page)), r + ": no Page not found");
      ok(await s.page.evaluate(function () { return location.hash; }) === r, r + ": redirected");
      ok(await s.page.locator('#view a[href="#/"]').count() === 1, r + ": no link home");
    }
    await s.ctx.close();
  });
  await test("public pages without a profile are not empty and show no welcome card", async function () {
    const s = await session();
    for (const r of ["#/", "#/a1", "#/a2", "#/a1/verbs-gustar", "#/a1/verbs-ser", "#/practice", "#/lab", "#/writing"]) {
      await visit(s.page, r, 600);
      const t = await viewText(s.page);
      ok(t.length > 40, r + ": empty");
      ok(!/Ta strona potrzebuje profilu/.test(t), r + ": welcome card on a public page");
    }
    ok(!s.page.errs.length, "JS errors: " + s.page.errs[0]);
    await s.ctx.close();
  });

  console.log("\nChecklist = topics (E2), level status (E1)");
  await test("A1: topics grouped by syllabus category, ticking writes progress[<topic id>]", async function () {
    const s = await session(1280, 900, true);
    await visit(s.page, "#/a1");
    const groups = await s.page.locator(".ess-group-title").allInnerTexts();
    const first = [];
    a1Topics.forEach(function (t) { const n = syllabus.categories[t.category]; if (first.indexOf(n) === -1) first.push(n); });
    ok(JSON.stringify(groups.map(function (g) { return g.trim(); })) === JSON.stringify(first), "groups: " + groups.join(" | "));
    ok(await s.page.locator(".ess-item input[type=checkbox]").count() === a1Topics.length, "checkbox count");
    await s.page.locator('li[data-topic="a1-verbs-gustar"] input').check({ force: true });
    await s.page.waitForTimeout(200);
    ok((await progressOf(s.page))["a1-verbs-gustar"] === true, "progress not saved under the topic id");
    ok(/1 of 26 known/.test(await viewText(s.page)), "level progress text");
    await s.ctx.close();
  });
  await test("soon level: planned topics without links or checkboxes, no final test or cheat sheet, sidebar says soon", async function () {
    const soon = syllabus.levels.find(function (l) { return status[l.id] !== "available"; });
    if (!soon) return;
    const s = await session(1280, 900, true);
    await visit(s.page, "#/" + soon.id.toLowerCase());
    const t = await viewText(s.page);
    ok(t.indexOf(soon.id + " is on its way. The topics below are what it will cover.") !== -1, "no soon text");
    ok(await s.page.locator("#view input[type=checkbox]").count() === 0, "checkboxes on a soon level");
    ok(await s.page.locator("#view .ess-list a").count() === 0, "links on a soon level");
    ok(await s.page.locator(".lf-level-card").count() === 0, "final-test or cheat-sheet card");
    const sb = await s.page.locator(".sb-item.is-level.lvl-" + soon.id + " .sb-label-sub").innerText();
    ok(/soon/.test(sb), "sidebar label: " + sb);
    await visit(s.page, "#/" + soon.id.toLowerCase() + "/test");
    ok(/comes with it/.test(await viewText(s.page)), "final test of a soon level");
    await s.ctx.close();
  });
  await test("a topic without a page: This topic is being written", async function () {
    const s = await session();
    await visit(s.page, "#/a1/verbs-ser");
    ok(/This topic is being written/.test(await viewText(s.page)), "no being-written page");
    await s.ctx.close();
  });

  console.log("\nTrail generated from the syllabus (E9)");
  await test("trail: one stop per topic and a checkpoint per unit; soon lands dimmed with Coming soon", async function () {
    const s = await session(1280, 900, true);
    await visit(s.page, "#/trail", 1500);
    const lessons = a1Topics.length, checkpoints = a1.units.length;
    ok(await s.page.locator(".sz-level.lvl-A1 .sz-node").count() === lessons + checkpoints, "A1 nodes");
    ok(await s.page.locator(".sz-node.is-review").count() === checkpoints, "checkpoints");
    const soonCount = syllabus.levels.filter(function (l) { return status[l.id] !== "available"; }).length;
    ok(await s.page.locator(".sz-level.is-soon").count() === soonCount, "soon lands");
    ok(await s.page.locator(".sz-level.is-soon .chip.is-soon").count() === soonCount, "Coming soon labels");
    ok((await s.page.locator(".sz-node.is-current").getAttribute("data-stop")) === a1Topics[0].id, "current stop is the first topic");
    ok(!s.page.errs.length, "JS errors: " + s.page.errs[0]);
    await s.ctx.close();
  });
  await test("stop sheet: topic as the checklist item; quiz ≥ 3/4 passes the stop but never ticks the topic", async function () {
    const s = await session(1280, 900, true);
    await visit(s.page, "#/trail", 1500);
    await s.page.click('.sz-node[data-stop="a1-verbs-gustar"] button');
    await s.page.waitForSelector("dialog[open]");
    ok(/gustar/.test(await s.page.innerText("dialog[open] .sz-items")), "topic not listed in the sheet");
    await s.page.click("dialog[open] button:has-text('Quiz')");
    for (let i = 0; i < 4; i++) {
      await s.page.waitForSelector(".ex-option");
      const idx = await s.page.evaluate(function () {
        const it = LM.exercises.currentItem();
        const opts = [].slice.call(document.querySelectorAll(".ex-option .ex-option-text")).map(function (b) { return b.innerText.trim(); });
        return opts.indexOf(it.options[it.correct].trim());
      });
      await s.page.locator(".ex-option").nth(idx).click();
      await s.page.click(".ex-check");
      await s.page.click(".ex-next");
      await s.page.waitForTimeout(200);
    }
    await s.page.waitForSelector(".sz-result");
    ok(!(await progressOf(s.page))["a1-verbs-gustar"], "the quiz ticked the topic");
    const st = await s.page.evaluate(function () { return JSON.parse(localStorage.getItem("slm.trail.p_e2e")); });
    ok(st.version === 1 && st.stops["a1-verbs-gustar"] && st.stops["a1-verbs-gustar"].best === 4, "stored in slm.trail.<id>");
    await s.ctx.close();
  });

  console.log("\nExams: generic module (E8)");
  await test("empty registry: the sidebar group Exams is hidden", async function () {
    const s = await session(1280, 800, true);
    await visit(s.page, "#/a1");
    ok(await s.page.locator("#exams-nav").isHidden(), "exams nav visible");
    ok(await s.page.locator("#exams-nav .exam-chip").count() === 0, "exam tiles with an empty registry");
    await s.ctx.close();
  });
  await test("fixture exam: sidebar group, overview, page, practice list, set in the engine, writing trainer, soon exam", async function () {
    const s = await session(1280, 900, true, { exams: true });
    await visit(s.page, "#/exams/exam-demo", 1200);
    ok(await s.page.locator("#exams-nav").isVisible(), "exams nav hidden");
    ok(await s.page.locator('#exams-nav a[href="#/exams/exam-demo"]').count() >= 1, "no sidebar tile");
    ok(/This page belongs to a test fixture/.test(await viewText(s.page)), "overview page");
    await visit(s.page, "#/exams/exam-demo/format", 1000);
    ok(/Choose the right word/.test(await viewText(s.page)), "format page");
    await visit(s.page, "#/exams/exam-demo/practice", 1200);
    ok(/Demo set 1/.test(await viewText(s.page)), "set card in the practice list");
    await visit(s.page, "#/practice/set/exam-demo-set-1", 1200);
    ok(/Demo set 1/.test(await viewText(s.page)), "set in the engine");
    await visit(s.page, "#/exams/exam-demo/writing", 1200);
    ok(/An email to a friend/.test(await viewText(s.page)), "writing trainer list");
    await visit(s.page, "#/exams/exam-demo/writing/email-1", 1200);
    ok(await s.page.locator("textarea").count() >= 1, "writing trainer editor");
    await visit(s.page, "#/exams/exam-later", 1000);
    ok(/Later exam/.test(await viewText(s.page)), "soon exam page");
    await visit(s.page, "#/exams/exam-later/x", 600);
    ok(/Page not found/.test(await viewText(s.page)), "sub-page of a soon exam");
    ok(!s.page.errs.length, "JS errors: " + s.page.errs[0]);
    await s.ctx.close();
  });

  console.log("\nLayout");
  await test("no horizontal scroll at 320 px on the main routes", async function () {
    const s = await session(320, 740, true);
    const bad = [];
    for (const r of ["#/", "#/today", "#/a1", "#/a2", "#/a1/verbs-gustar", "#/a1/verbs-ser", "#/trail", "#/nope"]) {
      await s.page.goto(URL + r); await s.page.waitForTimeout(500);
      const d = await s.page.evaluate(function () { return [document.documentElement.scrollWidth, document.documentElement.clientWidth]; });
      if (d[0] > d[1]) bad.push(r + " (" + d[0] + ">" + d[1] + ")");
    }
    ok(!bad.length, "horizontal scroll: " + bad.join("; "));
    await s.ctx.close();
  });

  await browser.close();
  server.close();
  console.log("\nE2E: " + passed + " ok, " + failures.length + " failed");
  if (failures.length) process.exit(1);
}

main().catch(function (e) { console.error(e); server.close(); process.exit(1); });
