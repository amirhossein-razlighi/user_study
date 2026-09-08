# Modality Ablation Study

Sibling of the main study one level up ([../README.md](../README.md)) — same
theme, same infrastructure, same conventions. Compares three guidance
setups for the video edit: **audio-only**, **text-only**, and **both**,
across 7 scenarios (of the 16 in `../ablation/`; the rest are missing one
or both non-`both` variants and can be added later the same way).

Live at `https://amirhossein-razlighi.github.io/user_study/ablation/`.

## What's different from the main study

- **Three videos per scenario, not two.** Options A/B/C are `clip1`/
  `clip2`/`clip3`, blinded the same way (neutral file names, on-screen
  position independently randomized per scenario per participant). Which
  physical clip is which method is fixed globally in `assets/js/app.js`
  (`CLIP_METHOD`), not per scenario.
- **Ratings instead of a checkbox.** Each video gets two 1–5 Likert
  ratings — **edit success** ("how well does it perform the edit?") and
  **motion naturalness** — instead of the main study's binary "task
  accomplished" checkbox. Each rating is a slider (`.likert-slider`) with
  a red (1, worst) → green (5, best) gradient track; the thumb starts
  ghosted at the midpoint (not a real "3") until the participant actually
  drags it — `updateLikertDisplay()` in `app.js` tracks that via a
  `.touched` class, separate from the underlying `null` rating value, so
  an untouched slider never gets silently submitted as a real answer.
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
- **Own Supabase table**: `public.h3_ablation_survey_responses`, plus two
  helper views — `h3_ablation_ratings_by_method` (long-format: one row
  per session/scenario/method, with a `rank` 1–3 column, so
  `avg(success)`/`avg(naturalness)`/`avg(rank)`/win-rate are all plain
  `GROUP BY` queries) and `h3_ablation_repeat_devices` (same
  repeat-submission-detection pattern as the main study). None of this
  touches `h3_main_experiment_survey_responses` or the project's other
  tables.
- **Own `localStorage` key** (`ablation_study_v1`) so progress doesn't
  collide with the main study's (`video_study_v1`) — both pages share an
  origin (`github.io`), just different paths. `device_id`
  (`video_study_device_id_v1`) is intentionally the *same* key as the
  main study's: one browser gets one consistent anonymous id across both
  studies.
- **Shares the root stylesheet.** `index.html` loads
  `../assets/css/style.css` (the main study's theme/tokens) plus a small
  `assets/css/ablation.css` for what's unique here: the Likert widget, a
  1-column 3-video stack (`.options-grid-3` — a 2-up grid doesn't fit 3
  taller cards well), and a 4-way choice row.

## Debug view (temporary, remove before release)

Same pattern as the main study — see
[../README.md#debug-view-temporary-remove-before-release](../README.md#debug-view-temporary-remove-before-release)
for the general explanation. Run `grep -rn "DEBUG-ONLY" ablation/` to find
every spot in this sub-study before release.

## Adding more scenarios

Once a scenario in `../ablation/<slug>/` has all three of `both/`,
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
