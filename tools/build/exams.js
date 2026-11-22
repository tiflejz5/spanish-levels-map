/*
 * exams.js — exam registry and per-exam data (port of the reference tools/zbuduj-egzaminy.js, generic part only).
 *
 *   content/exams/registry.json                → data/exams-registry.js   LM.EXAM_REGISTRY = { version, exams, links, sets }
 *   content/exams/<exam id>/manifest.json, pages/*.md, exercises/*.json, trainers/*.json, links.json
 *                                              → data/exam-<id>.js        LM.EXAMS[<id>] = { manifest, pages, trainers }  (lazy)
 *                                              → data/sets/<set id>.js    exam sets in the engine format
 * The registry stays empty until stage E (spec 06 E8, spec 12). The C1 Use of English format is dropped (spec 03).
 */
"use strict";

const C = require("./common");

function sectionTrainers(sec) { return Array.isArray(sec.trainers) ? sec.trainers : sec.trainer ? [sec.trainer] : []; }

function build(ctx) {
  const root = C.path.join(C.CONTENT, "exams");
  const registry = C.readJsonIf(C.path.join(root, "registry.json"), { version: 1, exams: [] });
  const exams = (registry.exams || []).slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
  const links = {};
  const sets = {};
  const summary = [];
  ctx.examSets = [];
  exams.forEach(function (exam) {
    const dir = C.path.join(root, exam.id);
    const manifestFile = C.path.join(dir, "manifest.json");
    if (exam.status !== "active" || !C.exists(manifestFile)) return;
    const manifest = C.readJson(manifestFile);
    const pages = {}, trainers = {};
    exam.setIds = [];
    (manifest.sections || []).forEach(function (sec) {
      (sec.pages || []).forEach(function (p) {
        const file = C.path.join(dir, p.file);
        if (C.exists(file)) pages[p.id] = C.read(file); else ctx.error("exams/" + exam.id + ": missing page " + p.file);
      });
      (sec.exerciseGroups || []).forEach(function (g) {
        g.sets.forEach(function (s) {
          const file = C.path.join(dir, s.file);
          if (!C.exists(file)) { ctx.error("exams/" + exam.id + ": missing set " + s.file); return; }
          const set = C.readJson(file);
          set.items = (set.items || []).map(function (it) { return Object.assign({ topic: null, level: set.level || null, tags: [], setId: s.id }, it); });
          C.writeData("sets/" + s.id + ".js", "content/exams/" + exam.id + "/" + s.file, C.assignKey("EX_SETS", s.id, set));
          sets[s.id] = { exam: exam.id, label: s.label, group: g.label, maxScore: s.maxScore || null, format: "items",
            href: "#/practice/set/" + s.id, file: "data/sets/" + s.id + ".js" };
          exam.setIds.push(s.id);
          ctx.examSets.push({ exam: exam, group: g, meta: s, set: set });
        });
      });
      sectionTrainers(sec).forEach(function (t) {
        const file = C.path.join(dir, t.file);
        if (C.exists(file)) trainers[t.id] = C.readJson(file); else ctx.error("exams/" + exam.id + ": missing trainer " + t.file);
      });
    });
    const linksFile = C.path.join(dir, "links.json");
    if (C.exists(linksFile)) links[exam.id] = C.readJson(linksFile).links || [];
    C.writeData("exam-" + exam.id + ".js", "content/exams/" + exam.id + "/", C.assignKey("EXAMS", exam.id, { manifest: manifest, pages: pages, trainers: trainers }));
    summary.push(exam.id + ": " + Object.keys(pages).length + " pages, " + exam.setIds.length + " sets, " + Object.keys(trainers).length + " trainers");
  });
  ctx.exams = exams;
  C.writeData("exams-registry.js", "content/exams/registry.json",
    C.assign("EXAM_REGISTRY", { version: 1, exams: exams, links: links, boxTitles: {}, sets: sets }));
  ctx.log("Exams: " + (exams.length ? exams.map(function (e) { return e.code + (e.status === "active" ? "" : " (" + e.status + ")"); }).join(", ") : "registry empty") +
    (summary.length ? " | " + summary.join(" | ") : ""));
}

module.exports = { build: build };
