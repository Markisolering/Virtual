// Handlingar som spelaren kan be personerna om, t.ex. "sätt dig i soffan", "följ mig" eller "dansa".
// Används både av den inbyggda samtalsmotorn (tolkar texten själv) och av Claude (via ett verktyg).

import { PRESETS, savedMotions } from './motion.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Färdiga egna rörelser som den inbyggda motorn känner igen
const MOTION_PHRASES = [
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
  matbordet: { name: 'matbordet', at: 'vid matbordet', seat: 'matbordet', poi: 'matbordet', re: /matbord|bordet|middagsbord|\bstol/ },
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
const PLACE_ORDER = ['lasfatoljen', 'fatoljen', 'soffan', 'kylskapet', 'koket', 'matbordet', 'fonstret', 'tv', 'bokhyllan', 'skivspelaren', 'tavlan', 'dorren'];

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

export const ACTIONS = ['satt_dig', 'res_dig', 'ga_till', 'kom_hit', 'folj_mig', 'sluta_folja', 'stanna', 'lamna_rummet', ...Object.keys(GESTURES)];

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
          'satt_dig, res_dig (ställ dig upp), ga_till (gå till en plats), kom_hit (gå fram till spelaren), folj_mig (följ efter spelaren), sluta_folja, stanna (stanna där du är), lamna_rummet, eller en gest: vinka, dansa, klappa, jubla, skratta, rycka_pa_axlarna, stracka_pa_sig, gaspa, sitt_pa_huk, ta_foto, fundera',
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

// Tolka en uppmaning på svenska. Returnerar null om texten inte ber personen göra något.
export function parseCommand(raw) {
  const t = raw.toLowerCase().replace(/[!?.,]/g, ' ');
  // Frågor om vanor ("gillar du att dansa?") ska inte tolkas som uppmaningar
  if (/\b(gillar|brukar|tycker|har) du\b/.test(t)) return null;
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
};

const FAIL = {
  occupied: (p, at) => (at ? `Det är fullt ${at}.` : 'Det finns ingen ledig plats att sitta på.'),
  noSeat: (p) => `Man kan inte sitta vid ${p}.`,
  noPlace: () => 'Vart menar du? Jag kan gå till köket, fönstret, bokhyllan, tv:n, skivspelaren, tavlan, kylskåpet eller dörren.',
  already: () => 'Det gör jag ju redan.',
  noPath: () => 'Jag kommer inte fram dit.',
};

export function commandReply(persona, cmd, result) {
  const place = cmd.place ? PLACES[cmd.place] : null;
  if (!result.ok) return FAIL[result.reason]?.(place?.name, place?.at) || 'Det går inte just nu.';
  const yes = cmd.action === 'lamna_rummet' ? '' : `${pick(YES[persona.personality.id] || YES.vänlig)} `;
  return `${yes}${DOING[cmd.action](place?.name, place?.at, cmd)}`;
}

// Text som Claude får tillbaka om hur det gick
export function commandResultText(cmd, result) {
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
