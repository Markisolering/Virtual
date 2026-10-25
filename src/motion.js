import * as THREE from 'three';

// Egna rörelser som beskrivs med nyckelbilder: vinklar i grader för huvud, överkropp, armar och ben.
// Claude kan skapa nya rörelser med verktyget skapa_rorelse, och de sparas så att personerna kan göra dem igen.
//
// Alla vinklar räknas från en neutral stående pose (armarna hänger, benen raka) och i personens egna
// riktningar, så att "lyft armen framåt 90" betyder samma sak oavsett skelettets inre axlar.

const HAND_FORMS = ['oppen', 'knytnave', 'peka', 'tumme_upp', 'fridstecken'];

// Ledernas namn i nyckelbilderna och vad de betyder (används även i verktygsbeskrivningen)
export const JOINT_HELP = {
  huvud_nick: 'positivt = nicka ner, negativt = titta upp',
  huvud_vrid: 'positivt = vrid huvudet åt vänster',
  huvud_luta: 'positivt = luta huvudet mot höger axel',
  overkropp_framat: 'positivt = böj överkroppen framåt (buga), negativt = luta bakåt',
  overkropp_vrid: 'positivt = vrid överkroppen åt vänster',
  overkropp_luta: 'positivt = luta åt höger',
  h_arm_framat: 'höger arm: lyft framåt från hängande (90 = rakt fram, 180 = rakt upp)',
  h_arm_utat: 'höger arm: lyft ut åt sidan (90 = vågrätt ut, 170 = upp över huvudet)',
  h_arm_vrid: 'höger arm: vrid runt armens egen axel; positivt = inåt (underarmen mot magen), negativt = utåt (underarmen uppåt när armen hålls ut åt sidan)',
  h_armbage: 'höger armbåge: böj (0 = rak, 140 = helt böjd)',
  h_handled: 'höger handled: böj',
  h_hand: `höger hand: ${HAND_FORMS.join(', ')}`,
  v_arm_framat: 'vänster arm, som höger',
  v_arm_utat: 'vänster arm, som höger',
  v_arm_vrid: 'vänster arm, som höger',
  v_armbage: 'vänster armbåge, som höger',
  v_handled: 'vänster handled, som höger',
  v_hand: `vänster hand: ${HAND_FORMS.join(', ')}`,
  h_ben_framat: 'höger ben: lyft framåt från höften',
  h_ben_utat: 'höger ben: lyft ut åt sidan',
  h_kna: 'höger knä: böj (0 = rakt)',
  v_ben_framat: 'vänster ben, som höger',
  v_ben_utat: 'vänster ben, som höger',
  v_kna: 'vänster knä, som höger',
  hojd: 'hela kroppen upp/ner i centimeter (hopp: +30, sätta sig på huk: -45 tillsammans med böjda knän)',
  snurra: 'vrid hela kroppen runt sin egen axel i grader (360 = ett varv)',
};
const NUMERIC = Object.keys(JOINT_HELP).filter((k) => !k.endsWith('_hand'));

// ---------------- Färdiga rörelser ----------------
// Fungerar utan AI och fungerar som exempel för Claude.
export const PRESETS = {
  peka: {
    beskrivning: 'pekar rakt fram med höger hand',
    nyckelbilder: [
      { tid: 0.4, h_arm_framat: 85, h_arm_utat: 10, h_armbage: 10, h_hand: 'peka', huvud_nick: -5 },
      { tid: 2.2, h_arm_framat: 85, h_arm_utat: 10, h_armbage: 10, h_hand: 'peka' },
    ],
  },
  tumme_upp: {
    beskrivning: 'gör tummen upp med höger hand',
    nyckelbilder: [
      { tid: 0.4, h_arm_framat: 45, h_armbage: 80, h_hand: 'tumme_upp', huvud_nick: 5 },
      { tid: 2.0, h_arm_framat: 45, h_armbage: 85, h_hand: 'tumme_upp' },
    ],
  },
  buga: {
    beskrivning: 'bugar djupt',
    nyckelbilder: [
      { tid: 0.6, overkropp_framat: 45, huvud_nick: 15, h_arm_framat: 10, v_arm_framat: 10 },
      { tid: 1.4, overkropp_framat: 45, huvud_nick: 15, h_arm_framat: 10, v_arm_framat: 10 },
      { tid: 2.0, overkropp_framat: 0, huvud_nick: 0, h_arm_framat: 0, v_arm_framat: 0 },
    ],
  },
  nicka: {
    beskrivning: 'nickar instämmande',
    nyckelbilder: [
      { tid: 0.25, huvud_nick: 18 },
      { tid: 0.5, huvud_nick: -4 },
      { tid: 0.75, huvud_nick: 18 },
      { tid: 1.0, huvud_nick: -4 },
      { tid: 1.3, huvud_nick: 0 },
    ],
  },
  skaka_pa_huvudet: {
    beskrivning: 'skakar på huvudet',
    nyckelbilder: [
      { tid: 0.2, huvud_vrid: 25 },
      { tid: 0.45, huvud_vrid: -25 },
      { tid: 0.7, huvud_vrid: 25 },
      { tid: 0.95, huvud_vrid: -25 },
      { tid: 1.2, huvud_vrid: 0 },
    ],
  },
  armarna_i_kors: {
    beskrivning: 'står med armarna i kors',
    nyckelbilder: [
      { tid: 0.6, h_arm_framat: 35, h_arm_utat: 20, h_arm_vrid: 60, h_armbage: 120, v_arm_framat: 40, v_arm_utat: 20, v_arm_vrid: 60, v_armbage: 115 },
      { tid: 4, h_arm_framat: 35, h_arm_utat: 20, h_arm_vrid: 60, h_armbage: 120, v_arm_framat: 40, v_arm_utat: 20, v_arm_vrid: 60, v_armbage: 115 },
    ],
  },
  handerna_pa_hoften: {
    beskrivning: 'står med händerna på höfterna',
    nyckelbilder: [
      { tid: 0.5, h_arm_utat: 40, h_arm_framat: -10, h_armbage: 100, h_arm_vrid: 40, v_arm_utat: 40, v_arm_framat: -10, v_armbage: 100, v_arm_vrid: 40 },
      { tid: 3.5, h_arm_utat: 40, h_arm_framat: -10, h_armbage: 100, h_arm_vrid: 40, v_arm_utat: 40, v_arm_framat: -10, v_armbage: 100, v_arm_vrid: 40 },
    ],
  },
  hoppa: {
    beskrivning: 'hoppar jämfota med armarna upp',
    hela_kroppen: true,
    nyckelbilder: [
      { tid: 0.3, hojd: -12, h_kna: 40, v_kna: 40, h_ben_framat: 20, v_ben_framat: 20, overkropp_framat: 10 },
      { tid: 0.55, hojd: 32, h_kna: 5, v_kna: 5, h_ben_framat: 0, v_ben_framat: 0, h_arm_utat: 150, v_arm_utat: 150, overkropp_framat: 0 },
      { tid: 0.8, hojd: 0, h_kna: 20, v_kna: 20, h_ben_framat: 10, v_ben_framat: 10, h_arm_utat: 30, v_arm_utat: 30 },
      { tid: 1.1, hojd: 0, h_kna: 0, v_kna: 0, h_ben_framat: 0, v_ben_framat: 0, h_arm_utat: 0, v_arm_utat: 0 },
    ],
  },
  snurra: {
    beskrivning: 'snurrar ett varv med armarna ut',
    hela_kroppen: true,
    nyckelbilder: [
      { tid: 0.3, h_arm_utat: 70, v_arm_utat: 70, snurra: 0 },
      { tid: 1.5, h_arm_utat: 70, v_arm_utat: 70, snurra: 360 },
      { tid: 1.8, h_arm_utat: 0, v_arm_utat: 0, snurra: 360 },
    ],
  },
  visa_musklerna: {
    beskrivning: 'spänner armmusklerna',
    nyckelbilder: [
      { tid: 0.5, h_arm_utat: 90, h_armbage: 120, h_arm_vrid: -70, h_hand: 'knytnave', v_arm_utat: 90, v_armbage: 120, v_arm_vrid: -70, v_hand: 'knytnave' },
      { tid: 2.5, h_arm_utat: 90, h_armbage: 130, h_arm_vrid: -70, h_hand: 'knytnave', v_arm_utat: 90, v_armbage: 130, v_arm_vrid: -70, v_hand: 'knytnave' },
    ],
  },
  fridstecken: {
    beskrivning: 'gör fredstecken med höger hand',
    nyckelbilder: [
      { tid: 0.4, h_arm_framat: 60, h_arm_utat: 25, h_armbage: 70, h_hand: 'fridstecken', huvud_luta: 8 },
      { tid: 2.2, h_arm_framat: 60, h_arm_utat: 25, h_armbage: 75, h_hand: 'fridstecken', huvud_luta: 8 },
    ],
  },
};

// ---------------- Sparade rörelser ----------------
const STORE = 'virtual-room-motions';
export function savedMotions() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}
export function saveMotion(name, def) {
  const all = savedMotions();
  all[name] = def;
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    // Lagringen är full eller blockerad; rörelsen fungerar ändå just nu
  }
}
export function findMotion(name) {
  const key = String(name || '').toLowerCase().trim();
  return savedMotions()[key] || PRESETS[key] || null;
}
export function motionNames() {
  return [...new Set([...Object.keys(PRESETS), ...Object.keys(savedMotions())])];
}

// Kontrollera och städa en rörelse från Claude (eller lagringen) innan den spelas
export function cleanMotion(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.nyckelbilder)) return null;
  const keys = [];
  for (const k of input.nyckelbilder.slice(0, 40)) {
    if (!k || typeof k !== 'object') continue;
    const tid = Number(k.tid);
    if (!Number.isFinite(tid) || tid < 0 || tid > 20) continue;
    const key = { tid };
    for (const j of NUMERIC) {
      if (k[j] === undefined) continue;
      const v = Number(k[j]);
      if (!Number.isFinite(v)) continue;
      const lim = j === 'snurra' ? 1080 : j === 'hojd' ? 60 : 200;
      key[j] = Math.max(-lim, Math.min(lim, v));
    }
    for (const side of ['h', 'v']) if (HAND_FORMS.includes(k[`${side}_hand`])) key[`${side}_hand`] = k[`${side}_hand`];
    keys.push(key);
  }
  if (!keys.length) return null;
  keys.sort((a, b) => a.tid - b.tid);
  return {
    beskrivning: String(input.beskrivning || '').slice(0, 120),
    loop: !!input.loop,
    hela_kroppen: !!input.hela_kroppen,
    nyckelbilder: keys,
  };
}

// Nyckelbilder där leder som inte nämns behåller sitt värde från förra bilden (startvärde 0)
function expand(def) {
  const out = [{ tid: 0 }];
  let prev = {};
  for (const k of def.nyckelbilder) {
    const full = { ...prev, ...k };
    out.push(full);
    prev = full;
  }
  if (def.nyckelbilder[0].tid === 0) out.shift();
  return out;
}

const ease = (t) => t * t * (3 - 2 * t);

// Värdena i rörelsen vid tiden t
export function sampleMotion(frames, t) {
  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].tid <= t) i++;
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const span = b.tid - a.tid;
  const f = span > 0 ? ease(Math.min(1, Math.max(0, (t - a.tid) / span))) : 1;
  const pose = {};
  for (const j of NUMERIC) {
    const va = a[j] ?? 0;
    const vb = b[j] ?? 0;
    if (va || vb) pose[j] = va + (vb - va) * f;
  }
  // Handformer byter vid nyckelbilden, inte gradvis
  for (const side of ['h', 'v']) {
    const form = (f < 0.5 ? a : b)[`${side}_hand`];
    if (form) pose[`${side}_hand`] = form;
  }
  return pose;
}

// Gör en rörelse redo att spelas på en viss rigg
export function prepareMotion(def, rig) {
  const frames = expand(def);
  const duration = frames[frames.length - 1].tid;
  return { def, frames, duration, used: rig.usedBones(def), usesHead: def.nyckelbilder.some((k) => Object.keys(k).some((j) => j.startsWith('huvud'))) };
}

// ---------------- Rigg ----------------
// Personens riktningar i modellens grundläge (tittar längs +z)
const RIGHT = new THREE.Vector3(-1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const DEG = Math.PI / 180;

// Fingrarnas böjning i grader för varje handform: [tumme, pekfinger, långfinger, ringfinger, lillfinger]
const FORMS = {
  oppen: [0, 0, 0, 0, 0],
  knytnave: [40, 85, 90, 90, 90],
  peka: [35, 0, 90, 90, 90],
  tumme_upp: [-10, 90, 95, 95, 95],
  fridstecken: [40, 0, 0, 90, 90],
};

export class MotionRig {
  // nodes: modellens noder efter namn. Anropas när modellen står i neutral pose med roten utan rotation.
  constructor(model, nodes) {
    this.model = model;
    const get = (n) => nodes[n];
    const side = (s) => ({
      upper: get(`Bip01_${s}_UpperArm`),
      fore: get(`Bip01_${s}_Forearm`),
      hand: get(`Bip01_${s}_Hand`),
      thigh: get(`Bip01_${s}_Thigh`),
      calf: get(`Bip01_${s}_Calf`),
      fingers: [0, 1, 2, 3, 4].map((f) => [get(`Bip01_${s}_Finger${f}`), get(`Bip01_${s}_Finger${f}1`), get(`Bip01_${s}_Finger${f}2`)].filter(Boolean)),
    });
    this.b = {
      pelvis: get('Bip01_Pelvis'),
      spine: [get('Bip01_Spine'), get('Bip01_Spine1'), get('Bip01_Spine2')].filter(Boolean),
      neck: get('Bip01_Neck'),
      head: get('Bip01_Head'),
      R: side('R'),
      L: side('L'),
    };
    model.updateMatrixWorld(true);
    // Neutral lokal rotation och "personens riktningar" uttryckta i varje bens koordinater
    this.neutral = new Map();
    this.invWorld = new Map();
    const all = [this.b.pelvis, ...this.b.spine, this.b.neck, this.b.head];
    for (const s of ['R', 'L']) {
      const x = this.b[s];
      all.push(x.upper, x.fore, x.hand, x.thigh, x.calf, ...x.fingers.flat());
    }
    for (const bone of all.filter(Boolean)) {
      this.neutral.set(bone, bone.quaternion.clone());
      this.invWorld.set(bone, bone.getWorldQuaternion(new THREE.Quaternion()).invert());
    }
    // Fingrarnas böjningsaxel: tvärs över handflatan, mätt i neutral pose (handen hänger med handflatan inåt)
    this.fingerAxis = {};
    for (const s of ['R', 'L']) {
      const x = this.b[s];
      const f1 = x.fingers[1]?.[0];
      const f4 = x.fingers[4]?.[0];
      if (f1 && f4 && x.hand) {
        // Axeln går från lillfingret till pekfingret
        const across = f1.getWorldPosition(new THREE.Vector3()).sub(f4.getWorldPosition(new THREE.Vector3())).normalize();
        this.fingerAxis[s] = across;
      }
    }
  }

  // En personriktning (i neutral pose) uttryckt i världen enligt hur benet `frame` är vridet just nu
  axis(frame, dir) {
    frame.getWorldQuaternion(_q).multiply(this.invWorld.get(frame));
    return _ax.copy(dir).applyQuaternion(_q).normalize();
  }

  rotate(bone, axis, deg) {
    if (!bone || !deg) return;
    bone.parent.getWorldQuaternion(_q2);
    bone.getWorldQuaternion(_q);
    _q.premultiply(_qa.setFromAxisAngle(axis, deg * DEG));
    bone.quaternion.copy(_q2.invert().multiply(_q));
    bone.updateMatrixWorld(true);
  }

  // Vilka ben en rörelse styr (resten följer den vanliga animationen)
  usedBones(def) {
    const used = new Set();
    const keys = new Set(def.nyckelbilder.flatMap((k) => Object.keys(k)));
    const has = (re) => [...keys].some((k) => re.test(k));
    if (has(/^overkropp/)) this.b.spine.forEach((b) => used.add(b));
    if (has(/^huvud/)) [this.b.neck, this.b.head].forEach((b) => used.add(b));
    for (const [p, s] of [['h', 'R'], ['v', 'L']]) {
      const x = this.b[s];
      if (has(new RegExp(`^${p}_(arm|armbage|handled)`))) [x.upper, x.fore, x.hand].forEach((b) => used.add(b));
      if (has(new RegExp(`^${p}_hand$`))) x.fingers.flat().forEach((b) => used.add(b));
      if (def.hela_kroppen || has(new RegExp(`^${p}_(ben|kna)`))) [x.thigh, x.calf].forEach((b) => used.add(b));
    }
    if (def.hela_kroppen) this.b.spine.forEach((b) => used.add(b));
    used.delete(undefined);
    return used;
  }

  // Lägg rörelsens pose ovanpå animationen. w = 0..1 (för mjuk in- och uttoning)
  apply(pose, used, w) {
    if (w <= 0) return;
    // 1. Tona de använda benen mot neutral pose
    for (const bone of used) bone.quaternion.slerp(this.neutral.get(bone), w);
    this.model.updateMatrixWorld(true);
    const v = (k) => (pose[k] || 0) * w;
    const { pelvis, spine, neck, head } = this.b;

    // 2. Överkropp (fördelat på tre ryggkotor) och huvud (nacke 40 %, huvud 60 %)
    for (const s of spine) {
      this.rotate(s, this.axis(pelvis, RIGHT), -v('overkropp_framat') / spine.length);
      this.rotate(s, this.axis(pelvis, UP), v('overkropp_vrid') / spine.length);
      this.rotate(s, this.axis(pelvis, FWD), v('overkropp_luta') / spine.length);
    }
    const top = spine[spine.length - 1] || pelvis;
    for (const [bone, share] of [[neck, 0.4], [head, 0.6]]) {
      if (!bone) continue;
      this.rotate(bone, this.axis(top, RIGHT), -v('huvud_nick') * share);
      this.rotate(bone, this.axis(top, UP), v('huvud_vrid') * share);
      this.rotate(bone, this.axis(top, FWD), v('huvud_luta') * share);
    }

    // 3. Armar och ben, i förhållande till överkroppen respektive bäckenet
    for (const [p, s, sign] of [['h', 'R', -1], ['v', 'L', 1]]) {
      const x = this.b[s];
      if (x.upper) {
        this.rotate(x.upper, this.axis(top, FWD), sign * v(`${p}_arm_utat`));
        this.rotate(x.upper, this.axis(top, RIGHT), v(`${p}_arm_framat`));
        const twist = v(`${p}_arm_vrid`);
        if (twist && x.fore) {
          const dir = x.fore.getWorldPosition(_p1).sub(x.upper.getWorldPosition(_p2)).normalize();
          this.rotate(x.upper, dir, sign * twist);
        }
      }
      if (x.fore) this.rotate(x.fore, this.axis(x.upper, RIGHT), v(`${p}_armbage`));
      if (x.hand) this.rotate(x.hand, this.axis(x.fore, RIGHT), v(`${p}_handled`));
      if (x.thigh) {
        this.rotate(x.thigh, this.axis(pelvis, FWD), sign * v(`${p}_ben_utat`));
        this.rotate(x.thigh, this.axis(pelvis, RIGHT), v(`${p}_ben_framat`));
      }
      if (x.calf) this.rotate(x.calf, this.axis(x.thigh, RIGHT), -v(`${p}_kna`));

      // Fingrar: böj varje led runt axeln tvärs över handflatan
      const form = FORMS[pose[`${p}_hand`]];
      const across = this.fingerAxis[s];
      if (form && across && x.hand) {
        x.fingers.forEach((chain, fi) => {
          const bend = form[fi] * w;
          if (!bend) return;
          for (const bone of chain) {
            const ax = this.axis(x.hand, across).clone();
            this.rotate(bone, ax, (s === 'R' ? 1 : -1) * bend * (fi === 0 ? 0.5 : 1));
          }
        });
      }
    }

    // 4. Hela kroppen: höjd och snurr
    this.model.position.y = (v('hojd') / 100) * 1;
    this.model.rotation.y = v('snurra') * DEG;
  }

  reset() {
    this.model.position.y = 0;
    this.model.rotation.y = 0;
  }
}

// ---------------- Verktyg för Claude ----------------
const jointProps = Object.fromEntries(
  Object.entries(JOINT_HELP).map(([k, d]) => [k, k.endsWith('_hand') ? { type: 'string', enum: HAND_FORMS, description: d } : { type: 'number', description: d }]),
);

export const MOTION_TOOL = {
  name: 'skapa_rorelse',
  description: `Skapa och utför en egen kroppsrörelse när spelaren ber om något som inte finns bland handlingarna i gor_handling (t.ex. "peka på fönstret", "gör en karatespark", "visa hur stor fisken var", "gör en honnör").
Beskriv rörelsen som nyckelbilder: tid i sekunder från start plus vinklar i grader för de leder som ska röra sig. Alla vinklar utgår från att personen står rakt med armarna hängande längs sidorna (värde 0). Leder som inte anges i en nyckelbild behåller värdet från förra nyckelbilden. Efter sista bilden går personen mjukt tillbaka till sin vanliga pose.
Tips: 0,3–0,6 s mellan bilder ger naturligt tempo. Upprepa bilder för att hålla en pose. Vinka = arm_utat ca 150 och växla armbage mellan 20 och 60. Peka framåt = arm_framat 85 och hand "peka".
Sätt hela_kroppen till true om benen eller hojd/snurra används; annars fortsätter benen som vanligt (och rörelsen går att göra sittande).
Ge rörelsen ett kort namn (små bokstäver, understreck) så sparas den och kan göras igen med spela_rorelse.
Exempel (vinka med höger hand): {"namn":"vinka_glatt","beskrivning":"vinkar glatt","loop":false,"hela_kroppen":false,"nyckelbilder":[{"tid":0.4,"h_arm_utat":150,"h_armbage":30,"h_hand":"oppen"},{"tid":0.7,"h_armbage":60},{"tid":1.0,"h_armbage":25},{"tid":1.3,"h_armbage":60},{"tid":1.6,"h_armbage":25}]}`,
  input_schema: {
    type: 'object',
    properties: {
      namn: { type: 'string', description: 'kort namn, t.ex. honnor eller karatespark' },
      beskrivning: { type: 'string', description: 'vad rörelsen föreställer, några ord' },
      loop: { type: 'boolean', description: 'upprepa rörelsen en stund (t.ex. för dans eller jubel)' },
      hela_kroppen: { type: 'boolean' },
      nyckelbilder: {
        type: 'array',
        items: { type: 'object', properties: { tid: { type: 'number' }, ...jointProps }, required: ['tid'] },
      },
    },
    required: ['namn', 'nyckelbilder'],
  },
  eager_input_streaming: true,
};

export const PLAY_MOTION_TOOL = {
  name: 'spela_rorelse',
  description: 'Gör en rörelse som redan finns (färdig eller tidigare skapad med skapa_rorelse). Namnen står i systemprompten.',
  input_schema: {
    type: 'object',
    properties: { namn: { type: 'string' } },
    required: ['namn'],
    additionalProperties: false,
  },
  strict: true,
  eager_input_streaming: true,
};
