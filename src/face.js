// Ansiktet som pratar: läppsynk, huvudrörelser i takt med talet, ögonbryn, blinkningar och blick.
// Används av personerna med ansiktsuttryck (närbildsmodellerna och Avaturn-avatarer).
//
// Läppsynken bygger på texten (bokstäver -> munformer) och följer rösten: talsyntesen säger till när
// varje ord börjar (onboundary i webbläsaren, onRangeStart i Android-appen), och då hoppar munnen
// till just det ordet. Mellan munformerna tonas det över i förväg, som när man pratar på riktigt.

const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Mjukt brus av några sinusvågor, för små rörelser som aldrig upprepar sig
const noise = (t, seed) => Math.sin(t * 1.0 + seed) * 0.5 + Math.sin(t * 2.31 + seed * 1.7) * 0.3 + Math.sin(t * 4.07 + seed * 2.9) * 0.2;

// Bokstäver -> munformer (Oculus-visem) för svenska, med ungefärlig längd i sekunder
export function textToVisemes(text) {
  const t = text.toLowerCase();
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const two = t.slice(i, i + 2);
    // sj-ljud: sj, tj, ch, stj, samt sk före mjuk vokal (skön, skina)
    if (['sj', 'tj', 'ch', 'stj'].some((d) => t.startsWith(d, i)) || (two === 'sk' && 'eiyäö'.includes(t[i + 2]))) {
      out.push(['CH', 0.1, i]);
      i += t.startsWith('stj', i) ? 2 : 1;
      continue;
    }
    // ng och dubbelteckning låter som ett ljud
    if (two === 'ng') {
      out.push(['kk', 0.08, i]);
      i++;
      continue;
    }
    if (two === 'th') {
      out.push(['TH', 0.08, i]);
      i++;
      continue;
    }
    const c = t[i];
    if (c === t[i - 1] && /[a-zåäö]/.test(c)) continue;
    let v = null;
    if ('aá'.includes(c)) v = 'aa';
    else if ('eéä'.includes(c)) v = 'E';
    else if ('iyj'.includes(c)) v = 'I';
    else if ('oåö'.includes(c)) v = 'O';
    else if ('uü'.includes(c)) v = 'U';
    else if ('pbm'.includes(c)) v = 'PP';
    else if ('fvw'.includes(c)) v = 'FF';
    else if ('tdl'.includes(c)) v = 'DD';
    else if (c === 'n') v = 'nn';
    else if ('kgqch'.includes(c)) v = 'kk';
    else if ('szxc'.includes(c)) v = 'SS';
    else if (c === 'r') v = 'RR';
    if (v) out.push([v, ['aa', 'E', 'I', 'O', 'U'].includes(v) ? 0.1 : 0.065, i]);
    else if ('.!?…'.includes(c)) out.push(['sil', 0.34, i]);
    else if (',;:'.includes(c)) out.push(['sil', 0.2, i]);
    else if (c === ' ') out.push(['sil', 0.035, i]);
  }
  return out;
}

const VISEMES = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'];
export const VISEME_MORPH = Object.fromEntries(VISEMES.map((v, i) => [v, `AA_VI_${String(i).padStart(2, '0')}_${v === 'sil' ? 'Sil' : v === 'kk' ? 'KK' : v}`]));
// Hur mycket käken öppnas, och hur tydligt munformen visas
const JAW = { aa: 0.34, E: 0.2, I: 0.11, O: 0.24, U: 0.13, RR: 0.12, CH: 0.07, SS: 0.05, DD: 0.1, nn: 0.07, kk: 0.12, TH: 0.07, FF: 0.03, PP: 0, sil: 0 };
const STRENGTH = { PP: 1, FF: 0.9, aa: 0.9, O: 0.9, U: 0.9, E: 0.85, I: 0.85, CH: 0.85, SS: 0.7, TH: 0.7, DD: 0.65, nn: 0.6, kk: 0.55, RR: 0.6, sil: 0 };
const NEGATIONS = /^(nej|nä|nää|inte|aldrig|ingen|inget|inga|knappast)$/;

export class FaceAnimator {
  constructor(seed = 1) {
    this.seed = seed;
    this.t = Math.random() * 100;
    this.speech = null;
    this.pulses = []; // { kind, start, dur, amp }
    this.blink = { next: rand(1, 4), start: -1 };
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0, next: rand(0.5, 2) };
    this.nodNext = rand(2, 4);
    this.head = { yaw: 0, pitch: 0, roll: 0 };
  }

  // Bygg tidslinjen för en replik. Returnerar hur lång tid den ungefär tar.
  speak(text, rate = 1) {
    const seq = textToVisemes(text);
    const segs = [];
    let time = 0.05;
    for (const [vis, dur, char] of seq) {
      const d = dur / rate;
      segs.push({ vis, start: time, dur: d, char });
      time += d;
    }
    // Ord: var de börjar i texten och i tiden, och vilka som betonas
    const words = [];
    const re = /[\p{L}\p{N}']+/gu;
    let m;
    while ((m = re.exec(text))) {
      const seg = segs.find((s) => s.char >= m.index);
      if (!seg) break;
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
      words.push({ char: m.index, t: seg.start, word: m[0].toLowerCase(), long: m[0].length >= 7, bang: after.includes('!'), question: after.includes('?') });
    }
    this.speech = { segs, words, time: 0, end: time, wordIndex: -1, text };
    this.planGestures(words, time);
    return time;
  }

  // Ögonbryn, nickar och huvudskakningar i takt med talet
  planGestures(words, end) {
    this.pulses = this.pulses.filter((p) => p.start + p.dur > this.t);
    const now = this.t;
    words.forEach((w, i) => {
      const first = i === 0 || /[.!?]\s*$/.test(this.speech.text.slice(0, w.char).trim().slice(-1));
      if (w.bang || (w.long && Math.random() < 0.5) || (first && Math.random() < 0.4)) {
        this.pulses.push({ kind: 'nod', start: now + w.t, dur: 0.5, amp: w.bang ? 0.07 : 0.045 });
        this.pulses.push({ kind: 'brow', start: now + w.t - 0.05, dur: 0.6, amp: w.bang ? 0.55 : 0.35 });
      }
      if (NEGATIONS.test(w.word)) this.pulses.push({ kind: 'shake', start: now + w.t, dur: 0.75, amp: 0.06 });
      if (w.question) {
        this.pulses.push({ kind: 'tilt', start: now + w.t - 0.2, dur: Math.max(1.2, end - w.t + 0.8), amp: 0.07 });
        this.pulses.push({ kind: 'brow', start: now + w.t - 0.1, dur: 1, amp: 0.45 });
      }
    });
  }

  // Talsyntesen har börjat säga ordet som börjar vid tecknet charIndex
  onWord(charIndex) {
    const s = this.speech;
    if (!s) return;
    let i = s.words.findIndex((w) => w.char >= charIndex);
    if (i < 0) i = s.words.length - 1;
    const w = s.words[i];
    if (!w) return;
    // Gester som hör till orden flyttas lika mycket som läppsynken
    const shift = w.t - s.time;
    if (Math.abs(shift) > 0.04) {
      for (const p of this.pulses) if (p.start > this.t - 0.1) p.start -= shift;
      s.time = w.t;
    }
    s.wordIndex = i;
  }

  stop() {
    if (this.speech) this.speech.time = this.speech.end;
  }

  get talking() {
    return !!this.speech && this.speech.time < this.speech.end;
  }

  // add(morf, värde) lägger till ansiktsformer. state: { listening, thinking }.
  update(dt, add, state = {}) {
    this.t += dt;
    const t = this.t;
    const s = this.speech;

    // ---- Läppsynk med samartikulation: nästa munform tonas in innan den nuvarande är slut ----
    let jaw = 0;
    if (s && s.time < s.end) {
      s.time += dt;
      const i = s.segs.findIndex((g) => g.start + g.dur > s.time);
      if (i >= 0) {
        const cur = s.segs[i];
        const next = s.segs[i + 1];
        const p = (s.time - cur.start) / cur.dur;
        const k = next ? smooth(0.45, 1, p) : 0;
        const show = (seg, w) => {
          if (!seg || seg.vis === 'sil' || w <= 0) return;
          add(VISEME_MORPH[seg.vis], STRENGTH[seg.vis] * w);
          jaw += (JAW[seg.vis] || 0) * w;
        };
        show(cur, 1 - k);
        show(next, k);
      }
    } else if (s) this.speech = null;
    if (jaw > 0) add('AK_25_JawOpen', jaw);

    // ---- Gester (nick, skakning, lutning, ögonbryn) ----
    let nod = 0;
    let shake = 0;
    let tilt = 0;
    let brow = 0;
    this.pulses = this.pulses.filter((p) => t < p.start + p.dur + 0.1);
    for (const p of this.pulses) {
      const x = (t - p.start) / p.dur;
      if (x < 0 || x > 1) continue;
      const env = Math.sin(Math.PI * x);
      if (p.kind === 'nod') nod += p.amp * Math.sin(Math.PI * 2 * x) * (1 - x);
      else if (p.kind === 'shake') shake += p.amp * Math.sin(Math.PI * 4 * x) * env;
      else if (p.kind === 'tilt') tilt += p.amp * smooth(0, 0.15, x) * (1 - smooth(0.8, 1, x));
      else if (p.kind === 'brow') brow = Math.max(brow, p.amp * env);
    }
    // Den som lyssnar nickar ibland och ser uppmärksam ut
    if (state.listening && !this.talking) {
      this.nodNext -= dt;
      if (this.nodNext < 0) {
        this.nodNext = rand(1.8, 4);
        this.pulses.push({ kind: 'nod', start: t, dur: 0.7, amp: 0.035 });
      }
      add('AK_03_BrowInnerUp', 0.05);
      add('AK_44_MouthSmileLeft', 0.08);
      add('AK_45_MouthSmileRight', 0.08);
    }
    if (brow > 0) {
      add('AK_03_BrowInnerUp', brow);
      add('AK_04_BrowOuterUpLeft', brow * 0.7);
      add('AK_05_BrowOuterUpRight', brow * 0.7);
    }

    // ---- Huvudet rör sig hela tiden lite, mer när personen pratar ----
    const amp = this.talking ? 1.8 : 1;
    const speed = this.talking ? 1.4 : 0.6;
    this.head.yaw = 0.03 * amp * noise(t * speed * 0.7, this.seed) + shake;
    this.head.pitch = 0.022 * amp * noise(t * speed * 0.9, this.seed + 3) + nod;
    this.head.roll = 0.018 * amp * noise(t * speed * 0.5, this.seed + 7) + tilt;

    // ---- Blick: små fixeringsbyten, bort och uppåt när personen tänker ----
    const g = this.gaze;
    g.next -= dt;
    if (state.thinking) {
      g.tx = -0.22;
      g.ty = 0.13;
    } else if (g.next < 0) {
      g.next = rand(0.6, 2.6);
      const aside = this.talking && Math.random() < 0.25;
      g.tx = aside ? rand(-0.18, 0.18) : rand(-0.035, 0.035);
      g.ty = aside ? rand(-0.05, 0.1) : rand(-0.025, 0.025);
      if (aside) g.next = rand(0.4, 0.9);
    }
    // Ögonen hoppar snabbt (sackader), de glider inte
    const k = Math.min(1, dt * 22);
    g.x += (g.tx - g.x) * k;
    g.y += (g.ty - g.y) * k;
    if (g.y < -0.03) {
      add('AK_11_EyeLookDownLeft', -g.y * 2);
      add('AK_12_EyeLookDownRight', -g.y * 2);
    }

    // ---- Blinkningar: oftare vid pauser, snabb stängning och långsammare öppning ----
    const b = this.blink;
    b.next -= dt;
    const atPause = s && s.segs.find((x) => x.vis === 'sil' && x.dur > 0.3 && Math.abs(x.start - s.time) < dt);
    if (b.start < 0 && (b.next < 0 || (atPause && Math.random() < 0.6))) {
      b.start = t;
      b.next = Math.random() < 0.15 ? 0.25 : rand(2.2, 6);
    }
    if (b.start >= 0) {
      const x = t - b.start;
      const w = x < 0.07 ? x / 0.07 : x < 0.1 ? 1 : Math.max(0, 1 - (x - 0.1) / 0.15);
      add('AK_09_EyeBlinkLeft', w);
      add('AK_10_EyeBlinkRight', w);
      if (x > 0.25) b.start = -1;
    }
  }
}
