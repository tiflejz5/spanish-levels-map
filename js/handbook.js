/*
 * handbook.js — topic pages, level summaries, cheat sheets and the home page.
 *
 * Text: LM.PAGES (data/pages.js, built from content/pages, summaries, cheatsheets, home.md).
 * Which topics exist, their titles, levels and categories: LM.SYLLABUS through LM.syl (spec 06 E2). There is no label
 * matching: the page of topic "a1-verbs-gustar" is content/pages/a1/verbs-gustar.md, and its checklist item is the
 * topic id itself (progress["a1-verbs-gustar"]).
 *
 * Routes (spec 02 §6):
 *   #/a1/<category>-<slug>   topic page (topic id without the level prefix)
 *   #/a1/cheatsheet          level cheat sheet
 * A syllabus topic without a page shows "This topic is being written" (spec 06 E1).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  // Sections (## headings) hidden behind "Show answers" (spec 07)
  const HIDDEN_SECTIONS = ["Answers"];

  const metaCache = {};

  function data() { return LM.PAGES || null; }
  function appTitle() { return LM.APP.appTitle; }

  // =====================================================================
  // ROUTES
  // =====================================================================

  /** Route of a topic ("#/a1/verbs-gustar"). Accepts a topic id or a topic object. */
  function routeOf(topic) {
    return LM.syl.routeOf(typeof topic === "string" ? topic : topic.id);
  }

  function cheatsheetRoute(levelId) { return "#/" + levelId.toLowerCase() + "/cheatsheet"; }

  /**
   * "#/a1/verbs-gustar" → { kind: "topic", topicId, level }; "#/a1/cheatsheet" → { kind: "cheatsheet", level };
   * anything else (also an unknown slug) → null, so the router shows "Page not found".
   */
  function parseRoute(hash) {
    const m = /^#\/([abc][12])\/([a-z0-9-]+)\/?$/i.exec(hash || "");
    if (!m) return null;
    const level = m[1].toUpperCase();
    const slug = m[2].toLowerCase();
    if (slug === "cheatsheet") return { kind: "cheatsheet", level: level };
    const topic = LM.syl.topicFromPath(m[1].toLowerCase() + "/" + slug);
    return topic ? { kind: "topic", topicId: topic.id, level: topic.level } : null;
  }

  function pageText(topic) {
    const d = data();
    return (d && d.pages && d.pages[topic.file]) || null;
  }

  function metaOf(topic) {
    const md = pageText(topic);
    if (!md) return {};
    if (!metaCache[topic.file]) metaCache[topic.file] = LM.markdown.parseFrontmatter(md).meta;
    return metaCache[topic.file];
  }

  /** Display title of a topic: the page title when the page exists, else the syllabus title. */
  function titleOf(topic) { return metaOf(topic).title || topic.title; }

  // =====================================================================
  // TOPIC PAGE
  // =====================================================================

  function renderPage(route) {
    if (route.kind === "cheatsheet") return renderCheatsheet(route);
    const view = document.getElementById("view");
    const topic = LM.syl.topic(route.topicId);
    const levelId = topic.level;
    // The same page redrawn (e.g. profile switch) keeps its scroll position
    const keepScroll = view.dataset.file === topic.file ? U.getScroll() : 0;
    view.className = "view page-view lvl-" + levelId;
    view.dataset.file = topic.file;
    view.replaceChildren();

    const levelCrumb = { label: "Level " + levelId, href: LM.app.levelHash(levelId), onclick: function () { goBack(topic); } };
    const crumbs = [levelCrumb, { label: LM.syl.categoryName(topic.category), href: levelCrumb.href, onclick: levelCrumb.onclick }];
    const md = pageText(topic);

    if (!md) {
      view.appendChild(el("div", { class: "page-head" }, LM.ui.breadcrumbs(crumbs.concat([{ label: topic.title }]))));
      view.appendChild(el("section", { class: "card page-soon", "aria-labelledby": "page-soon-title" }, [
        el("p", { class: "page-soon-kicker", text: LM.ui.landLabel(levelId) + " · " + topic.unitTitle }),
        el("h1", { class: "page-soon-title", id: "page-soon-title", text: topic.title }),
        topic.example ? el("p", { class: "page-soon-example", lang: LM.APP.targetLang, text: topic.example }) : null,
        el("p", { class: "page-soon-text", text: "This topic is being written. Its page, examples and practice will appear here." }),
        el("p", null, el("a", { class: "btn btn-secondary", href: LM.app.levelHash(levelId) }, LM.ui.withIcon("arrow-left", "Back to " + levelId)))
      ]));
      document.title = topic.title + " · " + appTitle();
      U.setScroll(0);
      return;
    }

    const doc = LM.markdown.parse(md);
    const title = doc.meta.title || topic.title;
    view.appendChild(el("div", { class: "page-head" }, [
      LM.ui.breadcrumbs(crumbs.concat([{ label: title }])),
      LM.notes ? LM.notes.button(topic.id, { title: levelId + " · " + title, route: location.hash }) : null,
      LM.syl.isAvailable(levelId) ? knowToggle(topic, title) : null
    ]));

    const article = el("article", { class: "md" }, LM.markdown.render(doc.blocks, { hiddenSections: HIDDEN_SECTIONS }));
    if (LM.callouts) LM.callouts.apply(article); // highlighted sections and tables (js/callouts.js)
    view.appendChild(LM.toc ? LM.toc.wrap(article) : article); // table of contents with ≥ 4 sections (js/toc.js)
    // "Check yourself": exercise sets of the topic (index loaded on demand)
    if (LM.exercises) view.appendChild(LM.exercises.topicSection(topic.id));
    const trailBar = LM.trail ? LM.trail.barFor(topic.id) : null; // "Stop N of M" (trail)
    if (trailBar) view.appendChild(trailBar);
    view.appendChild(topicNav(topic));
    document.title = title + " · " + appTitle();
    if (LM.profileData) LM.profileData.setLastPage(location.hash, levelId + " · " + title);
    U.setScroll(keepScroll);
  }

  // =====================================================================
  // PREVIOUS / NEXT TOPIC
  // =====================================================================

  let topicLinks = null; // { prev, next } of the current page: { href, label } (also for the [ and ] keys)

  /** Navigation at the end of a page: previous and next topic with a page; at the end of a level, the next level. */
  function topicNav(topic) {
    const withPage = LM.syl.topics(topic.level).filter(function (t) { return LM.syl.hasPage(t.id); });
    const n = LM.learn.topicNeighbors(withPage.map(function (t) { return t.id; }), topic.id);
    const prev = n.prev ? LM.syl.topic(n.prev) : null, next = n.next ? LM.syl.topic(n.next) : null;
    const nextLevel = LM.LEVEL_IDS[LM.LEVEL_IDS.indexOf(topic.level) + 1] || null;
    topicLinks = {
      prev: prev ? { href: routeOf(prev), label: titleOf(prev) } : null,
      next: next ? { href: routeOf(next), label: titleOf(next) }
        : nextLevel ? { href: LM.app.levelHash(nextLevel), label: "Go to " + LM.ui.landLabel(nextLevel) } : null
    };
    const items = [];
    items.push(topicLinks.prev
      ? el("a", { class: "topic-nav-link is-prev", href: topicLinks.prev.href, rel: "prev" }, [LM.icon("chevron-left", { size: 18 }), el("span", null, [el("span", { class: "topic-nav-kicker", text: "Previous" }), el("span", { class: "topic-nav-title", text: topicLinks.prev.label })])])
      : el("span", { class: "topic-nav-gap" }));
    if (topicLinks.next) {
      items.push(el("a", { class: "topic-nav-link is-next", href: topicLinks.next.href, rel: "next" }, [
        el("span", null, [el("span", { class: "topic-nav-kicker", text: next ? "Next topic" : "End of " + topic.level }), el("span", { class: "topic-nav-title", text: topicLinks.next.label })]),
        LM.icon("chevron-right", { size: 18 })
      ]));
    }
    return el("nav", { class: "page-foot topic-nav", "aria-label": "Previous and next topic" }, items);
  }

  // Keys: [ previous topic, ] next topic (outside text fields)
  document.addEventListener("keydown", function (e) {
    if (!LM.state || LM.state.view !== "page" || !topicLinks || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (document.querySelector(".dialog-backdrop, dialog[open]")) return;
    const link = e.key === "[" ? topicLinks.prev : e.key === "]" ? topicLinks.next : null;
    if (link) { e.preventDefault(); location.hash = link.href; }
  });

  // =====================================================================
  // CHEAT SHEET (content/cheatsheets/<level>.md), route #/a1/cheatsheet
  // =====================================================================

  let printPending = false;

  function cheatsheetText(levelId) {
    const d = data();
    return (d && d.cheatsheets && d.cheatsheets[levelId]) || null;
  }

  function printCheatsheet() { if (LM.print) LM.print.now(); else window.print(); }

  /** Cheat-sheet page: a normal content page with a Print button on screen, one A4 sheet in two columns in print. */
  function renderCheatsheet(route) {
    const view = document.getElementById("view");
    const levelId = route.level;
    const file = "cheatsheets/" + levelId.toLowerCase() + ".md";
    const text = LM.syl.isAvailable(levelId) ? cheatsheetText(levelId) : null;
    const keepScroll = view.dataset.file === file ? U.getScroll() : 0;
    view.className = "view page-view sciaga-view lvl-" + levelId;
    view.dataset.file = file;
    view.replaceChildren();
    const levelCrumb = { label: "Level " + levelId, href: LM.app.levelHash(levelId) };
    if (!text) {
      view.appendChild(el("div", { class: "page-head" }, LM.ui.breadcrumbs([levelCrumb, { label: "Cheat sheet" }])));
      view.appendChild(el("div", { class: "empty-state" }, el("p", { class: "empty-state-text", text: "The " + levelId + " cheat sheet is being written." })));
      document.title = "Cheat sheet " + levelId + " · " + appTitle();
      return;
    }
    const doc = LM.markdown.parse(text);
    const title = doc.meta.title || "Cheat sheet " + levelId;
    view.appendChild(el("div", { class: "page-head sciaga-tools" }, [
      LM.ui.breadcrumbs([levelCrumb, { label: "Cheat sheet" }]),
      el("button", { type: "button", class: "btn btn-primary sciaga-print", onclick: printCheatsheet }, LM.ui.withIcon("download", "Print"))
    ]));
    view.appendChild(el("header", { class: "sciaga-head" }, [
      el("span", { class: "sciaga-code", "aria-hidden": "true", text: levelId }),
      el("div", { class: "sciaga-head-text" }, [
        el("p", { class: "sciaga-title", text: title }),
        el("p", { class: "sciaga-sub", text: "Level " + levelId + " · " + appTitle() })
      ])
    ]));
    // The file's # heading is replaced by the header above, so it is not repeated in the text
    const blocks = doc.blocks.filter(function (b, i) { return !(b.type === "heading" && b.level === 1 && i === 0); });
    view.appendChild(el("article", { class: "md sciaga" }, LM.markdown.render(blocks)));
    document.title = title + " · " + appTitle();
    if (LM.profileData) LM.profileData.setLastPage(location.hash, title);
    U.setScroll(keepScroll);
    if (printPending) { printPending = false; setTimeout(printCheatsheet, 300); }
  }

  /** "Cheat sheet A1 – one page to print" card on the level page (Open / Print), or null without a cheat sheet. */
  function cheatsheetCard(levelId) {
    const text = LM.syl.isAvailable(levelId) ? cheatsheetText(levelId) : null;
    if (!text) return null;
    const meta = LM.markdown.parseFrontmatter(text).meta;
    return el("section", { class: "card lf-level-card sciaga-card lvl-" + levelId, "aria-labelledby": "sciaga-card-title" }, [
      el("div", { class: "lf-level-card-body" }, [
        el("h2", { class: "section-title", id: "sciaga-card-title" }, [el("span", { class: "callout-icon", "aria-hidden": "true" }, LM.icon("file-text", { size: 20 })), "Cheat sheet " + levelId + " – one page to print"]),
        el("p", { text: meta.summary || "The key forms, phrases and traps of the level on one A4 page." })
      ]),
      el("div", { class: "sciaga-card-actions" }, [
        el("a", { class: "btn btn-primary", href: cheatsheetRoute(levelId) }, LM.ui.withIcon("file-text", "Open")),
        el("button", { type: "button", class: "btn btn-secondary", onclick: function () { printPending = true; location.hash = cheatsheetRoute(levelId); } }, LM.ui.withIcon("download", "Print"))
      ])
    ]);
  }

  // =====================================================================
  // LEVEL SUMMARY (content/summaries/<level>.md)
  // =====================================================================

  /** Card with the level summary, or null when there is no file (or the level is "soon"). */
  function renderSummary(levelId) {
    const d = data();
    const text = LM.syl.isAvailable(levelId) && d && d.summaries && d.summaries[levelId];
    if (!text) return null;
    const doc = LM.markdown.parse(text);
    const section = el("section", { class: "card level-summary md", "aria-labelledby": "summary-title" }, LM.markdown.render(doc.blocks));
    // The file's heading ("## A1 in a nutshell") is the section title
    const h2 = section.querySelector("h2");
    if (h2) { h2.id = "summary-title"; h2.classList.add("section-title"); }
    markSubheads(section);
    if (LM.callouts) LM.callouts.apply(section);
    return section;
  }

  /** Paragraphs that are only bold text become subheadings. */
  function markSubheads(root) {
    root.querySelectorAll("p").forEach(function (p) {
      if (p.childNodes.length === 1 && p.firstChild.nodeName === "STRONG") p.classList.add("md-subhead");
    });
  }

  // =====================================================================
  // HOME PAGE (content/home.md), route #/
  // =====================================================================

  const LEVELS_HEADING = "levels at a glance";

  function renderHome() {
    const view = document.getElementById("view");
    const keepScroll = view.dataset.file === "#home" ? U.getScroll() : 0;
    view.className = "view home-view";
    view.dataset.file = "#home";
    view.replaceChildren();
    document.title = appTitle() + " (A1–C2)";

    const d = data();
    if (!d || !d.home) {
      view.appendChild(el("div", { class: "empty-state" }, el("p", { class: "empty-state-text", text: "Choose a level in the menu." })));
      return;
    }
    const doc = LM.markdown.parse(d.home);
    const article = el("article", { class: "md home" }, LM.markdown.render(doc.blocks));
    linkLevelTable(article);
    if (LM.callouts) LM.callouts.apply(article);
    // Compact trail above the "Levels at a glance" table
    if (LM.today && LM.today.compactTrail) {
      const levels = levelsSection(article);
      if (levels) article.insertBefore(LM.today.compactTrail(), levels);
    }
    view.appendChild(article);
    U.setScroll(keepScroll);
  }

  function levelsSection(root) {
    return Array.prototype.find.call(root.querySelectorAll(".md-section"), function (s) {
      const h = s.querySelector("h2");
      return h && h.textContent.trim().toLowerCase() === LEVELS_HEADING;
    }) || null;
  }

  /** In the "Levels at a glance" table the codes A1…C2 in the first column become links to the levels. */
  function linkLevelTable(root) {
    const section = levelsSection(root);
    if (!section) return;
    section.querySelectorAll("tbody tr").forEach(function (tr) {
      const cell = tr.cells[0];
      const code = cell ? cell.textContent.trim().toUpperCase() : "";
      if (LM.LEVEL_IDS.indexOf(code) === -1) return;
      tr.classList.add("lvl-row", "lvl-" + code);
      cell.replaceChildren(el("a", { class: "level-link lvl-" + code, href: LM.app.levelHash(code), "aria-label": "Go to level " + code }, [
        el("span", { class: "level-dot", "aria-hidden": "true" }), code
      ]));
    });
  }

  // =====================================================================
  // "I KNOW THIS" (the checklist item of a topic is the topic id)
  // =====================================================================

  /** "I know this" switch: the same state as the checkbox on the level page (active profile). */
  function knowToggle(topic, title) {
    const done = LM.state.progress[topic.id] === true;
    const label = el("label", { class: "umiem umiem-lg" + (done ? " is-done" : "") }, [
      el("input", {
        type: "checkbox",
        checked: done,
        "aria-label": "I know this: " + title,
        onchange: function (e) {
          if (!LM.app.hasProfiles()) { // guest mode: create a profile first, then tick (the page redraws itself)
            const input = e.target, on = input.checked;
            input.checked = !on;
            LM.app.withProfile("“I know this” ticks are saved in your profile.", function () { LM.app.setProgress(topic.id, on); LM.app.renderAll(); });
            return;
          }
          LM.app.setProgress(topic.id, e.target.checked);
          label.classList.toggle("is-fresh", e.target.checked);
        }
      }),
      el("span", { text: "I know this" })
    ]);
    return label;
  }

  /** The checklist item of a topic: { id, text, done } or null when the topic is not in the syllabus. */
  function essentialForTopic(topicId) {
    const t = LM.syl.topic(topicId);
    return t ? { id: t.id, text: titleOf(t), done: LM.state.progress[t.id] === true } : null;
  }

  function goBack(topic) {
    LM.app.goToList({ levelId: topic ? topic.level : LM.state.ui.levelId });
  }

  LM.handbook = {
    routeOf: routeOf,
    parseRoute: parseRoute,
    titleOf: titleOf,
    essentialForTopic: essentialForTopic,
    renderPage: renderPage,
    renderSummary: renderSummary,
    cheatsheetCard: cheatsheetCard,
    cheatsheetRoute: cheatsheetRoute,
    renderHome: renderHome
  };
})(window.LM);
