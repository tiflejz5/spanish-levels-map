/*
 * answer-spread.js — the spread rule for correct letters in "choose A, B, C or D" sets
 * (gaps[].options = { A, B, C, D }, gaps[].answer = a letter): no letter is correct in more than 50% of the gaps
 * of a set, and no letter is correct more than 2 times in a row. Sets with one or two gaps are skipped
 * (the rule makes no sense then).
 *
 * Usage: require("./answer-spread").check(set) → a description of the problem, or null;
 *        checkAll(root) → the problems of all exam sets (content/exams/<exam>/sets/*.json).
 * Exam builds and validators call it in stage E; a problem stops the build.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "content");
const MAX_SHARE = 0.5;
const MAX_RUN = 2;

function isLettered(set) {
  return !!set && Array.isArray(set.gaps) && set.gaps.length > 0 && set.gaps.every(function (g) {
    return g && g.options && typeof g.options === "object" && !Array.isArray(g.options) && typeof g.answer === "string";
  });
}

/** A description of the rule violation, or null. */
function check(set) {
  if (!isLettered(set) || set.gaps.length < 3) return null;
  const seq = set.gaps.map(function (g) { return g.answer; });
  const counts = {};
  seq.forEach(function (l) { counts[l] = (counts[l] || 0) + 1; });
  const dist = Object.keys(counts).sort().map(function (l) { return l + counts[l]; }).join(" ") + " [" + seq.join("") + "]";
  const worst = Object.keys(counts).reduce(function (a, l) { return counts[l] > counts[a] ? l : a; }, Object.keys(counts)[0]);
  if (counts[worst] / seq.length > MAX_SHARE) return "letter " + worst + " is correct in " + counts[worst] + " of " + seq.length + " gaps (max 50%): " + dist;
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    run = seq[i] === seq[i - 1] ? run + 1 : 1;
    if (run > MAX_RUN) return "letter " + seq[i] + " is correct more than " + MAX_RUN + " times in a row (gaps " + (i - MAX_RUN + 1) + "–" + (i + 1) + "): " + dist;
  }
  return null;
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach(function (name) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.json$/.test(name) && path.basename(path.dirname(p)) === "sets") out.push(p);
  });
  return out;
}

/** Problems of all sets with lettered options in the "sets" folders under root. → [{ file, id, error }] */
function checkAll(root) {
  const errors = [];
  const base = root || ROOT;
  walk(base, []).sort().forEach(function (file) {
    let json;
    try { json = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); } catch (e) { return; }
    (function find(x) {
      if (Array.isArray(x)) { x.forEach(find); return; }
      if (!x || typeof x !== "object") return;
      if (isLettered(x)) {
        const e = check(x);
        if (e) errors.push({ file: path.relative(base, file).replace(/\\/g, "/"), id: x.id || path.basename(file), error: e });
      } else Object.keys(x).forEach(function (k) { find(x[k]); });
    })(json);
  });
  return errors;
}

module.exports = { check: check, checkAll: checkAll, isLettered: isLettered };
