/*
 * toc.js — table of contents of topic pages (pack v8, S3).
 *
 *   LM.toc.wrap(article) → element to insert instead of the article
 *
 * Pages with ≥ 4 "##" sections: from 1200 px the list sticks on the right (between --w-text and --w-wide)
 * with scrollspy (aria-current="location" on the current section); narrower screens get <details> "On this page" above the text.
 * The router owns the address bar, so links use scrollIntoView (with focus on the heading), not #id anchors.
 * Hidden in print (css/print.css). Fewer than 4 sections: the article is unchanged.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const MIN_SECTIONS = 4;

  let observer = null;

  function reduced() { return !!(LM.reducedMotion && LM.reducedMotion()); }

  function go(heading) {
    heading.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    heading.focus({ preventScroll: true });
  }

  function list(headings, onPick) {
    return el("ol", { class: "toc-list" }, headings.map(function (h) {
      return el("li", null, el("a", {
        href: "#" + h.id, "data-toc": h.id,
        onclick: function (e) { e.preventDefault(); go(h); if (onPick) onPick(); }
      }, h.textContent));
    }));
  }

  /** Scrollspy (IntersectionObserver): marks the current section in the list. */
  function spy(headings, side) {
    if (observer) { observer.disconnect(); observer = null; }
    if (!window.IntersectionObserver) return;
    const links = {};
    side.querySelectorAll("a[data-toc]").forEach(function (a) { links[a.getAttribute("data-toc")] = a; });
    let current = null;
    function mark(id) {
      if (id === current) return;
      current = id;
      Object.keys(links).forEach(function (k) {
        if (k === id) { links[k].setAttribute("aria-current", "location"); links[k].classList.add("is-current"); }
        else { links[k].removeAttribute("aria-current"); links[k].classList.remove("is-current"); }
      });
    }
    // Reading line: 25% of the window height; current section = the last heading that passed it (the observer wakes up when one crosses the band)
    observer = new IntersectionObserver(function () {
      const line = window.innerHeight * 0.25;
      let cur = headings[0];
      headings.forEach(function (h) { if (h.getBoundingClientRect().top <= line) cur = h; });
      mark(cur.id);
    }, { rootMargin: "0px 0px -75% 0px", threshold: [0, 1] });
    headings.forEach(function (h) { observer.observe(h); });
    mark(headings[0].id);
  }

  function wrap(article) {
    if (observer) { observer.disconnect(); observer = null; }
    const headings = Array.prototype.slice.call(article.querySelectorAll("h2"));
    if (headings.length < MIN_SECTIONS) return article;
    headings.forEach(function (h, i) {
      h.id = "toc-" + (i + 1);
      h.setAttribute("tabindex", "-1");
      h.classList.add("toc-target");
    });
    const side = el("nav", { class: "page-toc is-side", "aria-label": "Table of contents" }, [
      el("p", { class: "toc-title", text: "On this page" }),
      list(headings)
    ]);
    const inline = el("details", { class: "page-toc is-inline" }, [
      el("summary", { text: "On this page" }),
      list(headings, function () { inline.open = false; })
    ]);
    const body = el("div", { class: "page-body" }, [article, el("aside", { class: "page-aside" }, side)]);
    spy(headings, side);
    return el("div", { class: "page-with-toc" }, [inline, body]);
  }

  LM.toc = { wrap: wrap, MIN_SECTIONS: MIN_SECTIONS };
})(window.LM);
