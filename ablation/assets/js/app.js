/* Modality ablation study: audio-only vs text-only vs both, 7 scenarios.
 *
 * Sibling of the main study's assets/js/app.js — same architecture
 * (localStorage progress, Supabase submission with retry + zip fallback,
 * device_id repeat-detection), adapted for a 3-way comparison with
 * per-video Likert ratings instead of a pairwise A/B + checkbox.
 */
(function () {
  "use strict";

  // Distinct from the main study's "video_study_v1": both pages share the
  // same origin (github.io), so a shared key would let one study's
  // progress clobber the other's.
  const STORAGE_KEY = "ablation_study_v1";
  // Intentionally the SAME key as the main study's — one browser gets one
  // consistent anonymous device id across all our studies, which is a
  // free bonus for cross-study analysis later.
  const DEVICE_ID_STORAGE_KEY = "video_study_device_id_v1";

  const SUPABASE_URL = "https://guamrqujwnfejkvsrcar.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1YW1ycXVqd25mZWprdnNyY2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MTMxMzIsImV4cCI6MjA5MzM4OTEzMn0.UukpujziUjhZA16Wcx1lF2Pzh8Yhasz0fGYWENuRYRs";
  const SUPABASE_TABLE = "h3_ablation_survey_responses";
  const MAX_SUBMIT_ATTEMPTS = 3;

  // Fixed globally (not per-scenario): which blinded file is which method.
  // Blinding comes from randomizing on-screen A/B/C position at runtime,
  // never from the file name.
  const CLIP_METHOD = { clip1: "audio_only", clip2: "text_only", clip3: "both" };
  const ALL_CLIPS = ["clip1", "clip2", "clip3"];

  // Word label per slider value (index 0 = value 1), and the matching
  // red -> green color per value — same 5 stops as the CSS track
  // gradient — used to color the live value readout.
  const LIKERT_LABELS = {
    success: ["Not at all", "Slightly", "Partially", "Mostly", "Completely"],
    naturalness: ["Very unnatural", "Somewhat unnatural", "Neutral", "Somewhat natural", "Very natural"]
  };
  const RATING_COLORS = ["#dc2626", "#f97316", "#eab308", "#84cc16", "#16a34a"];
  const ALL_CHOICES = ["A", "B", "C"];

  // The ranking actually shown/submitted: once exactly two positions are
  // explicitly tapped, the third is implied (only one choice left) and
  // filled in automatically — so a full ranking never needs a 3rd tap.
  function effectiveRanking(trial) {
    const manual = trial.rankingManual;
    if (manual.length === 2) {
      const missing = ALL_CHOICES.find((c) => !manual.includes(c));
      return manual.concat([missing]);
    }
    return manual.slice();
  }

  /* ---------------- state ---------------- */

  let state = null;

  function freshState() {
    const order = shuffledSlugOrder();
    const trials = order.map((slug) => ({
      slug,
      sources: shuffledClips(), // [A, B, C] -> which clip is shown at each position
      ratings: {
        a: { success: null, naturalness: null },
        b: { success: null, naturalness: null },
        c: { success: null, naturalness: null }
      },
      // Explicitly-tapped ranking, best first, e.g. ["B", "A"] after two
      // taps. Kept separate from the *effective* (possibly auto-completed)
      // ranking — see effectiveRanking() — so undoing a tap always has an
      // unambiguous, non-looping effect.
      rankingManual: [],
      visited: false,
      timeSpentMs: 0
    }));
    return {
      sessionId: createSessionId(),
      startedAt: null,
      finishedAt: null,
      submitted: false,
      currentIndex: 0,
      trials
    };
  }

  function createSessionId() {
    return createUuid();
  }

  function createUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getOrCreateDeviceId() {
    try {
      const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (existing) return existing;
      const created = createUuid();
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
      return created;
    } catch (e) {
      return createUuid();
    }
  }

  const DEVICE_ID = getOrCreateDeviceId();

  function ensureSessionFields(s) {
    if (!s.sessionId) s.sessionId = createSessionId();
    if (typeof s.submitted !== "boolean") s.submitted = false;
  }

  function shuffledSlugOrder() {
    const slugs = SCENARIOS.map((s) => s.slug);
    for (let i = slugs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slugs[i], slugs[j]] = [slugs[j], slugs[i]];
    }
    return slugs;
  }

  function shuffledClips() {
    const clips = ALL_CLIPS.slice();
    for (let i = clips.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [clips[i], clips[j]] = [clips[j], clips[i]];
    }
    return clips;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        !Array.isArray(parsed.trials) ||
        parsed.trials.length !== SCENARIOS.length ||
        // Shape check: a state saved before the tap-to-rank UI (with a
        // `bestChoice` field instead of `rankingManual`) can't be
        // resumed — start fresh instead of crashing on it.
        !parsed.trials.every((t) => Array.isArray(t.rankingManual))
      ) {
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* storage full or unavailable — study still works, just won't resume */
    }
  }

  function clearState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  /* ---------------- dom refs ---------------- */

  const screens = {
    welcome: document.getElementById("screen-welcome"),
    trial: document.getElementById("screen-trial"),
    done: document.getElementById("screen-done")
  };

  const el = {
    btnStart: document.getElementById("btn-start"),
    btnResume: document.getElementById("btn-resume"),
    scenarioCount: document.getElementById("scenario-count"),

    progressFill: document.getElementById("progress-fill"),
    progressLabel: document.getElementById("progress-label"),
    btnRestart: document.getElementById("btn-restart"),
    editPrompt: document.getElementById("edit-prompt"),

    videoInput: document.getElementById("video-input"),
    videoA: document.getElementById("video-a"),
    videoB: document.getElementById("video-b"),
    videoC: document.getElementById("video-c"),

    likertGroups: Array.from(document.querySelectorAll(".likert")),
    rankChips: Array.from(document.querySelectorAll(".rank-chip")),
    rankSlots: Array.from(document.querySelectorAll(".rank-slot")),

    btnBack: document.getElementById("btn-back"),
    btnNext: document.getElementById("btn-next"),

    submitStatus: document.getElementById("submit-status"),
    submitStatusText: document.getElementById("submit-status-text"),
    submitActions: document.getElementById("submit-actions"),
    btnRetrySubmit: document.getElementById("btn-retry-submit"),
    downloadHint: document.getElementById("download-hint"),

    btnDownload: document.getElementById("btn-download"),
    btnToggleSummary: document.getElementById("btn-toggle-summary"),
    summaryWrap: document.getElementById("summary-wrap"),
    summaryTable: document.getElementById("summary-table"),
    btnRestart2: document.getElementById("btn-restart-2"),

    // DEBUG-ONLY: delete these four lines before release
    debugToggle: document.getElementById("debug-toggle"),
    debugBadgeA: document.getElementById("debug-badge-a"),
    debugBadgeB: document.getElementById("debug-badge-b"),
    debugBadgeC: document.getElementById("debug-badge-c")
  };

  let trialShownAt = 0;

  // DEBUG-ONLY: delete this whole block before release
  let debugMode = false;
  if (el.debugToggle) {
    el.debugToggle.addEventListener("change", () => {
      debugMode = el.debugToggle.checked;
      if (state && !screens.trial.hidden) renderTrial();
    });
  }
  // END DEBUG-ONLY

  /* ---------------- screen switching ---------------- */

  function showScreen(name) {
    Object.entries(screens).forEach(([key, node]) => {
      node.hidden = key !== name;
    });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  /* ---------------- welcome screen ---------------- */

  el.scenarioCount.textContent = String(SCENARIOS.length);

  const savedState = loadState();
  const hasResumable = !!(savedState && savedState.startedAt && !savedState.finishedAt);
  const hasUnsubmittedFinished = !!(savedState && savedState.finishedAt && savedState.submitted !== true);

  if (hasUnsubmittedFinished) {
    state = savedState;
    ensureSessionFields(state);
    saveState();
    showScreen("done");
    renderSummary();
    submitResponses();
  } else if (hasResumable) {
    const answeredCount = savedState.trials.filter((t) => t.rankingManual.length >= 2).length;

    el.btnResume.hidden = false;
    el.btnResume.classList.remove("btn-ghost");
    el.btnResume.classList.add("btn-primary", "btn-large");
    el.btnResume.textContent = `Resume where I left off (${answeredCount}/${savedState.trials.length} answered)`;

    el.btnStart.classList.remove("btn-primary", "btn-large");
    el.btnStart.classList.add("btn-ghost");
    el.btnStart.textContent = "Start over instead";

    el.btnResume.addEventListener("click", () => {
      state = savedState;
      ensureSessionFields(state);
      saveState();
      showScreen("trial");
      renderTrial();
    });
  }

  el.btnStart.addEventListener("click", () => {
    if (hasResumable) {
      const confirmed = window.confirm(
        "You have answers saved on this device. Starting over will erase them. Continue?"
      );
      if (!confirmed) return;
    }
    state = freshState();
    state.startedAt = new Date().toISOString();
    saveState();
    showScreen("trial");
    renderTrial();
  });

  /* ---------------- trial screen ---------------- */

  function currentTrial() {
    return state.trials[state.currentIndex];
  }

  function currentScenario() {
    return SCENARIOS.find((s) => s.slug === currentTrial().slug);
  }

  function videoPath(slug, file) {
    return `assets/videos/${slug}/${file}.mp4`;
  }

  function posterPath(slug, file) {
    return `assets/posters/${slug}/${file}.jpg`;
  }

  function setVideoSource(videoEl, slug, file) {
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();
    videoEl.poster = posterPath(slug, file);
    videoEl.src = videoPath(slug, file);
    videoEl.load();
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlightEditText(text, phrases) {
    if (!phrases || !phrases.length) return escapeHtml(text);
    const pattern = phrases
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|");
    const re = new RegExp(`(${pattern})`, "g");
    return text
      .split(re)
      .map((part) =>
        phrases.includes(part)
          ? `<mark class="edit-highlight">${escapeHtml(part)}</mark>`
          : escapeHtml(part)
      )
      .join("");
  }

  const POSITION_VIDEO_EL = { a: null, b: null, c: null }; // filled in renderTrial

  function renderTrial() {
    const trial = currentTrial();
    const scenario = currentScenario();

    el.progressLabel.textContent = `Scenario ${state.currentIndex + 1} of ${state.trials.length}`;
    el.progressFill.style.width = `${((state.currentIndex) / state.trials.length) * 100}%`;

    el.editPrompt.innerHTML = highlightEditText(scenario.edit, scenario.highlights);

    setVideoSource(el.videoInput, scenario.slug, "input");
    POSITION_VIDEO_EL.a = el.videoA;
    POSITION_VIDEO_EL.b = el.videoB;
    POSITION_VIDEO_EL.c = el.videoC;
    setVideoSource(el.videoA, scenario.slug, trial.sources[0]);
    setVideoSource(el.videoB, scenario.slug, trial.sources[1]);
    setVideoSource(el.videoC, scenario.slug, trial.sources[2]);

    el.likertGroups.forEach((group) => {
      const pos = group.dataset.video; // "a" | "b" | "c"
      const question = group.dataset.question; // "success" | "naturalness"
      updateLikertDisplay(group, trial.ratings[pos][question]);
    });

    renderRanking(trial);

    // DEBUG-ONLY: delete this block before release
    const badgeByPos = { a: el.debugBadgeA, b: el.debugBadgeB, c: el.debugBadgeC };
    ["a", "b", "c"].forEach((pos, i) => {
      const badge = badgeByPos[pos];
      if (!badge) return;
      badge.hidden = !debugMode;
      badge.textContent = CLIP_METHOD[trial.sources[i]];
    });
    // END DEBUG-ONLY

    el.btnBack.disabled = state.currentIndex === 0;
    updateNextEnabled();

    trial.visited = true;
    trialShownAt = performance.now();
  }

  // Syncs one slider + its live value readout to `value` (1-5, or null
  // for "not yet answered"). Shared between renderTrial() (restoring a
  // stored rating) and the slider's own "input" handler (live dragging).
  function updateLikertDisplay(group, value) {
    const slider = group.querySelector(".likert-slider");
    const valueEl = group.querySelector(".likert-value");
    const question = group.dataset.question;
    if (value === null) {
      slider.value = "3";
      slider.classList.remove("touched");
      valueEl.textContent = valueEl.dataset.placeholder;
      valueEl.style.color = "";
    } else {
      slider.value = String(value);
      slider.classList.add("touched");
      valueEl.textContent = `${value} — ${LIKERT_LABELS[question][value - 1]}`;
      valueEl.style.color = RATING_COLORS[value - 1];
    }
  }

  // Syncs the pending chips + the three rank slots to `trial`. A chip
  // disappears from "Pending" once it's anywhere in the effective
  // ranking (including the auto-completed 3rd). A slot is only
  // clickable-to-undo when it holds an *explicit* tap (index <
  // rankingManual.length) — the auto-filled 3rd isn't directly
  // removable, since undoing it would just re-derive it right back;
  // changing the 1st or 2nd pick is what cascades it away.
  function renderRanking(trial) {
    const ranking = effectiveRanking(trial);

    el.rankChips.forEach((chip) => {
      const placed = ranking.includes(chip.dataset.choice);
      chip.hidden = placed;
    });

    el.rankSlots.forEach((slot, i) => {
      const choice = ranking[i] || null;
      const isManual = i < trial.rankingManual.length;
      const valueEl = slot.querySelector(".rank-slot-value");

      if (choice) {
        valueEl.textContent = `Option ${choice}`;
        valueEl.classList.remove("rank-slot-value-empty");
        slot.classList.add("filled");
        slot.classList.toggle("auto-filled", !isManual);
        slot.dataset.interactive = isManual ? "true" : "false";
        const key = choice.toLowerCase();
        slot.style.setProperty("--chip-color", `var(--chip-${key})`);
        slot.style.setProperty("--chip-soft", `var(--chip-${key}-soft)`);
      } else {
        valueEl.textContent = valueEl.dataset.placeholder;
        valueEl.classList.add("rank-slot-value-empty");
        slot.classList.remove("filled", "auto-filled");
        slot.dataset.interactive = "false";
        slot.style.removeProperty("--chip-color");
        slot.style.removeProperty("--chip-soft");
      }
    });
  }

  function allRated(trial) {
    return ["a", "b", "c"].every(
      (pos) => trial.ratings[pos].success !== null && trial.ratings[pos].naturalness !== null
    );
  }

  function updateNextEnabled() {
    const trial = currentTrial();
    const ready = allRated(trial) && effectiveRanking(trial).length === 3;
    // DEBUG-ONLY: revert to `el.btnNext.disabled = !ready;` before release
    el.btnNext.disabled = !debugMode && !ready;
  }

  el.likertGroups.forEach((group) => {
    const pos = group.dataset.video;
    const question = group.dataset.question;
    const slider = group.querySelector(".likert-slider");
    slider.addEventListener("input", () => {
      const value = Number(slider.value);
      currentTrial().ratings[pos][question] = value;
      updateLikertDisplay(group, value);
      updateNextEnabled();
      saveState();
    });
  });

  el.rankChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const trial = currentTrial();
      const choice = chip.dataset.choice;
      if (trial.rankingManual.length >= 3 || trial.rankingManual.includes(choice)) return;
      trial.rankingManual.push(choice);
      renderRanking(trial);
      updateNextEnabled();
      saveState();
    });
  });

  el.rankSlots.forEach((slot, i) => {
    slot.addEventListener("click", () => {
      if (slot.dataset.interactive !== "true") return;
      const trial = currentTrial();
      trial.rankingManual.splice(i, 1);
      renderRanking(trial);
      updateNextEnabled();
      saveState();
    });
  });

  function pauseAllVideos() {
    [el.videoInput, el.videoA, el.videoB, el.videoC].forEach((v) => v.pause());
  }

  function recordTimeSpent() {
    if (!trialShownAt) return;
    const delta = performance.now() - trialShownAt;
    currentTrial().timeSpentMs += Math.round(delta);
    trialShownAt = 0;
  }

  el.btnNext.addEventListener("click", () => {
    const trial = currentTrial();
    const ready = allRated(trial) && effectiveRanking(trial).length === 3;
    // DEBUG-ONLY: revert to `if (!ready) return;` before release
    if (!debugMode && !ready) return;
    recordTimeSpent();
    pauseAllVideos();
    if (state.currentIndex < state.trials.length - 1) {
      state.currentIndex += 1;
      saveState();
      renderTrial();
    } else {
      finishStudy();
    }
  });

  el.btnBack.addEventListener("click", () => {
    if (state.currentIndex === 0) return;
    recordTimeSpent();
    pauseAllVideos();
    state.currentIndex -= 1;
    saveState();
    renderTrial();
  });

  function confirmRestart() {
    return window.confirm(
      "This will erase all your answers on this device and start the study over. Continue?"
    );
  }

  el.btnRestart.addEventListener("click", () => {
    if (!confirmRestart()) return;
    clearState();
    window.location.reload();
  });

  el.btnRestart2.addEventListener("click", () => {
    if (!confirmRestart()) return;
    clearState();
    window.location.reload();
  });

  /* ---------------- done screen ---------------- */

  function finishStudy() {
    state.finishedAt = new Date().toISOString();
    saveState();
    showScreen("done");
    renderSummary();
    if (state.submitted) {
      setSubmitState("success");
    } else {
      submitResponses();
    }
  }

  // Roles/ranking derivation shared between the downloadable export and
  // the DB submission — keep them in sync here.
  function computeTrialMethods(trial) {
    const methods = trial.sources.map((clip) => CLIP_METHOD[clip]); // [aMethod, bMethod, cMethod]
    const choiceIndex = { A: 0, B: 1, C: 2 };
    const ranking = effectiveRanking(trial); // ["B", "A", "C"] -> best to worst
    const rankedMethods = ranking.map((choice) => methods[choiceIndex[choice]]);
    return {
      aMethod: methods[0],
      bMethod: methods[1],
      cMethod: methods[2],
      firstChoice: ranking[0] || null,
      secondChoice: ranking[1] || null,
      thirdChoice: ranking[2] || null,
      firstMethod: rankedMethods[0] || null,
      secondMethod: rankedMethods[1] || null,
      thirdMethod: rankedMethods[2] || null
    };
  }

  function buildExportPayload() {
    return {
      sessionId: state.sessionId,
      deviceId: DEVICE_ID,
      // DEBUG-ONLY: delete this line before release (debug_mode column defaults to false in the DB)
      debugMode,
      // END DEBUG-ONLY
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      userAgent: navigator.userAgent,
      responses: state.trials.map((trial, i) => {
        const scenario = SCENARIOS.find((s) => s.slug === trial.slug);
        const {
          aMethod,
          bMethod,
          cMethod,
          firstChoice,
          secondChoice,
          thirdChoice,
          firstMethod,
          secondMethod,
          thirdMethod
        } = computeTrialMethods(trial);
        return {
          order: i + 1,
          slug: trial.slug,
          editPrompt: scenario.edit,
          aSource: trial.sources[0],
          bSource: trial.sources[1],
          cSource: trial.sources[2],
          aMethod,
          bMethod,
          cMethod,
          aSuccess: trial.ratings.a.success,
          aNaturalness: trial.ratings.a.naturalness,
          bSuccess: trial.ratings.b.success,
          bNaturalness: trial.ratings.b.naturalness,
          cSuccess: trial.ratings.c.success,
          cNaturalness: trial.ratings.c.naturalness,
          firstChoice,
          secondChoice,
          thirdChoice,
          firstMethod,
          secondMethod,
          thirdMethod,
          timeSpentMs: trial.timeSpentMs
        };
      })
    };
  }

  // Rows matching the h3_ablation_survey_responses table: one row per
  // scenario, "tidy"/long format.
  function buildSubmissionRows() {
    return state.trials.map((trial, i) => {
      const scenario = SCENARIOS.find((s) => s.slug === trial.slug);
      const {
        aMethod,
        bMethod,
        cMethod,
        firstChoice,
        secondChoice,
        thirdChoice,
        firstMethod,
        secondMethod,
        thirdMethod
      } = computeTrialMethods(trial);
      return {
        session_id: state.sessionId,
        device_id: DEVICE_ID,
        // DEBUG-ONLY: delete this line before release (debug_mode column defaults to false in the DB)
        debug_mode: debugMode,
        // END DEBUG-ONLY
        scenario_order: i + 1,
        scenario_slug: trial.slug,
        edit_prompt: scenario.edit,
        a_source: trial.sources[0],
        b_source: trial.sources[1],
        c_source: trial.sources[2],
        a_method: aMethod,
        b_method: bMethod,
        c_method: cMethod,
        a_success: trial.ratings.a.success,
        a_naturalness: trial.ratings.a.naturalness,
        b_success: trial.ratings.b.success,
        b_naturalness: trial.ratings.b.naturalness,
        c_success: trial.ratings.c.success,
        c_naturalness: trial.ratings.c.naturalness,
        first_choice: firstChoice,
        second_choice: secondChoice,
        third_choice: thirdChoice,
        first_method: firstMethod,
        second_method: secondMethod,
        third_method: thirdMethod,
        time_spent_ms: trial.timeSpentMs,
        session_started_at: state.startedAt,
        session_finished_at: state.finishedAt,
        user_agent: navigator.userAgent
      };
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setSubmitState(nextState) {
    if (!el.submitStatus) return;
    el.submitStatus.dataset.state = nextState;
    if (nextState === "submitting") {
      el.submitStatusText.textContent = "Saving your responses…";
      el.submitActions.hidden = true;
    } else if (nextState === "success") {
      el.submitStatusText.textContent = "Saved — thank you for participating!";
      el.submitActions.hidden = true;
      el.downloadHint.textContent =
        "Optional — a .zip of your results, in case you'd like a copy for yourself.";
      el.btnDownload.classList.remove("btn-primary", "btn-large");
      el.btnDownload.classList.add("btn-ghost");
    } else if (nextState === "error") {
      el.submitStatusText.textContent =
        "Couldn't save automatically — your answers are safe on this device.";
      el.submitActions.hidden = false;
      el.downloadHint.textContent =
        "Please download this file and send it to the study organizer.";
      el.btnDownload.classList.remove("btn-ghost");
      el.btnDownload.classList.add("btn-primary", "btn-large");
    }
  }

  // Plain insert (no upsert): idempotency for retries comes from the
  // unique (session_id, scenario_slug) constraint — a retried insert
  // returns 409/23505 (duplicate key), treated as success. See the main
  // study's app.js for why we don't use ?on_conflict=... here (Postgres
  // needs SELECT-level RLS visibility for ON CONFLICT DO UPDATE, which
  // we don't want to grant to anon).
  async function submitResponses() {
    setSubmitState("submitting");
    const rows = buildSubmissionRows();
    const endpoint = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`;

    for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Prefer: "return=minimal"
          },
          body: JSON.stringify(rows)
        });
        if (!res.ok && res.status !== 409) throw new Error(`HTTP ${res.status}`);
        state.submitted = true;
        saveState();
        setSubmitState("success");
        return;
      } catch (err) {
        if (attempt < MAX_SUBMIT_ATTEMPTS) {
          await sleep(attempt * 1500);
        }
      }
    }
    setSubmitState("error");
  }

  if (el.btnRetrySubmit) {
    el.btnRetrySubmit.addEventListener("click", () => submitResponses());
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  el.btnDownload.addEventListener("click", async () => {
    const payload = buildExportPayload();
    const json = JSON.stringify(payload, null, 2);
    const stamp = Date.now();

    if (window.JSZip) {
      const zip = new window.JSZip();
      zip.file(`ablation_study_results_${stamp}.json`, json);
      const blob = await zip.generateAsync({ type: "blob" });
      triggerBlobDownload(blob, `ablation_study_results_${stamp}.zip`);
    } else {
      const blob = new Blob([json], { type: "application/json" });
      triggerBlobDownload(blob, `ablation_study_results_${stamp}.json`);
    }
  });

  el.btnToggleSummary.addEventListener("click", () => {
    const hidden = el.summaryWrap.hidden;
    el.summaryWrap.hidden = !hidden;
    el.btnToggleSummary.textContent = hidden ? "Hide summary" : "Show a summary of my answers";
  });

  function renderSummary() {
    const payload = buildExportPayload();
    const rows = payload.responses
      .map(
        (r) => `<tr>
          <td>${r.order}</td>
          <td>${escapeHtml(r.slug)}</td>
          <td>${r.firstChoice} &gt; ${r.secondChoice} &gt; ${r.thirdChoice}</td>
          <td>${r.aSuccess}/${r.aNaturalness}</td>
          <td>${r.bSuccess}/${r.bNaturalness}</td>
          <td>${r.cSuccess}/${r.cNaturalness}</td>
        </tr>`
      )
      .join("");
    el.summaryTable.innerHTML = `
      <thead>
        <tr><th>#</th><th>Scenario</th><th>Ranking</th><th>A (succ/nat)</th><th>B (succ/nat)</th><th>C (succ/nat)</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    `;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }
})();
