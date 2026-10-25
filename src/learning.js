import Anthropic from '@anthropic-ai/sdk';
import { findMotion, savedMotions, JOINT_HELP } from './motion.js';

// Inlärning av rörelser utifrån spelarens betyg.
//
// - Varje rörelse får tummen upp/ner och korta kommentarer om vad som var fel.
// - Rörelser med bäst betyg skickas med som exempel när Claude skapar nya rörelser.
// - Efter varje betyg uppdaterar en "rörelsecoach" (ett separat Claude-anrop) en kort lista med
//   lärdomar, t.ex. "för honnör behöver armbågen vara böjd ca 135°". Lärdomarna följer med till
//   alla personer och samtal, så rörelserna blir bättre med tiden.
// Allt sparas i webbläsaren.

const RATINGS = 'virtual-room-motion-ratings';
const LESSONS = 'virtual-room-motion-lessons';
const MAX_LESSONS = 14;

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Lagringen är full eller blockerad
  }
};

export function ratings() {
  return read(RATINGS, {});
}

export function motionLessons() {
  return read(LESSONS, []);
}

export function resetLearning() {
  for (const key of [RATINGS, LESSONS, 'virtual-room-motions']) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignorera
    }
  }
}

// Spara ett betyg. grade = 'up' (bra), 'close' (inte bra, men åt rätt håll) eller 'down' (dålig).
export function rateMotion(name, grade, note) {
  const all = ratings();
  const r = { up: 0, close: 0, down: 0, notes: [], ...all[name] };
  r[grade] = (r[grade] || 0) + 1;
  if (note) r.notes = [...r.notes, note].slice(-6);
  r.last = Date.now();
  all[name] = r;
  write(RATINGS, all);
  return r;
}

// Spelaren har själv visat hur rörelsen ska se ut i redigeraren
export function recordCorrection(name, correction) {
  const all = ratings();
  const r = { up: 0, close: 0, down: 0, notes: [], ...all[name] };
  r.corrections = [...(r.corrections || []), correction].slice(-4);
  if (correction.note) r.notes = [...r.notes, `rättat: ${correction.note}`].slice(-6);
  r.last = Date.now();
  all[name] = r;
  write(RATINGS, all);
  return r;
}

// Rörelser med bäst betyg (eller som spelaren har rättat själv), som exempel för Claude
export function bestExamples(n = 3) {
  const all = ratings();
  const score = (r) => r.up - r.down + (r.corrections?.length ? 2 : 0);
  return Object.entries(all)
    .filter(([, r]) => (r.up > 0 && r.up >= r.down) || r.corrections?.length)
    .sort((a, b) => score(b[1]) - score(a[1]) || b[1].last - a[1].last)
    .map(([name]) => [name, findMotion(name)])
    .filter(([, def]) => def)
    .slice(0, n);
}

const compact = (def) =>
  JSON.stringify({
    hela_kroppen: def.hela_kroppen || undefined,
    loop: def.loop || undefined,
    nyckelbilder: def.nyckelbilder.map((k) => Object.fromEntries(Object.entries(k).map(([j, v]) => [j, typeof v === 'number' ? Math.round(v * 10) / 10 : v]))),
  });

// Del av systemprompten: lärdomar och väl betygsatta exempel (läses när ett samtal börjar)
export function motionGuide() {
  const lessons = motionLessons();
  const examples = bestExamples();
  const parts = [];
  if (lessons.length) parts.push(`Lärdomar om rörelser (från spelarens betyg – följ dem när du skapar rörelser):\n${lessons.map((l) => `- ${l}`).join('\n')}`);
  if (examples.length) {
    parts.push(
      `Rörelser som spelaren har gett tummen upp eller själv rättat (använd som förebild för vinklar och tempo):\n${examples
        .map(([name, def]) => `- ${name} (${def.beskrivning || name}): ${compact(def)}`)
        .join('\n')}`,
    );
  }
  return parts.join('\n\n');
}

// ---------------- Rörelsecoach ----------------
// Låter Claude sammanfatta betygen till konkreta, generella lärdomar om hur vinklarna ska sättas.
let coachBusy = false;

const GRADE_TEXT = { up: 'tummen upp (bra)', close: 'nästan (inte bra, men åt rätt håll – justera, gör inte om från början)', down: 'tummen ner (dålig)' };

export async function updateLessons(settings, name, grade, note, correction) {
  if (!settings.apiKey || coachBusy) return null;
  const def = findMotion(name);
  if (!def) return null;
  coachBusy = true;
  try {
    const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
    const r = ratings()[name] || {};
    const res = await client.messages.create({
      model: settings.model || 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system: `Du är rörelsecoach i ett 3D-spel. Personerna i spelet gör rörelser som beskrivs med nyckelbilder: vinklar i grader för leder, räknade från en neutral stående pose med armarna hängande. Ledernas betydelse:
${Object.entries(JOINT_HELP)
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n')}

Din uppgift: uppdatera listan med lärdomar utifrån spelarens senaste betyg, så att framtida rörelser blir bättre. Lärdomarna ska vara korta, konkreta och användbara (helst med vinklar och tempo), till exempel "Honnör: höger arm utåt ca 80, armbåge ca 135, handen vid pannan" eller "Gester blir naturligare med 0,3–0,5 s mellan nyckelbilder". Behåll bra gamla lärdomar, slå ihop dubletter, ta bort sådant som visat sig fel. Högst ${MAX_LESSONS} punkter.
Svara bara med punktlistan, en lärdom per rad som börjar med "- ".`,
      messages: [
        {
          role: 'user',
          content: `Nuvarande lärdomar:
${motionLessons().map((l) => `- ${l}`).join('\n') || '(inga ännu)'}

Rörelse: ${name} (${def.beskrivning || ''})
${compact(def)}

${
            correction
              ? `Spelaren har själv rättat rörelsen i en redigerare genom att dra kroppsdelarna dit de ska. Rörelsen ovan är den RÄTTADE versionen – den är facit. Vid ${correction.tid} s ändrades: ${correction.andringar || '(små ändringar)'}.${correction.note ? ` Spelarens förklaring: "${correction.note}".` : ''} Dra generella slutsatser om var kroppsdelar finns (t.ex. vilka vinklar som behövs för att handen ska nå håret, ansiktet eller axeln).`
              : `Spelarens betyg nu: ${GRADE_TEXT[grade]}${note ? `. Kommentar: ${note}` : ''}`
          }
Tidigare betyg för rörelsen: ${r.up || 0} bra, ${r.close || 0} nästan, ${r.down || 0} dåliga${r.notes?.length ? `, kommentarer: ${r.notes.join('; ')}` : ''}`,
        },
      ],
    });
    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const lessons = text
      .split('\n')
      .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
      .filter((l) => l.length > 3)
      .slice(0, MAX_LESSONS);
    if (lessons.length) write(LESSONS, lessons);
    return lessons;
  } catch (err) {
    console.warn('Rörelsecoachen kunde inte uppdatera lärdomarna', err);
    return null;
  } finally {
    coachBusy = false;
  }
}

export function learnedCount() {
  return { motions: Object.keys(savedMotions()).length, rated: Object.keys(ratings()).length, lessons: motionLessons().length };
}
