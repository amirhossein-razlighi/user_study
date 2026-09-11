# Modality Ablation Study

Sibling of the main study one level up ([../README.md](../README.md)) — same
theme, same infrastructure, same conventions. Compares three guidance
setups for the video edit: **audio-only**, **text-only**, and **both**,
across 12 of the 16 scenarios in `../ablation/` (`gen_frog_jumps`,
`gen_koi_pond`, `gen_sealion`, and `gen_woman_desk` were dropped from this
study by request).

`car_door_opens`'s "both" video (here and in the main study) is
`B_candidate_iter03_av.mp4` from `../user_study/car_door_opens/` — the
same file in both places, not each study's own `both`/iter-4 render.

Live at `https://amirhossein-razlighi.github.io/user_study/ablation/`.

## What's different from the main study

- **Three videos per scenario, not two.** Options A/B/C are `clip1`/
  `clip2`/`clip3`, blinded the same way (neutral file names, on-screen
  position independently randomized per scenario per participant via
  `shuffledClips()`). Which physical clip is which method is fixed
  globally in `assets/js/app.js` (`CLIP_METHOD`), not per scenario.
  Scenario order is also shuffled per participant (`shuffledSlugOrder()`)
  — same randomization pattern as the main study.
- **Ratings instead of a checkbox.** Each video gets two 1–5 Likert
  ratings — **edit success** ("how well does it perform the edit?") and
  **motion naturalness** — instead of the main study's binary "task
  accomplished" checkbox. Each rating is five discrete tap buttons
  (`.likert-btn`, not a slider — a slider's thumb sitting at a ghosted
  midpoint made it too easy to mistake an untouched rating for a real
  "3", which is exactly what happened in testing), colored red (1,
  worst) → green (5, best) once tapped; the underlying value stays
  `null` until one is (`updateLikertDisplay()` in `app.js`), so an
  unanswered rating never gets silently submitted as a real answer. A
  `next-hint` banner also lists every still-missing rating/ranking by
  name when "Next" is disabled, since six sliders (er, buttons) plus a
  ranking is easy to lose track of otherwise.
  Then a full ranking, best to worst, via **tap-to-rank**: tap a video
  card in the "Pending" row and it drops into the next open slot
  (1st/2nd/3rd); once two are placed the third fills in automatically
  (only one choice left); tap a filled slot to undo it (`renderRanking()`
  in `app.js`). No literal drag-and-drop — this gets the same visual
  outcome as a full mockup with a pending pool + ranked slots, without
  the reliability issues free-form dragging tends to have on mobile.
  `trial.rankingManual` (explicit taps) and `effectiveRanking()` (that
  plus the auto-completed 3rd) are kept separate so undoing a tap always
  has an unambiguous effect.
- **"Play all together" mode**, extended to three videos (see the main
  study's README for the two-video version — same architecture: video A
  is the sync clock, B and C are corrected back into line past ~150ms of
  drift, all three muted while in this mode since the study never judges
  audio). Done screen's summary also gained a win-stats section: % of
  scenarios each method (audio-only/text-only/both) was ranked #1, plus
  its average edit-success and motion-naturalness rating, pooled across
  whichever on-screen position it happened to be shown at
  (`computeBestPickPct()`/`computeMethodAverages()` in `app.js`) — shown
  only if the participant taps to expand the summary.
- **Own Supabase table**: `public.h3_ablation_survey_responses`, plus two
  helper views — `h3_ablation_ratings_by_method` (long-format: one row
  per session/scenario/method, with a `rank` 1–3 column, so
  `avg(success)`/`avg(naturalness)`/`avg(rank)`/win-rate are all plain
  `GROUP BY` queries) and `h3_ablation_repeat_devices` (same
  repeat-submission-detection pattern as the main study). None of this
  touches `h3_main_experiment_survey_responses` or the project's other
  tables. Same submission flow as the main study (see
  [../README.md](../README.md#database-supabase)) — including the
  pre-flight `firstIncompleteTrialIndex()` check (adapted here to check
  `allRated()` + a full `effectiveRanking()` per trial instead of a single
  `choice`) that shows "You have unanswered scenarios!" with a jump-back
  button instead of a generic error, for the case debug view makes
  possible: an incomplete trial reaching the done screen.
- **Own `localStorage` key** (`ablation_study_v1`) so progress doesn't
  collide with the main study's (`video_study_v1`) — both pages share an
  origin (`github.io`), just different paths. `device_id`
  (`video_study_device_id_v1`) is intentionally the *same* key as the
  main study's: one browser gets one consistent anonymous id across both
  studies.
- **Shares the root stylesheet.** `index.html` loads
  `../assets/css/style.css` (the main study's theme/tokens) plus a small
  `assets/css/ablation.css` for what's unique here: the Likert slider, a
  1-column 3-video stack (`.options-grid-3` — a 2-up grid doesn't fit 3
  taller cards well), and the tap-to-rank widget.

## Debug view (temporary, remove before release)

Same pattern as the main study — see
[../README.md#debug-view-temporary-remove-before-release](../README.md#debug-view-temporary-remove-before-release)
for the general explanation, including that debug-mode completions no
longer auto-submit: the done screen shows "You're in debug mode — still
submit responses?" instead, requiring an explicit tap
(`state.debugMode`/the `"debug-confirm"` submit-status branch in
`app.js`). Run `grep -rn "DEBUG-ONLY" ablation/` to find every spot in
this sub-study before release.

## Adding more scenarios

12 of the 16 scenarios in `../ablation/` are live here (see the exclusions
noted above). If more scenarios show up there later, or one of the
excluded ones should come back, once a scenario has all three of `both/`,
`text_only/`, `audio_only/` populated:

```bash
slug=<slug>
cp "../user_study/$slug/source_input_av.mp4" "assets/videos/$slug/input.mp4"
cp "../ablation/$slug/audio_only/B_audio_only_best_av.mp4" "assets/videos/$slug/clip1.mp4"
cp "../ablation/$slug/text_only/B_text_only_best_av.mp4"  "assets/videos/$slug/clip2.mp4"
cp "../ablation/$slug/both/B_both_av.mp4"                 "assets/videos/$slug/clip3.mp4"
for f in input clip1 clip2 clip3; do
  ffmpeg -y -ss 0.6 -i "assets/videos/$slug/$f.mp4" -frames:v 1 -vf scale=480:-1 -q:v 5 "assets/posters/$slug/$f.jpg"
done
```

then add an entry to `data/scenarios.js` (slug, edit, highlights — copy the
highlight phrases from the main study's `../data/scenarios.js` if the
scenario already exists there) and bump the `?v=N` cache-busting numbers
in `index.html`.
