/*
 * e2e.js — browser smoke tests: routes, level status, trail from the syllabus, generic exams (stage 1B), the language layer
 * (stage 3), every exercise item type with the Spanish content sets and the paradigm view (stage 4).
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
      ok(!/This page needs a profile/.test(t), r + ": welcome card on a public page");
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

  console.log("\nLanguage layer (spec 05, spec 06 E3–E5; data from tools/fixtures/lang/)");
  const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "fixtures", "lang", "exercises.json"), "utf8"));
  const bankItem = function (id) { for (const s of BANK.sets) for (const it of s.items) if (it.id === id) return Object.assign({ topic: a1Topics[0].id, level: "A1" }, it); return null; };
  /** Voices for a test: a target-language voice, or only a voice of the UI language (the real browser may have none at all). */
  async function withVoices(ctx, target) {
    await ctx.addInitScript(function (on) {
      // built on first use, when LM.APP (js/config.js) is loaded: a voice of the first configured locale, and an English one
      speechSynthesis.getVoices = function () {
        const v = [{ lang: LM.APP.uiLang, name: "ui", localService: true, voiceURI: "ui" }];
        if (on) v.unshift({ lang: LM.APP.speech.voices[0], name: "target", localService: true, voiceURI: "t" });
        return v;
      };
      speechSynthesis.speak = function () {};
    }, !!target);
  }
  async function startItem(page, it) {
    await page.evaluate(function (x) { LM.exercises.startCustom({ items: [x], mode: "learn", autostart: true, title: "E2E" }); }, it);
    await page.waitForTimeout(500);
  }
  await test("character bar: inserts at the cursor and keeps the focus; Alt + letter gives the marked form", async function () {
    const s = await session(1280, 800, true);
    await visit(s.page, "#/practice", 600);
    const it = bankItem("fx-ser-estar-1-02");
    await startItem(s.page, it);
    const plan = await s.page.evaluate(function (word) {
      const i = Array.prototype.findIndex.call(word, function (c) { return LM.APP.chars.indexOf(c) !== -1; });
      return { before: word.slice(0, i), ch: word[i], after: word.slice(i + 1), base: LM.lang.keyBase(word[i]), keys: document.querySelectorAll(".ex-body .charbar-key").length, n: LM.APP.chars.length };
    }, it.accepted[0]);
    ok(plan.keys === plan.n, "bar keys: " + plan.keys);
    await s.page.click(".ex-body input");
    await s.page.keyboard.type(plan.before);
    await s.page.click('.charbar-key[data-char="' + plan.ch + '"]');
    await s.page.keyboard.type(plan.after);
    ok(await s.page.inputValue(".ex-body input") === it.accepted[0], "bar insert: " + await s.page.inputValue(".ex-body input"));
    ok(await s.page.evaluate(function () { return document.activeElement === document.querySelector(".ex-body input"); }), "focus left the field");
    await s.page.fill(".ex-body input", plan.before);
    await s.page.keyboard.press("Alt+Key" + plan.base.toUpperCase());
    ok(await s.page.inputValue(".ex-body input") === plan.before + plan.ch, "Alt + letter: " + await s.page.inputValue(".ex-body input"));
    ok(!s.page.errs.length, "JS errors: " + s.page.errs[0]);
    await s.ctx.close();
  });
  await test("answer check: accents-only is wrong with the accents hint; with lenientAccents right, the reminder stays, the attempt is marked lenient", async function () {
    const s = await session(1280, 800, true);
    await visit(s.page, "#/practice", 600);
    const it = bankItem("fx-ser-estar-1-02");
    const plain = await s.page.evaluate(function (w) { return LM.lang.stripMarks(w); }, it.accepted[0]);
    await startItem(s.page, it);
    await s.page.fill(".ex-body input", plain);
    await s.page.click(".ex-check");
    await s.page.waitForTimeout(300);
    let t = await s.page.innerText(".ex-status");
    ok(/Not quite/.test(t) && /Check the accents/.test(t) && t.indexOf(it.accepted[0]) !== -1, "strict: " + t);
    await s.page.evaluate(function () { LM.profileData.setPref("lenientAccents", true); });
    await startItem(s.page, it);
    await s.page.fill(".ex-body input", plain);
    await s.page.click(".ex-check");
    await s.page.waitForTimeout(300);
    t = await s.page.innerText(".ex-status");
    ok(/Right!/.test(t) && /Check the accents/.test(t) && /counted as right/.test(t), "lenient: " + t);
    const last = await s.page.evaluate(function () { const a = LM.profileData.attempts().items; return a[a.length - 1]; });
    ok(last.correct === true && last.lenient === true, "attempt: " + JSON.stringify(last));
    await s.ctx.close();
  });
  await test("topic page: lang on italics, the target column and its glosses; listen buttons per row only with a voice", async function () {
    const s = await session(1280, 800, true);
    await withVoices(s.ctx, true);
    await visit(s.page, "#/a1/verbs-gustar", 900);
    const r = await s.page.evaluate(function () {
      const T = LM.APP.targetLang;
      const rows = document.querySelectorAll(".md-examples tbody tr");
      return {
        em: document.querySelectorAll("#view em").length, emLang: document.querySelectorAll("#view em[lang='" + T + "']").length,
        rows: rows.length, cells: document.querySelectorAll(".md-examples td.md-target-cell .md-target[lang='" + T + "']").length,
        glossOutside: Array.prototype.every.call(document.querySelectorAll(".md-gloss"), function (g) { return !g.closest("[lang='" + T + "']"); }),
        visibleButtons: Array.prototype.filter.call(document.querySelectorAll(".md-examples .listen-btn"), function (b) { return b.offsetParent !== null; }).length,
        listen: Array.prototype.every.call(rows, function (tr) { return tr.getAttribute("data-listen") && tr.getAttribute("data-listen").indexOf("(") === -1; }),
        voice: document.documentElement.getAttribute("data-voice")
      };
    });
    ok(r.em > 0 && r.em === r.emLang, "italics: " + r.emLang + "/" + r.em);
    ok(r.rows > 0 && r.cells === r.rows, "target cells: " + r.cells + "/" + r.rows);
    ok(r.glossOutside, "a gloss inside a lang span");
    ok(r.voice === "ok" && r.visibleButtons === r.rows && r.listen, JSON.stringify(r));
    await s.ctx.close();
    const n = await session(1280, 800, true);
    await withVoices(n.ctx, null);
    await visit(n.page, "#/a1/verbs-gustar", 900);
    const hidden = await n.page.evaluate(function () {
      return { voice: document.documentElement.getAttribute("data-voice"), visible: Array.prototype.filter.call(document.querySelectorAll(".listen-btn"), function (b) { return b.offsetParent !== null; }).length };
    });
    ok(hidden.voice === "none" && hidden.visible === 0, "no voice: " + JSON.stringify(hidden));
    await startItem(n.page, bankItem("fx-preterito-1-04"));
    ok(/has no .* voice/.test(await n.page.innerText(".ex-card")), "dictation without a voice: no message");
    await n.ctx.close();
  });
  await test("quotes: target-language lines, the gloss outside, one listen button; My words menu only on target-language text", async function () {
    const s = await session(1280, 800, true);
    await withVoices(s.ctx, true);
    await visit(s.page, "#/a1/verbs-gustar", 900);
    const q = await s.page.evaluate(function () {
      const ex = document.querySelector(".md-examples .md-target").textContent;
      const box = document.createElement("article");
      box.className = "md";
      box.appendChild(LM.markdown.render(LM.markdown.parse("> A: " + ex + " (gloss)\n> B: " + ex).blocks));
      document.getElementById("view").appendChild(box);
      const bq = box.querySelector("blockquote");
      return { spans: bq.querySelectorAll(".md-target[lang='" + LM.APP.targetLang + "']").length, gloss: bq.querySelector(".md-gloss").textContent, buttons: bq.querySelectorAll(".listen-btn").length, listen: bq.getAttribute("data-listen").split("\n").length };
    });
    ok(q.spans === 2 && q.gloss === "(gloss)" && q.buttons === 1 && q.listen === 2, JSON.stringify(q));
    const menuFor = async function (sel) {
      await s.page.evaluate(function (selector) {
        const host = document.querySelector(selector);
        host.scrollIntoView({ block: "center" });
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        const n = walker.nextNode();
        const word = /\p{L}{3,}/u.exec(n.nodeValue);
        const r = document.createRange();
        r.setStart(n, word.index); r.setEnd(n, word.index + word[0].length);
        getSelection().removeAllRanges(); getSelection().addRange(r);
      }, sel);
      await s.page.waitForTimeout(400);
      return s.page.evaluate(function () { const m = document.querySelector(".fc-sel-menu"); return m && !m.hidden ? m.innerText : ""; });
    };
    ok(/Add to My words/.test(await menuFor(".md-examples .md-target")), "no Add to My words on target-language text");
    const en = await menuFor(".md-examples td:not(.md-target-cell)");
    ok(en && !/Add to My words/.test(en), "Add to My words on English text: " + en);
    ok(!s.page.errs.length, "JS errors: " + s.page.errs[0]);
    await s.ctx.close();
  });
  await test("settings: the voice variant radios change the preference (one checked)", async function () {
    const s = await session(1280, 800, true);
    await withVoices(s.ctx, true);
    await visit(s.page, "#/review", 700);
    await s.page.click("#profile-btn");
    await s.page.waitForTimeout(300);
    const radios = await s.page.locator(".menu-radio").count();
    ok(radios >= 2, "voice radios: " + radios);
    await s.page.locator(".menu-radio").nth(1).click();
    const pref = await s.page.evaluate(function () { return { v: LM.profileData.prefs().voiceVariant, want: LM.APP.speech.variants[1].id, checked: document.querySelectorAll(".menu-radio[aria-checked='true']").length }; });
    ok(pref.v === pref.want && pref.checked === 1, JSON.stringify(pref));
    ok(!s.page.errs.length, "JS errors: " + s.page.errs[0]);
    await s.ctx.close();
  });

  console.log("\nExercises with Spanish data (stage 4: every item type, paradigm E6)");
  /** Answers the current item through the page as a learner would, with the model answer (right) or a wrong one. */
  async function answerItem(page, it, right) {
    const t = it.type;
    if (t === "multiple-choice") {
      const want = right ? it.options[it.correct] : it.options[(it.correct + 1) % it.options.length];
      const i = await page.evaluate(function (w) { return Array.prototype.findIndex.call(document.querySelectorAll(".ex-option-text"), function (n) { return n.textContent === w; }); }, want);
      await page.click(".ex-option >> nth=" + i);
    } else if (t === "short-answer" || t === "transformation") {
      await page.fill(".ex-body input[type=text]", right ? (it.accepted || it.answers)[0] : "zzz");
    } else if (t === "translate" || t === "dictation") {
      if (t === "dictation") await page.click("[data-fk='listen']");
      await page.fill(".ex-body textarea", right ? (it.text || it.accepted[0]) : "zzz zzz");
    } else if (t === "gap-fill") {
      const inputs = await page.$$(".ex-body input.ex-gap-input");
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(right ? it.gaps[i].accepted[0] : "zzz");
    } else if (t === "paradigm") {
      const inputs = await page.$$(".ex-body input.ex-para-input:not(.is-given)");
      const open = it.cells.filter(function (c) { return !c.given; });
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(right ? open[i].accepted[0] : "zzz");
    } else if (t === "reorder") {
      const words = await page.evaluate(function (x) { return LM.exLogic.answerTokens(x.answers[0], x.answers.slice(1)); }, it);
      const order = right ? words : words.slice().reverse();
      for (const w of order) {
        const i = await page.evaluate(function (word) { return Array.prototype.findIndex.call(document.querySelectorAll(".ex-pool .ex-token"), function (n) { return n.textContent === word; }); }, w);
        await page.click(".ex-pool .ex-token >> nth=" + i);
      }
    } else if (t === "find-error") {
      if (it.noError) { if (right) await page.click(".ex-tools .btn"); else await page.click(".ex-word >> nth=0"); }
      else {
        await page.click(".ex-word >> nth=" + it.errorRange[0]);
        if (it.errorRange[1] !== it.errorRange[0]) await page.click(".ex-word >> nth=" + it.errorRange[1]);
        await page.fill("#ex-fix", right ? it.fixes[0] : "zzz");
      }
    } else if (t === "match") {
      for (let i = 0; i < it.pairs.length; i++) {
        const want = right ? it.pairs[i][1] : it.pairs[(i + 1) % it.pairs.length][1];
        await page.click("[data-fk='" + (i === 0 ? "first" : "L" + i) + "']");
        const j = await page.evaluate(function (w) { return Array.prototype.findIndex.call(document.querySelectorAll(".ex-match-col:nth-child(2) .ex-match-text"), function (n) { return n.textContent === w; }); }, want);
        const btns = await page.$$(".ex-match-col:nth-child(2) .ex-match-item");
        await btns[j].click();
      }
    }
    await page.click(".ex-check");
    await page.waitForTimeout(250);
  }
  /** Every item of the content sets (the real Spanish data), each solved right and wrong in the page. */
  const contentItems = [];
  fs.readdirSync(path.join(ROOT, "content", "exercises")).filter(function (f) { return /\.json$/.test(f) && f !== "topics.json" && f !== "mixes.json"; }).forEach(function (f) {
    const set = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "exercises", f), "utf8"));
    set.items.forEach(function (it) { contentItems.push(Object.assign({ topic: set.topic, level: set.level, setId: set.id }, it)); });
  });
  await test("every item type with Spanish data: the model answer is Right, a wrong answer is not; no JS errors", async function () {
    const s = await session(1280, 800, true);
    await withVoices(s.ctx, true);
    await visit(s.page, "#/practice", 600);
    const types = {};
    for (const it of contentItems) {
      for (const right of [true, false]) {
        await startItem(s.page, it);
        await answerItem(s.page, it, right);
        const v = await s.page.innerText(".ex-status .lt-verdict");
        if (right) ok(/Right!/.test(v), it.id + " model answer: " + v);
        else ok(!/Right!/.test(v), it.id + " wrong answer counted as right: " + v);
      }
      types[it.type] = true;
    }
    ok(Object.keys(types).length === 10, "types covered: " + Object.keys(types).join(", "));
    ok(!s.page.errs.length, "JS errors: " + s.page.errs[0]);
    await s.ctx.close();
  });
  await test("paradigm: Tab moves down the cells, Enter checks, wrong cells show the right form, character bar, live status", async function () {
    const s = await session(1280, 800, true);
    await visit(s.page, "#/practice", 600);
    const it = bankItem("fx-ser-estar-1-07");
    await startItem(s.page, it);
    const r = await s.page.evaluate(function () {
      return { bar: !!document.querySelector(".ex-body[data-charbar] .charbar-key, .ex-body + .charbar .charbar-key") || document.querySelectorAll(".charbar-key").length > 0,
        given: document.querySelectorAll(".ex-para-input.is-given[readonly]").length, live: document.querySelector(".ex-status").getAttribute("aria-live"), lang: document.querySelector(".ex-para-label").getAttribute("lang") === LM.APP.targetLang };
    });
    ok(r.bar && r.given === 1 && r.live === "polite" && r.lang === true, JSON.stringify(r));
    ok(await s.page.getAttribute("#ex-cell-1", "data-fk") === "first", "the first cell to fill takes the focus at the start");
    await s.page.click("#ex-cell-1");
    const open = it.cells.filter(function (c) { return !c.given; });
    for (let i = 0; i < open.length; i++) {
      await s.page.keyboard.type(i === 1 ? "zzz" : open[i].accepted[0]);
      if (i < open.length - 1) await s.page.keyboard.press("Tab");
    }
    ok(await s.page.evaluate(function () { return document.activeElement.id; }) === "ex-cell-" + (it.cells.length - 1), "Tab did not move down the cells");
    await s.page.keyboard.press("Enter");
    await s.page.waitForTimeout(300);
    const t = await s.page.innerText(".ex-status");
    ok(/Partly right/.test(t) && /4 \/ 5 points/.test(t), "verdict: " + t);
    const model = await s.page.innerText(".ex-para-row.is-bad .ex-gap-model");
    ok(model.indexOf(open[1].accepted[0]) !== -1, "right form next to the wrong cell: " + model);
    ok(await s.page.$$eval(".ex-para-row.is-ok", function (n) { return n.length; }) === 4, "four right cells");
    const last = await s.page.evaluate(function () { const a = LM.profileData.attempts().items; return a[a.length - 1]; });
    ok(last.type === "paradigm" && last.points === 4 && last.max === 5 && !last.correct, "attempt: " + JSON.stringify(last));
    ok(!s.page.errs.length, "JS errors: " + s.page.errs[0]);
    await s.ctx.close();
  });
  await test("paradigm on a phone (320 px): one column, targets ≥ 44 px, no horizontal scroll", async function () {
    const s = await session(320, 740, true);
    await visit(s.page, "#/practice", 600);
    await startItem(s.page, bankItem("fx-ser-estar-1-07"));
    const r = await s.page.evaluate(function () {
      const inputs = Array.prototype.slice.call(document.querySelectorAll(".ex-para-input"));
      const lefts = inputs.map(function (n) { return Math.round(n.getBoundingClientRect().left); });
      return { cols: new Set(lefts).size, minH: Math.min.apply(null, inputs.map(function (n) { return n.getBoundingClientRect().height; })),
        scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    ok(r.cols === 1 && r.minH >= 44 && r.scroll <= 0, JSON.stringify(r));
    await s.ctx.close();
  });
  await test("hub filters and the generator list Fill the table; a set result is in points", async function () {
    const s = await session(1280, 800, true);
    await withVoices(s.ctx, true);
    await visit(s.page, "#/practice", 900);
    const chips = await s.page.$$eval(".chip-filter [data-type]", function (n) { return n.map(function (x) { return x.dataset.type; }); });
    ok(chips.indexOf("paradigm") !== -1, "type chips: " + chips.join(", "));
    const setId = contentItems.find(function (it) { return it.type === "paradigm"; }).setId;
    await visit(s.page, "#/practice/set/" + setId, 900);
    await s.page.click("[data-fk='mode-exam']");
    await s.page.click("[data-fk='start']");
    for (let i = 0; i < 20; i++) {
      if (!(await s.page.$(".ex-check"))) break;
      await s.page.click(".ex-check");
      await s.page.waitForTimeout(120);
    }
    const score = await s.page.innerText(".ex-result-score");
    ok(/\d+\/\d+ points/.test(score), "result: " + score);
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
