import Anthropic from '@anthropic-ai/sdk';
import { ACTION_TOOL, EMOTION_TOOL, EMOTIONS, validCommand, commandResultText } from './commands.js';

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

export class OfflineBrain {
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
        if (p.job === 'student') out = `Jag är student och läser filosofi${st.end} Mest läser jag om varför jag läser filosofi.`;
        if (p.job === 'pensionär') out = `Jag är pensionär nu, ${p.jobDetail}${st.end} Nu har jag all tid i världen.`;
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

function systemPrompt(ch, world) {
  const p = ch.persona;
  const others = world.characters.filter((c) => c !== ch).map((c) => `${c.persona.firstName} (${c.persona.job})`);
  const where = ch.following
    ? 'följer efter spelaren'
    : ch.seated
      ? `sitter ${ch.seat.label === 'matbordet' ? 'vid' : 'i'} ${ch.seat.label}`
      : ch.poi
        ? `står vid ${ch.poi.label}`
        : 'står i rummet';
  return `Du spelar en rollfigur i ett 3D-spel i förstapersonsperspektiv. Spelaren har gått fram till dig i ett möblerat vardagsrum och pratar med dig.

Din rollfigur:
- Namn: ${p.firstName} ${p.lastName} (${p.pronoun}), ${p.age} år
- Yrke: ${p.job} ${p.jobDetail}
- Uppvuxen i ${p.hometown}
- Gillar ${p.hobby}, äter helst ${p.food}, lyssnar på ${p.music}
- Personlighet: ${p.personality.desc}. ${cap(p.personality.style)}.
- Ett kännetecken: ${p.quirk}
- Varför du är här: du ${p.visit}
- Humör just nu: ${p.mood > 0.7 ? 'på strålande humör' : p.mood > 0.4 ? 'helt okej' : 'lite nere'}
- Du ${where}. Rummet har soffa, fåtöljer, matbord, kök, bokhylla, skivspelare, tavlor och två fönster mot stan.
- Andra i rummet: ${others.length ? others.join(', ') : 'ingen annan just nu'}
- När spelaren kom fram hälsade du: "${ch.greeting || 'Hej!'}"

Så här svarar du:
- Prata svenska, som en verklig människa i ett vardagligt samtal. Håll dig i rollen; du vet inte att du är en AI eller en spelfigur.
- Svara kort, oftast 1–3 meningar, så att det passar en pratbubbla på en mobilskärm. Ingen markdown, inga listor.
- Visa personligheten i hur du formulerar dig. Hitta gärna på små detaljer om ditt liv som passar rollen.

Handlingar:
- Du kan röra dig och göra saker i rummet med verktyget gor_handling: sätta dig, resa dig, gå till en plats, komma fram till spelaren, följa efter spelaren, stanna, lämna rummet, eller gester som att vinka, dansa, klappa händerna, jubla, skratta, rycka på axlarna, sträcka på dig, gäspa, sätta dig på huk, ta ett foto eller fundera.
- När spelaren ber dig göra något sådant gör du det, gärna med en kommentar i din personlighets stil. Skriv först en kort replik, anropa sedan verktyget.
- Om spelaren tar farväl eller ber dig gå, säg hej då och använd handlingen lamna_rummet.
- Säg inte att du gör något du inte kan göra med verktyget.${
    ch.hasFace
      ? '\n- Spelaren ser ditt ansikte i närbild. Visa känslor med verktyget visa_kansla när de tydligt ändras, t.ex. när du blir glad, skrattar, blir ledsen, arg eller förvånad.'
      : ''
  }`;
}

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
    ch.history.push({ role: 'user', content: [...pending, { type: 'text', text }] });
    const restore = () => {
      ch.history.pop();
      ch.pendingToolResults = pending;
    };
    let final;
    let full = '';
    try {
      const stream = this.client.beta.messages.stream({
        model: this.settings.model || DEFAULT_MODEL,
        max_tokens: 2000,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: systemPrompt(ch, world),
        tools: ch.hasFace ? [ACTION_TOOL, EMOTION_TOOL] : [ACTION_TOOL],
        messages: ch.history,
      });
      stream.on('text', (delta) => {
        full += delta;
        onDelta(full);
      });
      final = await stream.finalMessage();
    } catch (err) {
      restore();
      throw err;
    }
    if (final.stop_reason === 'refusal') {
      // Ta bort spelarens meddelande så att historiken förblir giltig
      restore();
      return { text: 'Hmm, det vill jag inte prata om. Kan vi ta något annat?', outcomes: [] };
    }
    // Spara hela svaret (inklusive tänkande-block) så att nästa anrop bygger vidare på samma historik
    ch.history.push({ role: 'assistant', content: final.content });
    const outcomes = [];
    const results = [];
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue;
      if (block.name === EMOTION_TOOL.name) {
        const emotion = final.stop_reason !== 'max_tokens' && EMOTIONS[block.input?.kansla];
        if (emotion) feel(emotion);
        results.push({ type: 'tool_result', tool_use_id: block.id, content: emotion ? 'Syns i ansiktet.' : 'Okänd känsla.', ...(emotion ? {} : { is_error: true }) });
        continue;
      }
      // Med strömmade verktygsargument kan indata vara ofullständig; kontrollera den innan något körs
      const cmd = final.stop_reason === 'max_tokens' ? null : validCommand(block.input);
      if (!cmd) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Ogiltig handling, inget hände.', is_error: true });
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
