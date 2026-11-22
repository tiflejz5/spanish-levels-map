/*
 * exams.js — exam registry and per-exam data (port of the reference tools/zbuduj-egzaminy.js, generic part only).
 *
 *   <root>/registry.json                       → data/exams-registry.js   LM.EXAM_REGISTRY = { version, exams, links, sets }
 *   <root>/<exam id>/manifest.json, pages/*.md, exercises/*.json, trainers/*.json, links.json
 *                                              → data/exam-<id>.js        LM.EXAMS[<id>] = { manifest, pages, trainers }  (lazy)
 *                                              → data/sets/<set id>.js    exam sets in the engine format (also listed in
 *                                                                         data/sets-index.js by tools/build/exercises.js)
 * <root> is content/exams. The registry stays empty until stage E (spec 06 E8, spec 12); the fixture exam in
 * tools/fixtures/exam-demo/ goes through the same collect() in the unit and e2e tests.
 * The C1 Use of English format of the reference app is dropped (spec 03).
 */
"use strict";

const C = require("./common");

function sectionTrainers(sec) { return Array.isArray(sec.trainers) ? sec.trainers : sec.trainer ? [sec.trainer] : []; }

/**
 * Reads an exam root without writing anything.
 * → { registry: { version, exams, links, boxTitles, sets }, data: { <id>: { manifest, pages, trainers } },
 *     setFiles: { <set id>: set }, examSets: [{ exam, group, meta, set }], errors: [], summary: [] }
 */
function collect(root) {
  const errors = [];
  const registry = C.readJsonIf(C.path.join(root, "registry.json"), { version: 1, exams: [] });
  const exams = (registry.exams || []).slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
  const links = {}, sets = {}, data = {}, setFiles = {}, examSets = [], summary = [];
  const seen = {};
  exams.forEach(function (exam) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(exam.id || "")) errors.push("exams/registry.json: bad exam id " + JSON.stringify(exam.id));
    if (seen[exam.id]) errors.push("exams/registry.json: duplicate exam id " + exam.id);
    seen[exam.id] = true;
    if (["active", "soon"].indexOf(exam.status) === -1) errors.push("exams/registry.json: " + exam.id + " has unknown status " + JSON.stringify(exam.status));
    if (!exam.code || !exam.label) errors.push("exams/registry.json: " + exam.id + " needs code and label");
    const dir = C.path.join(root, exam.id);
    const manifestFile = C.path.join(dir, "manifest.json");
    if (exam.status !== "active") return;
    if (!C.exists(manifestFile)) { errors.push("exams/" + exam.id + ": active exam without manifest.json"); return; }
    const manifest = C.readJson(manifestFile);
    const pages = {}, trainers = {};
    exam.setIds = [];
    (manifest.sections || []).forEach(function (sec) {
      (sec.pages || []).forEach(function (p) {
        const file = C.path.join(dir, p.file);
        if (C.exists(file)) pages[p.id] = C.read(file); else errors.push("exams/" + exam.id + ": missing page " + p.file);
      });
      (sec.exerciseGroups || []).forEach(function (g) {
        g.sets.forEach(function (s) {
          const file = C.path.join(dir, s.file);
          if (!C.exists(file)) { errors.push("exams/" + exam.id + ": missing set " + s.file); return; }
          const set = C.readJson(file);
          set.id = s.id;
          set.items = (set.items || []).map(function (it) { return Object.assign({ topic: null, level: set.level || null, tags: [], setId: s.id }, it); });
          setFiles[s.id] = set;
          sets[s.id] = { exam: exam.id, label: s.label, group: g.label, maxScore: s.maxScore || null, format: "items",
            href: "#/practice/set/" + s.id, file: "data/sets/" + s.id + ".js" };
          exam.setIds.push(s.id);
          examSets.push({ exam: exam, group: g, meta: s, set: set });
        });
      });
      sectionTrainers(sec).forEach(function (t) {
        if (["writing", "speaking"].indexOf(t.type) === -1) errors.push("exams/" + exam.id + ": trainer " + t.id + " needs type \"writing\" or \"speaking\"");
        const file = C.path.join(dir, t.file);
        if (C.exists(file)) trainers[t.id] = C.readJson(file); else errors.push("exams/" + exam.id + ": missing trainer " + t.file);
      });
    });
    const linksFile = C.path.join(dir, "links.json");
    if (C.exists(linksFile)) links[exam.id] = C.readJson(linksFile).links || [];
    data[exam.id] = { manifest: manifest, pages: pages, trainers: trainers };
    summary.push(exam.id + ": " + Object.keys(pages).length + " pages, " + exam.setIds.length + " sets, " + Object.keys(trainers).length + " trainers");
  });
  return {
    registry: { version: 1, exams: exams, links: links, boxTitles: {}, sets: sets },
    data: data, setFiles: setFiles, examSets: examSets, errors: errors, summary: summary
  };
}

/** The generated files of an exam root as { "<data path>": "<file text>" } (used by build() and the e2e fixture). */
function files(result) {
  const out = {};
  const head = function (src) { return "/* GENERATED by tools/build.js — do not edit. Source: " + src + " */\nwindow.LM = window.LM || {};\n"; };
  out["data/exams-registry.js"] = head("exams/registry.json") + C.assign("EXAM_REGISTRY", result.registry) + "\n";
  Object.keys(result.data).forEach(function (id) {
    out["data/exam-" + id + ".js"] = head("exams/" + id + "/") + C.assignKey("EXAMS", id, result.data[id]) + "\n";
  });
  Object.keys(result.setFiles).forEach(function (id) {
    out["data/sets/" + id + ".js"] = head("exams set " + id) + C.assignKey("EX_SETS", id, result.setFiles[id]) + "\n";
  });
  return out;
}

function build(ctx) {
  const r = collect(C.path.join(C.CONTENT, "exams"));
  r.errors.forEach(function (e) { ctx.error(e); });
  Object.keys(r.data).forEach(function (id) {
    C.writeData("exam-" + id + ".js", "content/exams/" + id + "/", C.assignKey("EXAMS", id, r.data[id]));
  });
  Object.keys(r.setFiles).forEach(function (id) {
    const meta = r.registry.sets[id];
    C.writeData("sets/" + id + ".js", "content/exams/" + meta.exam + "/", C.assignKey("EX_SETS", id, r.setFiles[id]));
  });
  ctx.exams = r.registry.exams;
  ctx.examSets = r.examSets;
  C.writeData("exams-registry.js", "content/exams/registry.json", C.assign("EXAM_REGISTRY", r.registry));
  ctx.log("Exams: " + (r.registry.exams.length ? r.registry.exams.map(function (e) { return e.code + (e.status === "active" ? "" : " (" + e.status + ")"); }).join(", ") : "registry empty") +
    (r.summary.length ? " | " + r.summary.join(" | ") : ""));
}

module.exports = { build: build, collect: collect, files: files };
