#!/usr/bin/env python3
"""Reference validator for the Spanish Levels Map plan and content.

  python3 docs/plan/scripts/validate_plan.py docs/plan     # syllabus.json + examples/
  python3 docs/plan/scripts/validate_plan.py content       # the real content (syllabus.json, levels.json inside)

Exit code 1 when there are errors. Warnings do not fail. Port these rules to tools/validate-*.js (spec 06, E11).
"""
import json, os, re, sys, glob

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
LANG = {"es": "Spanish", "pl": "Polish"}
ALPHABET = {
    "es": "áéíóúüñÁÉÍÓÚÜÑ¿¡«»",
    "pl": "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ„”",
}
TYPO = "—–…“”‘’·→✗✓×÷°€"
PRONOUNS = {
    "es": ["yo", "tú", "él", "ella", "usted", "nosotros", "nosotras", "vosotros", "vosotras", "ellos", "ellas", "ustedes"],
    "pl": ["ja", "ty", "on", "ona", "ono", "my", "wy", "oni", "one"],
}
SECTIONS = {
    "verbs": ["How it works", "When to use it", "Examples", "Common mistakes", "Practice", "Answers"],
    "grammar": ["How it works", "When to use it", "Examples", "Common mistakes", "Practice", "Answers"],
    "cases": ["How it works", "When to use it", "Examples", "Common mistakes", "Practice", "Answers"],
    "functions": ["Key phrases", "Dialogue", "Common mistakes", "Practice", "Answers"],
    "vocabulary": ["Words", "Word partners", "Common mistakes", "Practice", "Answers"],
}
OPTIONAL = ["Good to know", "Culture note", "Real life vs exam"]
WORDS = {"A1": (300, 700), "A2": (300, 700), "B1": (450, 850), "B2": (450, 850), "C1": (500, 1000), "C2": (500, 1000)}
TYPES = ["multiple-choice", "reorder", "find-error", "short-answer", "gap-fill", "match", "transformation", "translate", "dictation", "paradigm"]
CASES = ["nominative", "genitive", "dative", "accusative", "instrumental", "locative", "vocative"]

errors, warnings = [], []
def err(where, msg): errors.append("ERROR  %s: %s" % (where, msg))
def warn(where, msg): warnings.append("warn   %s: %s" % (where, msg))

def load(path):
    try:
        with open(path, encoding="utf8") as f:
            return json.load(f)
    except Exception as e:
        err(path, "cannot read JSON (%s)" % e)
        return None

# ---------------------------------------------------------------- syllabus
def check_syllabus(path, pack):
    d = load(path)
    topics = {}
    if not d:
        return topics
    if d.get("lang") != pack:
        err(path, "lang is %r, expected %r" % (d.get("lang"), pack))
    cats = d.get("categories", {})
    if [l.get("id") for l in d.get("levels", [])] != LEVELS:
        err(path, "levels must be exactly A1…C2 in order")
    unit_ids = set()
    for L in d.get("levels", []):
        for k in ("land", "goal"):
            if not L.get(k):
                err(path, "%s: missing %s" % (L.get("id"), k))
        if not L.get("units"):
            err(path, "%s: no units" % L.get("id"))
        for U in L.get("units", []):
            if U["id"] in unit_ids:
                err(path, "duplicate unit id %s" % U["id"])
            unit_ids.add(U["id"])
            if not U.get("topics"):
                err(path, "%s: empty unit" % U["id"])
            if not 2 <= len(U.get("topics", [])) <= 8:
                warn(path, "%s: %d topics (expected 2–8)" % (U["id"], len(U.get("topics", []))))
            for T in U.get("topics", []):
                tid = T.get("id", "")
                m = re.fullmatch(r"(a1|a2|b1|b2|c1|c2)-([a-z]+)-([a-z0-9]+(?:-[a-z0-9]+)*)", tid)
                if not m:
                    err(path, "bad topic id %r" % tid); continue
                if m.group(1).upper() != L["id"]:
                    err(path, "%s is listed under %s" % (tid, L["id"]))
                if m.group(2) != T.get("category") or T.get("category") not in cats:
                    err(path, "%s: category mismatch or unknown category" % tid)
                if tid in topics:
                    err(path, "duplicate topic id %s" % tid)
                for k in ("title", "example"):
                    if not T.get(k):
                        err(path, "%s: missing %s" % (tid, k))
                topics[tid] = dict(T, level=L["id"], unit=U["id"])
    return topics

# ---------------------------------------------------------------- helpers
def charset(where, text, pack):
    bad = sorted({c for c in str(text) if ord(c) > 126 and c not in ALPHABET[pack] and c not in TYPO})
    if bad:
        err(where, "characters outside the %s alphabet: %s in %r" % (pack, " ".join(bad), str(text)[:60]))

def pronoun_variants(where, accepted, pack):
    norm = lambda s: re.sub(r"[¿¡?!.,]", "", s).strip().lower()
    have = {norm(a) for a in accepted}
    for a in accepted:
        w = norm(a).split()
        if len(w) > 1 and w[0] in PRONOUNS[pack]:
            rest = " ".join(w[1:])
            # es: "a mí me gusta" style starts with "a", not a pronoun, so it is not caught here
            if rest not in have:
                warn(where, "accepted %r starts with a subject pronoun; the variant without it is missing" % a)

def check_mc(where, it, pack):
    opts = it.get("options", [])
    if not 2 <= len(opts) <= 5:
        err(where, "multiple-choice needs 2–5 options")
    if len({o.strip().lower() for o in opts}) != len(opts):
        err(where, "duplicate options")
    c = it.get("correct")
    if not isinstance(c, int) or not 0 <= c < len(opts):
        err(where, "correct must be an option index")
    if not it.get("explanation"):
        err(where, "explanation missing")
    notes = it.get("optionNotes")
    if notes is not None:
        if len(notes) != len(opts):
            err(where, "optionNotes length differs from options")
        elif isinstance(c, int) and 0 <= c < len(notes) and notes[c] is not None:
            err(where, "optionNotes for the correct option must be null")
        elif any(n is None for i, n in enumerate(notes) if i != c):
            warn(where, "a wrong option has no note")
    for o in opts:
        charset(where, o, pack)

def check_item(where, it, pack):
    t = it.get("type")
    if t not in TYPES:
        err(where, "unknown type %r" % t); return
    if t != "dictation" and not it.get("explanation"):
        err(where, "explanation missing")
    if t == "multiple-choice":
        check_mc(where, it, pack)
    elif t == "gap-fill":
        n = len(re.findall(r"\{\{\d+\}\}", it.get("text", "")))
        if n == 0 or n != len(it.get("gaps", [])) or n > 4:
            err(where, "gap-fill: 1–4 gaps {{n}} matching gaps[]")
        for g in it.get("gaps", []):
            if not g.get("accepted"):
                err(where, "gap without accepted answers")
            for a in g.get("accepted", []): charset(where, a, pack)
        charset(where, it.get("text", ""), pack)
    elif t == "reorder":
        ans = it.get("answers", [])
        if not ans or not it.get("context"):
            err(where, "reorder needs context and answers")
        bag = lambda s: sorted(re.sub(r"[¿¡?!.,;:]", "", s).lower().split())
        if any(bag(a) != bag(ans[0]) for a in ans):
            err(where, "reorder: every answer must use exactly the same words")
        for a in ans: charset(where, a, pack)
    elif t == "find-error":
        tok, rng = it.get("tokens", []), it.get("errorRange", [])
        if len(rng) != 2 or not 0 <= rng[0] <= rng[1] < len(tok) or not it.get("fixes"):
            err(where, "find-error: tokens, errorRange [from, to], fixes")
        for a in tok + it.get("fixes", []): charset(where, a, pack)
    elif t == "translate":
        acc = it.get("accepted", [])
        if not it.get("source") or not 1 <= len(acc) <= 8:
            err(where, "translate: source and 1–8 accepted")
        if any(ord(c) > 126 and c not in TYPO for c in it.get("source", "")):
            warn(where, "translate source should be English")
        pronoun_variants(where, acc, pack)
        for a in acc: charset(where, a, pack)
    elif t == "match":
        pairs = it.get("pairs", [])
        if it.get("mode") not in ("definition", "halves", "translation", "response") or not 3 <= len(pairs) <= 6:
            err(where, "match: mode and 3–6 pairs")
        if len({p[1] for p in pairs}) != len(pairs) or len({p[0] for p in pairs}) != len(pairs):
            err(where, "match: duplicate side")
    elif t == "paradigm":
        cells = it.get("cells", [])
        if not 3 <= len(cells) <= 8:
            err(where, "paradigm: 3–8 cells")
        if len({c.get("label") for c in cells}) != len(cells):
            err(where, "paradigm: duplicate labels")
        if sum(1 for c in cells if not c.get("given")) < 2:
            err(where, "paradigm: at least 2 cells to fill")
        if not it.get("lemma") or not it.get("prompt"):
            err(where, "paradigm: lemma and prompt")
        for c in cells:
            if not c.get("accepted"):
                err(where, "paradigm: cell %r without accepted" % c.get("label"))
            for a in c.get("accepted", []): charset(where, a, pack)
    elif t == "dictation":
        if not 4 <= len(it.get("text", "").split()) <= 30:
            err(where, "dictation: 4–30 words")
        charset(where, it.get("text", ""), pack)
    elif t == "transformation":
        for k in ("source", "keyword", "answers"):
            if not it.get(k):
                err(where, "transformation: %s missing" % k)

# ---------------------------------------------------------------- content types
def check_page(path, topics, pack):
    raw = open(path, encoding="utf8").read()
    m = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.S)
    if not m:
        err(path, "front matter missing"); return
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1); fm[k.strip()] = v.strip()
    body = m.group(2)
    tid = fm.get("id", "")
    T = topics.get(tid)
    if not T:
        err(path, "id %r is not in the syllabus" % tid); return
    if fm.get("level") != T["level"] or fm.get("category") != T["category"]:
        err(path, "level/category differ from the syllabus")
    for k in ("title", "summary"):
        if not fm.get(k):
            err(path, "front matter: %s missing" % k)
    if len(fm.get("summary", "")) > 140:
        err(path, "summary longer than 140 characters")
    expect = "%s-%s.md" % (T["category"], tid.split("-", 2)[2])
    if os.path.basename(path) != expect or os.path.basename(os.path.dirname(path)) != T["level"].lower():
        err(path, "file should be %s/%s" % (T["level"].lower(), expect))
    if not re.search(r"^# \S", body, re.M):
        err(path, "no # title")
    heads = re.findall(r"^## (.+?)\s*$", body, re.M)
    need = SECTIONS[T["category"]]
    seq = [h for h in heads if h in need]
    if seq != need:
        err(path, "sections must be, in order: %s (found: %s)" % (" · ".join(need), " · ".join(heads)))
    for h in heads:
        if h not in need and h not in OPTIONAL:
            err(path, "unknown section %r" % h)
    if heads and heads[-1] != "Answers":
        err(path, "Answers must be the last section")
    n = len(re.findall(r"\S+", re.sub(r"[|*_#>\-]", " ", body)))
    lo, hi = WORDS[T["level"]]
    if not lo <= n <= hi:
        warn(path, "%d words (expected %d–%d)" % (n, lo, hi))
    if not re.search(r"^\|\s*%s\s*\|\s*English\s*\|" % LANG[pack], body, re.M):
        err(path, "no table with header | %s | English |" % LANG[pack])
    sec = re.search(r"## Common mistakes\n(.*?)(?=\n## )", body, re.S)
    if sec:
        lines = [l for l in sec.group(1).splitlines() if l.startswith("- ")]
        if not 3 <= len(lines) <= 5:
            err(path, "mistakes section: 3–5 lines (found %d)" % len(lines))
        for l in lines:
            if "✗" not in l or "✓" not in l or "→" not in l:
                err(path, "mistake line must be '- ✗ *wrong* → ✓ *right* — why': %r" % l[:50])
    prac = re.search(r"## Practice\n(.*?)(?=\n## )", body, re.S)
    ans = re.search(r"## Answers\n(.*)", body, re.S)
    if prac and ans:
        a = len(re.findall(r"^\d+\.", prac.group(1), re.M)); b = len(re.findall(r"^\d+\.", ans.group(1), re.M))
        if not 6 <= a <= 8:
            err(path, "practice: 6–8 numbered items (found %d)" % a)
        if a != b:
            err(path, "practice has %d items but answers has %d" % (a, b))
    for link in re.findall(r"\[\[([^\]]+)\]\]", body):
        if link not in topics:
            err(path, "link [[%s]] is not a topic id" % link)
    charset(path, body, pack)

def check_quiz(path, topics, pack):
    d = load(path)
    if not d: return
    if d.get("id") != d.get("topic") or d.get("topic") not in topics:
        err(path, "quiz id must equal an existing topic id")
    if os.path.basename(path) != "%s.json" % d.get("id"):
        err(path, "file name must be <topic id>.json")
    if d.get("passScore") != 3 or len(d.get("items", [])) != 4:
        err(path, "quiz: exactly 4 items, passScore 3")
    ids = set()
    for i, it in enumerate(d.get("items", [])):
        w = "%s #%d" % (path, i + 1)
        if it.get("type") not in ("multiple-choice", "gap-fill"):
            err(w, "quiz items are multiple-choice (one gap-fill allowed)")
        if it.get("id") in ids: err(w, "duplicate id")
        ids.add(it.get("id"))
        check_item(w, it, pack)
    pos = [it.get("correct") for it in d.get("items", []) if it.get("type") == "multiple-choice"]
    if len(pos) >= 3 and len(set(pos)) == 1:
        warn(path, "the correct option is always in the same position")

def check_set(path, topics, pack):
    d = load(path)
    if not d: return
    if d.get("topic") not in topics:
        err(path, "topic %r not in syllabus" % d.get("topic"))
    if d.get("kind") == "level-test":
        if len(d.get("items", [])) != 30 or d.get("draw") != 20 or d.get("passPercent") != 80:
            err(path, "final test: 30 items, draw 20, passPercent 80")
    else:
        if not re.fullmatch(re.escape(str(d.get("topic"))) + r"-\d+", str(d.get("id"))):
            err(path, "set id must be <topic id>-<n>")
        if not 8 <= len(d.get("items", [])) <= 12:
            err(path, "set: 8–12 items")
        if len({it.get("type") for it in d.get("items", [])}) < 4 and topics.get(d.get("topic"), {}).get("category") in ("verbs", "grammar", "cases"):
            err(path, "set: at least four different item types")
    ids = set()
    for i, it in enumerate(d.get("items", [])):
        w = "%s #%d" % (path, i + 1)
        if not re.fullmatch(re.escape(str(d.get("id"))) + r"-\d\d", str(it.get("id"))) and d.get("kind") != "level-test":
            err(w, "item id must be <set id>-NN")
        if it.get("id") in ids: err(w, "duplicate id")
        ids.add(it.get("id"))
        if not it.get("tags"):
            warn(w, "no tags")
        check_item(w, it, pack)

def check_deck(path, pack):
    d = load(path)
    if not d: return
    ids = set()
    for i, c in enumerate(d.get("cards", [])):
        w = "%s #%d" % (path, i + 1)
        if not re.fullmatch(re.escape(str(d.get("id"))) + r"-\d{3}", str(c.get("id"))):
            err(w, "card id must be <deck id>-NNN")
        if c.get("id") in ids: err(w, "duplicate id")
        ids.add(c.get("id"))
        if c.get("level") not in LEVELS: err(w, "level missing")
        if c.get("type") == "typed":
            if not c.get("front") or not c.get("accepted") or not c.get("back"):
                err(w, "typed: front, accepted, back")
            for a in c.get("accepted", []): charset(w, a, pack)
        elif c.get("type") == "cloze":
            if len(re.findall(r"\{\{[^}]+\}\}", c.get("text", ""))) != 1:
                err(w, "cloze: exactly one {{gap}}")
            if not c.get("hint"): err(w, "cloze: hint (English) missing")
            if not c.get("en"): warn(w, "cloze: no English translation (en)")
            charset(w, c.get("text", ""), pack)
        else:
            err(w, "unknown card type %r" % c.get("type"))

def check_placement(path, topics, pack, full):
    d = load(path)
    if not d: return
    ids, count = set(), {}
    for i, q in enumerate(d.get("questions", [])):
        w = "%s #%d" % (path, i + 1)
        if q.get("id") in ids: err(w, "duplicate id")
        ids.add(q.get("id"))
        if q.get("level") not in LEVELS or q.get("skill") not in ("grammar", "vocabulary", "reading"):
            err(w, "level / skill")
        if len(q.get("options", [])) != 4: err(w, "4 options")
        check_mc(w, dict(q, explanation=q.get("explanation")), pack)
        if q.get("skill") == "reading":
            n = len(q.get("passage", "").split())
            lo, hi = (30, 80) if q.get("level") in ("A1", "A2", "B1") else (60, 130)
            if not lo <= n <= hi: err(w, "reading passage %d words (expected %d–%d)" % (n, lo, hi))
            charset(w, q.get("passage", ""), pack)
        if q.get("topicId") is not None and q.get("topicId") not in topics:
            err(w, "topicId %r not in syllabus" % q.get("topicId"))
        if q.get("topicId") and topics.get(q["topicId"], {}).get("level") != q.get("level"):
            warn(w, "topicId is from another level")
        count[(q.get("level"), q.get("skill"))] = count.get((q.get("level"), q.get("skill")), 0) + 1
    if full:
        for lv in LEVELS:
            got = tuple(count.get((lv, s), 0) for s in ("grammar", "vocabulary", "reading"))
            if got != (5, 3, 2): err(path, "%s: %s questions (grammar, vocabulary, reading), expected (5, 3, 2)" % (lv, got))

def check_lab(path, topics, pack):
    d = load(path)
    if not d: return
    for c in d.get("cards", []) + d.get("cases", []):
        w = "%s %s" % (path, c.get("id"))
        for k in ("id", "name", "nameEn", "level", "summary", "uses", "traps", "topicIds"):
            if not c.get(k): err(w, "missing %s" % k)
        for t in c.get("topicIds", []):
            if t not in topics: err(w, "topicId %r not in syllabus" % t)
    if "axes" in d:
        cols = {a["id"] for a in d["axes"].get("columns", [])}; rows = {a["id"] for a in d["axes"].get("rows", [])}
        for c in d.get("cards", []):
            if c.get("column") not in cols or c.get("row") not in rows:
                err(path, "%s: column/row not in axes" % c.get("id"))
    for m in d.get("models", []):
        for num in ("singular", "plural"):
            if sorted(m.get(num, {}).keys()) != sorted(CASES):
                err(path, "model %s: %s must have all 7 cases" % (m.get("id"), num))
            for v in m.get(num, {}).values(): charset(path, v, pack)

def check_tree(root, topics, pack, full):
    for p in sorted(glob.glob(os.path.join(root, "pages", "*", "*.md"))): check_page(p, topics, pack)
    for p in sorted(glob.glob(os.path.join(root, "quizzes", "*", "*.json"))): check_quiz(p, topics, pack)
    for p in sorted(glob.glob(os.path.join(root, "exercises", "*.json"))):
        if os.path.basename(p) not in ("topics.json", "mixes.json"): check_set(p, topics, pack)
    for p in sorted(glob.glob(os.path.join(root, "tests", "final-*.json"))): check_set(p, topics, pack)
    for p in sorted(glob.glob(os.path.join(root, "decks", "*.json"))):
        if os.path.basename(p) != "index.json": check_deck(p, pack)
    for p in sorted(glob.glob(os.path.join(root, "tests", "placement*.json"))): check_placement(p, topics, pack, full and "sample" not in p)
    for p in sorted(glob.glob(os.path.join(root, "lab", "*.json"))):
        if "trees" not in p: check_lab(p, topics, pack)
    if full:
        pj = load(os.path.join(root, "levels.json")) or {}
        for lv, status in pj.items():
            if status != "available": continue
            for tid, T in topics.items():
                if T["level"] != lv: continue
                slug = tid.split("-", 2)[2]
                if not os.path.exists(os.path.join(root, "pages", lv.lower(), "%s-%s.md" % (T["category"], slug))):
                    err(root, "%s is available but %s has no page" % (lv, tid))
                if not os.path.exists(os.path.join(root, "quizzes", lv.lower(), tid + ".json")):
                    err(root, "%s is available but %s has no quiz" % (lv, tid))
            for f in ("summaries/%s.md", "cheatsheets/%s.md", "tests/final-%s.json"):
                if not os.path.exists(os.path.join(root, f % lv.lower())):
                    err(root, "%s is available but %s is missing" % (lv, f % lv.lower()))

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(2)
    root = args[0]
    pack = "es"
    topics = check_syllabus(os.path.join(root, "syllabus.json"), pack)
    print("%d topics" % len(topics))
    if os.path.isdir(os.path.join(root, "examples")):
        check_tree(os.path.join(root, "examples"), topics, pack, False)
    else:
        check_tree(root, topics, pack, True)
    for w in warnings: print(w)
    for e in errors: print(e)
    print("\n%d error(s), %d warning(s)" % (len(errors), len(warnings)))
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()
