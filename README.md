# Video Editing User Study

A minimalistic, mobile-friendly A/B preference study, built as a static
site (no server) for GitHub Pages.

For each of 27 scenarios, a participant:

1. Reads the one-sentence edit request and watches the original input video.
2. Watches **Option A** and **Option B** — a baseline edit and "ours",
   shown in random order and under blinded names so participants can't
   tell which is which.
3. Checks a box under each option for "the task was accomplished in this
   video" (0/1).
4. Picks which option is better overall, or "about the same".

Progress is saved to `localStorage` as they go (refresh-safe / resumable).
At the end, all 27 answers are submitted to Supabase in one request (see
[Database](#database-supabase)); a status indicator shows saving/saved/
failed, with automatic + manual retry and a "download results as .zip"
fallback if it still can't get through.

A sibling study lives at [`ablation/`](ablation/README.md) — same theme
and infrastructure, comparing three editing-guidance setups (audio-only /
text-only / both) with Likert ratings instead of a pairwise A/B checkbox.

## Running locally

No build step. Any static file server works, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (Opening `index.html` directly via
`file://` also works, since scenario data is loaded from a plain `<script>`
tag rather than `fetch()`.)

## Deploying to GitHub Pages

Settings → Pages → Build and deployment → Source: **Deploy from a branch**,
branch **`main`**, folder **`/ (root)`**. No Actions workflow is needed.

GitHub Pages caches assets for ~10 minutes (`cache-control: max-age=600`).
`index.html` loads `style.css`, `scenarios.js`, and `app.js` with a
`?v=N` query string for exactly this reason — bump `N` for all three
`<link>`/`<script>` tags any time you change one of those files, so
anyone with a browser tab already open (or a warm cache) is guaranteed
to fetch the new version instead of silently keeping the stale one.
Without it, a reload can still serve a cached copy of the old file for
up to 10 minutes.

## Project structure

```
index.html              single-page app: welcome → trial → done screens
assets/css/style.css    all styling (light + dark mode aware)
assets/js/app.js        study logic: ordering, randomization, state, export
assets/videos/<slug>/   input.mp4, clip1.mp4, clip2.mp4 per scenario
assets/posters/<slug>/  matching poster frames (jpg) for fast perceived load
data/scenarios.js       the manifest of scenarios (edit sentence, scene, files)
```

The only external dependency is [JSZip](https://stuk.github.io/jszip/), loaded from cdnjs in `index.html`, used solely to build the "Download results (.zip)" file client-side.

### Blinding & randomization

Video files are named neutrally (`clip1.mp4` / `clip2.mp4`), never
`baseline`/`ours`, so the file name itself never reveals which method
produced a clip. `data/scenarios.js` records which clip is the baseline via
`baselineClip`. At study start, `app.js` independently randomizes, per
scenario and per participant, whether `clip1`/`clip2` is shown as "Option
A" or "Option B" — so there's no systematic left/right or A/B bias. Scenario
order is also shuffled per participant.

### Adding / editing scenarios

Edit `data/scenarios.js` and drop matching files into
`assets/videos/<slug>/{input,clip1,clip2}.mp4`. Regenerate a poster frame
with, e.g.:

```bash
ffmpeg -y -ss 0.6 -i assets/videos/<slug>/clip1.mp4 -frames:v 1 -vf scale=480:-1 -q:v 5 assets/posters/<slug>/clip1.jpg
```

## Database (Supabase)

Responses are stored in the `gruvi-survey` Supabase project (project ref
`guamrqujwnfejkvsrcar`), in a table dedicated to this study:
**`public.h3_main_experiment_survey_responses`**. That project already held
data from unrelated prior studies (`survey_responses`,
`ablation_modality_responses`) — this table is new and independent, so
nothing else in the project was touched. The [`ablation/`](ablation/README.md)
sibling study followed this same pattern for its own
`public.h3_ablation_survey_responses` table — the template to copy for any
future study.

**Shape:** one row per `(session_id, scenario)` — i.e. 27 rows per
completed participant, "tidy"/long format, rather than one row per session
with everything crammed into a jsonb blob. This makes per-scenario and
overall metrics (win rate, task-accomplishment rate, etc.) plain `GROUP BY`
queries instead of needing to unnest jsonb every time:

```sql
-- overall win rate
select preferred_method, count(*) from h3_main_experiment_survey_responses
group by preferred_method;

-- per-scenario win rate
select scenario_slug, preferred_method, count(*)
from h3_main_experiment_survey_responses
group by scenario_slug, preferred_method;

-- task-accomplishment rate by method (overall or per scenario) via the
-- helper view that unpivots accomplished_a/accomplished_b into rows:
select method, avg(accomplished::int)
from h3_main_experiment_accomplishment_by_method
group by method;
```

Key columns: `session_id` (groups one participant's 27 rows),
`scenario_order`, `scenario_slug`, `edit_prompt`, `a_source`/`b_source`
(blinded `clip1`/`clip2`), `a_role`/`b_role` (`baseline`/`ours`, decoded
from the blinded mapping), `accomplished_a`/`accomplished_b`, `choice`
(`A`/`B`/`tie`), `preferred_method` (`baseline`/`ours`/`tie`, already
decoded from `choice` + the roles), `time_spent_ms`, plus session-level
`session_started_at`/`session_finished_at`/`user_agent` denormalized onto
every row for filtering without a join. `debug_mode` (default `false`)
flags rows submitted while the frontend's debug view was on — should
always be `false` for real data; filter out (or investigate) any `true`
rows during cleaning.

**No participant IDs, but repeat submissions are still detectable.** The
consent screen promises no personal information is collected, so there's
no login/name/email to key on. Instead, `session_id` (a fresh id every time
someone starts or restarts the study — groups one submission's 27 rows)
is paired with `device_id`: a random id generated once and kept in the
browser's `localStorage` under its own key (`video_study_device_id_v1`,
separate from the study-progress key, so it survives "Start over"). It
identifies a *browser*, not a person — clearing site data, private
browsing, or a different device/browser all evade it — but it's the best
available signal without collecting anything identifying. During cleaning,
query the helper view for devices that submitted more than once:

```sql
select * from public.h3_main_experiment_repeat_devices;
-- device_id, submission_count, session_ids, first_started_at, last_finished_at
```

then decide per case whether to keep the first submission, the last, or
drop the device's rows entirely.

**Access model:** RLS is enabled; the `anon` key (used by the public site)
can only `INSERT`, never `SELECT`/`UPDATE`/`DELETE` — matching the pattern
already used by the other tables in this project. Only the project's
`service_role` key (kept secret) can read or clean up submissions, e.g. via
the Supabase SQL editor.

**Submission flow** (`assets/js/app.js`, see `submitResponses()`): on the
done screen, all 27 rows are POSTed in a single request. A status card
shows a spinner while in flight, a green check on success, or a red X after
3 failed attempts (1.5s/3s backoff) — with a "Try again" button and a
"Download results (.zip)" fallback the participant can send manually.
Retries (automatic or manual) can't create duplicate rows: a unique
`(session_id, scenario_slug)` constraint means a retried insert comes back
as `409` (Postgres `23505`), which the client treats as "already saved"
rather than an error. If a participant closes the tab before the
submission ever succeeds, `submitted: false` is remembered in
`localStorage`, and reopening the page skips straight back to the done
screen and retries automatically — no need to redo any trials.

Before any of that, `submitResponses()` first calls
`firstIncompleteTrialIndex()` (every DB column is `NOT NULL`, so an
incomplete trial would otherwise fail with an unhelpful generic error).
Normally impossible to trigger — `Next` already requires a full answer —
but debug view deliberately bypasses that, so it's easy to reach in
testing. When it finds one, the status card shows a distinct blue "info"
state ("You have unanswered scenarios! Go back and fill them in.") with a
**Go back and answer** button that jumps straight to that trial, instead
of wasting the 3 retry attempts on a request that can never succeed.

## Debug view (temporary, remove before release)

The welcome screen has a "Debug view" checkbox that, while checked:

- reveals which option (A/B) is the baseline vs. "ours" for every
  scenario, as a small badge next to each "Option A"/"Option B" title
- unlocks the "Next" button so you can click through every scenario
  without picking A/B/tie first (handy for quickly eyeballing all 27)

It's for internal use while building the study and must not ship to real
participants — it breaks blinding. As a safety net in case a row ever
does get submitted with it on, every row also carries a permanent
`debug_mode` column (see [Database](#database-supabase)) that isn't part
of the code being removed here — it stays in the schema, always `false`,
so real data is unaffected either way.

Every line of the debug-view UI itself is wrapped in `DEBUG-ONLY` /
`END DEBUG-ONLY` markers in `index.html`, `assets/css/style.css`, and
`assets/js/app.js`. Run `grep -rn "DEBUG-ONLY" .` to find every spot
before release:

- `index.html`: the checkbox block, and two badge `<span>`s
- `assets/css/style.css`: one rule block
- `assets/js/app.js`: delete the `debugMode`/toggle-listener block, the
  badge-rendering block, and the `debugMode`/`debug_mode` line in each
  of `buildExportPayload()`/`buildSubmissionRows()` outright; for the
  remaining two (inside `updateNextEnabled()` and the `#btn-next` click
  handler) revert the line to what the comment above it says instead of
  deleting it, so "Next" goes back to requiring an answer.
