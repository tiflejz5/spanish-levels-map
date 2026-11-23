/*
 * recorder.js — shared voice recording in the speaking trainers:
 * used by js/speaking-trainer.js.
 *
 *   LM.recorder.create({ exam, card, hint? }) → { node, attach(timer), isRecording(), count(), destroy() }
 *
 *   - buttons Record / Stop, a player for each attempt, Record again, Delete attempt, Download
 *     (name <export name>-speaking-<exam>-<card>-<YYYY-MM-DD>.webm / .m4a / .ogg depending on the browser),
 *   - up to 3 attempts per card in the current session; after a view change the recordings are gone (URL.revokeObjectURL),
 *   - "Record together with the timer": timer start = recording start, time up = stop (timer: LM.speakingTrainer.makeTimer),
 *   - no microphone, permission refused or no MediaRecorder: a message, the trainer keeps working,
 *   - indicator "Recording 0:23" (aria-live only at start and end),
 *   - NOTHING goes to localStorage or the network.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const MAX = 3;

  const live = []; // active recorders (cleaned up on a view change)
  let withTimer = false; // the "together with the timer" choice, remembered until the end of the visit

  /** Releases all recordings (view change, new card). */
  function destroyAll() { live.slice().forEach(function (r) { r.destroy(); }); }

  function mmss(s) { return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  function extOf(mime) {
    if (/mp4|aac/i.test(mime)) return "m4a";
    if (/ogg/i.test(mime)) return "ogg";
    return "webm";
  }

  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "karta"; }

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof window.MediaRecorder !== "undefined";
  }

  function create(opts) {
    const attempts = []; // { url, mime, blob }
    let session = null; // { recorder, stream, chunks, started, tick, discard }
    let timer = null;
    let destroyed = false;

    const status = el("p", { class: "c1-rec-status rec-status", role: "status", "aria-live": "polite" });
    const indicator = el("p", { class: "rec-indicator", hidden: true }, [el("span", { class: "rec-dot", "aria-hidden": "true" }), el("span", { class: "rec-time num", text: "Recording 0:00" })]);
    const list = el("ol", { class: "rec-list" });
    const button = el("button", { type: "button", class: "btn btn-secondary rec-btn" });
    const linkInput = el("input", { type: "checkbox", id: "rec-link-" + Math.random().toString(36).slice(2, 8), checked: withTimer, onchange: function () { withTimer = linkInput.checked; } });
    const linkRow = el("div", { class: "fc-check rec-link", hidden: true }, [linkInput, el("label", { for: linkInput.id, text: "Record together with the timer" })]);

    function paintButton() {
      button.classList.toggle("is-recording", !!session);
      const full = attempts.length >= MAX;
      button.disabled = !session && full;
      button.replaceChildren.apply(button, session ? LM.ui.withIcon("square", "Stop recording") : LM.ui.withIcon("mic", attempts.length ? "Record again" : "Record yourself"));
      if (!session && full) status.textContent = "You already have " + MAX + " attempts. Delete one to record another.";
    }

    function paintList() {
      list.replaceChildren.apply(list, attempts.map(function (a, i) {
        const name = LM.APP.exportName + "-speaking-" + slug(opts.exam) + "-" + slug(opts.card) + "-" + LM.learn.today() + (attempts.length > 1 || i > 0 ? "-attempt" + (i + 1) : "") + "." + extOf(a.mime);
        return el("li", { class: "rec-item" }, [
          el("span", { class: "rec-item-label", text: "Attempt " + (i + 1) }),
          el("audio", { controls: true, src: a.url, "aria-label": "Attempt " + (i + 1) }),
          el("span", { class: "rec-item-actions" }, [
            el("a", { class: "btn btn-secondary btn-small", href: a.url, download: name }, LM.ui.withIcon("download", "Download")),
            el("button", { type: "button", class: "btn btn-link btn-small", "aria-label": "Delete attempt " + (i + 1), onclick: function () { remove(i); } }, LM.ui.withIcon("trash", "Delete"))
          ])
        ]);
      }));
      paintButton();
    }

    function remove(i) {
      const a = attempts.splice(i, 1)[0];
      if (a) URL.revokeObjectURL(a.url);
      status.textContent = "";
      paintList();
    }

    function stopTracks() { if (session) session.stream.getTracks().forEach(function (t) { t.stop(); }); }

    function finish() {
      if (!session) return;
      clearInterval(session.tick);
      indicator.hidden = true;
      stopTracks();
      const s = session;
      session = null;
      if (!s.discard && s.chunks.length) {
        const mime = s.recorder.mimeType || "audio/webm";
        const blob = new Blob(s.chunks, { type: mime });
        attempts.push({ url: URL.createObjectURL(blob), mime: mime, blob: blob });
        status.textContent = "Recording saved as attempt " + attempts.length + ". It stays only in this browser tab.";
      }
      paintList();
    }

    function start() {
      if (session || destroyed || attempts.length >= MAX) return;
      if (!supported()) {
        status.textContent = "This browser does not support recording (or the page has no access to it in this mode). The trainer works without recording.";
        return;
      }
      status.textContent = "Asking for microphone access…";
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        if (destroyed || session) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        const recorder = new MediaRecorder(stream);
        const chunks = [];
        session = { recorder: recorder, stream: stream, chunks: chunks, started: Date.now(), tick: null, discard: false };
        recorder.addEventListener("dataavailable", function (e) { if (e.data && e.data.size) chunks.push(e.data); });
        recorder.addEventListener("stop", finish);
        recorder.start();
        status.textContent = "Recording.";
        indicator.hidden = false;
        const time = indicator.querySelector(".rec-time");
        time.textContent = "Recording 0:00";
        session.tick = setInterval(function () {
          if (!document.contains(node)) { destroy(); return; }
          time.textContent = "Recording " + mmss(Math.round((Date.now() - session.started) / 1000));
        }, 500);
        paintButton();
      }).catch(function (err) {
        const name = err && err.name;
        status.textContent = name === "NotAllowedError" || name === "SecurityError"
          ? "No permission for the microphone. Allow access in the browser settings to record yourself. The trainer keeps working without recording."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No microphone found. Connect one or practice without recording."
            : "Could not turn on the microphone" + (name ? " (" + name + ")" : "") + ". The trainer keeps working without recording.";
        paintButton();
      });
    }

    function stop() { if (session && session.recorder.state !== "inactive") session.recorder.stop(); }

    button.addEventListener("click", function () { if (session) stop(); else start(); });

    const node = el("section", { class: "card c1-rec rec", "aria-label": "Recording" }, [
      el("div", { class: "c1-rec-row" }, [
        button,
        el("span", { class: "c1-rec-hint", text: opts.hint || "Optional: record your answer and listen to it (up to " + MAX + " attempts). The recording stays only in this browser tab." })
      ]),
      linkRow,
      indicator,
      status,
      list
    ]);

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (session) { session.discard = true; clearInterval(session.tick); try { if (session.recorder.state !== "inactive") session.recorder.stop(); } catch (e) { /* already stopped */ } stopTracks(); session = null; }
      attempts.splice(0).forEach(function (a) { URL.revokeObjectURL(a.url); });
      const i = live.indexOf(api);
      if (i !== -1) live.splice(i, 1);
    }

    /** Links to the timer (LM.speakingTrainer.makeTimer): timer start turns recording on, time up stops it. */
    function attach(t) {
      timer = t;
      linkRow.hidden = false;
      t.on("start", function () { if (linkInput.checked && !session) start(); });
      t.on("end", function () { if (linkInput.checked) stop(); });
    }

    const api = { node: node, attach: attach, isRecording: function () { return !!session; }, count: function () { return attempts.length; }, destroy: destroy };
    live.push(api);
    paintList();
    return api;
  }

  window.addEventListener("hashchange", destroyAll);

  LM.recorder = { create: create, destroyAll: destroyAll, supported: supported, MAX: MAX };
})(window.LM);
