// Engelska uppmaningar och repliker för handlingarna i commands.js ("sit on the sofa", "follow me",
// "dance", "wear a red shirt", "give Anna a hug" …). Handlingarna och platserna har samma id som på
// svenska; bara tolkningen av texten och replikerna skiljer sig.
//
// Obs: modulen importeras av commands.js och importerar själv därifrån, så inget från commands.js får
// användas när modulen laddas – bara inuti funktionerna.

import { PRESETS, PRESETS_EN, savedMotions } from './motion.js';
import { PLACE_ORDER, PLACES } from './commands.js';
import { PARTS } from './clothes.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const MOTION_PHRASES = [
  [/(somersault|forward roll|roll forward)/, 'kullerbytta'],
  [/(backflip|back flip|do a flip|flip backwards)/, 'bakatvolt'],
  [/(cartwheel)/, 'hjula'],
  [/(handstand|stand on your hands|walk on your hands)/, 'sta_pa_handerna'],
  [/(roll around|roll on the floor|roll over)/, 'rulla_runt'],
  [/\blie (down )?on your (stomach|belly|front|tummy)\b/, 'ligga_pa_magen'],
  [/\b(lie down|lie on the floor|lie on your back|lay down)\b/, 'ligga_pa_rygg'],
  [/\bsit (down )?on the floor\b/, 'sitta_pa_golvet'],
  [/\b(kneel|get on your knees|go down on one knee)\b/, 'sta_pa_kna'],
  [/\bpoint\b/, 'peka'],
  [/\bthumbs? up\b/, 'tumme_upp'],
  [/\b(bow|curtsy|curtsey)\b/, 'buga'],
  [/\bnod\b/, 'nicka'],
  [/\bshake your head\b/, 'skaka_pa_huvudet'],
  [/\b(cross|fold) your arms\b/, 'armarna_i_kors'],
  [/\bhands on (your )?hips\b/, 'handerna_pa_hoften'],
  [/\bjump\b/, 'hoppa'],
  [/\b(spin|turn around|twirl)\b/, 'snurra'],
  [/\b(flex|show (me )?your muscles)\b/, 'visa_musklerna'],
  [/\b(peace sign|peace)\b/, 'fridstecken'],
];

const PLACE_RE = {
  soffan: /\b(sofa|couch|settee)\b/,
  lasfatoljen: /\b(reading chair|reading corner|reading nook)\b/,
  fatoljen: /\b(armchair|orange chair)\b/,
  soffbordet: /\b(coffee table|small table|living room table)\b/,
  matbordet: /\b(dining table|table|dinner table|chair)\b/,
  golvet: /\bfloor\b/,
  koket: /\b(kitchen|sink|stove|cooker)\b/,
  kylskapet: /\b(fridge|refrigerator)\b/,
  fonstret: /\bwindows?\b/,
  tv: /\b(tv|telly|television)\b/,
  bokhyllan: /\b(books?|bookcase|bookshelf|shelf)\b/,
  skivspelaren: /\b(record player|vinyl|turntable|records)\b/,
  tavlan: /\b(painting|picture|art|artwork)\b/,
  dorren: /\b(door|hall|hallway)\b/,
};

// Hur platserna skrivs i replikerna
export const PLACE_EN = {
  soffan: { name: 'the sofa', at: 'on the sofa' },
  lasfatoljen: { name: 'the reading chair', at: 'in the reading chair' },
  fatoljen: { name: 'the armchair', at: 'in the armchair' },
  soffbordet: { name: 'the coffee table', at: 'at the coffee table' },
  matbordet: { name: 'the dining table', at: 'at the dining table' },
  golvet: { name: 'the floor', at: 'on the floor' },
  koket: { name: 'the kitchen' },
  kylskapet: { name: 'the fridge' },
  fonstret: { name: 'the window' },
  tv: { name: 'the TV' },
  bokhyllan: { name: 'the bookcase' },
  skivspelaren: { name: 'the record player' },
  tavlan: { name: 'the painting' },
  dorren: { name: 'the door' },
};

export function findPlaceEn(text) {
  for (const id of PLACE_ORDER) if (PLACE_RE[id]?.test(text) && PLACES[id]) return id;
  return null;
}

// ---------------- Kläder ----------------
// Engelska färgord -> färgernas id (svenska, se COLORS i clothes.js)
const COLOR_WORDS = [
  ['vinröd', /^(burgundy|maroon|wine(red)?)$/],
  ['marinblå', /^(navy|darkblue)$/],
  ['ljusblå', /^(lightblue|skyblue|babyblue)$/],
  ['mörkgrön', /^(darkgreen|forestgreen|olive)$/],
  ['röd', /^red$/],
  ['rosa', /^pink$/],
  ['orange', /^orange$/],
  ['gul', /^yellow$/],
  ['grön', /^green$/],
  ['turkos', /^(turquoise|teal)$/],
  ['blå', /^blue$/],
  ['lila', /^(purple|lilac|violet)$/],
  ['brun', /^brown$/],
  ['beige', /^(beige|tan)$/],
  ['vit', /^white$/],
  ['grå', /^(gr[ae]y)$/],
  ['svart', /^black$/],
];
export const COLOR_EN = { vinröd: 'burgundy', marinblå: 'navy', ljusblå: 'light blue', mörkgrön: 'dark green', röd: 'red', rosa: 'pink', orange: 'orange', gul: 'yellow', grön: 'green', turkos: 'turquoise', blå: 'blue', lila: 'purple', brun: 'brown', beige: 'beige', vit: 'white', grå: 'grey', svart: 'black' };
const PART_WORDS = {
  overdel: /^(shirt|t-?shirt|top|jacket|blouse|sweater|jumper|hoodie|dress|cardigan|tee)s?$/,
  underdel: /^(trousers|pants|jeans|skirt|shorts|leggings)$/,
  skor: /^(shoes?|boots?|sneakers?|trainers?)$/,
};
const colorOf = (w) => COLOR_WORDS.find(([, re]) => re.test(w))?.[0];
const partOf = (w) => Object.keys(PART_WORDS).find((p) => PART_WORDS[p].test(w));

function parseClothes(raw) {
  const t = raw.replace(/\b(light|sky|baby|dark|forest|wine) (blue|green|red)\b/g, '$1$2');
  if (!/\b(change|put on|wear|dress|switch|colou?r|dye|make your|turn your|get changed)\b/.test(t)) return null;
  const words = t.split(/\s+/).filter(Boolean);
  const hasPart = words.some(partOf);
  if (!hasPart && !/\b(clothes|outfit|get changed|style|dress (up|in))\b/.test(t)) return null;
  if (/\b(normal|own|old|usual|original|regular) clothes\b|as before|back to normal/.test(t)) return { action: 'byt_klader', clothes: { overdel: 'original', underdel: 'original', skor: 'original' } };
  const clothes = {};
  let loose = null;
  words.forEach((w, i) => {
    const c = colorOf(w);
    if (!c) return;
    const p = words.slice(i + 1, i + 4).map(partOf).find(Boolean);
    if (p) clothes[p] = c;
    else loose = c;
  });
  if (loose && !Object.keys(clothes).length) Object.assign(clothes, { overdel: loose, underdel: loose });
  return { action: 'byt_klader', clothes: Object.keys(clothes).length ? clothes : null };
}

// ---------------- Göra saker med andra ----------------
const INTERACT_WORDS = [
  [/\bhug\b/, 'kram'],
  [/high.?five|give .* five/, 'high_five'],
  [/shake hands|handshake|say hello to|greet/, 'skaka_hand'],
  [/sit (down )?(next to|beside|with|near)/, 'satt_bredvid'],
  [/\bdance\b/, 'dansa'],
  [/\b(talk|chat|speak|say hi|have a chat|ask)\b/, 'prata'],
  [/\b(go|walk|run|come) (to|over to|up to)\b/, 'ga_fram'],
];

function parseInteraction(t, others) {
  const kind = INTERACT_WORDS.find(([re]) => re.test(t))?.[1];
  if (!kind) return null;
  let person = others.find((n) => new RegExp(`(?<![a-zåäöé])${n.toLowerCase()}(?![a-zåäöé])`).test(t));
  if (!person && others.length === 1 && /\b(each other|the other|him|her|them)\b/.test(t)) person = others[0];
  return person ? { action: 'interagera', person, kind } : null;
}

// Tolka en uppmaning på engelska. Returnerar null om texten inte ber personen göra något.
export function parseCommandEn(raw, others = []) {
  const t = raw.toLowerCase().replace(/[!?.,]/g, ' ').replace(/’/g, "'");
  if (/\b(do you (like|usually|enjoy|ever)|have you ever)\b/.test(t)) return null;
  const together = parseInteraction(t, others);
  if (together) return together;
  const clothes = parseClothes(t);
  if (clothes) return clothes;
  const place = findPlaceEn(t);
  const rules = [
    [/\b(leave the room|go home|get out|go away|get lost|leave)\b/, 'lamna_rummet'],
    [/\b(stop following|don'?t follow)\b/, 'sluta_folja'],
    [/\b(follow me|come with me|come along|tag along)\b/, 'folj_mig'],
    [/\b(come here|come closer|come to me|come over)\b/, 'kom_hit'],
    [/\b(stand up|get up|on your feet)\b/, 'res_dig'],
    [/\b(crouch|squat)\b/, 'sitt_pa_huk'],
    [/\b(sit down|take a seat|have a seat|sit)\b/, 'satt_dig'],
    [/\b(stop|wait|stay|stand still|hold on)\b/, 'stanna'],
    [/\bdance\b/, 'dansa'],
    [/\bwave\b/, 'vinka'],
    [/\b(clap|applaud)\b/, 'klappa'],
    [/\b(cheer|celebrate)\b/, 'jubla'],
    [/\blaugh\b/, 'skratta'],
    [/\bshrug\b/, 'rycka_pa_axlarna'],
    [/\bstretch\b/, 'stracka_pa_sig'],
    [/\byawn\b/, 'gaspa'],
    [/\b(take a (photo|picture|selfie|snap))\b/, 'ta_foto'],
    [/\b(think( about it)?|ponder)\b/, 'fundera'],
    [/\b(go|walk|run|stand|move|head) (to|by|over to|towards|into|next to)\b/, 'ga_till'],
  ];
  if (/\b(lie down|lie|rest|lay down)\b/.test(t) && place && ['soffan', 'matbordet', 'soffbordet'].includes(place) && !/(stomach|belly|front)/.test(t)) return { action: 'lagg_dig', place };
  if (/\b(sit|hop|jump|climb) (up )?on (top of )?(the )?(dining |coffee |dinner )?table\b/.test(t) && ['matbordet', 'soffbordet'].includes(place)) return { action: 'sitt_pa', place };
  for (const [name, def] of Object.entries(savedMotions())) {
    const words = name.replace(/_/g, ' ');
    if (words.length > 2 && t.includes(words)) return { action: 'rorelse', place: null, motion: def, name };
  }
  for (const [re, name] of MOTION_PHRASES) if (re.test(t)) return { action: 'rorelse', place: null, motion: PRESETS[name], name };
  for (const [re, action] of rules) {
    if (re.test(t)) {
      if (action === 'res_dig' && place && /\bstand\b/.test(t)) return { action: 'ga_till', place };
      return { action, place };
    }
  }
  return null;
}

// ---------------- Repliker ----------------
const YES = {
  vänlig: ['Of course!', 'Happy to!', 'Sure thing.'],
  blyg: ['Um… okay.', 'Yes… sure.', 'Okay…'],
  sarkastisk: ['As you command.', 'Right, let’s do that then.', 'Exactly what I wanted to do.'],
  entusiastisk: ['Yes! Love to!', 'Ooh, fun idea!', 'Absolutely!'],
  grinig: ['Sigh. Fine.', 'If I must.', 'Mm. Fine.'],
  filosofisk: ['Why not. Everything is movement.', 'One small step for me…', 'If you say so.'],
  charmig: ['For you? Of course.', 'Anything for you.', 'With pleasure.'],
};

const DOING = {
  satt_dig: (p, at) => (at ? `I’ll sit ${at}.` : 'I’ll sit down.'),
  lagg_dig: (p, at, cmd) => (cmd.place && cmd.place !== 'golvet' ? `I’ll lie down on ${p}.` : '*lies down on the floor*'),
  sitt_pa: (p) => `*hops up and sits on ${p}*`,
  res_dig: () => 'I’ll stand up.',
  ga_till: (p) => (p ? `I’ll go over to ${p}.` : 'Where to?'),
  kom_hit: () => 'Coming.',
  folj_mig: () => 'I’ll follow you.',
  sluta_folja: () => 'Okay, I’ll stay here.',
  stanna: () => 'I’ll stay here.',
  lamna_rummet: () => 'I’ll be off then. Bye!',
  vinka: () => 'Hi there! *waves*',
  dansa: () => 'Music in my head… here we go!',
  klappa: () => '*claps*',
  jubla: () => 'Yesss! *cheers*',
  skratta: () => 'Haha!',
  rycka_pa_axlarna: () => '*shrugs*',
  stracka_pa_sig: () => 'Ahh, I needed that. *stretches*',
  gaspa: () => '*yawns* Sorry, long day.',
  sitt_pa_huk: () => '*crouches down*',
  ta_foto: () => 'Smile! *takes a picture*',
  fundera: () => 'Hmm, let me think…',
  rorelse: (p, at, cmd) => `*${PRESETS_EN[cmd.name]?.[1] || cmd.motion?.beskrivning || cmd.name?.replace(/_/g, ' ') || 'does it'}*`,
  byt_klader: (p, at, cmd) => {
    const c = cmd.clothes;
    if (!c) return '*gets changed* What do you think?';
    if (PARTS.every((k) => c[k] === 'original')) return '*changes back into their usual clothes*';
    const names = { overdel: 'top', underdel: 'bottoms', skor: 'shoes' };
    const list = PARTS.filter((k) => c[k] && c[k] !== 'original').map((k) => `${COLOR_EN[c[k]] || c[k]} ${names[k]}`);
    return `*changes into ${list.join(' and ')}* Looking good?`;
  },
  interagera: (p, at, cmd) =>
    ({
      kram: `Come here, ${cmd.person}! *hugs*`,
      high_five: `${cmd.person}, give me five!`,
      skaka_hand: `*shakes hands with ${cmd.person}*`,
      dansa: `${cmd.person}, shall we dance?`,
      prata: `I’ll have a little chat with ${cmd.person}.`,
      satt_bredvid: `I’ll sit next to ${cmd.person}.`,
      ga_fram: `I’ll go over to ${cmd.person}.`,
    })[cmd.kind] || `*goes over to ${cmd.person}*`,
};

const FAIL = {
  occupied: (p, at) => (at ? `There’s no room ${at}.` : 'There’s nowhere free to sit.'),
  noSeat: (p) => `You can’t sit at ${p}.`,
  noPlace: () => 'Where do you mean? I can go to the kitchen, the window, the bookcase, the TV, the record player, the painting, the fridge or the door.',
  already: () => 'I’m already doing that.',
  noPath: () => 'I can’t get there.',
  noPerson: () => 'Who do you mean? I don’t see anyone by that name here.',
  notSeated: () => 'But they’re not sitting down.',
  noClothes: () => 'I can’t change clothes right now.',
};

export function commandReplyEn(persona, cmd, result) {
  const place = cmd.place ? PLACE_EN[cmd.place] : null;
  if (!result.ok) return FAIL[result.reason]?.(place?.name, place?.at) || 'I can’t right now.';
  const yes = cmd.action === 'lamna_rummet' ? '' : `${pick(YES[persona.personality.id] || YES.vänlig)} `;
  return `${yes}${DOING[cmd.action](place?.name, place?.at, cmd)}`;
}

export function commandResultTextEn(cmd, result) {
  if (result.ok && cmd.action === 'byt_klader') return `Done: the clothes changed colour (${cmd.clothes ? PARTS.map((k) => `${k}: ${cmd.clothes[k] || 'same'}`).join(', ') : 'random colours'}).`;
  if (result.ok && cmd.action === 'interagera') return `Done: you walk over to ${cmd.person} and do ${cmd.kind} together for a while.`;
  if (result.ok && cmd.action === 'rorelse') return `Done: the movement ${cmd.name || ''} is playing${cmd.saved ? ' and has been saved' : ''}.`;
  if (result.ok) return `Done: ${cmd.action}${cmd.place ? ` (${PLACE_EN[cmd.place]?.name || cmd.place})` : ''}.`;
  return `Failed: ${cmd.action} (${result.reason}). Briefly explain it to the player.`;
}
