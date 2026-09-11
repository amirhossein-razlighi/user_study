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
        choice: null, // "A" | "B" | "tie" -- overall
        naturalnessChoice: null, // "A" | "B" | "tie" -- which looks more natural
        strengthChoice: null, // "A" | "B" | "tie" -- which motion is stronger/clearer
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

    modeIndividualBtn: document.getElementById("mode-individual-btn"),
    modeTogetherBtn: document.getElementById("mode-together-btn"),
    syncBar: document.getElementById("sync-bar"),
    syncPlayBtn: document.getElementById("sync-play-btn"),
    syncIconPlay: document.querySelector("#sync-play-btn .sync-icon-play"),
    syncIconPause: document.querySelector("#sync-play-btn .sync-icon-pause"),
    syncScrub: document.getElementById("sync-scrub"),
    syncTime: document.getElementById("sync-time"),

    btnBack: document.getElementById("btn-back"),
    btnNext: document.getElementById("btn-next"),

    submitStatus: document.getElementById("submit-status"),
    submitStatusText: document.getElementById("submit-status-text"),
    submitActions: document.getElementById("submit-actions"),
    btnRetrySubmit: document.getElementById("btn-retry-submit"),
    btnGoToIncomplete: document.getElementById("btn-go-to-incomplete"),
    downloadHint: document.getElementById("download-hint"),

    btnDownload: document.getElementById("btn-download"),
    btnToggleSummary: document.getElementById("btn-toggle-summary"),
    summaryWrap: document.getElementById("summary-wrap"),
    winStats: document.getElementById("win-stats"),
    summaryTable: document.getElementById("summary-table"),
    btnRestart2: document.getElementById("btn-restart-2"),

    // DEBUG-ONLY: delete these three lines before release
    debugToggle: document.getElementById("debug-toggle"),
    debugBadgeA: document.getElementById("debug-badge-a"),
    debugBadgeB: document.getElementById("debug-badge-b")
  };

  // Each trial has three independent A/B/tie questions; a fieldset's
  // `data-question` says which trial field its buttons write to.
  const QUESTION_FIELD = {
    overall: "choice",
    natural: "naturalnessChoice",
    strength: "strengthChoice"
  };

  const choiceGroups = Array.from(
    document.querySelectorAll(".choice-fieldset[data-question]")
  ).map((fieldset) => ({
    field: QUESTION_FIELD[fieldset.dataset.question],
    buttons: Array.from(fieldset.querySelectorAll(".choice-btn"))
  }));

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

  /* ---------------- synced side-by-side playback ----------------
   * Default is each video's own native controls ("individual"). "Together"
   * mode hides those and drives both videos from one shared play button +
   * scrub bar, so participants can watch them in lockstep or drag to a
   * specific frame in both at once — useful when the edit is subtle.
   * Video A is the sync clock: B's currentTime is nudged back in line
   * whenever it drifts more than ~150ms, since browsers don't guarantee
   * two independently-playing <video> elements stay frame-synced.
   */

  let compareMode = "individual"; // "individual" | "together"

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function syncDuration() {
    const a = el.videoA.duration;
    const b = el.videoB.duration;
    if (isFinite(a) && a > 0) return a;
    if (isFinite(b) && b > 0) return b;
    return 0;
  }

  // Toggle via setAttribute/removeAttribute, not the `.hidden` IDL property:
  // on <svg> elements that property silently fails to reflect to the actual
  // attribute in some engines (a real, longstanding SVG-vs-HTML DOM
  // inconsistency), so `svgEl.hidden = true` can be a no-op. Attribute
  // methods work correctly on every element type.
  function setIconHidden(iconEl, isHidden) {
    if (isHidden) iconEl.setAttribute("hidden", "");
    else iconEl.removeAttribute("hidden");
  }

  function setSyncPlaying(playing) {
    el.syncPlayBtn.setAttribute("aria-label", playing ? "Pause both videos" : "Play both videos");
    setIconHidden(el.syncIconPlay, playing);
    setIconHidden(el.syncIconPause, !playing);
  }

  function updateSyncScrubFromVideoA() {
    if (compareMode !== "together") return;
    const duration = syncDuration();
    const fraction = duration > 0 ? el.videoA.currentTime / duration : 0;
    el.syncScrub.value = String(Math.round(fraction * 1000));
    el.syncTime.textContent = `${formatTime(el.videoA.currentTime)} / ${formatTime(duration)}`;
    const durationB = isFinite(el.videoB.duration) ? el.videoB.duration : duration;
    const targetB = fraction * durationB;
    if (Math.abs(el.videoB.currentTime - targetB) > 0.15) {
      el.videoB.currentTime = targetB;
    }
  }

  function seekBothTo(fraction) {
    const durationA = isFinite(el.videoA.duration) ? el.videoA.duration : 0;
    const durationB = isFinite(el.videoB.duration) ? el.videoB.duration : 0;
    el.videoA.currentTime = fraction * durationA;
    el.videoB.currentTime = fraction * durationB;
    el.syncTime.textContent = `${formatTime(fraction * durationA)} / ${formatTime(syncDuration())}`;
  }

  function resetSyncBarForNewTrial() {
    el.videoA.pause();
    el.videoB.pause();
    setSyncPlaying(false);
    el.syncScrub.value = "0";
    el.syncTime.textContent = "0:00 / 0:00";
    el.videoA.controls = compareMode === "individual";
    el.videoB.controls = compareMode === "individual";
    el.videoA.muted = compareMode === "together";
    el.videoB.muted = compareMode === "together";
  }

  // Safe wrapper: play() returns a promise that can reject (autoplay
  // policy, media not ready yet) — every engine surfaces that a little
  // differently, so swallow it rather than let it surface as an unhandled
  // rejection in the console.
  function safePlay(videoEl) {
    const p = videoEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  function setCompareMode(mode) {
    compareMode = mode;
    const together = mode === "together";
    el.modeIndividualBtn.classList.toggle("is-active", !together);
    el.modeTogetherBtn.classList.toggle("is-active", together);
    el.modeIndividualBtn.setAttribute("aria-selected", together ? "false" : "true");
    el.modeTogetherBtn.setAttribute("aria-selected", together ? "true" : "false");
    el.syncBar.hidden = !together;
    el.videoA.pause();
    el.videoB.pause();
    setSyncPlaying(false);
    el.videoA.controls = !together;
    el.videoB.controls = !together;
    // Two clips playing at once would otherwise overlap their audio into
    // noise — muted in "together" mode since the study only asks
    // participants to judge motion, never audio (see the welcome screen's
    // audio note). Individual mode keeps native controls, unmuted as before.
    el.videoA.muted = together;
    el.videoB.muted = together;
    if (together) {
      el.syncScrub.value = "0";
      updateSyncScrubFromVideoA();
    }
  }

  el.modeIndividualBtn.addEventListener("click", () => setCompareMode("individual"));
  el.modeTogetherBtn.addEventListener("click", () => setCompareMode("together"));

  el.syncPlayBtn.addEventListener("click", () => {
    if (el.videoA.paused) {
      safePlay(el.videoA);
      safePlay(el.videoB);
      setSyncPlaying(true);
    } else {
      el.videoA.pause();
      el.videoB.pause();
      setSyncPlaying(false);
    }
  });

  el.syncScrub.addEventListener("input", () => {
    el.videoA.pause();
    el.videoB.pause();
    setSyncPlaying(false);
    seekBothTo(Number(el.syncScrub.value) / 1000);
  });

  el.videoA.addEventListener("timeupdate", updateSyncScrubFromVideoA);
  el.videoA.addEventListener("loadedmetadata", updateSyncScrubFromVideoA);
  // Only "ended" here, not "pause": with native controls hidden in
  // together mode, playback ending on its own is the only way A can stop
  // outside of our own play/pause button — and a video's "pause" event is
  // fired via a queued task (not synchronously), so listening for it here
  // risked catching our *own* setCompareMode()-triggered pause() after a
  // later play(), clobbering the play button's state right after a click.
  el.videoA.addEventListener("ended", () => {
    if (compareMode === "together") {
      el.videoB.pause();
      setSyncPlaying(false);
    }
  });

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
    resetSyncBarForNewTrial();

    el.checkA.checked = !!trial.accomplishedA;
    el.checkB.checked = !!trial.accomplishedB;

    setChoiceUI(trial);

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

  function setChoiceUI(trial) {
    choiceGroups.forEach((group) => {
      const value = trial[group.field];
      group.buttons.forEach((btn) => {
        const selected = btn.dataset.choice === value;
        btn.classList.toggle("selected", selected);
        btn.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    });
  }

  // All three A/B/tie questions (overall, naturalness, strength) must be
  // answered, not just the overall one.
  function trialIsComplete(trial) {
    return !!(trial.choice && trial.naturalnessChoice && trial.strengthChoice);
  }

  function updateNextEnabled() {
    // DEBUG-ONLY: revert to `el.btnNext.disabled = !trialIsComplete(currentTrial());` before release
    el.btnNext.disabled = !debugMode && !trialIsComplete(currentTrial());
  }

  el.checkA.addEventListener("change", () => {
    currentTrial().accomplishedA = el.checkA.checked;
    saveState();
  });

  el.checkB.addEventListener("change", () => {
    currentTrial().accomplishedB = el.checkB.checked;
    saveState();
  });

  choiceGroups.forEach((group) => {
    group.buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        currentTrial()[group.field] = btn.dataset.choice;
        setChoiceUI(currentTrial());
        updateNextEnabled();
        saveState();
      });
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
    // DEBUG-ONLY: revert to `if (!trialIsComplete(currentTrial())) return;` before release
    if (!debugMode && !trialIsComplete(currentTrial())) return;
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

  // aRole/bRole/preferredMethod (and the naturalness/strength equivalents)
  // are derived the same way for both the downloadable export and the DB
  // submission — keep them in sync here.
  function computeTrialRoles(trial, scenario) {
    const aRole = trial.aSource === scenario.baselineClip ? "baseline" : "ours";
    const bRole = trial.bSource === scenario.baselineClip ? "baseline" : "ours";
    const decode = (choice) =>
      choice === "tie" ? "tie" : choice === "A" ? aRole : bRole;
    return {
      aRole,
      bRole,
      preferredMethod: decode(trial.choice),
      preferredNatural: decode(trial.naturalnessChoice),
      preferredStrength: decode(trial.strengthChoice)
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
        const { aRole, bRole, preferredMethod, preferredNatural, preferredStrength } =
          computeTrialRoles(trial, scenario);
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
          naturalnessChoice: trial.naturalnessChoice,
          preferredNatural,
          strengthChoice: trial.strengthChoice,
          preferredStrength,
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
      const { aRole, bRole, preferredMethod, preferredNatural, preferredStrength } =
        computeTrialRoles(trial, scenario);
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
        naturalness_choice: trial.naturalnessChoice,
        preferred_natural: preferredNatural,
        strength_choice: trial.strengthChoice,
        preferred_strength: preferredStrength,
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

  // Index of the first trial missing a choice, or -1 if every trial is
  // complete. Normally impossible to reach the done screen with an
  // incomplete trial (Next requires it) — but debug view deliberately
  // bypasses that check, and the DB's NOT NULL `choice` column will
  // reject an incomplete row outright. Checking this client-side first
  // means we can say exactly what's wrong instead of surfacing the
  // resulting 400 as a generic "couldn't save" error.
  function firstIncompleteTrialIndex() {
    for (let i = 0; i < state.trials.length; i++) {
      if (!trialIsComplete(state.trials[i])) return i;
    }
    return -1;
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
      el.btnRetrySubmit.hidden = false;
      el.btnGoToIncomplete.hidden = true;
      el.downloadHint.textContent =
        "Please download this file and send it to the study organizer.";
      el.btnDownload.classList.remove("btn-ghost");
      el.btnDownload.classList.add("btn-primary", "btn-large");
    } else if (nextState === "incomplete") {
      el.submitStatusText.textContent =
        "You have unanswered scenarios! Go back and fill them in.";
      el.submitActions.hidden = false;
      el.btnRetrySubmit.hidden = true;
      el.btnGoToIncomplete.hidden = false;
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
    if (firstIncompleteTrialIndex() !== -1) {
      setSubmitState("incomplete");
      return;
    }

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

  if (el.btnGoToIncomplete) {
    el.btnGoToIncomplete.addEventListener("click", () => {
      const idx = firstIncompleteTrialIndex();
      if (idx === -1) return;
      state.currentIndex = idx;
      saveState();
      showScreen("trial");
      renderTrial();
    });
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

  // Counts how often each field ("baseline" | "ours" | "tie") won across
  // all responses, as percentages of the total. Purely a personal recap
  // shown on-demand after the study is finished — never seen mid-study,
  // so it can't bias later answers.
  function computeWinRate(responses, field) {
    const total = responses.length;
    const ours = responses.filter((r) => r[field] === "ours").length;
    const baseline = responses.filter((r) => r[field] === "baseline").length;
    const tie = total - ours - baseline;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    return { oursPct: pct(ours), baselinePct: pct(baseline), tiePct: pct(tie) };
  }

  function renderWinStats(payload) {
    const rows = [
      { label: "Overall winner", field: "preferredMethod" },
      { label: "More natural motion", field: "preferredNatural" },
      { label: "Stronger motion", field: "preferredStrength" }
    ];
    el.winStats.innerHTML = rows
      .map(({ label, field }) => {
        const { oursPct, baselinePct, tiePct } = computeWinRate(payload.responses, field);
        return `
          <div class="win-stat">
            <p class="win-stat-label">${label}</p>
            <div class="win-stat-bar">
              <span class="win-stat-seg win-stat-ours" style="width:${oursPct}%"></span>
              <span class="win-stat-seg win-stat-baseline" style="width:${baselinePct}%"></span>
              <span class="win-stat-seg win-stat-tie" style="width:${tiePct}%"></span>
            </div>
            <p class="win-stat-legend">
              <span><i class="win-dot win-dot-ours"></i>Ours ${oursPct}%</span>
              <span><i class="win-dot win-dot-baseline"></i>Baseline ${baselinePct}%</span>
              <span><i class="win-dot win-dot-tie"></i>Tie ${tiePct}%</span>
            </p>
          </div>
        `;
      })
      .join("");
  }

  function renderSummary() {
    const payload = buildExportPayload();
    renderWinStats(payload);
    const rows = payload.responses
      .map(
        (r) => `<tr>
          <td>${r.order}</td>
          <td>${escapeHtml(r.slug)}</td>
          <td>${r.choice === "tie" ? "Tie" : r.choice}</td>
          <td>${r.naturalnessChoice === "tie" ? "Tie" : r.naturalnessChoice}</td>
          <td>${r.strengthChoice === "tie" ? "Tie" : r.strengthChoice}</td>
          <td>${r.accomplishedA ? "&check;" : "&mdash;"}</td>
          <td>${r.accomplishedB ? "&check;" : "&mdash;"}</td>
        </tr>`
      )
      .join("");
    el.summaryTable.innerHTML = `
      <thead>
        <tr><th>#</th><th>Scenario</th><th>Overall</th><th>Natural</th><th>Stronger</th><th>A ok</th><th>B ok</th></tr>
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
