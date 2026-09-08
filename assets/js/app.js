/* Video editing A/B user study — front end only (no backend yet).
 *
 * Progress and answers are kept in localStorage so a participant can close
 * the tab and resume later. At the end, results are exported as a single
 * JSON file the participant downloads and sends back to the study
 * organizer. `buildExportPayload()` is the single place that shapes that
 * payload — wire a real submission (fetch/POST, Supabase, etc.) around its
 * result when the backend is ready.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "video_study_v1";

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
      participantId: "",
      startedAt: null,
      finishedAt: null,
      currentIndex: 0,
      trials
    };
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
    participantId: document.getElementById("participant-id"),
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

    btnDownload: document.getElementById("btn-download"),
    btnToggleSummary: document.getElementById("btn-toggle-summary"),
    summaryWrap: document.getElementById("summary-wrap"),
    summaryTable: document.getElementById("summary-table"),
    btnRestart2: document.getElementById("btn-restart-2")
  };

  let trialShownAt = 0;

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
  if (savedState && savedState.startedAt && !savedState.finishedAt) {
    el.btnResume.hidden = false;
    el.btnResume.addEventListener("click", () => {
      state = savedState;
      el.participantId.value = state.participantId || "";
      showScreen("trial");
      renderTrial();
    });
  }

  el.btnStart.addEventListener("click", () => {
    state = freshState();
    state.participantId = el.participantId.value.trim();
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

  function renderTrial() {
    const trial = currentTrial();
    const scenario = currentScenario();

    el.progressLabel.textContent = `Scenario ${state.currentIndex + 1} of ${state.trials.length}`;
    el.progressFill.style.width = `${((state.currentIndex) / state.trials.length) * 100}%`;

    el.editPrompt.textContent = scenario.edit;

    setVideoSource(el.videoInput, scenario.slug, "input");
    setVideoSource(el.videoA, scenario.slug, trial.aSource);
    setVideoSource(el.videoB, scenario.slug, trial.bSource);

    el.checkA.checked = !!trial.accomplishedA;
    el.checkB.checked = !!trial.accomplishedB;

    setChoiceUI(trial.choice);

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
    el.btnNext.disabled = !currentTrial().choice;
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
    if (!currentTrial().choice) return;
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
  }

  function buildExportPayload() {
    return {
      participantId: state.participantId || null,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      userAgent: navigator.userAgent,
      responses: state.trials.map((trial, i) => {
        const scenario = SCENARIOS.find((s) => s.slug === trial.slug);
        const aRole = trial.aSource === scenario.baselineClip ? "baseline" : "ours";
        const bRole = trial.bSource === scenario.baselineClip ? "baseline" : "ours";
        const choiceRole =
          trial.choice === "tie" ? "tie" : trial.choice === "A" ? aRole : bRole;
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
          preferredMethod: choiceRole,
          timeSpentMs: trial.timeSpentMs
        };
      })
    };
  }

  el.btnDownload.addEventListener("click", () => {
    const payload = buildExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const idPart = payload.participantId ? `_${slugify(payload.participantId)}` : "";
    a.href = url;
    a.download = `video_study_results${idPart}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

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
