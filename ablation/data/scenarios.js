// Scenario manifest for the modality ablation study (audio-only vs
// text-only vs both). Each scenario has a slug (locates
// assets/videos/<slug>/*.mp4), the edit instruction, and `highlights`:
// exact substrings of `edit` that app.js bolds/colors.
//
// IMPORTANT: "clip1"/"clip2"/"clip3" are neutral, blinded file names —
// never renamed to reveal which method produced them. Which physical
// clip is which method is fixed globally in app.js (CLIP_METHOD), and
// which clip is shown at on-screen position A/B/C is independently
// randomized per scenario per participant at runtime.
const SCENARIOS = [
  {
    slug: "boy_splashes",
    edit: "The boy splashes the water with both hands.",
    highlights: ["splashes"]
  },
  {
    slug: "cat_yawns",
    edit: "The cat yawns widely.",
    highlights: ["yawns"]
  },
  {
    slug: "gen_frog_jumps",
    edit: "The frog jumps off the lily pad into the water.",
    highlights: ["jumps off"]
  },
  {
    slug: "gen_glass_edge",
    edit: "The glass falls off the table and shatters on the floor.",
    highlights: ["falls", "shatters"]
  },
  {
    slug: "gen_glass_table",
    edit: "The glass tips over and spills the water.",
    highlights: ["tips over", "spills"]
  },
  {
    slug: "goldfish",
    edit: "The goldfish jumps out of the fish tank into the air.",
    highlights: ["jumps out"]
  },
  {
    slug: "man_shouts",
    edit: "The man shouts loudly.",
    highlights: ["shouts loudly"]
  }
];
