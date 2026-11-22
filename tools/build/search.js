/*
 * search.js — search index (port of the reference tools/zbuduj-szukaj.js) → data/search-index.js
 *   LM.SEARCH_INDEX = { version, records: [{ id, group, title, headings, summary, text, level, category, route }] }   (lazy)
 *
 * Indexed: topic pages, summaries and cheat sheets of AVAILABLE levels only (spec 06 E1), exercise sets, mixes,
 * shortcuts to the review views and built-in decks, lab cards, phrase-bank groups, exam pages and sets.
 * Notes and the mistake log are added in the browser. Routes are the English ones of spec 02 §6 (the router
 * handles them from stage 1B; until then only topic-page routes open).
 */
"use strict";

const C = require("./common");

const TEXT_MAX = 4000;
const SIZE_LIMIT = 1024 * 1024;

function clean(md) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s*)?/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function headings(body) { return (body.match(/^#{2,3}\s+.+$/gm) || []).map(function (h) { return clean(h.replace(/^#+\s+/, "")); }); }
function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > max * 0.8 ? cut.lastIndexOf(" ") : max);
}

function build(ctx) {
  const records = [];
  const add = function (r) {
    records.push({ id: r.id, group: r.group, title: r.title || "", headings: r.headings || [], summary: r.summary || "",
      text: clip(r.text || "", TEXT_MAX), level: r.level || null, category: r.category || null, route: r.route });
  };
  const available = function (level) { return ctx.status[level] === "available"; };
  const cats = ctx.syllabus.categories || {};

  // Topic pages
  Object.keys(ctx.topics).forEach(function (id) {
    const t = ctx.topics[id];
    const file = C.path.join(C.CONTENT, "pages", C.pageFileOf(id));
    if (!available(t.level) || !C.exists(file)) return;
    const md = C.splitMd(C.read(file));
    add({ id: "page:" + id, group: "pages", title: md.meta.title || t.title, headings: headings(md.body), summary: md.meta.summary || "",
      text: clean(md.body.replace(/^#\s+.+$/m, "")), level: t.level, category: cats[t.category] || t.category,
      route: "#/" + C.pageFileOf(id).replace(/\.md$/, "") });
  });
  // Summaries and cheat sheets
  [["summaries", "summary", "Level summary ", ""], ["cheatsheets", "cheatsheet", "Cheat sheet ", "/cheatsheet"]].forEach(function (k) {
    C.listFiles(C.path.join(C.CONTENT, k[0]), /^[abc][12]\.md$/i).forEach(function (f) {
      const L = f.replace(/\.md$/i, "").toUpperCase();
      if (!available(L)) return;
      const md = C.splitMd(C.read(C.path.join(C.CONTENT, k[0], f)));
      add({ id: k[1] + ":" + L, group: "pages", title: k[2] + L, headings: headings(md.body), summary: md.meta.summary || "",
        text: clean(md.body), level: L, category: k[1] === "cheatsheet" ? "Cheat sheet" : null, route: "#/" + L.toLowerCase() + k[3] });
    });
  });
  // Review shortcuts and built-in decks (cards are not indexed: too much noise)
  add({ id: "review", group: "exercises", title: "Flashcards and mistakes", summary: "One review queue: deck cards, My mistakes and weak spots from exercises.", text: "flashcards review decks mistakes weak spots", category: "Flashcards", route: "#/review" });
  add({ id: "review:words", group: "exercises", title: "My words", summary: "Words and phrases you selected in texts, with their sentence and meaning.", text: "my words personal vocabulary flashcards", category: "Flashcards", route: "#/review/words" });
  (ctx.decks || []).forEach(function (d) {
    add({ id: "deck:" + d.id, group: "exercises", title: d.title + " (flashcards)", summary: d.description, text: "flashcards deck " + d.title + " " + d.level, category: "Flashcards", route: "#/review/decks/deck/" + d.id });
  });
  // Sets and mixes
  Object.keys(ctx.sets || {}).forEach(function (id) {
    const s = ctx.sets[id];
    if (s.level && !available(s.level)) return;
    const t = ctx.topics[s.topic];
    add({ id: "set:" + id, group: "exercises", title: s.title, summary: s.intro, text: "Topic: " + ((t && (ctx.pageMeta[t.id] || t).title) || s.topic || ""), level: s.level, category: "Exercise set", route: "#/practice/set/" + id });
  });
  (ctx.mixes || []).forEach(function (m) {
    add({ id: "mix:" + m.id, group: "exercises", title: m.title, summary: m.description || "", text: "Mixed set. Topics: " + (m.topics || []).map(function (t) { return (ctx.topics[t] || {}).title || t; }).join(", "), category: "Mixed set", route: "#/practice/mix/" + m.id });
  });
  // Lab
  (ctx.lab || []).forEach(function (card) {
    add({ id: "lab:" + card.id, group: "lab", title: card.name, headings: card.nameEn ? [card.nameEn] : [], summary: card.summary || "",
      text: [].concat((card.uses || []).map(function (u) { return (u.label || "") + " " + (u.example || u.text || ""); }), card.signals || [], card.traps || []).join(" "),
      level: card.level, category: "Tense & Mood Lab", route: "#/lab/" + card.id });
  });
  // Phrase bank
  if (ctx.phrases) {
    (ctx.phrases.groups || []).forEach(function (g) {
      add({ id: "phrases:" + g.id, group: "exercises", title: "Phrases: " + g.label, summary: g.description || "",
        text: (g.phrases || []).map(function (p) { return (p.text || "") + " " + (p.en || ""); }).join(" "), category: "Writing", route: "#/writing/phrases/" + g.id });
    });
  }
  // Exams
  (ctx.examSets || []).forEach(function (x) {
    add({ id: "examset:" + x.meta.id, group: "exercises", title: x.set.title || x.meta.label, summary: x.set.intro || "", text: x.exam.label + " · " + x.group.label, level: x.set.level || null, category: x.exam.label, route: "#/practice/set/" + x.meta.id });
  });

  let json = { version: 1, records: records };
  if (JSON.stringify(json).length > SIZE_LIMIT) records.forEach(function (r) { r.text = clip(r.text, 900); });
  C.writeData("search-index.js", "content/** (pages, summaries, cheat sheets, sets, mixes, decks, lab, phrases, exams)", C.assign("SEARCH_INDEX", json));
  const groups = {};
  records.forEach(function (r) { groups[r.group] = (groups[r.group] || 0) + 1; });
  ctx.log("Search: " + records.length + " records (" + Object.keys(groups).map(function (g) { return g + " " + groups[g]; }).join(", ") + ")");
}

module.exports = { build: build };
