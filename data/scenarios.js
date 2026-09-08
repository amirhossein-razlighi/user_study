// Scenario manifest for the user study.
// Each scenario has a slug (used to locate assets/videos/<slug>/*.mp4),
// the edit instruction shown to participants, a short scene description,
// and `highlights`: exact substrings of `edit` (case-sensitive) that
// app.js bolds/colors so participants notice the specific motion being
// judged. Keep each phrase an exact match of text in `edit`.
//
// IMPORTANT: "clip1" and "clip2" are neutral, blinded file names. Which one
// is the baseline and which is "ours" is intentionally NOT encoded in the
// file name, so the mapping lives only in this array (baselineClip) and the
// on-screen A/B position is additionally randomized per participant at
// runtime in app.js. Do not rename clip1.mp4 / clip2.mp4 to anything that
// reveals which method produced them.
const SCENARIOS = [
  {
    slug: "boy_splashes",
    edit: "The boy splashes the water with both hands.",
    scene: "a boy standing in a swimming pool",
    baselineClip: "clip1",
    highlights: ["splashes"]
  },
  {
    slug: "car_door_opens",
    edit: "The car door swings open.",
    scene: "a car raised on a lift in a workshop with a mechanic nearby",
    baselineClip: "clip1",
    highlights: ["swings open"]
  },
  {
    slug: "cat_yawns",
    edit: "The cat yawns widely.",
    scene: "a cat sitting",
    baselineClip: "clip1",
    highlights: ["yawns"]
  },
  {
    slug: "gen_cow_field",
    edit: "The cow moos loudly.",
    scene: "a cow standing in a green pasture",
    baselineClip: "clip1",
    highlights: ["moos loudly"]
  },
  {
    slug: "gen_dolphin_sea",
    edit: "The dolphin leaps out of the water.",
    scene: "a dolphin swimming just below the surface of a calm sea",
    baselineClip: "clip1",
    highlights: ["leaps out of the water"]
  },
  {
    slug: "gen_frog_jumps",
    edit: "The frog jumps off the lily pad into the water.",
    scene: "a green frog sitting on a lily pad in a pond",
    baselineClip: "clip1",
    highlights: ["jumps off"]
  },
  {
    slug: "gen_glass_edge",
    edit: "The glass falls off the table and shatters on the floor.",
    scene: "a drinking glass at the edge of a kitchen table",
    baselineClip: "clip1",
    highlights: ["falls", "shatters"]
  },
  {
    slug: "gen_glass_table",
    edit: "The glass tips over and spills the water.",
    scene: "a full glass of water on a wooden kitchen table",
    baselineClip: "clip1",
    highlights: ["tips over", "spills"]
  },
  {
    slug: "gen_koi_pond",
    edit: "The koi jumps out of the water.",
    scene: "a large orange koi near the surface of a garden pond",
    baselineClip: "clip1",
    highlights: ["jumps out"]
  },
  {
    slug: "gen_sealion",
    edit: "The sea lion barks with its head raised.",
    scene: "a sea lion resting on coastal rocks",
    baselineClip: "clip1",
    highlights: ["barks", "head raised"]
  },
  {
    slug: "gen_windmill",
    edit: "The windmill blades start turning.",
    scene: "an old wooden windmill on a hill",
    baselineClip: "clip1",
    highlights: ["blades", "turning"]
  },
  {
    slug: "gen_wolf_hill",
    edit: "The wolf howls with its head tilted up.",
    scene: "a grey wolf standing on a snowy hill",
    baselineClip: "clip1",
    highlights: ["howls", "head tilted up"]
  },
  {
    slug: "gen_woman_desk",
    edit: "The woman yawns widely.",
    scene: "a young woman sitting at an office desk with a laptop",
    baselineClip: "clip1",
    highlights: ["yawns"]
  },
  {
    slug: "gen_woman_door",
    edit: "The woman opens the door and walks inside.",
    scene: "a woman standing in front of a closed wooden front door",
    baselineClip: "clip1",
    highlights: ["opens", "walks"]
  },
  {
    slug: "goldfish",
    edit: "The goldfish jumps out of the fish tank into the air.",
    scene: "a goldfish in a fish tank",
    baselineClip: "clip1",
    highlights: ["jumps out"]
  },
  {
    slug: "man_claps",
    edit: "The man claps his hands.",
    scene: "a man standing, facing the camera",
    baselineClip: "clip1",
    highlights: ["claps"]
  },
  {
    slug: "man_shouts",
    edit: "The man shouts loudly.",
    scene: "a man facing the camera",
    baselineClip: "clip1",
    highlights: ["shouts loudly"]
  }
];
