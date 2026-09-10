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
    slug: "car_door_opens",
    edit: "The car door swings open.",
    highlights: ["swings open"]
  },
  {
    slug: "cat_yawns",
    edit: "The cat yawns widely.",
    highlights: ["yawns"]
  },
  {
    slug: "gen_cow_field",
    edit: "The cow moos loudly.",
    highlights: ["moos loudly"]
  },
  {
    slug: "gen_dolphin_sea",
    edit: "The dolphin leaps out of the water.",
    highlights: ["leaps out of the water"]
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
    slug: "gen_windmill",
    edit: "The windmill blades start turning.",
    highlights: ["blades", "turning"]
  },
  {
    slug: "gen_wolf_hill",
    edit: "The wolf howls with its head tilted up.",
    highlights: ["howls", "head tilted up"]
  },
  {
    slug: "gen_woman_door",
    edit: "The woman opens the door and walks inside.",
    highlights: ["opens", "walks"]
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
