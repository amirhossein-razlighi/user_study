# Video Editing User Study

A minimalistic, mobile-friendly A/B preference study, built as a static
site (no server) for GitHub Pages.

For each of 17 scenarios, a participant:

1. Reads the one-sentence edit request and watches the original input video.
2. Watches **Option A** and **Option B** — a baseline edit and "ours",
   shown in random order and under blinded names so participants can't
   tell which is which.
3. Checks a box under each option for "the task was accomplished in this
   video" (0/1).
4. Picks which option is better overall, or "about the same".

Progress is saved to `localStorage` as they go (refresh-safe / resumable).
At the end, the participant downloads a JSON file of their results — there
is no backend yet, see [Next steps](#next-steps-wiring-up-a-database).

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

## Next steps: wiring up a database

This first iteration is frontend-only. Results currently live in
`localStorage` and are exported by `buildExportPayload()` in
`assets/js/app.js` (called from the "Download results" button on the done
screen). To add persistence:

- Replace/augment the click handler on `#btn-download` with a `fetch(...)`
  POST of `buildExportPayload()` to whatever backend we set up (e.g. a
  Supabase table, a small serverless function, etc.).
- Everything needed for analysis is already in that payload: the
  per-scenario A/B source mapping (`aSource`/`bSource`), which role each
  was (`aRole`/`bRole`: `"baseline"` or `"ours"`), the two accomplishment
  checkboxes, the overall choice, a convenience `preferredMethod` field,
  and time spent per scenario. No personal information is collected
  anywhere in this payload — responses are anonymous by design.

## Debug view (temporary, remove before release)

The welcome screen has a "Debug view" checkbox that, while checked:

- reveals which option (A/B) is the baseline vs. "ours" for every
  scenario, as a small badge next to each "Option A"/"Option B" title
- unlocks the "Next" button so you can click through every scenario
  without picking A/B/tie first (handy for quickly eyeballing all 17)

It's for internal use while building the study and must not ship to real
participants — it breaks blinding.

Every line of it is wrapped in `DEBUG-ONLY` / `END DEBUG-ONLY` markers in
`index.html`, `assets/css/style.css`, and `assets/js/app.js`. Run
`grep -rn "DEBUG-ONLY" .` to find every spot before release:

- `index.html`: the checkbox block, and two badge `<span>`s
- `assets/css/style.css`: one rule block
- `assets/js/app.js`: delete the `debugMode`/toggle-listener block and
  the badge-rendering block outright; for the other two (inside
  `updateNextEnabled()` and the `#btn-next` click handler) revert the
  line to what the comment above it says instead of deleting it, so
  "Next" goes back to requiring an answer.
