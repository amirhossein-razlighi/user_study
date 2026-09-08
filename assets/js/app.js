/* Video editing A/B user study.
 *
 * Progress and answers are kept in localStorage so a participant can close
 * the tab and resume later. On the done screen, the full set of answers is
 * submitted to Supabase in a single request (see submitResponses()); a
 * status indicator shows the in-flight/success/failure state, with
 * automatic retries and a manual "Try again". `buildExportPayload()` /
 * the "Download results" button remain as a manual backup path if the
 * automatic submission can't get through.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "video_study_v1";
  // Separate from STORAGE_KEY on purpose: this must survive "Start over"
  // (which clears STORAGE_KEY) so repeat submissions from the same
  // browser can still be detected later. See DEVICE_ID below.
  const DEVICE_ID_STORAGE_KEY = "video_study_device_id_v1";

  // Anon/publishable key: safe to ship in client code by design — RLS on
  // this table only allows the anon role to INSERT, never read/update/
  // delete, so this key can't expose or tamper with anyone's data.
  const SUPABASE_URL = "https://guamrqujwnfejkvsrcar.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1YW1ycXVqd25mZWprdnNyY2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MTMxMzIsImV4cCI6MjA5MzM4OTEzMn0.UukpujziUjhZA16Wcx1lF2Pzh8Yhasz0fGYWENuRYRs";
  const SUPABASE_TABLE = "h3_main_experiment_survey_responses";
  const MAX_SUBMIT_ATTEMPTS = 3;

  /* ---------------- state ---------------- */

  let state = null;

  function freshState() {
    const order = shuffledSlugOrder();
    const trials = order.map((slug) => {
      const scenario = SCENARIOS.find((s) => s.slug === slug);
      const swapped = Math.random() < 0.5;
      const aSource = swapped ? otherClip(scenario.baselineClip) : scenario.baselineClip;
      const bSource = otherClip(aSource);
      return {
        slug,
        aSource,
        bSource,
        accomplishedA: false,
        accomplishedB: false,
        choice: null, // "A" | "B" | "tie"
        visited: false,
        timeSpentMs: 0
      };
    });
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
    // Fallback UUID v4 for browsers without crypto.randomUUID (rare, but cheap to cover)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // A random id generated once per browser and kept in its own
  // localStorage key so it outlives "Start over" (which wipes the study
  // progress key). Not personal data — it identifies a browser, not a
  // person — but it lets the same-browser case ("did this person submit
  // more than once?") be checked later during data cleaning, which
  // session_id alone (regenerated every run) can't do.
  function getOrCreateDeviceId() {
    try {
      const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (existing) return existing;
      const created = createUuid();
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
      return created;
    } catch (e) {
      // localStorage unavailable — fall back to a per-load id; it just
      // won't be able to catch repeats for this participant.
      return createUuid();
    }
  }

  const DEVICE_ID = getOrCreateDeviceId();

  // Patches in sessionId/submitted for a state saved before this feature
  // existed, so old resumed/finished sessions still work.
  function ensureSessionFields(s) {
    if (!s.sessionId) s.sessionId = createSessionId();
    if (typeof s.submitted !== "boolean") s.submitted = false;
  }

  function otherClip(clip) {
    return clip === "clip1" ? "clip2" : "clip1";
  }

  function shuffledSlugOrder() {
    const slugs = SCENARIOS.map((s) => s.slug);
    for (let i = slugs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slugs[i], slugs[j]] = [slugs[j], slugs[i]];
    }
    return slugs;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.trials) || parsed.trials.length !== SCENARIOS.length) {
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

    checkA: document.getElementById("check-a"),
    checkB: document.getElementById("check-b"),

    choiceBtns: Array.from(document.querySelectorAll(".choice-btn")),

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

    // DEBUG-ONLY: delete these three lines before release
    debugToggle: document.getElementById("debug-toggle"),
    debugBadgeA: document.getElementById("debug-badge-a"),
    debugBadgeB: document.getElementById("debug-badge-b")
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
  // Also covers a state saved before `submitted` existed (old finished
  // session that never got a chance to auto-submit) — treat as unsubmitted.
  const hasUnsubmittedFinished = !!(savedState && savedState.finishedAt && savedState.submitted !== true);

  if (hasUnsubmittedFinished) {
    // They already answered everything last time; just get them back to
    // the done screen so the pending submission can retry, no need to
    // replay the welcome screen or any trials.
    state = savedState;
    ensureSessionFields(state);
    saveState();
    showScreen("done");
    renderSummary();
    submitResponses();
  } else if (hasResumable) {
    const answeredCount = savedState.trials.filter((t) => t.choice).length;

    // A returning participant with in-progress answers is the primary path:
    // make "Resume" the prominent button and downgrade "begin" to a clearly
    // secondary, explicitly-destructive action so progress isn't lost by
    // accident.
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

  // Wraps `scenario.highlights` phrases (exact substrings of `edit`) in a
  // <mark> so participants notice the specific motion being judged.
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

  function renderTrial() {
    const trial = currentTrial();
    const scenario = currentScenario();

    el.progressLabel.textContent = `Scenario ${state.currentIndex + 1} of ${state.trials.length}`;
    el.progressFill.style.width = `${((state.currentIndex) / state.trials.length) * 100}%`;

    el.editPrompt.innerHTML = highlightEditText(scenario.edit, scenario.highlights);

    setVideoSource(el.videoInput, scenario.slug, "input");
    setVideoSource(el.videoA, scenario.slug, trial.aSource);
    setVideoSource(el.videoB, scenario.slug, trial.bSource);

    el.checkA.checked = !!trial.accomplishedA;
    el.checkB.checked = !!trial.accomplishedB;

    setChoiceUI(trial.choice);

    // DEBUG-ONLY: delete this block before release
    if (el.debugBadgeA && el.debugBadgeB) {
      const aRole = trial.aSource === scenario.baselineClip ? "baseline" : "ours";
      const bRole = trial.bSource === scenario.baselineClip ? "baseline" : "ours";
      el.debugBadgeA.hidden = !debugMode;
      el.debugBadgeB.hidden = !debugMode;
      el.debugBadgeA.textContent = aRole;
      el.debugBadgeB.textContent = bRole;
    }
    // END DEBUG-ONLY

    el.btnBack.disabled = state.currentIndex === 0;
    updateNextEnabled();

    trial.visited = true;
    trialShownAt = performance.now();
  }

  function setChoiceUI(choice) {
    el.choiceBtns.forEach((btn) => {
      const selected = btn.dataset.choice === choice;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function updateNextEnabled() {
    // DEBUG-ONLY: revert to `el.btnNext.disabled = !currentTrial().choice;` before release
    el.btnNext.disabled = !debugMode && !currentTrial().choice;
  }

  el.checkA.addEventListener("change", () => {
    currentTrial().accomplishedA = el.checkA.checked;
    saveState();
  });

  el.checkB.addEventListener("change", () => {
    currentTrial().accomplishedB = el.checkB.checked;
    saveState();
  });

  el.choiceBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTrial().choice = btn.dataset.choice;
      setChoiceUI(btn.dataset.choice);
      updateNextEnabled();
      saveState();
    });
  });

  function pauseAllVideos() {
    [el.videoInput, el.videoA, el.videoB].forEach((v) => v.pause());
  }

  function recordTimeSpent() {
    if (!trialShownAt) return;
    const delta = performance.now() - trialShownAt;
    currentTrial().timeSpentMs += Math.round(delta);
    trialShownAt = 0;
  }

  el.btnNext.addEventListener("click", () => {
    // DEBUG-ONLY: revert to `if (!currentTrial().choice) return;` before release
    if (!debugMode && !currentTrial().choice) return;
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

  // aRole/bRole/preferredMethod are derived the same way for both the
  // downloadable export and the DB submission — keep them in sync here.
  function computeTrialRoles(trial, scenario) {
    const aRole = trial.aSource === scenario.baselineClip ? "baseline" : "ours";
    const bRole = trial.bSource === scenario.baselineClip ? "baseline" : "ours";
    const preferredMethod =
      trial.choice === "tie" ? "tie" : trial.choice === "A" ? aRole : bRole;
    return { aRole, bRole, preferredMethod };
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
        const { aRole, bRole, preferredMethod } = computeTrialRoles(trial, scenario);
        return {
          order: i + 1,
          slug: trial.slug,
          editPrompt: scenario.edit,
          aSource: trial.aSource,
          bSource: trial.bSource,
          aRole,
          bRole,
          accomplishedA: trial.accomplishedA ? 1 : 0,
          accomplishedB: trial.accomplishedB ? 1 : 0,
          choice: trial.choice,
          preferredMethod,
          timeSpentMs: trial.timeSpentMs
        };
      })
    };
  }

  // Rows matching the h3_main_experiment_survey_responses table: one row
  // per scenario, "tidy"/long format so per-scenario and overall metrics
  // are plain GROUP BY queries on the DB side.
  function buildSubmissionRows() {
    return state.trials.map((trial, i) => {
      const scenario = SCENARIOS.find((s) => s.slug === trial.slug);
      const { aRole, bRole, preferredMethod } = computeTrialRoles(trial, scenario);
      return {
        session_id: state.sessionId,
        device_id: DEVICE_ID,
        // DEBUG-ONLY: delete this line before release (debug_mode column defaults to false in the DB)
        debug_mode: debugMode,
        // END DEBUG-ONLY
        scenario_order: i + 1,
        scenario_slug: trial.slug,
        edit_prompt: scenario.edit,
        a_source: trial.aSource,
        b_source: trial.bSource,
        a_role: aRole,
        b_role: bRole,
        accomplished_a: !!trial.accomplishedA,
        accomplished_b: !!trial.accomplishedB,
        choice: trial.choice,
        preferred_method: preferredMethod,
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

  // POSTs all rows for this session in one request (plain insert — no
  // upsert). Idempotency for retries comes from the unique
  // (session_id, scenario_slug) constraint instead: if this session's
  // rows already made it in on a prior attempt whose response we never
  // saw, Postgres returns 409/23505 (duplicate key), which we treat as
  // success rather than an error.
  //
  // (We tried an upsert via ?on_conflict=... + Prefer: resolution=
  // merge-duplicates first, but Postgres requires SELECT-level RLS
  // visibility to evaluate ON CONFLICT DO UPDATE even when nothing
  // conflicts yet — granting anon SELECT would let anyone read every
  // submission, which we don't want. Plain insert + 409-as-success gets
  // the same idempotency without widening anon past insert-only.)
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
      zip.file(`video_study_results_${stamp}.json`, json);
      const blob = await zip.generateAsync({ type: "blob" });
      triggerBlobDownload(blob, `video_study_results_${stamp}.zip`);
    } else {
      // JSZip failed to load (e.g. offline) — fall back to plain JSON
      // rather than leaving the button dead.
      const blob = new Blob([json], { type: "application/json" });
      triggerBlobDownload(blob, `video_study_results_${stamp}.json`);
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
          <td>${r.choice === "tie" ? "Tie" : r.choice}</td>
          <td>${r.accomplishedA ? "&check;" : "&mdash;"}</td>
          <td>${r.accomplishedB ? "&check;" : "&mdash;"}</td>
        </tr>`
      )
      .join("");
    el.summaryTable.innerHTML = `
      <thead>
        <tr><th>#</th><th>Scenario</th><th>Choice</th><th>A ok</th><th>B ok</th></tr>
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
