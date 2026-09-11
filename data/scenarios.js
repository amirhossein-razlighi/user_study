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
  },
  {
    slug: "gen_cat_vase",
    edit: "The cat pushes the vase over and it shatters on the floor.",
    scene: "a cat sitting on the floor next to a large ceramic vase",
    baselineClip: "clip1",
    highlights: ["pushes the vase over", "shatters"]
  },
  {
    slug: "gen_firecracker",
    edit: "The firecracker explodes with a bang and a puff of smoke.",
    scene: "a red firecracker lying on a concrete yard with a lit fuse",
    baselineClip: "clip1",
    highlights: ["explodes"]
  },
  {
    slug: "real_casablanca",
    edit: "She bursts out laughing, throwing her head back.",
    scene: "a black-and-white close-up of a woman in a hat with tearful eyes",
    baselineClip: "clip1",
    highlights: ["bursts out laughing", "throwing her head back"]
  },
  {
    slug: "real_casablanca_hat",
    edit: "She grabs her hat, throws it up into the air and laughs.",
    scene: "a black-and-white close-up of a woman in a wide-brimmed hat with tearful eyes",
    baselineClip: "clip1",
    highlights: ["throws it up into the air", "laughs"]
  },
  {
    slug: "real_keaton",
    edit: "He bursts out laughing.",
    scene: "a black-and-white silent-film close-up of a deadpan man in a flat straw hat",
    baselineClip: "clip1",
    highlights: ["bursts out laughing"]
  },
  {
    slug: "real_leo_kneeslap",
    edit: "He slaps his knee and bursts out laughing.",
    scene: "a man in a yellow shirt sitting on a couch holding a drink",
    baselineClip: "clip1",
    highlights: ["slaps his knee", "bursts out laughing"]
  },
  {
    slug: "gen_woman_scream",
    edit: "The woman screams in fright.",
    scene: "a young woman standing in a dim corridor facing the camera",
    baselineClip: "clip1",
    highlights: ["screams"]
  },
  {
    slug: "real_michael_cry",
    edit: "He suddenly bursts into tears, sobbing loudly, his face crumpling.",
    scene: "a close-up of a man in a white shirt and dark tie sitting at an office desk, holding a coffee mug",
    baselineClip: "clip1",
    highlights: ["bursts into tears", "sobbing loudly"]
  },
  {
    slug: "real_mrbean",
    edit: "He faints and falls backwards into the field.",
    scene: "a man in a brown suit standing in a yellow field, hands on hips",
    baselineClip: "clip1",
    highlights: ["faints", "falls backwards"]
  },
  {
    slug: "real_tony_shout",
    edit: "He suddenly shouts angrily at the camera, his face contorted with rage.",
    scene: "a close-up of a heavy-set man in a patterned shirt sitting in a dim hotel room",
    baselineClip: "clip1",
    highlights: ["shouts angrily"]
  },
  {
    slug: "gen_kettle",
    edit: "The kettle whistles and steam shoots out of the spout.",
    scene: "a stovetop kettle on a lit gas burner",
    baselineClip: "clip1",
    highlights: ["whistles", "steam shoots out"]
  },
  {
    slug: "gen_tyre",
    edit: "The tyre bursts with a loud bang and goes flat.",
    scene: "a close-up of a parked car's front wheel",
    baselineClip: "clip1",
    highlights: ["bursts", "goes flat"]
  }
];
