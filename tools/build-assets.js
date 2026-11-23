/*
 * build-assets.js — copies assets from npm packages to the assets/ folder,
 * so the site works WITHOUT node_modules (GitHub Pages, opening from disk).
 *
 * Usage (from the project folder, after `npm install`):
 *   npm run assets        (or: node tools/build-assets.js)
 *
 * What goes to assets/:
 *   fonts/   — Fraunces (display, axes wght + opsz) and Inter (text, axis wght),
 *              only the latin and latin-ext subsets (accented letters), woff2
 *   icons.js — data of the Lucide icons in use (LM.ICON_NODES), drawn by
 *              js/ui.js without innerHTML; the icon list: ICONS below
 *   vendor/gsap.min.js — GSAP (loaded on demand by LM.loadGsap)
 *   vendor/DrawSVGPlugin.min.js, MotionPathPlugin.min.js — GSAP plugins (also on demand)
 *
 * To add an icon: add its name (from lucide.dev) to ICONS and run the script.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const NM = path.join(ROOT, "node_modules");
const OUT = path.join(ROOT, "assets");

const FONTS = [
  // [package, file in the package/files, target name]
  ["@fontsource-variable/fraunces", "fraunces-latin-opsz-normal.woff2", "fraunces-latin.woff2"],
  ["@fontsource-variable/fraunces", "fraunces-latin-ext-opsz-normal.woff2", "fraunces-latin-ext.woff2"],
  ["@fontsource-variable/inter", "inter-latin-wght-normal.woff2", "inter-latin.woff2"],
  ["@fontsource-variable/inter", "inter-latin-ext-wght-normal.woff2", "inter-latin-ext.woff2"]
];

// Lucide icons in use (names as on lucide.dev)
const ICONS = [
  "sunrise", "target", "notebook-pen", "award", "menu", "x", "pencil", "check", "plus",
  "chevron-right", "chevron-left", "chevron-down", "arrow-left", "arrow-right",
  "sun", "moon", "sun-moon", "mic", "square", "download", "upload", "rotate-ccw",
  "trash", "search", "copy", "play", "pause", "timer", "circle-question-mark", "map",
  "flag", "info", "triangle-alert", "user-round", "external-link",
  "pin", "pin-off", "panel-left-open", "panel-left-close",
  "flame", "calendar-days", "map-pin", "list-checks", "sparkles", "notebook-text", "eye",
  "flask-conical", "dumbbell", "volume-2", "shuffle", "arrow-left-right", "split", "layout-grid", "route",
  "chart-column", "notebook", "clock", "corner-down-left", "file-text", "graduation-cap", "undo-2", "layers", "star"
];

function need(file) {
  if (!fs.existsSync(file)) {
    console.error("ERROR: missing " + path.relative(ROOT, file) + ". Run first: npm install");
    process.exit(1);
  }
  return file;
}

fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
fs.mkdirSync(path.join(OUT, "vendor"), { recursive: true });

// ---------- Fonty ----------
let fontBytes = 0;
FONTS.forEach(function (f) {
  const src = need(path.join(NM, f[0], "files", f[1]));
  fs.copyFileSync(src, path.join(OUT, "fonts", f[2]));
  fontBytes += fs.statSync(src).size;
});
// Font licenses (SIL OFL) next to the files
[["@fontsource-variable/fraunces", "Fraunces-LICENSE.txt"], ["@fontsource-variable/inter", "Inter-LICENSE.txt"]].forEach(function (l) {
  const src = path.join(NM, l[0], "LICENSE");
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, "fonts", l[1]));
});

// ---------- Ikony ----------
const nodes = JSON.parse(fs.readFileSync(need(path.join(NM, "lucide-static", "icon-nodes.json")), "utf8"));
const icons = {};
const missing = [];
ICONS.forEach(function (name) {
  if (nodes[name]) icons[name] = nodes[name];
  else missing.push(name);
});
if (missing.length) {
  console.error("ERROR: these icons are not in lucide-static: " + missing.join(", "));
  process.exit(1);
}
const lucideVersion = JSON.parse(fs.readFileSync(path.join(NM, "lucide-static", "package.json"), "utf8")).version;
fs.writeFileSync(path.join(OUT, "icons.js"),
  "/*\n * GENERATED FILE — do not edit by hand.\n" +
  " * Lucide icons " + lucideVersion + " (ISC license, https://lucide.dev), only the ones in use.\n" +
  " * Refresh with: npm run assets\n */\n" +
  "window.LM = window.LM || {};\nwindow.LM.ICON_NODES = " + JSON.stringify(icons) + ";\n", "utf8");
const lucideLicense = path.join(NM, "lucide-static", "LICENSE");
if (fs.existsSync(lucideLicense)) fs.copyFileSync(lucideLicense, path.join(OUT, "Lucide-LICENSE.txt"));

// ---------- GSAP ----------
fs.copyFileSync(need(path.join(NM, "gsap", "dist", "gsap.min.js")), path.join(OUT, "vendor", "gsap.min.js"));
// Plugins (free since 3.13): drawing the trail path and moving the marker along it
["DrawSVGPlugin.min.js", "MotionPathPlugin.min.js"].forEach(function (f) {
  fs.copyFileSync(need(path.join(NM, "gsap", "dist", f)), path.join(OUT, "vendor", f));
});
const gsapVersion = JSON.parse(fs.readFileSync(path.join(NM, "gsap", "package.json"), "utf8")).version;

console.log("Fonts: " + FONTS.length + " files, " + Math.round(fontBytes / 1024) + " KB");
console.log("Ikony: " + Object.keys(icons).length + " (Lucide " + lucideVersion + ")");
console.log("GSAP " + gsapVersion + ": assets/vendor/gsap.min.js (loaded on demand only)");
