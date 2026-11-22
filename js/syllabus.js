/*
 * syllabus.js — LM.syl: read access to the syllabus (spec 06 E1, E2).
 *
 * LM.SYLLABUS and LM.LEVEL_STATUS come from data/syllabus.js (generated from content/syllabus.json and
 * content/levels.json). They are the ONLY list of levels, units, categories and topics. A checklist item is a
 * topic: progress[<topic id>] = true. Nothing here is language-specific.
 *
 *   LM.LEVEL_IDS                   ["A1", …, "C2"] in syllabus order
 *   syl.levels() / level(id)       syllabus levels ({ id, land, goal, units, status })
 *   syl.status(id), isAvailable(id), availableLevels()
 *   syl.categories()               [{ id, name }] in syllabus order; categoryName(id)
 *   syl.topics(levelId?)           topics in unit order: { id, level, unit, unitTitle, category, title, example, order, file, path }
 *   syl.topic(id)                  one topic or null
 *   syl.groups(levelId)            [{ id, name, topics }] by category, in order of first appearance on that level
 *   syl.routeOf(id)                "#/a1/verbs-gustar"; topicFromPath("a1/verbs-gustar") → topic or null
 *   syl.hasPage(id)                the topic page exists in LM.PAGES
 *   syl.stats(levelId, progress)   { done, total, percent } over the level's topics
 *   syl.countDone(progress)        ticked topics that exist in the syllabus
 *   syl.landName(levelId)          "Meadow"
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  let cache = null;

  function src() { return LM.SYLLABUS || { categories: {}, levels: [] }; }

  function build() {
    const s = src();
    const byId = {};
    const all = [];
    const byLevel = {};
    let order = 0;
    (s.levels || []).forEach(function (level) {
      byLevel[level.id] = [];
      (level.units || []).forEach(function (unit) {
        (unit.topics || []).forEach(function (t) {
          const m = /^([a-z][0-9])-(.+)$/.exec(t.id);
          const path = m ? m[1] + "/" + m[2] : t.id;
          const topic = {
            id: t.id, level: level.id, unit: unit.id, unitTitle: unit.title, category: t.category,
            title: t.title, example: t.example || "", order: order++, path: path, file: path + ".md"
          };
          byId[t.id] = topic;
          all.push(topic);
          byLevel[level.id].push(topic);
        });
      });
    });
    return { byId: byId, all: all, byLevel: byLevel };
  }

  function c() { return cache || (cache = build()); }

  function levels() { return src().levels || []; }
  function level(id) { return levels().find(function (l) { return l.id === id; }) || null; }
  function status(id) {
    const st = LM.LEVEL_STATUS && LM.LEVEL_STATUS[id];
    return st === "available" ? "available" : "soon";
  }
  function isAvailable(id) { return status(id) === "available"; }
  function availableLevels() { return LM.LEVEL_IDS.filter(isAvailable); }

  function categories() {
    const cats = src().categories || {};
    return Object.keys(cats).map(function (id) { return { id: id, name: cats[id] }; });
  }
  function categoryName(id) { return (src().categories || {})[id] || id; }

  function topics(levelId) { return levelId ? (c().byLevel[levelId] || []) : c().all; }
  function topic(id) { return c().byId[id] || null; }

  function groups(levelId) {
    const out = [];
    const at = {};
    topics(levelId).forEach(function (t) {
      if (!(t.category in at)) { at[t.category] = out.length; out.push({ id: t.category, name: categoryName(t.category), topics: [] }); }
      out[at[t.category]].topics.push(t);
    });
    return out;
  }

  function routeOf(id) { const t = topic(id); return t ? "#/" + t.path : null; }
  function topicFromPath(path) {
    const p = String(path || "").toLowerCase().replace(/^\/+|\/+$/g, "");
    return c().all.find(function (t) { return t.path === p; }) || null;
  }

  function hasPage(id) {
    const t = topic(id);
    return !!(t && LM.PAGES && LM.PAGES.pages && LM.PAGES.pages[t.file]);
  }

  function stats(levelId, progress) {
    const list = topics(levelId);
    const done = list.filter(function (t) { return progress && progress[t.id] === true; }).length;
    return { done: done, total: list.length, percent: list.length ? Math.round((done / list.length) * 100) : 0 };
  }

  function countDone(progress) {
    if (!progress) return 0;
    return c().all.filter(function (t) { return progress[t.id] === true; }).length;
  }

  function landName(levelId) { const l = level(levelId); return l && l.land ? l.land : ""; }

  /** Tests only: forget the derived lists (after swapping LM.SYLLABUS). */
  function reset() { cache = null; LM.LEVEL_IDS = levels().map(function (l) { return l.id; }); }

  LM.LEVEL_IDS = levels().map(function (l) { return l.id; });

  LM.syl = {
    levels: levels, level: level, status: status, isAvailable: isAvailable, availableLevels: availableLevels,
    categories: categories, categoryName: categoryName, topics: topics, topic: topic, groups: groups,
    routeOf: routeOf, topicFromPath: topicFromPath, hasPage: hasPage, stats: stats, countDone: countDone,
    landName: landName, reset: reset
  };
})(window.LM);
