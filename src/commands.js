// Handlingar som spelaren kan be personerna om, t.ex. "sätt dig i soffan", "följ mig" eller "dansa".
// Används både av den inbyggda samtalsmotorn (tolkar texten själv) och av Claude (via ett verktyg).

import { PRESETS, savedMotions } from './motion.js';
import { COLORS, PARTS } from './clothes.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Färdiga egna rörelser som den inbyggda motorn känner igen
const MOTION_PHRASES = [
  [/(kullerbytta|kullerbyttor|rulla framåt)/, 'kullerbytta'],
  [/(bakåtvolt|volt bakåt|gör en volt|voltera|baklängesvolt|backflip)/, 'bakatvolt'],
  [/(hjula|hjulning|gör ett hjul|hjulet)/, 'hjula'],
  [/(stå på händerna|står på händerna|handstående|gå ner i handstående)/, 'sta_pa_handerna'],
  [/(rulla runt|rulla på golvet|rulla omkring|rulla dig)/, 'rulla_runt'],
  [/\b(lägg dig på magen|ligg på magen)\b/, 'ligga_pa_magen'],
  [/\b(lägg dig|ligg ner|lägga dig|ligg på golvet|ligg på rygg)\b/, 'ligga_pa_rygg'],
  [/\b(sätt dig på golvet|sitt på golvet|sätta dig på golvet)\b/, 'sitta_pa_golvet'],
  [/\b(ställ dig på knä|stå på knä|gå ner på knä|knäböj)\b/, 'sta_pa_kna'],
  [/\bpeka\b/, 'peka'],
  [/\btummen? upp\b/, 'tumme_upp'],
  [/\b(buga|bocka|niga)\b/, 'buga'],
  [/\bnicka\b/, 'nicka'],
  [/\bskaka på huvudet\b/, 'skaka_pa_huvudet'],
  [/\b(armarna i kors|korsa armarna)\b/, 'armarna_i_kors'],
  [/\bhänderna på höfterna?\b/, 'handerna_pa_hoften'],
  [/\bhoppa\b/, 'hoppa'],
  [/\b(snurra|gör ett varv)\b/, 'snurra'],
  [/\b(visa (dina )?muskler(na)?|spänn musklerna|flexa)\b/, 'visa_musklerna'],
  [/\b(fredstecken|fridstecken|peace)\b/, 'fridstecken'],
];

// Platser i rummet. `seat` matchar sittplatsernas etikett, `poi` de platser man kan ställa sig vid.
export const PLACES = {
  soffan: { name: 'soffan', at: 'i soffan', seat: 'soffan', re: /soffa/ },
  lasfatoljen: { name: 'läsfåtöljen', at: 'i läsfåtöljen', seat: 'läsfåtöljen', re: /läsfåtölj|läshörn/ },
  fatoljen: { name: 'fåtöljen', at: 'i fåtöljen', seat: 'fåtöljen', re: /fåtölj|orange stol/ },
  soffbordet: { name: 'soffbordet', at: 'vid soffbordet', poi: 'tv:n', re: /soffbord|lilla bordet|vardagsrumsbord/ },
  matbordet: { name: 'matbordet', at: 'vid matbordet', seat: 'matbordet', poi: 'matbordet', re: /matbord|bordet|middagsbord|\bstol/ },
  golvet: { name: 'golvet', at: 'på golvet', re: /golv/ },
  koket: { name: 'köket', poi: 'köket', re: /kök|diskbänk|diskho|spis/ },
  kylskapet: { name: 'kylskåpet', poi: 'kylskåpet', re: /kyl/ },
  fonstret: { name: 'fönstret', poi: 'fönstret', re: /fönst/ },
  tv: { name: 'tv:n', poi: 'tv:n', re: /\btv|teve/ },
  bokhyllan: { name: 'bokhyllan', poi: 'bokhyllan', re: /bok/ },
  skivspelaren: { name: 'skivspelaren', poi: 'skivspelaren', re: /skivspelar|vinyl|grammofon/ },
  tavlan: { name: 'tavlan', poi: 'tavlan', re: /tavl|målning|konst/ },
  dorren: { name: 'dörren', poi: 'dörren', re: /dörr|hallen/ },
};
// Ordningen spelar roll: "läsfåtöljen" måste testas före "fåtöljen"
const PLACE_ORDER = ['lasfatoljen', 'fatoljen', 'soffbordet', 'soffan', 'golvet', 'kylskapet', 'koket', 'matbordet', 'fonstret', 'tv', 'bokhyllan', 'skivspelaren', 'tavlan', 'dorren'];

// Gester: animationsklipp, om de fungerar sittande, och hur länge loopande klipp spelas
export const GESTURES = {
  vinka: { clip: 'wave' },
  dansa: { clip: 'dance', loop: 12 },
  klappa: { clip: 'clap' },
  jubla: { clip: 'cheer' },
  skratta: { clip: 'laugh' },
  rycka_pa_axlarna: { clip: 'shrug', seatedClip: 'sitShrug' },
  stracka_pa_sig: { clip: 'stretch' },
  gaspa: { clip: 'yawn' },
  sitt_pa_huk: { clip: 'crouch', loop: 10 },
  ta_foto: { clip: 'photo' },
  fundera: { clip: 'think' },
};

export const ACTIONS = ['satt_dig', 'lagg_dig', 'sitt_pa', 'res_dig', 'ga_till', 'kom_hit', 'folj_mig', 'sluta_folja', 'stanna', 'lamna_rummet', ...Object.keys(GESTURES)];

// Verktyget som Claude får använda för att göra saker i rummet
export const ACTION_TOOL = {
  name: 'gor_handling',
  description:
    'Utför en fysisk handling i rummet. Använd verktyget när spelaren ber dig göra något (sätta dig, gå någonstans, följa med, dansa, vinka osv.) och du går med på det, eller när du själv väljer att lämna rummet. Skriv först en kort replik och anropa sedan verktyget. Platsen anges bara för satt_dig och ga_till; annars "ingen".',
  input_schema: {
    type: 'object',
    properties: {
      handling: {
        type: 'string',
        enum: ACTIONS,
        description:
          'satt_dig, lagg_dig (lägg dig på golvet, i soffan, på matbordet eller soffbordet; personen går dit, sätter sig på kanten och lägger sig), sitt_pa (sätt dig uppe på matbordet eller soffbordet), res_dig (ställ dig upp, även från golvet eller ett bord), ga_till (gå till en plats), kom_hit (gå fram till spelaren), folj_mig (följ efter spelaren), sluta_folja, stanna (stanna där du är), lamna_rummet, eller en gest: vinka, dansa, klappa, jubla, skratta, rycka_pa_axlarna, stracka_pa_sig, gaspa, sitt_pa_huk, ta_foto, fundera',
      },
      plats: { type: 'string', enum: [...Object.keys(PLACES), 'ingen'] },
    },
    required: ['handling', 'plats'],
    additionalProperties: false,
  },
  strict: true,
  eager_input_streaming: true,
};

export function validCommand(input) {
  if (!input || typeof input !== 'object') return null;
  if (!ACTIONS.includes(input.handling)) return null;
  const place = PLACES[input.plats] ? input.plats : null;
  return { action: input.handling, place };
}

export function findPlace(text) {
  for (const id of PLACE_ORDER) if (PLACES[id].re.test(text)) return id;
  return null;
}

// ---------------- Kläder ----------------
// \b fungerar inte med å, ä och ö, så ordgränser skrivs ut
const W = (s) => new RegExp(`(?<![a-zåäö])(${s})(?![a-zåäö])`);
const COLOR_WORDS = [
  ['vinröd', 'vinröda?|vinrött'],
  ['marinblå', 'marinblå(a|tt)?|mörkblå(a|tt)?'],
  ['ljusblå', 'ljusblå(a|tt)?'],
  ['mörkgrön', 'mörkgröna?|mörkgrönt'],
  ['röd', 'röda?|rött'],
  ['rosa', 'rosa'],
  ['orange', 'orange'],
  ['gul', 'gula?|gult'],
  ['grön', 'gröna?|grönt'],
  ['turkos', 'turkosa?'],
  ['blå', 'blå(a|tt)?'],
  ['lila', 'lila'],
  ['brun', 'bruna?|brunt'],
  ['beige', 'beige'],
  ['vit', 'vita?|vitt'],
  ['grå', 'grå(a|tt)?'],
  ['svart', 'svarta?|svart'],
].map(([k, re]) => [k, new RegExp(`^(${re})$`)]);
const PART_WORDS = {
  overdel: /^(tröj|skjort|t-shirt|topp|jack|blus|linne|klänning|kofta|hoodie|överdel)/,
  underdel: /^(byx|jeans|kjol|shorts|underdel)/,
  skor: /^(sko|kängor|sneakers|gympaskor)/,
};
const colorOf = (w) => COLOR_WORDS.find(([, re]) => re.test(w))?.[0];
const partOf = (w) => Object.keys(PART_WORDS).find((p) => PART_WORDS[p].test(w));

function parseClothes(t) {
  if (!/(byt|byta|ta på|sätt på|klä|ha på dig|ändra|färga)/.test(t)) return null;
  const words = t.split(/\s+/).filter(Boolean);
  const hasPart = words.some(partOf);
  if (!hasPart && !/(kläder|klä om|byt om|byta om|outfit|stil)/.test(t)) return null;
  if (/(vanliga|egna|gamla|riktiga|förra) kläder|som förut|som innan/.test(t)) return { action: 'byt_klader', clothes: { overdel: 'original', underdel: 'original', skor: 'original' } };
  const clothes = {};
  let loose = null;
  words.forEach((w, i) => {
    const c = colorOf(w);
    if (!c) return;
    const p = words.slice(i + 1, i + 4).map(partOf).find(Boolean);
    if (p) clothes[p] = c;
    else loose = c;
  });
  // "klä dig i rött" utan plagg: färga både över- och underdel
  if (loose && !Object.keys(clothes).length) Object.assign(clothes, { overdel: loose, underdel: loose });
  return { action: 'byt_klader', clothes: Object.keys(clothes).length ? clothes : null };
}

// ---------------- Göra saker med andra ----------------
// Ska stämma med INTERACTIONS i interact.js
export const INTERACTION_KINDS = ['kram', 'high_five', 'skaka_hand', 'dansa', 'prata', 'satt_bredvid', 'ga_fram'];
const INTERACT_WORDS = [
  [/kram/, 'kram'],
  [/high.?five|highfive|ge .* en fyra|klappa handen/, 'high_five'],
  [/(skaka|ta) hand|handslag|hälsa på/, 'skaka_hand'],
  [/sätt dig (bredvid|hos|med|nära)|sitt (bredvid|hos|med)/, 'satt_bredvid'],
  [/dansa/, 'dansa'],
  [/(prata|snacka|tala|säg hej|småprata|diskutera|fråga)/, 'prata'],
  [/(gå|kom|spring) (till|fram till|bort till)/, 'ga_fram'],
];

function parseInteraction(t, others) {
  const kind = INTERACT_WORDS.find(([re]) => re.test(t))?.[1];
  if (!kind) return null;
  let person = others.find((n) => W(n.toLowerCase()).test(t));
  if (!person && others.length === 1 && /(varandra|den andra|(?<![a-zåäö])(honom|henne|hen|dem)(?![a-zåäö]))/.test(t)) person = others[0];
  return person ? { action: 'interagera', person, kind } : null;
}

// Tolka en uppmaning på svenska. Returnerar null om texten inte ber personen göra något.
// others = förnamnen på de andra i rummet
export function parseCommand(raw, others = []) {
  const t = raw.toLowerCase().replace(/[!?.,]/g, ' ');
  // Frågor om vanor ("gillar du att dansa?") ska inte tolkas som uppmaningar
  if (/\b(gillar|brukar|tycker|har) du\b/.test(t)) return null;
  const together = parseInteraction(t, others);
  if (together) return together;
  const clothes = parseClothes(t);
  if (clothes) return clothes;
  const place = findPlace(t);
  const rules = [
    [/\b(gå (härifrån|hem|ut)|lämna rummet|stick härifrån|försvinn|dra härifrån)\b/, 'lamna_rummet'],
    [/\b(sluta följa|följ inte)\b/, 'sluta_folja'],
    [/\b(följ (med )?mig|kom med mig|häng med)\b/, 'folj_mig'],
    [/\b(kom hit|kom närmare|kom till mig|kom fram)\b/, 'kom_hit'],
    [/\b(res dig|ställ dig upp|stå upp|upp och stå)\b/, 'res_dig'],
    [/\b(sätt dig|sitt ner|sitta ner|slå dig ner|ta plats|sätta dig)\b(?! på huk)/, 'satt_dig'],
    [/\b(sätt dig på huk|sitt på huk|huka|sätta dig på huk)\b/, 'sitt_pa_huk'],
    [/\b(stanna|vänta|stå still|stå kvar)\b/, 'stanna'],
    [/\bdansa\b/, 'dansa'],
    [/\bvinka\b/, 'vinka'],
    [/\b(klappa|applådera)\b/, 'klappa'],
    [/\b(jubla|heja|fira)\b/, 'jubla'],
    [/\bskratta\b/, 'skratta'],
    [/\b(ryck på axlarna|rycka på axlarna)\b/, 'rycka_pa_axlarna'],
    [/\b(sträck på dig|stretcha|sträcka på dig)\b/, 'stracka_pa_sig'],
    [/\bgäspa\b/, 'gaspa'],
    [/\b(ta (ett |en )?(foto|bild|kort)|fota)\b/, 'ta_foto'],
    [/\b(tänk efter|fundera)\b/, 'fundera'],
    [/\b(gå|spring|ställ dig|ta dig) (till|vid|bort till|fram till|mot|in i|ut i)\b/, 'ga_till'],
  ];
  // Lägga sig eller sitta på en möbel ("lägg dig på bordet", "sätt dig på soffbordet")
  if (/(lägg dig|ligg|lägga dig|vila dig)/.test(t) && place && ['soffan', 'matbordet', 'soffbordet'].includes(place) && !/magen/.test(t)) return { action: 'lagg_dig', place };
  if (/(sätt dig|sitt|sätta dig|hoppa upp) (uppe )?på (mat|soff)?bordet/.test(t) && ['matbordet', 'soffbordet'].includes(place)) return { action: 'sitt_pa', place };
  // Rörelser som personerna har lärt sig tidigare (skapade av Claude), t.ex. "gör karatesparken"
  for (const [name, def] of Object.entries(savedMotions())) {
    const words = name.replace(/_/g, ' ');
    if (words.length > 2 && t.includes(words)) return { action: 'rorelse', place: null, motion: def, name };
  }
  for (const [re, name] of MOTION_PHRASES) if (re.test(t)) return { action: 'rorelse', place: null, motion: PRESETS[name], name };
  for (const [re, action] of rules) {
    if (re.test(t)) {
      // "ställ dig vid fönstret" är en förflyttning, inte att resa sig
      if (action === 'res_dig' && place && /ställ dig/.test(t)) return { action: 'ga_till', place };
      return { action, place };
    }
  }
  return null;
}

// ---------------- Repliker ----------------
const YES = {
  vänlig: ['Absolut!', 'Gärna!', 'Självklart.'],
  blyg: ['Öh… okej.', 'Ja… visst.', 'Okej…'],
  sarkastisk: ['Som du befaller.', 'Jaha, då gör vi det då.', 'Det var ju precis vad jag ville.'],
  entusiastisk: ['Ja! Gärna!', 'Åh, kul idé!', 'Klart jag gör!'],
  grinig: ['Suck. Okej då.', 'Om jag måste.', 'Mm. Fine.'],
  filosofisk: ['Varför inte. Allt är ju rörelse.', 'Ett litet steg för mig…', 'Om du säger det.'],
  charmig: ['För dig? Självklart.', 'Allt för dig.', 'Med nöje.'],
};

const DOING = {
  satt_dig: (p, at) => (at ? `Jag sätter mig ${at}.` : 'Jag sätter mig.'),
  lagg_dig: (p) => (p && p !== 'golvet' ? `Jag lägger mig ${p === 'soffan' ? 'i' : 'på'} ${p}.` : '*lägger sig på golvet*'),
  sitt_pa: (p) => `*hoppar upp och sätter sig på ${p}*`,
  res_dig: () => 'Jag ställer mig upp.',
  ga_till: (p) => (p ? `Jag går bort till ${p}.` : 'Vart då?'),
  kom_hit: () => 'Jag kommer.',
  folj_mig: () => 'Jag följer efter dig.',
  sluta_folja: () => 'Okej, jag stannar här.',
  stanna: () => 'Jag stannar här.',
  lamna_rummet: () => 'Då går jag. Hej då!',
  vinka: () => 'Hej hej! *vinkar*',
  dansa: () => 'Musik i huvudet… nu kör vi!',
  klappa: () => '*klappar händerna*',
  jubla: () => 'Jaaa! *jublar*',
  skratta: () => 'Haha!',
  rycka_pa_axlarna: () => '*rycker på axlarna*',
  stracka_pa_sig: () => 'Åh, det behövdes. *sträcker på sig*',
  gaspa: () => '*gäspar* Förlåt, lång dag.',
  sitt_pa_huk: () => '*sätter sig på huk*',
  ta_foto: () => 'Le! *tar en bild*',
  fundera: () => 'Hmm, låt mig tänka…',
  rorelse: (p, at, cmd) => `*${cmd.motion?.beskrivning || cmd.name || 'gör det'}*`,
  byt_klader: (p, at, cmd) => {
    const c = cmd.clothes;
    if (!c) return '*byter om* Vad tycker du?';
    if (PARTS.every((k) => c[k] === 'original')) return '*byter tillbaka till sina vanliga kläder*';
    const names = { overdel: 'överdel', underdel: 'underdel', skor: 'skor' };
    const list = PARTS.filter((k) => c[k] && c[k] !== 'original').map((k) => `${c[k]} ${names[k]}`);
    return `*byter om till ${list.join(' och ')}* Snyggt?`;
  },
  interagera: (p, at, cmd) =>
    ({
      kram: `Kom hit, ${cmd.person}! *kramar*`,
      high_five: `${cmd.person}, ge mig fem!`,
      skaka_hand: `*skakar hand med ${cmd.person}*`,
      dansa: `${cmd.person}, ska vi dansa?`,
      prata: `Jag ska prata lite med ${cmd.person}.`,
      satt_bredvid: `Jag sätter mig bredvid ${cmd.person}.`,
      ga_fram: `Jag går bort till ${cmd.person}.`,
    })[cmd.kind] || `*går till ${cmd.person}*`,
};

const FAIL = {
  occupied: (p, at) => (at ? `Det är fullt ${at}.` : 'Det finns ingen ledig plats att sitta på.'),
  noSeat: (p) => `Man kan inte sitta vid ${p}.`,
  noPlace: () => 'Vart menar du? Jag kan gå till köket, fönstret, bokhyllan, tv:n, skivspelaren, tavlan, kylskåpet eller dörren.',
  already: () => 'Det gör jag ju redan.',
  noPath: () => 'Jag kommer inte fram dit.',
  noPerson: () => 'Vem menar du? Jag ser ingen med det namnet här.',
  notSeated: () => 'Men hen sitter ju inte ner.',
  noClothes: () => 'Det går inte att byta kläder just nu.',
};

export function commandReply(persona, cmd, result) {
  const place = cmd.place ? PLACES[cmd.place] : null;
  if (!result.ok) return FAIL[result.reason]?.(place?.name, place?.at) || 'Det går inte just nu.';
  const yes = cmd.action === 'lamna_rummet' ? '' : `${pick(YES[persona.personality.id] || YES.vänlig)} `;
  return `${yes}${DOING[cmd.action](place?.name, place?.at, cmd)}`;
}

// Text som Claude får tillbaka om hur det gick
export function commandResultText(cmd, result) {
  if (result.ok && cmd.action === 'byt_klader') return `Klart: kläderna har bytt färg (${cmd.clothes ? PARTS.map((k) => `${k}: ${cmd.clothes[k] || 'samma'}`).join(', ') : 'slumpade färger'}).`;
  if (result.ok && cmd.action === 'interagera') return `Klart: du går fram till ${cmd.person} och ni gör ${cmd.kind} tillsammans en stund.`;
  if (result.ok && cmd.action === 'rorelse') return `Klart: rörelsen ${cmd.name || ''} spelas upp${cmd.saved ? ' och är sparad' : ''}.`;
  if (result.ok) return `Klart: ${cmd.action}${cmd.place ? ` (${PLACES[cmd.place].name})` : ''}.`;
  return `Gick inte: ${cmd.action} (${result.reason}). Förklara det kort för spelaren.`;
}

// Känslor som syns i ansiktet i närbildsläget
export const EMOTIONS = { glad: 'happy', skrattar: 'laugh', ledsen: 'sad', arg: 'angry', forvanad: 'surprised', fundersam: 'thinking', trott: 'tired', neutral: 'neutral' };

export const EMOTION_TOOL = {
  name: 'visa_kansla',
  description: 'Visa en känsla i ansiktet medan du säger din replik. Använd när din känsla tydligt syns eller ändras (inte i varje replik).',
  input_schema: {
    type: 'object',
    properties: { kansla: { type: 'string', enum: Object.keys(EMOTIONS) } },
    required: ['kansla'],
    additionalProperties: false,
  },
  strict: true,
  eager_input_streaming: true,
};

// ---------------- Verktyg för kläder och för att göra saker med andra ----------------
const CLOTH_CHOICES = [...Object.keys(COLORS), 'behall', 'original'];

export const CLOTHES_TOOL = {
  name: 'byt_klader',
  description:
    'Byt kläder (färga om dem) när spelaren ber om det. Plaggen kan inte bytas mot andra plagg, men överdel (tröja/skjorta/klänning), underdel (byxor/kjol) och skor kan få en ny färg. "behall" = behåll som nu, "original" = de ursprungliga kläderna.',
  input_schema: {
    type: 'object',
    properties: Object.fromEntries(PARTS.map((p) => [p, { type: 'string', enum: CLOTH_CHOICES }])),
    required: PARTS,
    additionalProperties: false,
  },
  strict: true,
  eager_input_streaming: true,
};

export function validClothes(input) {
  if (!input || typeof input !== 'object') return null;
  const clothes = {};
  for (const p of PARTS) if (CLOTH_CHOICES.includes(input[p]) && input[p] !== 'behall') clothes[p] = input[p];
  return { action: 'byt_klader', place: null, clothes };
}

export const INTERACT_TOOL = {
  name: 'interagera',
  description:
    'Gör något tillsammans med en annan person i rummet när spelaren ber om det: kram, high_five, skaka_hand, dansa (tillsammans), prata (ni pratar med varandra; skriv replikerna), satt_bredvid (sätt dig bredvid personen som sitter), ga_fram (gå fram till personen). Du går själv fram till den andra. Skriv först en kort replik till spelaren.',
  input_schema: {
    type: 'object',
    properties: {
      person: { type: 'string', description: 'Förnamnet på den andra personen (se "Andra i rummet")' },
      handling: { type: 'string', enum: INTERACTION_KINDS },
      repliker: {
        type: 'array',
        description: 'Bara för prata: 2–6 korta repliker som ni säger till varandra, i tur och ordning (annars tom lista). vem = jag (du) eller den_andra.',
        items: {
          type: 'object',
          properties: { vem: { type: 'string', enum: ['jag', 'den_andra'] }, text: { type: 'string' } },
          required: ['vem', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['person', 'handling', 'repliker'],
    additionalProperties: false,
  },
  strict: true,
};

export function validInteraction(input) {
  if (!input || typeof input !== 'object' || !INTERACTION_KINDS.includes(input.handling)) return null;
  const lines = (Array.isArray(input.repliker) ? input.repliker : [])
    .filter((l) => l && typeof l.text === 'string' && l.text.trim())
    .map((l) => ({ vem: l.vem === 'den_andra' ? 'den_andra' : 'jag', text: l.text.trim().slice(0, 160) }))
    .slice(0, 8);
  return { action: 'interagera', place: null, person: String(input.person || ''), kind: input.handling, lines };
}
