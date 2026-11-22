/*
 * pages.js — topic pages, level summaries, cheat sheets and the home page → data/pages.js
 * (port of the reference tools/zbuduj-niezbednik.js; the C1 tab part is dropped, spec 03).
 *
 *   content/pages/<level>/<category>-<slug>.md   topic pages (front matter id = syllabus id)
 *   content/summaries/<level>.md                 level summaries
 *   content/cheatsheets/<level>.md               cheat sheets
 *   content/home.md                              home page
 *
 * LM.PAGES = { index, pages: { "a1/verbs-gustar.md": md }, summaries: { A1: md }, cheatsheets: { A1: md }, home }
 * `index` keeps the reference shape ({ categories, levels: [{ level, items: [{ id, category, file, label }] }] })
 * and is derived from the syllabus, so the handbook keeps working until stage 1B reads LM.SYLLABUS directly.
 */
"use strict";

const C = require("./common");

function build(ctx) {
  const dir = C.path.join(C.CONTENT, "pages");
  const pages = {};
  const byFile = {};
  C.listDirs(dir).forEach(function (lvl) {
    C.listFiles(C.path.join(dir, lvl), /\.md$/).forEach(function (f) {
      const relFile = lvl + "/" + f;
      const md = C.read(C.path.join(dir, lvl, f));
      const meta = C.splitMd(md).meta;
      const topic = ctx.topics[meta.id];
      if (!meta.id) { ctx.error("pages/" + relFile + ": front matter has no id"); return; }
      if (!topic) { ctx.error("pages/" + relFile + ": id " + meta.id + " is not in the syllabus"); return; }
      if (C.pageFileOf(meta.id) !== relFile) ctx.error("pages/" + relFile + ": file name must be " + C.pageFileOf(meta.id));
      if (meta.level && meta.level !== topic.level) ctx.error("pages/" + relFile + ": level " + meta.level + " ≠ syllabus " + topic.level);
      if (meta.category && meta.category !== topic.category) ctx.error("pages/" + relFile + ": category " + meta.category + " ≠ syllabus " + topic.category);
      pages[relFile] = md;
      byFile[meta.id] = { title: meta.title || topic.title, summary: meta.summary || "" };
    });
  });

  const index = {
    version: 2,
    categories: ctx.syllabus.categories,
    levels: ctx.syllabus.levels.map(function (level) {
      const items = [];
      level.units.forEach(function (unit) {
        unit.topics.forEach(function (t) {
          items.push({ id: t.id, category: t.category, unit: unit.id, file: C.pageFileOf(t.id), label: (byFile[t.id] || t).title });
        });
      });
      return { level: level.id, items: items };
    })
  };

  const byLevel = function (sub, re) {
    const out = {};
    C.listFiles(C.path.join(C.CONTENT, sub), re).forEach(function (f) {
      out[f.replace(/\.md$/i, "").toUpperCase()] = C.read(C.path.join(C.CONTENT, sub, f));
    });
    return out;
  };
  const summaries = byLevel("summaries", /^[abc][12]\.md$/i);
  const cheatsheets = byLevel("cheatsheets", /^[abc][12]\.md$/i);
  const homeFile = C.path.join(C.CONTENT, "home.md");
  const home = C.exists(homeFile) ? C.read(homeFile) : null;

  ctx.pageMeta = byFile;
  C.writeData("pages.js", "content/pages, summaries, cheatsheets, home.md",
    C.assign("PAGES", { index: index, pages: pages, summaries: summaries, cheatsheets: cheatsheets, home: home }));
  ctx.log("Pages: " + Object.keys(pages).length + " of " + Object.keys(ctx.topics).length + " topics; summaries " +
    (Object.keys(summaries).join(", ") || "none") + "; cheat sheets " + (Object.keys(cheatsheets).join(", ") || "none") +
    "; home " + (home ? "yes" : "no"));
}

module.exports = { build: build };
