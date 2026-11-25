/* Be Kyle — tap-along drum game.
 * Songs live in songs/<id>/ (chart.json, video.mp4, cover.jpg), listed in songs/songs.json.
 * Build new ones with tools/build_song.py. Chart note = [videoSeconds, lane, tier].
 */
(function () {
  "use strict";

  // ───────── Constants ─────────
  const LANES = [
    { name: "KICK",   key: "Space", color: "#22c33a", dark: "#0b5c16", light: "#9cff9c" },
    { name: "SNARE",  key: "D",     color: "#e8262b", dark: "#6b0a0c", light: "#ff9c9c" },
    { name: "TOM 1",  key: "F",     color: "#f5d20d", dark: "#7a6400", light: "#fff3a0" },
    { name: "TOM 2",  key: "J",     color: "#1f6ff2", dark: "#0a2f73", light: "#a8c8ff" },
    { name: "CYMBAL", key: "K",     color: "#ff8a12", dark: "#7a3a00", light: "#ffd09c" },
  ];
  const KEYMAP = { Space: 0, KeyS: 0, KeyD: 1, KeyF: 2, KeyJ: 3, KeyK: 4, KeyL: 4 };
  const DIFFS = {
    easy:   { label: "Easy",   tier: 0, look: 1.9,  miss: 0.018, hint: "Half the notes, slower highway." },
    medium: { label: "Medium", tier: 1, look: 1.6,  miss: 0.024, hint: "Three quarters of the notes." },
    kyle:   { label: "Kyle",   tier: 2, look: 1.3,  miss: 0.032, hint: "Every note Kyle plays. Good luck." },
  };
  const WINDOW = 0.1;           // ± seconds to count a hit
  const LEAD = 2.4;             // seconds of scrolling before the video starts
  const SP_PHRASE_EVERY = 8;    // bars between star phrases
  const SP_PHRASE_LEN = 2;      // bars per star phrase

  // ───────── Settings / storage ─────────
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const settings = Object.assign({ diff: "medium", delay: 0, noFail: false }, store.get("bk.settings", {}));
  if (!DIFFS[settings.diff]) settings.diff = "medium";
  const saveSettings = () => store.set("bk.settings", settings);

  const $ = (id) => document.getElementById(id);
  const video = $("video");
  const canvas = $("hw");
  const ctx = canvas.getContext("2d");

  let songs = [];
  let song = null;    // song list entry
  let chart = null;   // loaded chart
  let G = null;       // current run state

  // ───────── Song select ─────────
  function diffButtons(el, onPick) {
    el.innerHTML = "";
    Object.entries(DIFFS).forEach(([k, d]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.d = k;
      b.setAttribute("role", "radio");
      b.textContent = d.label;
      b.addEventListener("click", () => { settings.diff = k; saveSettings(); refreshDiffs(); onPick && onPick(); });
      el.appendChild(b);
    });
  }
  function refreshDiffs() {
    document.querySelectorAll(".diff button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.d === settings.diff)));
    $("diffHint").textContent = DIFFS[settings.diff].hint;
    renderSongs();
  }
  diffButtons($("diffSel"));
  diffButtons($("diffSet"));

  function fmtTime(s) { s = Math.round(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function starStr(n) { return "★".repeat(n) + "☆".repeat(5 - n); }

  function renderSongs() {
    const ol = $("songs");
    ol.innerHTML = "";
    songs.forEach((s, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.className = "song";
      b.style.animationDelay = `${80 + i * 60}ms`;
      const best = store.get(`bk.best.${s.id}.${settings.diff}`, null);
      const count = s.counts ? s.counts[settings.diff] : "";
      b.innerHTML =
        `<img src="songs/${s.id}/cover.jpg" alt="">` +
        `<div class="meta"><div class="name"></div><div class="by"></div>` +
        `<div class="best">${best ? `<span class="st">${starStr(best.stars)}</span> ${best.score.toLocaleString()}` : `${count} notes · ${fmtTime(s.duration)}`}</div></div>` +
        `<span class="play"><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg></span>`;
      b.querySelector(".name").textContent = s.title;
      b.querySelector(".by").textContent = `${s.artist} · ${Math.round(s.bpm)} BPM`;
      b.addEventListener("click", () => loadSong(s));
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  fetch("songs/songs.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((d) => { songs = d.songs || []; refreshDiffs(); })
    .catch(() => { $("songs").innerHTML = '<li class="hint">Could not load the setlist.</li>'; });

  // ───────── Settings panel ─────────
  const delayEl = $("delay");
  function showDelay() { $("delayVal").textContent = `${settings.delay > 0 ? "+" : ""}${settings.delay} ms`; }
  delayEl.value = settings.delay;
  $("noFail").checked = settings.noFail;
  showDelay();
  delayEl.addEventListener("input", () => { settings.delay = +delayEl.value; showDelay(); saveSettings(); });
  $("noFail").addEventListener("change", (e) => { settings.noFail = e.target.checked; saveSettings(); });
  let settingsReturn = null;
  $("openSettings").addEventListener("click", () => { settingsReturn = null; $("settings").hidden = false; });
  $("closeSettings").addEventListener("click", () => {
    $("settings").hidden = true;
    if (settingsReturn) settingsReturn();
  });

  // ───────── Loading a song ─────────
  let loadToken = 0;
  function loadSong(s) {
    song = s;
    const token = ++loadToken;
    $("loading").hidden = false;
    $("loadTitle").textContent = s.title;
    $("loadHint").textContent = "Loading song…";
    $("startBtn").hidden = true;
    document.querySelector("#loading .spinner").classList.remove("done");

    const chartP = fetch(`songs/${s.id}/chart.json`, { cache: "no-cache" }).then((r) => r.json());
    video.src = `songs/${s.id}/video.mp4`;
    video.load();
    const videoP = new Promise((res, rej) => {
      if (video.readyState >= 3) return res();
      const ok = () => { cleanup(); res(); };
      const bad = () => { cleanup(); rej(new Error("video")); };
      const cleanup = () => { video.removeEventListener("canplay", ok); video.removeEventListener("error", bad); };
      video.addEventListener("canplay", ok);
      video.addEventListener("error", bad);
    });
    Promise.all([chartP, videoP]).then(([c]) => {
      if (token !== loadToken) return;
      chart = c;
      document.querySelector("#loading .spinner").classList.add("done");
      $("loadHint").textContent = `${DIFFS[settings.diff].label} · ${c.counts[settings.diff]} notes`;
      $("startBtn").hidden = false;
    }).catch(() => {
      if (token !== loadToken) return;
      $("loadHint").textContent = "Couldn't load this song. Check your connection and try again.";
    });
  }
  $("cancelLoad").addEventListener("click", () => { loadToken++; $("loading").hidden = true; video.removeAttribute("src"); video.load(); });
  $("startBtn").addEventListener("click", () => {
    // Unlock audio playback inside the tap (iOS / Chrome autoplay rules)
    video.muted = /[?&]mute\b/.test(location.search); // ?mute: for testing without speakers
    const p = video.play();
    if (p && p.then) p.then(() => { if (!G || G.phase === "lead") { video.pause(); video.currentTime = 0; } }).catch(() => {});
    $("loading").hidden = true;
    startRun();
  });

  // ───────── Run state ─────────
  function buildRun() {
    const d = DIFFS[settings.diff];
    const notes = chart.notes
      .filter((n) => n[2] <= d.tier)
      .map((n) => ({ t: n[0], lane: n[1], hit: false, miss: false, star: -1, hitAt: 0 }));
    // Star power phrases: 2 bars every 8 bars
    const bars = chart.beats.filter((b) => b[1]).map((b) => b[0]);
    const phrases = [];
    for (let i = 4; i + SP_PHRASE_LEN < bars.length; i += SP_PHRASE_EVERY) {
      const a = bars[i], b = bars[i + SP_PHRASE_LEN];
      const inside = notes.filter((n) => n.t >= a && n.t < b);
      if (inside.length >= 3) {
        const id = phrases.length;
        inside.forEach((n) => (n.star = id));
        phrases.push({ left: inside.length, broken: false, last: inside[inside.length - 1].t });
      }
    }
    const byLane = LANES.map(() => []);
    notes.forEach((n) => byLane[n.lane].push(n));
    return {
      diff: d, notes, byLane, ptr: LANES.map(() => 0), phrases,
      phase: "lead", leadStart: performance.now(), pausedPhase: null, pausedLeadT: 0,
      score: 0, streak: 0, bestStreak: 0, hits: 0, misses: 0,
      meter: 0.5, sp: 0, spActive: false,
      pressed: LANES.map(() => 0), flames: LANES.map(() => -9), particles: [], ringFx: [],
      lastMult: 1, multPulse: 0, dangerT: 0, done: false, failed: false,
      spb: 60 / (chart.bpm || 120),
    };
  }

  function startRun() {
    $("select").classList.remove("active");
    $("game").classList.add("active");
    G = buildRun();
    video.currentTime = 0;
    clock.playing = false;
    $("songTag").textContent = `${chart.title} — ${chart.artist}`;
    $("songTag").classList.add("show");
    setTimeout(() => $("songTag").classList.remove("show"), 4000);
    $("spBtn").classList.remove("show");
    resize();
    requestWake();
    if (!raf) raf = requestAnimationFrame(frame);
  }

  // ───────── Clock (video time, smoothed) ─────────
  const clock = { playing: false, v: 0, p: 0, last: -1, lastChange: 0 };
  video.addEventListener("playing", () => {
    clock.playing = true; clock.v = video.currentTime; clock.p = clock.lastChange = performance.now();
  });
  video.addEventListener("pause", () => { clock.playing = false; });
  // Buffering: freeze the notes until the video moves again
  video.addEventListener("waiting", () => { clock.playing = false; });
  video.addEventListener("ended", () => { if (G && !G.done) finish(false); });

  function videoTime(now) {
    if (!clock.playing) return video.currentTime;
    const vt = video.currentTime;
    const est = clock.v + (now - clock.p) / 1000;
    if (vt !== clock.last) {
      clock.last = vt;
      clock.lastChange = now;
      if (Math.abs(est - vt) > 0.05) { clock.v = vt; clock.p = now; return vt; }
    } else if (now - clock.lastChange > 400) {
      // Video isn't actually advancing (stalled): hold the notes where the video is
      clock.v = vt; clock.p = now;
      return vt;
    }
    return est;
  }
  function gameTime(now) {
    if (!G) return 0;
    if (G.phase === "lead") return (now - G.leadStart) / 1000 - LEAD - settings.delay / 1000;
    if (G.phase === "paused" && G.pausedPhase === "lead") return G.pausedLeadT;
    return videoTime(now) - settings.delay / 1000;
  }

  // ───────── Input ─────────
  function laneAtX(x) {
    const r = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(4, Math.floor(((x - r.left) / r.width) * 5)));
  }
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    hitLane(laneAtX(e.clientX), e.timeStamp || performance.now());
  }, { passive: false });
  // Block scroll/zoom gestures on the game area
  $("game").addEventListener("touchstart", (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (!$("game").classList.contains("active")) return;
    if (e.code === "Escape" || e.code === "KeyP") { togglePause(); return; }
    if (e.code === "Enter") { activateSP(); e.preventDefault(); return; }
    if (e.repeat) return;
    const lane = KEYMAP[e.code];
    if (lane !== undefined) { e.preventDefault(); hitLane(lane, e.timeStamp || performance.now()); }
  });

  function hitLane(lane, stamp) {
    if (!G || G.done || G.phase === "paused") return;
    const now = performance.now();
    // Event timestamps share performance.now()'s clock; use them for tighter timing
    const at = stamp && stamp <= now && now - stamp < 200 ? stamp : now;
    const t = gameTime(at);
    G.pressed[lane] = now;
    const list = G.byLane[lane];
    for (let i = G.ptr[lane]; i < list.length; i++) {
      const n = list[i];
      if (n.t > t + WINDOW) break;
      if (n.hit || n.miss) continue;
      if (Math.abs(n.t - t) <= WINDOW) { onHit(n, now); return; }
    }
    // Over-hit: no penalty (like the real drum games)
  }

  function mult() {
    const base = G.streak >= 30 ? 4 : G.streak >= 20 ? 3 : G.streak >= 10 ? 2 : 1;
    return G.spActive ? base * 2 : base;
  }

  function onHit(n, now) {
    n.hit = true;
    n.hitAt = now;
    G.hits++;
    G.streak++;
    G.bestStreak = Math.max(G.bestStreak, G.streak);
    G.score += 50 * mult();
    G.meter = Math.min(1, G.meter + 0.015);
    G.flames[n.lane] = now;
    burst(n.lane, now);
    const m = mult();
    if (m !== G.lastMult) { if (m > G.lastMult) G.multPulse = now; G.lastMult = m; }
    if (G.streak % 50 === 0) message(`${G.streak} NOTE STREAK!`);
    if (n.star >= 0) {
      const ph = G.phrases[n.star];
      if (!ph.broken && --ph.left === 0) {
        G.sp = Math.min(1, G.sp + 0.25);
        G.ringFx.push({ t: now, lane: n.lane, sp: true });
        if (!G.spActive && G.sp >= 0.5) $("spBtn").classList.add("show");
      }
    }
  }

  function onMiss(n) {
    n.miss = true;
    G.misses++;
    if (G.streak >= 10) G.multPulse = 0;
    G.streak = 0;
    G.lastMult = G.spActive ? 2 : 1;
    G.meter = Math.max(0, G.meter - G.diff.miss);
    if (n.star >= 0) G.phrases[n.star].broken = true;
    if (G.meter <= 0 && !settings.noFail) finish(true);
  }

  function activateSP() {
    if (!G || G.spActive || G.sp < 0.5 || G.done || G.phase === "paused") return;
    G.spActive = true;
    G.spStart = performance.now();
    $("spBtn").classList.remove("show");
    message("STAR POWER!", true);
  }
  $("spBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); activateSP(); });

  function message(text, sp) {
    const m = $("centerMsg");
    m.textContent = text;
    m.style.textShadow = sp ? "0 0 22px rgba(89,230,255,1), 0 3px 0 #000" : "";
    m.classList.remove("show");
    void m.offsetWidth;
    m.classList.add("show");
  }

  // ───────── Pause / results ─────────
  function togglePause() {
    if (!G || G.done) return;
    if (G.phase === "paused") resume(); else pause();
  }
  function pause() {
    if (!G || G.phase === "paused" || G.done) return;
    G.pausedPhase = G.phase;
    if (G.phase === "lead") G.pausedLeadT = gameTime(performance.now());
    G.phase = "paused";
    video.pause();
    $("pause").hidden = false;
  }
  function resume() {
    $("pause").hidden = true;
    if (!G || G.phase !== "paused") return;
    if (G.pausedPhase === "lead") {
      G.leadStart = performance.now() - (G.pausedLeadT + LEAD + settings.delay / 1000) * 1000;
      G.phase = "lead";
    } else {
      G.phase = "play";
      video.play().catch(() => {});
    }
  }
  $("pauseBtn").addEventListener("click", pause);
  $("resume").addEventListener("click", resume);
  $("restart").addEventListener("click", () => { $("pause").hidden = true; video.pause(); startRun(); });
  $("quit").addEventListener("click", () => { $("pause").hidden = true; quit(); });
  $("pauseSettings").addEventListener("click", () => {
    $("pause").hidden = true;
    $("settings").hidden = false;
    settingsReturn = () => { $("pause").hidden = false; };
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

  function quit() {
    if (G) G.done = true;
    G = null;
    video.pause();
    $("game").classList.remove("active");
    $("select").classList.add("active");
    $("results").hidden = true;
    renderSongs();
    releaseWake();
  }

  function finish(failed) {
    if (!G || G.done) return;
    G.done = true;
    G.failed = failed;
    video.pause();
    $("spBtn").classList.remove("show");
    const total = G.notes.length || 1;
    const pct = Math.round((G.hits / total) * 100);
    const ratio = G.score / (total * 50);
    const stars = failed ? 0 : ratio >= 2.8 ? 5 : ratio >= 2.0 ? 4 : 3;
    $("resTitle").textContent = failed ? "Song Failed" : "Song Complete!";
    $("resSong").textContent = `${chart.title} · ${G.diff.label}`;
    $("resPct").textContent = pct + "%";
    $("resStreak").textContent = G.bestStreak;
    const starsEl = $("resStars");
    starsEl.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      const s = document.createElement("i");
      s.textContent = "★";
      if (i < stars) { s.className = "on"; s.style.animationDelay = `${0.5 + i * 0.22}s`; }
      starsEl.appendChild(s);
    }
    const key = `bk.best.${song.id}.${settings.diff}`;
    const best = store.get(key, null);
    const isNew = !failed && (!best || G.score > best.score);
    if (isNew) store.set(key, { score: G.score, stars, pct });
    $("resNew").hidden = true;
    // Count the score up
    const target = G.score, t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 1200);
      $("resScore").textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString();
      if (k < 1) requestAnimationFrame(tick); else if (isNew && best) $("resNew").hidden = false;
    };
    tick();
    setTimeout(() => { $("results").hidden = false; }, failed ? 600 : 900);
    if (failed) message("SONG FAILED");
    releaseWake();
  }
  $("retry").addEventListener("click", () => {
    $("results").hidden = true;
    video.play().then(() => { video.pause(); video.currentTime = 0; }).catch(() => {});
    startRun();
  });
  $("toSongs").addEventListener("click", quit);

  // Keep the screen awake while playing
  let wake = null;
  function requestWake() { try { navigator.wakeLock && navigator.wakeLock.request("screen").then((w) => (wake = w)).catch(() => {}); } catch (e) { /* unsupported */ } }
  function releaseWake() { try { wake && wake.release(); } catch (e) { /* ignore */ } wake = null; }

  // ───────── Rendering ─────────
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width * DPR));
    H = Math.max(1, Math.round(r.height * DPR));
    canvas.width = W;
    canvas.height = H;
  }
  window.addEventListener("resize", resize);

  // Perspective: s = 1 at the strike line, S_FAR at the far end
  const S_FAR = 0.3;
  function geom() {
    const labelH = 26 * DPR;
    const yStrike = H - labelH - 34 * DPR;
    const yTop = H * 0.04;
    const wNear = W * 0.96;
    const yV = (yTop - yStrike * S_FAR) / (1 - S_FAR);
    return { yStrike, yTop, wNear, yV, cx: W / 2, labelH };
  }
  // z: 0 = strike line, 1 = far end (can be <0 for notes that passed)
  const sAt = (z) => 1 / (1 + z * (1 / S_FAR - 1));
  const yAt = (g, s) => g.yV + (g.yStrike - g.yV) * s;
  const xAt = (g, laneEdge, s) => g.cx + (laneEdge / 5 - 0.5) * g.wNear * s; // laneEdge 0..5

  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!$("game").classList.contains("active") || !G) { raf && cancelAnimationFrame(raf); raf = 0; return; }
    const now = performance.now();
    const t = gameTime(now);

    // Lead-in finished → start the video
    if (G.phase === "lead" && t + settings.delay / 1000 >= 0) {
      G.phase = "play";
      video.currentTime = 0;
      video.play().catch(() => { pause(); });
    }
    if (G.phase !== "paused" && !G.done) update(t, now);
    draw(t, now);
  }

  function update(t, now) {
    // Misses
    for (let l = 0; l < 5; l++) {
      const list = G.byLane[l];
      let p = G.ptr[l];
      while (p < list.length && (list[p].hit || list[p].t < t - WINDOW)) {
        if (!list[p].hit && !list[p].miss) onMiss(list[p]);
        p++;
      }
      G.ptr[l] = p;
      if (G.done) return;
    }
    // Star power drain: 50% lasts 16 beats
    if (G.spActive) {
      G.sp -= (0.5 / (16 * G.spb)) * (1 / 60) * Math.max(0.5, Math.min(3, (now - (G.lastNow || now)) / 16.7));
      if (G.sp <= 0) { G.sp = 0; G.spActive = false; G.lastMult = mult(); }
    }
    G.lastNow = now;
    // Rock meter danger flash
    G.dangerT = G.meter < 0.25 ? now : G.dangerT;
  }

  function draw(t, now) {
    const g = geom();
    ctx.clearRect(0, 0, W, H);
    const sp = G.spActive;

    // Background: stage glow
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, sp ? "#03131c" : "#0b0705");
    bg.addColorStop(1, "#000");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Light rays
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const a = Math.sin(now / 1900 + i * 1.7) * 0.35;
      const x = W * (0.15 + i * 0.23);
      const grd = ctx.createLinearGradient(x, 0, x + Math.sin(a) * H, H);
      const c = sp ? "89,230,255" : i % 2 ? "255,120,0" : "255,192,0";
      grd.addColorStop(0, `rgba(${c},0.10)`);
      grd.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(x - 6 * DPR, 0);
      ctx.lineTo(x + 6 * DPR, 0);
      ctx.lineTo(x + Math.sin(a) * H + 90 * DPR, H);
      ctx.lineTo(x + Math.sin(a) * H - 90 * DPR, H);
      ctx.fill();
    }
    ctx.restore();

    const look = G.diff.look;
    const zOf = (nt) => (nt - t) / look;

    // Highway body
    const sB = sAt(-0.06), sT = S_FAR;
    const yB = Math.min(H - g.labelH, yAt(g, sB));
    ctx.beginPath();
    ctx.moveTo(xAt(g, 0, sT), g.yTop);
    ctx.lineTo(xAt(g, 5, sT), g.yTop);
    ctx.lineTo(xAt(g, 5, sB), yB);
    ctx.lineTo(xAt(g, 0, sB), yB);
    ctx.closePath();
    const hw = ctx.createLinearGradient(0, g.yTop, 0, g.yStrike);
    hw.addColorStop(0, sp ? "rgba(10,60,90,0.25)" : "rgba(30,22,16,0.2)");
    hw.addColorStop(0.35, sp ? "#0b3b55" : "#1d1712");
    hw.addColorStop(1, sp ? "#0f5a80" : "#2a211a");
    ctx.fillStyle = hw;
    ctx.fill();

    // Scrolling grain
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = sp ? "rgba(140,230,255,0.06)" : "rgba(255,220,180,0.05)";
    ctx.lineWidth = 1 * DPR;
    const grainGap = 0.045;
    const off = ((t / look) % grainGap + grainGap) % grainGap;
    for (let z = -off; z < 1; z += grainGap) {
      if (z < -0.06) continue;
      const s = sAt(z), y = yAt(g, s);
      ctx.beginPath();
      ctx.moveTo(xAt(g, 0, s), y);
      ctx.lineTo(xAt(g, 5, s), y);
      ctx.stroke();
    }
    // Lane dividers
    for (let l = 1; l < 5; l++) {
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1.2 * DPR;
      ctx.beginPath();
      ctx.moveTo(xAt(g, l, sT), g.yTop);
      ctx.lineTo(xAt(g, l, sB), yB);
      ctx.stroke();
    }
    // Beat / bar lines
    for (const b of chart.beats) {
      const z = zOf(b[0]);
      if (z < -0.05) continue;
      if (z > 1) break;
      const s = sAt(z), y = yAt(g, s);
      ctx.strokeStyle = b[1] ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)";
      ctx.lineWidth = (b[1] ? 3 : 1.5) * DPR * s;
      ctx.beginPath();
      ctx.moveTo(xAt(g, 0, s), y);
      ctx.lineTo(xAt(g, 5, s), y);
      ctx.stroke();
    }
    // Fade the far end into the dark
    const fade = ctx.createLinearGradient(0, g.yTop, 0, g.yTop + (g.yStrike - g.yTop) * 0.22);
    fade.addColorStop(0, "rgba(0,0,0,0.95)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, g.yTop - 2, W, (g.yStrike - g.yTop) * 0.22 + 2);
    ctx.restore();

    // Side rails (red flash when the rock meter is low)
    const danger = G.meter < 0.25 && !G.done && Math.sin(now / 110) > 0;
    const railC = sp ? "#8af0ff" : danger ? "#ff2a2a" : "#d9d2c8";
    ctx.lineWidth = 4 * DPR;
    ctx.strokeStyle = railC;
    ctx.shadowColor = sp ? "#59e6ff" : danger ? "#ff0000" : "rgba(255,200,120,0.6)";
    ctx.shadowBlur = (sp || danger ? 18 : 8) * DPR;
    for (const e of [0, 5]) {
      ctx.beginPath();
      ctx.moveTo(xAt(g, e, sT), g.yTop + (g.yStrike - g.yTop) * 0.08);
      ctx.lineTo(xAt(g, e, sB), yB);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Strike line bar
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(xAt(g, 0, 1), g.yStrike - 3 * DPR, g.wNear, 6 * DPR);

    // Fret buttons (targets)
    const laneW = g.wNear / 5;
    for (let l = 0; l < 5; l++) drawFret(g, l, laneW, now);

    // Notes: far → near
    const visible = [];
    for (let l = 0; l < 5; l++) {
      const list = G.byLane[l];
      for (let i = Math.max(0, G.ptr[l] - 6); i < list.length; i++) {
        const n = list[i];
        const z = zOf(n.t);
        if (z > 1.02) break;
        if (z < -0.12) continue;
        if (n.hit && now - n.hitAt > 0) continue;
        visible.push([z, n]);
      }
    }
    visible.sort((a, b) => b[0] - a[0]);
    for (const [z, n] of visible) {
      const s = sAt(z);
      const y = yAt(g, s);
      const x = xAt(g, n.lane + 0.5, s);
      const alpha = z < 1 ? Math.min(1, (1 - z) / 0.12) : 0;
      const missed = n.miss || (z < 0 && !n.hit);
      ctx.globalAlpha = missed ? Math.max(0, 0.55 + z * 4) * alpha : alpha;
      const isStar = n.star >= 0 && !G.phrases[n.star].broken;
      drawGem(x, y, laneW * 0.8 * s, LANES[n.lane], sp ? "sp" : isStar ? "star" : "", missed);
      ctx.globalAlpha = 1;
    }

    // Hit flames + particles
    drawEffects(g, laneW, now);

    // Lane labels
    ctx.font = `900 ${10.5 * DPR}px Montserrat, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let l = 0; l < 5; l++) {
      ctx.fillStyle = G.pressed[l] && now - G.pressed[l] < 120 ? LANES[l].light : "rgba(255,255,255,0.55)";
      ctx.fillText(LANES[l].name, xAt(g, l + 0.5, 1), H - g.labelH / 2 - 2 * DPR);
    }

    drawHUD(g, now);
  }

  function ellipse(x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  }

  function drawFret(g, l, laneW, now) {
    const x = xAt(g, l + 0.5, 1), y = g.yStrike;
    const w = laneW * 0.84, rx = w / 2, ry = rx * 0.42;
    const L = LANES[l];
    const press = G.pressed[l] && now - G.pressed[l] < 110;
    const dy = press ? 3 * DPR : 0;
    // base
    ctx.fillStyle = "#0a0a0a";
    ellipse(x, y + ry * 0.35, rx, ry);
    ctx.fill();
    // colored ring
    ctx.fillStyle = press ? L.light : L.color;
    ellipse(x, y + dy, rx * 0.96, ry * 0.96);
    ctx.fill();
    // inner well
    const inner = ctx.createRadialGradient(x, y + dy - ry * 0.3, 0, x, y + dy, rx * 0.7);
    inner.addColorStop(0, press ? L.light : "#3a3a3a");
    inner.addColorStop(1, press ? L.color : "#111");
    ctx.fillStyle = inner;
    ellipse(x, y + dy, rx * 0.7, ry * 0.7);
    ctx.fill();
    // silver rim highlight
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1.5 * DPR;
    ellipse(x, y + dy, rx * 0.96, ry * 0.96);
    ctx.stroke();
    if (press) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(x, y, 0, x, y, rx * 1.4);
      glow.addColorStop(0, L.color + "aa");
      glow.addColorStop(1, L.color + "00");
      ctx.fillStyle = glow;
      ellipse(x, y, rx * 1.4, ry * 1.6);
      ctx.fill();
      ctx.restore();
    }
  }

  function starPath(x, y, r, squash) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * squash);
    }
    ctx.closePath();
  }

  function drawGem(x, y, w, L, mode, missed) {
    const rx = w / 2, ry = rx * 0.42;
    const body = missed ? "#555" : mode === "sp" ? "#7fe8ff" : L.color;
    const dark = missed ? "#222" : mode === "sp" ? "#0b6f99" : L.dark;
    if (mode === "star" && !missed) {
      // Star-shaped gem
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      starPath(x, y + ry * 0.45, rx * 1.05, 0.55);
      ctx.fill();
      ctx.fillStyle = dark;
      starPath(x, y + ry * 0.18, rx * 1.05, 0.55);
      ctx.fill();
      const grd = ctx.createLinearGradient(0, y - ry, 0, y + ry);
      grd.addColorStop(0, L.light);
      grd.addColorStop(1, body);
      ctx.fillStyle = grd;
      starPath(x, y, rx, 0.55);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(1, rx * 0.09);
      ctx.stroke();
      return;
    }
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ellipse(x, y + ry * 0.55, rx, ry);
    ctx.fill();
    // side wall
    ctx.fillStyle = dark;
    ellipse(x, y + ry * 0.22, rx, ry);
    ctx.fill();
    // top
    const grd = ctx.createLinearGradient(0, y - ry, 0, y + ry);
    grd.addColorStop(0, missed ? "#777" : mode === "sp" ? "#e6fbff" : L.light);
    grd.addColorStop(0.55, body);
    grd.addColorStop(1, dark);
    ctx.fillStyle = grd;
    ellipse(x, y, rx * 0.97, ry * 0.97);
    ctx.fill();
    // white ring
    ctx.strokeStyle = missed ? "#999" : "#fff";
    ctx.lineWidth = Math.max(1, rx * 0.11);
    ellipse(x, y, rx * 0.62, ry * 0.62);
    ctx.stroke();
    // center cap
    ctx.fillStyle = missed ? "#333" : "#1b1b1b";
    ellipse(x, y, rx * 0.36, ry * 0.36);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ellipse(x - rx * 0.08, y - ry * 0.1, rx * 0.16, ry * 0.12);
    ctx.fill();
  }

  function burst(lane, now) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = (0.25 + Math.random() * 0.6);
      G.particles.push({
        lane, t: now, life: 260 + Math.random() * 260,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 1.4,
        c: G.spActive ? (Math.random() < 0.5 ? "#bff6ff" : "#59e6ff") : Math.random() < 0.5 ? "#ffd24a" : "#ff7a12",
        r: 1.5 + Math.random() * 2.5,
      });
    }
    if (G.particles.length > 400) G.particles.splice(0, G.particles.length - 400);
  }

  function drawEffects(g, laneW, now) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Flames: short upward fire from the fret
    for (let l = 0; l < 5; l++) {
      const age = now - G.flames[l];
      if (age > 240) continue;
      const k = age / 240;
      const x = xAt(g, l + 0.5, 1), y = g.yStrike;
      const h = laneW * (1.6 - k * 0.4), w = laneW * 0.55 * (1 - k * 0.5);
      for (let j = 0; j < 3; j++) {
        const grd = ctx.createRadialGradient(x, y - h * 0.2, 0, x, y - h * 0.35, h * 0.7);
        const c = G.spActive ? ["#ffffff", "#9ff2ff", "#1aa3ff"][j] : ["#fff4c0", "#ffb020", "#ff4a00"][j];
        grd.addColorStop(0, c);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = (1 - k) * (0.9 - j * 0.2);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(x + Math.sin(now / 30 + j) * 2 * DPR, y - h * (0.25 + j * 0.12), w * (1 - j * 0.2), h * (0.45 - j * 0.08), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // expanding ring
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = G.spActive ? "#bff6ff" : LANES[l].light;
      ctx.lineWidth = 3 * DPR * (1 - k);
      ellipse(x, y, laneW * 0.42 * (1 + k * 0.8), laneW * 0.18 * (1 + k * 0.8));
      ctx.stroke();
    }
    // Sparks
    const keep = [];
    for (const p of G.particles) {
      const age = now - p.t;
      if (age > p.life) continue;
      keep.push(p);
      const k = age / p.life;
      const x = xAt(g, p.lane + 0.5, 1) + p.vx * age * DPR * 0.6;
      const y = g.yStrike + p.vy * age * DPR * 0.6 + 0.0009 * age * age * DPR;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(x, y, p.r * DPR * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    G.particles = keep;
    // Star phrase complete: blue shockwave
    G.ringFx = G.ringFx.filter((r) => now - r.t < 500);
    for (const r of G.ringFx) {
      const k = (now - r.t) / 500;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = "#8af0ff";
      ctx.lineWidth = 5 * DPR * (1 - k);
      ellipse(g.cx, g.yStrike, g.wNear * 0.5 * (0.3 + k), g.wNear * 0.12 * (0.3 + k));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHUD(g, now) {
    const pad = 10 * DPR;
    const m = mult();
    // Score
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `italic 900 ${22 * DPR}px Montserrat, sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 6 * DPR;
    ctx.fillText(G.score.toLocaleString(), pad, pad);
    ctx.shadowBlur = 0;

    // Multiplier gauge (10 lights fill per level)
    const r = 24 * DPR, cx = pad + r, cy = pad + 34 * DPR + r;
    const pulse = G.multPulse && now - G.multPulse < 300 ? 1 + 0.25 * (1 - (now - G.multPulse) / 300) : 1;
    const segs = 10;
    const filled = m >= (G.spActive ? 8 : 4) ? segs : G.streak % 10;
    const mc = G.spActive ? "#59e6ff" : ["#ffffff", "#ffffff", "#ffd000", "#2ee65a", "#c86bff"][Math.min(4, m)];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < segs; i++) {
      const a0 = -Math.PI / 2 + (i / segs) * Math.PI * 2 + 0.06, a1 = a0 + (Math.PI * 2) / segs - 0.12;
      ctx.strokeStyle = i < filled ? mc : "rgba(255,255,255,0.15)";
      ctx.lineWidth = 4.5 * DPR;
      ctx.beginPath(); ctx.arc(0, 0, r - 4 * DPR, a0, a1); ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `italic 900 ${17 * DPR}px Montserrat, sans-serif`;
    ctx.fillStyle = mc;
    ctx.fillText("×" + m, 0, 1 * DPR);
    ctx.restore();

    // Streak counter
    if (G.streak >= 5) {
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${10 * DPR}px Montserrat, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(`${G.streak} STREAK`, pad, cy + r + 12 * DPR);
    }

    // Rock meter (top right): red / yellow / green arc with needle
    const R = 30 * DPR, mx = W - pad - R, my = pad + R + 4 * DPR;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath(); ctx.arc(mx, my, R + 4 * DPR, Math.PI, 0); ctx.closePath(); ctx.fill();
    const zones = [["#e8262b", 0, 1 / 3], ["#f5d20d", 1 / 3, 2 / 3], ["#22c33a", 2 / 3, 1]];
    for (const [c, a, b] of zones) {
      ctx.strokeStyle = c;
      ctx.lineWidth = 7 * DPR;
      ctx.beginPath(); ctx.arc(mx, my, R - 4 * DPR, Math.PI + a * Math.PI + 0.03, Math.PI + b * Math.PI - 0.03); ctx.stroke();
    }
    const na = Math.PI + G.meter * Math.PI;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5 * DPR;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(na) * (R - 2 * DPR), my + Math.sin(na) * (R - 2 * DPR)); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(mx, my, 3.5 * DPR, 0, Math.PI * 2); ctx.fill();

    // Star power tube
    const tw = 2 * R + 8 * DPR, th = 8 * DPR, tx = mx - R - 4 * DPR, ty = my + 8 * DPR;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    roundRect(tx, ty, tw, th, th / 2); ctx.fill();
    ctx.strokeStyle = "rgba(160,240,255,0.5)";
    ctx.lineWidth = 1 * DPR;
    ctx.stroke();
    if (G.sp > 0) {
      const glow = G.sp >= 0.5 || G.spActive;
      ctx.fillStyle = glow ? `rgba(120,235,255,${0.8 + 0.2 * Math.sin(now / 120)})` : "#3aa7d8";
      ctx.shadowColor = "#59e6ff";
      ctx.shadowBlur = glow ? 10 * DPR : 0;
      roundRect(tx + 1.5 * DPR, ty + 1.5 * DPR, Math.max(th, (tw - 3 * DPR) * G.sp), th - 3 * DPR, (th - 3 * DPR) / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `900 ${8.5 * DPR}px Montserrat, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("STAR POWER", mx, ty + th + 4 * DPR);

    // Lead-in countdown
    if (G.phase === "lead" || (G.phase === "paused" && G.pausedPhase === "lead")) {
      const left = -gameTime(now);
      if (left > 0 && left < LEAD) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `italic 900 ${18 * DPR}px Montserrat, sans-serif`;
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, left)})`;
        ctx.fillText("GET READY", W / 2, g.yTop + (g.yStrike - g.yTop) * 0.4);
      }
    }
  }

  // Debug hook for testing: game/?debug
  if (/[?&]debug\b/.test(location.search)) {
    window.__bk = { get G() { return G; }, hitLane, gameTime, video, settings };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
})();
