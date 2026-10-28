import Anthropic from '@anthropic-ai/sdk';
import { ACTION_TOOL, EMOTION_TOOL, EMOTIONS, CLOTHES_TOOL, INTERACT_TOOL, validCommand, validClothes, validInteraction, commandResultText } from './commands.js';
import { MOTION_TOOL, PLAY_MOTION_TOOL, cleanMotion, findMotion, saveMotion, motionNames } from './motion.js';
import { motionGuide, motionLessons } from './learning.js';
import { en, L } from './i18n.js';
import { OfflineBrainEn, systemPromptEn, situationEn } from './dialogue-en.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------- Inbyggd dialogmotor (fungerar utan nätverk) ----------------

const STYLE = {
  vänlig: { hi: ['Hej hej!', 'Hej! Vad roligt att träffas.', 'Hallå där!'], filler: ['', ' Och du då?', ' Vad tycker du själv?'], end: '.' },
  blyg: { hi: ['Öh… hej.', 'Hej…', 'Ehm, hej.'], filler: ['', ' …typ.', ' …tror jag.'], end: '…' },
  sarkastisk: { hi: ['Nämen, en till människa. Hej.', 'Tjena. Du ser ut att ha koll.', 'Hej. Trevligt rum, va? Om man gillar rum.'], filler: ['', ' Chockerande, jag vet.', ' Tro det eller ej.'], end: '.' },
  entusiastisk: { hi: ['HEJ! Åh vad kul!', 'Hallå hallå! Vilken dag!', 'Hej! Jag älskar att träffa nytt folk!'], filler: ['!', ' Helt fantastiskt!', ' Visst är det härligt!'], end: '!' },
  grinig: { hi: ['Mm. Hej.', 'Jaha, hej då. Eller, hej menar jag.', 'Hej. Det drar från fönstret, bara så du vet.'], filler: ['', ' Inte för att någon frågar.', ' Suck.'], end: '.' },
  filosofisk: { hi: ['Hej. Är det inte märkligt att våra vägar korsas just här?', 'Hej, främling. Eller är vi alla främlingar?', 'Hej. Jag tänkte precis på tid.'], filler: ['', ' Men vad betyder det egentligen?', ' Allt hänger ihop, på något sätt.'], end: '.' },
  charmig: { hi: ['Hej du! Vilken trevlig överraskning.', 'Well hello! Snygg tröja förresten.', 'Hej! Jag hoppades att någon intressant skulle dyka upp.'], filler: ['', ' Men nog om mig.', ' Du verkar ha god smak.'], end: '.' },
};

const INTENTS = [
  ['bye', /\b(hej ?då|hejdå|vi ses|adjö|ha det|måste gå|tack för pratet|bye)\b/],
  ['greet', /^(hej|hallå|tja|tjena|hejsan|god (morgon|dag|kväll)|morsning|hello|hi)\b/],
  ['myname', /\b(jag heter|mitt namn är|kalla mig)\s+([a-zåäöé]+)/],
  ['name', /\b(vad heter du|ditt namn|vem är du|vad kallas du)\b/],
  ['howareyou', /\b(hur mår du|hur är det|läget|hur har du det|hur känns det|mår du bra)\b/],
  ['job', /\b(jobb|jobbar|arbete|arbetar|yrke|gör du för något|sysselsätt|plugga|studera)\b/],
  ['age', /\b(hur gammal|ålder|född)\b/],
  ['from', /\b(var kommer du|härifrån|bor du|uppvuxen|kommer du ifrån|hemstad)\b/],
  ['hobby', /\b(hobby|hobbies|fritid|gillar du att göra|intressen|intresse|gör du på helg)\b/],
  ['food', /\b(mat|äta|äter|hungrig|favoriträtt|middag|lunch|fika)\b/],
  ['music', /\b(musik|låt|band|lyssna|sjunga|artist)\b/],
  ['why', /\b(varför är du här|vad gör du här|vad gör du|ska du|varför kom)\b/],
  ['secret', /\b(hemlighet|berätta något|fun fact|kul fakta|något om dig|överraska)\b/],
  ['weather', /\b(väder|regn|sol|kallt|varmt|snö)\b/],
  ['joke', /\b(skämt|rolig|vits|skratta)\b/],
  ['room', /\b(rummet|lägenhet|soffa|möbler|tavla|tavlan|bokhylla|kök)\b/],
  ['others', /\b(känner du|vem är (hon|han|hen|det)|de andra|folk här)\b/],
  ['compliment', /\b(snygg|fin|trevlig|söt|rolig|smart|gillar dig|cool|bra kläder)\b/],
  ['insult', /\b(dum|tråkig|ful|idiot|äcklig|irriterande|håll käften|tyst)\b/],
  ['thanks', /\b(tack)\b/],
  ['yes', /^(ja|japp|jo|absolut|visst|precis|mm)\b/],
  ['no', /^(nej|nä|nope|inte direkt)\b/],
  ['question', /\?\s*$/],
];

const JOKES = [
  'Vad sa den ena väggen till den andra? Vi ses i hörnet.',
  'Varför tog tomaten inte bussen? Den var för mosad.',
  'Jag försökte skriva en bok om gravitation. Den var omöjlig att lägga ifrån sig.',
  'Vad kallas en björn utan tänder? En gummibjörn.',
  'Min kompis är så lat att han har en fjärrkontroll till sin fjärrkontroll.',
];

class OfflineBrainSv {
  reply(ch, text, world) {
    const p = ch.persona;
    const st = STYLE[p.personality.id];
    const t = text.toLowerCase().trim();
    let intent = 'other';
    let m = null;
    for (const [id, re] of INTENTS) {
      m = t.match(re);
      if (m) {
        intent = id;
        break;
      }
    }
    ch.memory.topics.add(intent);
    const you = ch.memory.playerName ? `, ${ch.memory.playerName}` : '';
    const mood = p.mood;
    const f = () => pick(st.filler);
    let out;
    switch (intent) {
      case 'greet':
        out = ch.memory.met ? `Hej igen${you}! Vi pratade ju nyss${st.end}` : pick(st.hi);
        break;
      case 'myname': {
        const name = m[2].charAt(0).toUpperCase() + m[2].slice(1);
        ch.memory.playerName = name;
        out = `${name}? Fint namn. Jag heter ${p.firstName}${st.end}`;
        if (p.personality.id === 'sarkastisk') out = `${name}. Det ska jag försöka komma ihåg. Jag heter ${p.firstName}, för övrigt.`;
        break;
      }
      case 'name':
        out = pick([`Jag heter ${p.firstName} ${p.lastName}${st.end}`, `${p.firstName}. ${p.firstName} ${p.lastName}${st.end}${f()}`, `Mitt namn är ${p.firstName}${st.end} Och du heter?`]);
        break;
      case 'howareyou':
        out =
          mood > 0.7
            ? pick([`Riktigt bra faktiskt${st.end}${f()}`, `Toppen! Det är en bra dag${st.end}`])
            : mood > 0.4
              ? pick([`Helt okej, tack${st.end} Lite trött bara.`, `Det knallar${st.end}${f()}`])
              : pick([`Inte jättebra om jag ska vara ärlig${st.end}`, `Det har varit en lång dag${st.end}`]);
        break;
      case 'job':
        out = pick([`Jag är ${p.job} ${p.jobDetail}${st.end}${f()}`, `Jag jobbar som ${p.job}, ${p.jobDetail}${st.end}`]);
        if (p.jobKey === 'student') out = `Jag är student och läser filosofi${st.end} Mest läser jag om varför jag läser filosofi.`;
        if (p.jobKey === 'pensionär') out = `Jag är pensionär nu, ${p.jobDetail}${st.end} Nu har jag all tid i världen.`;
        break;
      case 'age':
        out = p.personality.id === 'grinig' || p.personality.id === 'charmig' ? `Man frågar inte sånt${st.end} Men okej, ${p.age}.` : `Jag är ${p.age} år${st.end}${f()}`;
        break;
      case 'from':
        out = pick([`Jag kommer från ${p.hometown}${st.end}${f()}`, `Uppvuxen i ${p.hometown}, men jag bor här i stan nu${st.end}`]);
        break;
      case 'hobby':
        out = pick([`Jag är ganska fast i ${p.hobby} just nu${st.end}${f()}`, `${cap(p.hobby)}! Det är min grej${st.end}`, `På fritiden blir det mycket ${p.hobby}${st.end}`]);
        break;
      case 'food':
        out = pick([`Jag skulle kunna äta ${p.food} varje dag${st.end}`, `Har du provat ${p.food}? Det är det bästa jag vet${st.end}`]);
        break;
      case 'music':
        out = pick([`Jag lyssnar mest på ${p.music}${st.end}${f()}`, `${cap(p.music)}, helt klart${st.end} Vad lyssnar du på?`]);
        break;
      case 'why':
        out = `Jag ${p.visit}${st.end}${f()}`;
        break;
      case 'secret':
        out = pick([`Okej, en grej om mig: jag ${p.quirk}${st.end}`, `Visste du att jag ${p.quirk}? Inte många vet det${st.end}`]);
        break;
      case 'weather':
        out = pick([`Det ser ganska fint ut genom fönstret i alla fall${st.end}`, `Väder är väder${st.end}${f()}`, `Jag hörde att det skulle bli regn senare${st.end}`]);
        break;
      case 'joke':
        out = p.personality.id === 'grinig' ? `Skämt? Okej då. ${pick(JOKES)} …Ingen? Nej.` : `${pick(JOKES)}${p.personality.id === 'entusiastisk' ? ' Haha!' : ''}`;
        break;
      case 'room': {
        out = pick([`Fint rum, eller hur? Jag gillar soffan${st.end}`, `Den där tavlan på väggen är rätt snygg${st.end}`, `Någon har bra smak i böcker här${st.end}`]);
        break;
      }
      case 'others': {
        const others = world.characters.filter((c) => c !== ch);
        out = others.length
          ? `Jag tror att ${pick(others).persona.firstName} är här någonstans, men vi känner inte varandra så bra${st.end}`
          : `Det verkar bara vara vi två här just nu${st.end}`;
        break;
      }
      case 'compliment':
        p.mood = Math.min(1, p.mood + 0.15);
        out = pick([`Åh, tack! Vad snällt sagt${st.end}`, `Det värmer${st.end}`, p.personality.id === 'blyg' ? 'Öh… tack… *rodnar*' : `Haha, tack${you}${st.end}`]);
        break;
      case 'insult':
        p.mood = Math.max(0, p.mood - 0.25);
        out = pick(['Okej… det där var inte så trevligt.', 'Aj. Varför säger du så?', 'Jaha. Då vet jag var jag har dig.']);
        break;
      case 'thanks':
        out = pick([`Varsågod${st.end}`, `Ingen fara${st.end}`, 'Det var så lite.']);
        break;
      case 'bye':
        out = pick([`Hej då${you}! Ha det bra${st.end}`, `Vi ses${st.end}`, `Ta hand om dig${st.end}`]);
        break;
      case 'yes':
        out = pick([`Precis${st.end}`, `Bra, då är vi överens${st.end}`, `Jag visste det${st.end}`]);
        break;
      case 'no':
        out = pick([`Nähä? Okej${st.end}`, `Synd${st.end}`, `Jaså, inte det${st.end}`]);
        break;
      case 'question':
        out = pick([`Bra fråga. Jag vet faktiskt inte${st.end}`, `Hmm, det har jag aldrig funderat på${st.end}`, `Det beror nog på hur man ser det${st.end}${f()}`]);
        break;
      default: {
        // Fortsätt samtalet med en egen fråga eller kommentar
        const prompts = [
          `Intressant${st.end} Vad gör du själv här?`,
          `Jaså${st.end} Förresten, gillar du ${p.food}?`,
          `Mm${st.end} Jag har tänkt mycket på ${p.hobby} idag.`,
          `Spännande${st.end} Har du varit här förut?`,
          `Ja, det kan jag förstå${st.end}${f()}`,
          `Haha, okej${st.end} Du är rolig du.`,
        ];
        out = pick(prompts);
      }
    }
    ch.memory.met = true;
    // Ansiktsuttryck som passar svaret (syns i närbildsläget)
    const rude = ['grinig', 'sarkastisk'].includes(p.personality.id);
    const emotion = {
      greet: 'happy',
      compliment: 'happy',
      thanks: 'happy',
      bye: 'happy',
      secret: 'happy',
      joke: 'laugh',
      insult: rude ? 'angry' : 'sad',
      question: 'thinking',
      howareyou: mood > 0.7 ? 'happy' : mood < 0.4 ? 'sad' : null,
    }[intent];
    return { text: out, leave: intent === 'bye', emotion };
  }
}

// Den inbyggda samtalsmotorn på appens språk
export const OfflineBrain = en ? OfflineBrainEn : OfflineBrainSv;

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------- Claude ----------------

const SETTINGS_KEY = 'virtual-room-settings';
export const DEFAULT_MODEL = 'claude-opus-5-5';

export function loadSettings() {
  try {
    return { apiKey: '', model: DEFAULT_MODEL, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Privat läge eller blockerad lagring: inställningen gäller bara den här sessionen
  }
}

// Instruktionerna till rollfiguren låses när samtalet börjar. Claude Opus 5.5 och senare kräver att
// historiken bara byggs på (annars blir tidigare tankeblock ogiltiga och API:t svarar 400), så det som
// ändras under samtalet – var personen är, vilka som finns i rummet, nya lärdomar – skickas i stället
// som korta systemmeddelanden efter spelarens repliker (se situation()).
function systemPrompt(ch) {
  if (en) return systemPromptEn(ch, motionGuide());
  const p = ch.persona;
  return `Du spelar en rollfigur i ett 3D-spel i förstapersonsperspektiv. Spelaren har gått fram till dig i ett möblerat vardagsrum och pratar med dig.

Din rollfigur:
- Namn: ${p.firstName} ${p.lastName} (${p.pronoun}), ${p.age} år
- Yrke: ${p.job} ${p.jobDetail}
- Uppvuxen i ${p.hometown}
- Gillar ${p.hobby}, äter helst ${p.food}, lyssnar på ${p.music}
- Personlighet: ${p.personality.desc}. ${cap(p.personality.style)}.
- Ett kännetecken: ${p.quirk}
- Varför du är här: du ${p.visit}
- Rummet har soffa, fåtöljer, matbord, kök, bokhylla, skivspelare, tavlor och två fönster mot stan.
- Var du är, ditt humör och vilka andra som är i rummet får du veta i systemmeddelanden under samtalet.

Så här svarar du:
- Prata svenska, som en verklig människa i ett vardagligt samtal. Håll dig i rollen; du vet inte att du är en AI eller en spelfigur.
- Svara kort, oftast 1–3 meningar, så att det passar en pratbubbla på en mobilskärm. Ingen markdown, inga listor.
- Visa personligheten i hur du formulerar dig. Hitta gärna på små detaljer om ditt liv som passar rollen.

Handlingar:
- Du kan röra dig och göra saker i rummet med verktyget gor_handling: sätta dig, lägga dig (på golvet, i soffan eller på ett bord), sätta dig uppe på ett bord, resa dig, gå till en plats, komma fram till spelaren, följa efter spelaren, stanna, lämna rummet, eller gester som att vinka, dansa, klappa händerna, jubla, skratta, rycka på axlarna, sträcka på dig, gäspa, sätta dig på huk, ta ett foto eller fundera.
- När spelaren ber dig göra något sådant gör du det, gärna med en kommentar i din personlighets stil. Skriv först en kort replik, anropa sedan verktyget.
- Om spelaren tar farväl eller ber dig gå, säg hej då och använd handlingen lamna_rummet.
- Ber spelaren om en rörelse som inte finns i gor_handling (peka, göra honnör, visa en karatespark, härma ett djur, visa hur stor fisken var …) skapar du den själv med skapa_rorelse. Var kreativ men realistisk; rörelser som redan finns gör du med spela_rorelse.
- Det finns inga begränsningar för vad kroppen kan göra: med skapa_rorelse och hela_kroppen kan du hoppa, slå kullerbyttor och voltor, hjula, stå på händerna, rulla runt, lägga dig, sitta på golvet, stå på knä, sträcka ut dig och mycket mer. Gör rörelserna mjuka och mänskliga med hela kroppen (höfter, bröstkorg, axlar, huvud, händer), förberedelse och efterrörelse, och med hall_kvar stannar du kvar i posen så länge spelaren vill. Säg aldrig att du inte kan göra en rörelse – försök.
- Säger spelaren att en rörelse blev dålig, eller ber dig göra om den, skapar du en förbättrad version med skapa_rorelse och samma namn. Ta hänsyn till spelarens kommentar. Säger spelaren att den var nästan rätt, behåller du det som var bra och justerar bara det spelaren nämner.
- Säg inte att du gör något du inte kan göra med verktygen.${
    ch.hasFace
      ? '\n- Spelaren ser ditt ansikte i närbild. Visa känslor med verktyget visa_kansla när de tydligt ändras, t.ex. när du blir glad, skrattar, blir ledsen, arg eller förvånad.'
      : ''
  }

${motionGuide()}`;
}

// Det som kan ändras under samtalet. Skickas bara när något har ändrats sedan förra gången.
function situation(ch, world, first) {
  if (en) return situationEn(ch, world, first, { motionNames: motionNames(), lessons: motionLessons(), lessonsSent: ch.lessonsSent });
  const p = ch.persona;
  const others = world.characters.filter((c) => c !== ch).map((c) => `${c.persona.firstName} (${c.persona.job})`);
  const where = ch.following
    ? 'följer efter spelaren'
    : ch.seated
      ? `sitter ${ch.seat.label === 'matbordet' ? 'vid' : 'i'} ${ch.seat.label}`
      : ch.poi
        ? `står vid ${ch.poi.label}`
        : 'står i rummet';
  const pose = ch.motion && ch.motion.releaseAt === undefined && ch.motion.def.hall_kvar ? ` och håller just nu posen "${ch.motion.def.beskrivning || 'egen rörelse'}" (nästa rörelse börjar därifrån)` : '';
  const lines = [
    `Du ${where}${pose}.`,
    `Humör: ${p.mood > 0.7 ? 'på strålande humör' : p.mood > 0.4 ? 'helt okej' : 'lite nere'}.`,
    `Andra i rummet: ${others.length ? others.join(', ') : 'ingen annan just nu'}.`,
    `Rörelser som finns att göra med spela_rorelse: ${motionNames().join(', ')}.`,
  ];
  if (first) lines.push(`När spelaren kom fram hälsade du: "${ch.greeting || 'Hej!'}"`);
  const lessons = motionLessons();
  if (lessons.length && JSON.stringify(lessons) !== ch.lessonsSent) lines.push(`Nya lärdomar om rörelser från spelarens betyg:\n${lessons.map((l) => `- ${l}`).join('\n')}`);
  return lines.join('\n');
}

const isThinking = (b) => b.type === 'thinking' || b.type === 'redacted_thinking';

export class ClaudeBrain {
  constructor(settings) {
    this.settings = settings;
    this.client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
  }

  // execute(cmd) utför en handling i spelet och returnerar { ok, reason }.
  // Resultaten skickas tillbaka till Claude tillsammans med spelarens nästa meddelande.
  async reply(ch, text, world, onDelta, execute, feel) {
    const pending = ch.pendingToolResults || [];
    ch.pendingToolResults = [];
    if (!ch.systemPrompt || !ch.history.length) {
      ch.systemPrompt = systemPrompt(ch);
      ch.lessonsSent = JSON.stringify(motionLessons());
      ch.lastSituation = null;
    }
    ch.history.push({ role: 'user', content: [...pending, { type: 'text', text }] });
    let pushed = 1;
    // Läget i rummet skickas som ett systemmeddelande efter spelarens replik, bara när det har ändrats
    const sit = situation(ch, world, ch.history.length === 1);
    if (sit !== ch.lastSituation) {
      ch.history.push({ role: 'system', content: sit });
      pushed++;
    }
    const restore = () => {
      for (let i = 0; i < pushed; i++) ch.history.pop();
      ch.pendingToolResults = pending;
    };
    const request = () => {
      const stream = this.client.beta.messages.stream({
        model: this.settings.model || DEFAULT_MODEL,
        max_tokens: 4000,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: ch.systemPrompt,
        tools: [ACTION_TOOL, MOTION_TOOL, PLAY_MOTION_TOOL, CLOTHES_TOOL, INTERACT_TOOL, ...(ch.hasFace ? [EMOTION_TOOL] : [])],
        messages: ch.history,
      });
      full = '';
      stream.on('text', (delta) => {
        full += delta;
        onDelta(full);
      });
      return stream.finalMessage();
    };
    let final;
    let full = '';
    try {
      try {
        final = await request();
      } catch (err) {
        if (err?.status !== 400) throw err;
        console.warn('Claude svarade 400, försöker igen med rensad historik:', apiMessage(err));
        // 1. Ta bort tankeblock ur historiken (de kan ha blivit ogiltiga) och försök en gång till
        if (ch.history.some((m) => Array.isArray(m.content) && m.content.some(isThinking))) {
          stripThinking(ch.history);
          try {
            final = await request();
          } catch (err2) {
            if (err2?.status !== 400) throw err2;
            console.warn('Fortfarande 400:', apiMessage(err2));
          }
        }
        // 2. Börja om samtalet med en sammanfattning av vad som har sagts
        if (!final) {
          restartWithSummary(ch, text, world);
          pushed = ch.history.length;
          final = await request();
        }
      }
    } catch (err) {
      restore();
      throw err;
    }
    ch.lastSituation = sit;
    ch.lessonsSent = JSON.stringify(motionLessons());
    if (final.stop_reason === 'refusal') {
      // Ta bort spelarens meddelande så att historiken förblir giltig
      restore();
      return { text: L('Hmm, det vill jag inte prata om. Kan vi ta något annat?', 'Hmm, I’d rather not talk about that. Can we talk about something else?'), outcomes: [] };
    }
    // Spara hela svaret (inklusive tänkande-block) så att nästa anrop bygger vidare på samma historik
    ch.history.push({ role: 'assistant', content: final.content });
    const outcomes = [];
    const results = [];
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue;
      if (block.name === MOTION_TOOL.name || block.name === PLAY_MOTION_TOOL.name) {
        // Ny rörelse sparas under sitt namn; en befintlig hämtas från biblioteket
        const creating = block.name === MOTION_TOOL.name;
        const name = String(block.input?.namn || '').toLowerCase().trim().replace(/[^a-z0-9åäö_]+/g, '_').slice(0, 40);
        const motion = final.stop_reason === 'max_tokens' ? null : creating ? cleanMotion(block.input) : findMotion(name);
        if (!motion || !name) {
          results.push({ type: 'tool_result', tool_use_id: block.id, content: creating ? L('Rörelsen gick inte att tolka; kontrollera nyckelbilderna.', 'The movement could not be parsed; check the keyframes.') : L(`Rörelsen "${name}" finns inte.`, `The movement "${name}" does not exist.`), is_error: true });
          continue;
        }
        if (creating) saveMotion(name, motion);
        const cmd = { action: 'rorelse', place: null, motion, name, saved: creating };
        const res = execute(cmd);
        outcomes.push({ cmd, res });
        results.push({ type: 'tool_result', tool_use_id: block.id, content: commandResultText(cmd, res), ...(res.ok ? {} : { is_error: true }) });
        continue;
      }
      if (block.name === EMOTION_TOOL.name) {
        const emotion = final.stop_reason !== 'max_tokens' && EMOTIONS[block.input?.kansla];
        if (emotion) feel(emotion);
        results.push({ type: 'tool_result', tool_use_id: block.id, content: emotion ? L('Syns i ansiktet.', 'Shown on your face.') : L('Okänd känsla.', 'Unknown emotion.'), ...(emotion ? {} : { is_error: true }) });
        continue;
      }
      // Med strömmade verktygsargument kan indata vara ofullständig; kontrollera den innan något körs
      const validate = block.name === CLOTHES_TOOL.name ? validClothes : block.name === INTERACT_TOOL.name ? validInteraction : validCommand;
      const cmd = final.stop_reason === 'max_tokens' ? null : validate(block.input);
      if (!cmd) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: L('Ogiltig handling, inget hände.', 'Invalid action, nothing happened.'), is_error: true });
        continue;
      }
      const res = execute(cmd);
      outcomes.push({ cmd, res });
      results.push({ type: 'tool_result', tool_use_id: block.id, content: commandResultText(cmd, res), ...(res.ok ? {} : { is_error: true }) });
    }
    ch.pendingToolResults = results;
    return { text: full.trim(), outcomes };
  }
}

// API:ts eget felmeddelande, för att kunna visa och felsöka
export function apiMessage(err) {
  return err?.error?.error?.message || err?.message || String(err);
}

function stripThinking(history) {
  for (const m of history) {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    m.content = m.content.filter((b) => !isThinking(b));
    if (!m.content.length) m.content = [{ type: 'text', text: '…' }];
  }
}

// Sista utvägen: ny historik med en kort sammanfattning av samtalet hittills plus spelarens nya replik
function restartWithSummary(ch, text, world) {
  const lines = (ch.transcript || []).slice(-14, -1).map(([t, who]) => `${who === 'me' ? L('Spelaren', 'Player') : L('Du', 'You')}: ${t}`);
  ch.history.length = 0;
  ch.pendingToolResults = [];
  ch.systemPrompt = systemPrompt(ch);
  const intro = lines.length ? `(${L('Samtalet hittills', 'The conversation so far')}:\n${lines.join('\n')})\n\n` : '';
  ch.history.push({ role: 'user', content: [{ type: 'text', text: intro + text }] });
  ch.history.push({ role: 'system', content: situation(ch, world, true) });
}
