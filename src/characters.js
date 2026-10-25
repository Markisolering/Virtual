import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SPAWN } from './room.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;

// ---------------- Personlighet ----------------
const NAMES = {
  kvinna: ['Elsa', 'Maja', 'Alice', 'Wilma', 'Ebba', 'Saga', 'Astrid', 'Linnea', 'Ingrid', 'Karin', 'Fatima', 'Amira', 'Sofia', 'Yasmin', 'Leila', 'Hanna', 'Greta', 'Sigrid', 'Mei', 'Nadia', 'Birgitta', 'Agnes', 'Klara', 'Tove'],
  man: ['Erik', 'Oskar', 'Lars', 'Johan', 'Ali', 'Omar', 'Lucas', 'Hugo', 'Axel', 'Nils', 'Gustav', 'Karl', 'Mohammed', 'Arvid', 'Viktor', 'Björn', 'Sven', 'Jonas', 'Mateo', 'Kenji', 'Anders', 'Ivan', 'Elias', 'Ludvig'],
  ickebinär: ['Robin', 'Kim', 'Alex', 'Charlie', 'Sam', 'Love', 'Eli', 'Noa', 'Vide', 'Kai'],
};
const SURNAMES = ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Lindqvist', 'Berg', 'Holm', 'Sandberg', 'Ek', 'Lund', 'Strand', 'Nyström', 'Hassan', 'Yilmaz', 'Novak', 'García', 'Kowalski', 'Lindgren', 'Åberg', 'Öberg', 'Sjöberg', 'Wallin', 'Falk'];
const JOBS = [
  ['sjuksköterska', 'på akuten'], ['snickare', 'i ett eget litet företag'], ['programmerare', 'på ett spelbolag'], ['lärare', 'på en mellanstadieskola'],
  ['kock', 'på en italiensk restaurang'], ['bibliotekarie', 'på stadsbiblioteket'], ['busschaufför', 'på linje 4'], ['arkitekt', 'som ritar skolor'],
  ['frisör', 'i en salong vid torget'], ['student', 'som läser filosofi'], ['pensionär', 'som har varit sjökapten'], ['musiker', 'i ett jazzband'],
  ['veterinär', 'som mest jobbar med katter'], ['journalist', 'på lokaltidningen'], ['brandman', 'på stationen här intill'], ['konstnär', 'som målar akvareller'],
  ['bagare', 'som börjar jobba klockan fyra'], ['forskare', 'inom marinbiologi'], ['elektriker', 'på ett byggföretag'], ['barista', 'på kaféet runt hörnet'],
];
const TOWNS = ['Göteborg', 'Malmö', 'Umeå', 'Kiruna', 'Visby', 'Uppsala', 'Örebro', 'Luleå', 'Jönköping', 'Lund', 'Sundsvall', 'Karlstad', 'Teheran', 'Krakow', 'Sarajevo', 'Santiago', 'Osaka', 'Helsingfors', 'Bergen', 'Kalmar'];
const HOBBIES = ['fågelskådning', 'klättring', 'att baka surdegsbröd', 'schack', 'att spela gitarr', 'löpning', 'brädspel', 'att sticka', 'fotografering', 'fiske', 'yoga', 'att samla vinylskivor', 'svampplockning', 'dans', 'att bygga modelltåg', 'poesi', 'trädgårdsarbete', 'datorspel', 'vinterbad', 'att laga koreansk mat'];
const FOODS = ['kanelbullar', 'pizza', 'pannkakor med sylt', 'sushi', 'köttbullar', 'falafel', 'räksmörgås', 'pho', 'tacos', 'kåldolmar', 'lasagne', 'ramen', 'pytt i panna', 'baklava'];
const MUSIC = ['jazz', 'gammal punk', 'Abba', 'klassisk musik', 'hiphop', 'dansband', 'synthpop', 'folkmusik', 'metal', 'soul', 'indiepop', 'opera'];
const VISITS = [
  'väntar på en vän som är sen', 'kom för att låna en bok', 'är här på fest och kom lite för tidigt', 'ska hjälpa till att flytta en soffa',
  'har en tid för att titta på lägenheten', 'kom för att lämna tillbaka en kastrull', 'söker skydd från regnet', 'har hört att det finns kaffe här',
  'ska träffa en gammal klasskompis', 'kom för att vattna blommorna', 'är granne och undrade vad som lät',
];
const QUIRKS = [
  'samlar på gamla nycklar', 'har aldrig sett Star Wars', 'kan alla huvudstäder i världen', 'är rädd för duvor', 'har en sköldpadda som heter Bosse',
  'har cyklat från Ystad till Haparanda', 'pratar gärna om väder', 'drömmer om att öppna ett café', 'har vunnit en tävling i pilkastning',
  'tror på spöken', 'lärde sig japanska förra året', 'har en hemlig talang för jonglering', 'har varit med i ett tv-program en gång',
];
export const PERSONALITIES = [
  { id: 'vänlig', desc: 'varm, vänlig och nyfiken på andra', style: 'pratar varmt och ställer gärna motfrågor' },
  { id: 'blyg', desc: 'blyg och lite tillbakadragen men snäll', style: 'svarar kort, tvekar ibland och säger "ehm"' },
  { id: 'sarkastisk', desc: 'torrt humoristisk och lite sarkastisk', style: 'skämtar torrt och ironiskt men menar väl' },
  { id: 'entusiastisk', desc: 'energisk, entusiastisk och pratglad', style: 'använder utropstecken och blir lätt exalterad' },
  { id: 'grinig', desc: 'lite grinig och otålig men har ett gott hjärta', style: 'klagar gärna och suckar, men är ärlig' },
  { id: 'filosofisk', desc: 'eftertänksam och filosofisk', style: 'funderar högt och vänder frågor till stora tankar' },
  { id: 'charmig', desc: 'charmig, självsäker och lite flörtig', style: 'ger komplimanger och berättar gärna anekdoter' },
];

function makePersona() {
  const gender = chance(0.08) ? 'ickebinär' : chance(0.5) ? 'kvinna' : 'man';
  const age = Math.round(chance(0.2) ? rand(60, 84) : rand(18, 60));
  const [job, jobDetail] = age > 67 ? ['pensionär', pick(['som har varit lärare', 'som har varit sjökapten', 'som har jobbat på posten', 'som har varit ingenjör'])] : pick(JOBS);
  return {
    gender,
    pronoun: gender === 'kvinna' ? 'hon' : gender === 'man' ? 'han' : 'hen',
    firstName: pick(NAMES[gender]),
    lastName: pick(SURNAMES),
    age,
    job,
    jobDetail,
    hometown: pick(TOWNS),
    hobby: pick(HOBBIES),
    food: pick(FOODS),
    music: pick(MUSIC),
    visit: pick(VISITS),
    quirk: pick(QUIRKS),
    personality: pick(PERSONALITIES),
    mood: rand(0.3, 0.9), // 0 = sur, 1 = strålande
  };
}

// ---------------- Utseende ----------------
const SKIN = ['#f6d7c3', '#eac0a2', '#e0ac8a', '#c98e6a', '#a86e4b', '#8a5536', '#6b3f26', '#4b2c1c', '#f1c8a8', '#d79f7a'];
const HAIR = ['#1a1310', '#2d1d14', '#4a2f1d', '#6b4426', '#8b5a2b', '#b07a3e', '#d4a55a', '#e6c88a', '#a33b20', '#151515'];
const CLOTH = ['#2f3e5c', '#8c2f39', '#3a5a40', '#e9c46a', '#264653', '#f4a261', '#e76f51', '#6d597a', '#f1faee', '#1d3557', '#b5838d', '#2a9d8f', '#ffb4a2', '#3d405b', '#d62828', '#495057', '#ddb892', '#118ab2'];
const PANTS = ['#2b3a55', '#1f2933', '#4a4e57', '#6b5b45', '#3c4a3e', '#283c63', '#5e503f', '#14213d', '#c2b280'];

function makeLook(persona) {
  const female = persona.gender === 'kvinna';
  const male = persona.gender === 'man';
  const grey = persona.age > 55 ? Math.min(1, (persona.age - 50) / 25) : 0;
  const hairColor = new THREE.Color(pick(HAIR)).lerp(new THREE.Color('#c9c5bf'), grey);
  const hairStyles = female
    ? ['long', 'long', 'bob', 'bun', 'ponytail', 'curly', 'afro', 'short']
    : male
      ? ['short', 'short', 'buzz', 'curly', 'bald', 'afro', 'long', 'ponytail']
      : ['short', 'bob', 'curly', 'buzz', 'ponytail', 'long'];
  let hair = pick(hairStyles);
  if (male && persona.age > 50 && chance(0.4)) hair = 'bald';
  return {
    height: female ? rand(1.56, 1.78) : male ? rand(1.68, 1.95) : rand(1.6, 1.85),
    build: rand(0.88, 1.22),
    skin: pick(SKIN),
    hairColor,
    hair,
    beard: male && chance(0.45) ? pick(['full', 'stubble', 'mustache']) : null,
    top: pick(['tshirt', 'sweater', 'shirt', 'hoodie', ...(female ? ['dress', 'dress'] : [])]),
    topColor: pick(CLOTH),
    accentColor: pick(CLOTH),
    bottom: chance(0.12) ? 'shorts' : female && chance(0.3) ? 'skirt' : 'pants',
    pantsColor: pick(PANTS),
    shoeColor: pick(['#1b1b1b', '#f1f1f1', '#6b4423', '#8c2f39', '#2f3e5c']),
    glasses: chance(persona.age > 45 ? 0.5 : 0.22),
    hat: chance(0.14) ? pick(['beanie', 'cap']) : null,
    eyeColor: pick(['#3b2a1a', '#2e5a88', '#4f7942', '#6b4f2a', '#1c1c1c']),
  };
}

// ---------------- Delade resurser ----------------
let fabricTex = null;
function fabricMap() {
  if (fabricTex) return fabricTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`;
    ctx.fillRect(0, y, 128, 1);
  }
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
  }
  fabricTex = new THREE.CanvasTexture(c);
  fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping;
  fabricTex.repeat.set(3, 3);
  fabricTex.colorSpace = THREE.SRGBColorSpace;
  return fabricTex;
}

let shadowTex = null;
function blobShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

const GEO = {};
function geo(key, make) {
  return GEO[key] || (GEO[key] = make());
}

function capsule(r, len, mat) {
  const g = geo(`cap${r}_${len}`, () => {
    const c = new THREE.CapsuleGeometry(r, len, 6, 14);
    c.translate(0, -len / 2 - r * 0.3, 0);
    return c;
  });
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function sphere(r, mat, ws = 20, hs = 14) {
  const m = new THREE.Mesh(geo(`sph${r}_${ws}`, () => new THREE.SphereGeometry(r, ws, hs)), mat);
  m.castShadow = true;
  return m;
}

// ---------------- Karaktären ----------------
export class Character {
  constructor(id) {
    this.id = id;
    this.persona = makePersona();
    this.look = makeLook(this.persona);
    this.name = this.persona.firstName;
    this.history = []; // konversationshistorik för Claude
    this.memory = { playerName: null, topics: new Set(), met: false };
    this.root = new THREE.Group();
    this.root.userData.character = this;
    this.build();
    this.state = 'idle';
    this.path = null;
    this.target = null;
    this.timer = 0;
    this.stay = rand(70, 200);
    this.age = 0;
    this.speed = rand(0.95, 1.25);
    this.walkPhase = Math.random() * 10;
    this.walkAmount = 0;
    this.sitAmount = 0;
    this.seat = null;
    this.talking = false;
    this.speaking = 0;
    this.blinkTimer = rand(1, 4);
    this.headYaw = 0;
    this.headPitch = 0;
    this.lookTarget = null;
    this.heading = 0;
    this.gesture = 0;
  }

  build() {
    const L = this.look;
    const s = L.height / 1.75;
    const w = L.build;
    const fab = fabricMap();
    const skin = new THREE.MeshStandardMaterial({ color: L.skin, roughness: 0.62 });
    const top = new THREE.MeshStandardMaterial({ color: L.topColor, map: fab, roughness: 0.9 });
    const accent = new THREE.MeshStandardMaterial({ color: L.accentColor, map: fab, roughness: 0.9 });
    const pants = new THREE.MeshStandardMaterial({ color: L.bottom === 'skirt' ? L.accentColor : L.pantsColor, map: fab, roughness: 0.92 });
    const shoe = new THREE.MeshStandardMaterial({ color: L.shoeColor, roughness: 0.55 });
    const hairMat = new THREE.MeshStandardMaterial({ color: L.hairColor, roughness: 0.75 });
    this.materials = [skin, top, accent, pants, shoe, hairMat];

    const body = new THREE.Group();
    body.scale.setScalar(s);
    this.root.add(body);
    this.body = body;

    const hips = new THREE.Group();
    hips.position.y = 0.95;
    body.add(hips);
    this.hips = hips;

    // Bäcken
    const pelvis = new THREE.Mesh(geo('pelvis', () => new RoundedBoxGeometry(0.3, 0.18, 0.19, 3, 0.07)), L.top === 'dress' ? top : pants);
    pelvis.scale.x = w;
    pelvis.castShadow = true;
    pelvis.position.y = 0.0;
    hips.add(pelvis);

    // Ben
    this.legs = [];
    const legLow = L.top === 'dress' || L.bottom === 'skirt' || L.bottom === 'shorts';
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.085 * w, -0.04, 0);
      hips.add(thigh);
      thigh.add(capsule(0.068 * Math.sqrt(w), 0.36, L.top === 'dress' || L.bottom === 'skirt' ? skin : pants));
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      thigh.add(knee);
      knee.add(capsule(0.055, 0.34, legLow ? skin : pants));
      const foot = new THREE.Mesh(geo('foot', () => new RoundedBoxGeometry(0.1, 0.075, 0.25, 3, 0.035)), shoe);
      foot.position.set(0, -0.445, 0.045);
      foot.castShadow = true;
      knee.add(foot);
      this.legs.push({ thigh, knee });
    }

    // Kjol/klänning
    if (L.top === 'dress' || L.bottom === 'skirt') {
      const len = L.top === 'dress' ? 0.5 : 0.42;
      const skirt = new THREE.Mesh(
        geo(`skirt${len}`, () => {
          const g = new THREE.CylinderGeometry(0.16, 0.25, len, 24, 1, true);
          g.translate(0, -len / 2 + 0.05, 0);
          return g;
        }),
        L.top === 'dress' ? top : pants,
      );
      skirt.material.side = THREE.DoubleSide;
      skirt.scale.set(w, 1, 0.85);
      skirt.castShadow = true;
      hips.add(skirt);
      this.skirt = skirt;
    }

    // Överkropp
    const spine = new THREE.Group();
    spine.position.y = 0.06;
    hips.add(spine);
    this.spine = spine;
    const torso = new THREE.Mesh(
      geo('torso', () => {
        const pts = [
          [0.0, 0.0], [0.135, 0.0], [0.14, 0.08], [0.135, 0.18], [0.15, 0.3], [0.165, 0.4], [0.16, 0.46], [0.12, 0.52], [0.05, 0.55], [0.0, 0.555],
        ].map(([r, y]) => new THREE.Vector2(r, y));
        return new THREE.LatheGeometry(pts, 28);
      }),
      top,
    );
    torso.scale.set(w * 1.08, 1, 0.68 * Math.sqrt(w));
    torso.castShadow = true;
    spine.add(torso);
    if (L.top === 'shirt') {
      // Krage och knappslå
      const collar = new THREE.Mesh(geo('collar', () => new THREE.TorusGeometry(0.06, 0.015, 8, 20)), accent);
      collar.rotation.x = Math.PI / 2 - 0.25;
      collar.position.set(0, 0.54, 0.0);
      spine.add(collar);
      const placket = new THREE.Mesh(geo('placket', () => new THREE.BoxGeometry(0.012, 0.4, 0.01)), new THREE.MeshStandardMaterial({ color: new THREE.Color(L.topColor).multiplyScalar(0.7), roughness: 0.8 }));
      placket.position.set(0, 0.3, 0.103 * Math.sqrt(w));
      spine.add(placket);
    }
    if (L.top === 'hoodie') {
      const hood = new THREE.Mesh(geo('hood', () => new THREE.TorusGeometry(0.1, 0.04, 10, 24)), top);
      hood.rotation.x = Math.PI / 2 + 0.35;
      hood.position.set(0, 0.54, -0.04);
      hood.castShadow = true;
      spine.add(hood);
      const pocket = new THREE.Mesh(geo('pocket', () => new RoundedBoxGeometry(0.2, 0.09, 0.03, 2, 0.012)), top);
      pocket.position.set(0, 0.12, 0.1 * Math.sqrt(w));
      spine.add(pocket);
    }
    if (L.top === 'tshirt' && chance(0.5)) {
      // Tryck på tröjan
      const print = new THREE.Mesh(geo('print', () => new THREE.CircleGeometry(0.05, 20)), accent);
      print.position.set(0, 0.33, 0.104 * Math.sqrt(w) + 0.003);
      spine.add(print);
    }

    // Armar
    this.arms = [];
    const sleeveLong = L.top !== 'tshirt' && L.top !== 'dress';
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.185 * w, 0.47, 0);
      spine.add(shoulder);
      const upper = capsule(0.05, 0.22, top);
      shoulder.add(upper);
      const joint = sphere(0.062, top, 14, 10);
      joint.scale.set(1, 0.85, 0.9);
      shoulder.add(joint);
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      shoulder.add(elbow);
      elbow.add(capsule(0.042, 0.2, sleeveLong ? top : skin));
      const hand = sphere(0.045, skin, 12, 10);
      hand.scale.set(0.8, 1.15, 0.6);
      hand.position.y = -0.3;
      elbow.add(hand);
      shoulder.rotation.z = side * 0.08;
      this.arms.push({ shoulder, elbow, side });
    }

    // Hals och huvud
    const neck = new THREE.Mesh(geo('neck', () => new THREE.CylinderGeometry(0.045, 0.05, 0.1, 14)), skin);
    neck.position.y = 0.58;
    neck.castShadow = true;
    spine.add(neck);
    const head = new THREE.Group();
    head.position.y = 0.71;
    spine.add(head);
    this.head = head;
    const skull = sphere(0.11, skin, 28, 20);
    skull.scale.set(0.9, 1.08, 0.97);
    head.add(skull);
    // Käke för lite mer mänsklig form
    const jaw = sphere(0.085, skin, 20, 14);
    jaw.scale.set(0.95, 0.75, 1);
    jaw.position.set(0, -0.05, 0.02);
    head.add(jaw);
    for (const side of [-1, 1]) {
      const ear = sphere(0.025, skin, 10, 8);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(side * 0.1, 0, -0.005);
      head.add(ear);
    }
    const nose = new THREE.Mesh(geo('nose', () => new THREE.ConeGeometry(0.018, 0.045, 10)), skin);
    nose.rotation.x = Math.PI / 2 - 0.4;
    nose.position.set(0, -0.012, 0.108);
    head.add(nose);

    const white = new THREE.MeshStandardMaterial({ color: '#f8f6f2', roughness: 0.25 });
    const iris = new THREE.MeshStandardMaterial({ color: L.eyeColor, roughness: 0.2 });
    const browMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(L.hairColor).multiplyScalar(0.8), roughness: 0.9 });
    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.037, 0.018, 0.088);
      const ball = new THREE.Mesh(geo('eyeball', () => new THREE.SphereGeometry(0.017, 14, 10)), white);
      eye.add(ball);
      const pupil = new THREE.Mesh(geo('iris', () => new THREE.SphereGeometry(0.0095, 12, 8)), iris);
      pupil.position.z = 0.011;
      eye.add(pupil);
      head.add(eye);
      this.eyes.push(eye);
      const brow = new THREE.Mesh(geo('brow', () => new RoundedBoxGeometry(0.04, 0.009, 0.012, 2, 0.004)), browMat);
      brow.position.set(side * 0.038, 0.048, 0.097);
      brow.rotation.z = side * -0.1;
      head.add(brow);
    }
    const mouthMat = new THREE.MeshStandardMaterial({ color: '#7a2f2f', roughness: 0.5 });
    const mouth = new THREE.Mesh(geo('mouth', () => new RoundedBoxGeometry(0.042, 0.012, 0.012, 2, 0.005)), mouthMat);
    mouth.position.set(0, -0.052, 0.098);
    head.add(mouth);
    this.mouth = mouth;

    this.addHair(head, hairMat);
    if (L.beard) this.addBeard(head, hairMat);
    if (L.glasses) {
      const gm = new THREE.MeshStandardMaterial({ color: pick(['#111', '#5a3b22', '#8a8a8a', '#7a1f2b']), roughness: 0.3, metalness: 0.4 });
      for (const side of [-1, 1]) {
        const rim = new THREE.Mesh(geo('rim', () => new THREE.TorusGeometry(0.024, 0.0035, 6, 20)), gm);
        rim.position.set(side * 0.038, 0.018, 0.106);
        head.add(rim);
        const arm = new THREE.Mesh(geo('garm', () => new THREE.BoxGeometry(0.003, 0.003, 0.1)), gm);
        arm.position.set(side * 0.062, 0.022, 0.06);
        head.add(arm);
      }
      const bridge = new THREE.Mesh(geo('bridge', () => new THREE.BoxGeometry(0.026, 0.004, 0.004)), gm);
      bridge.position.set(0, 0.022, 0.108);
      head.add(bridge);
    }
    if (L.hat) {
      const hm = new THREE.MeshStandardMaterial({ color: L.accentColor, map: fab, roughness: 0.95 });
      if (L.hat === 'beanie') {
        const b = new THREE.Mesh(geo('beanie', () => new THREE.SphereGeometry(0.122, 24, 12, 0, Math.PI * 2, 0, 1.75)), hm);
        b.rotation.x = -0.72;
        b.position.y = 0.01;
        b.scale.set(0.95, 1.08, 1);
        b.castShadow = true;
        head.add(b);
        const fold = new THREE.Mesh(geo('beanieFold', () => new THREE.TorusGeometry(0.108, 0.018, 8, 28)), hm);
        fold.rotation.x = Math.PI / 2 - 0.72;
        fold.position.set(0, 0.03, -0.035);
        head.add(fold);
      } else {
        const c = new THREE.Mesh(geo('cap', () => new THREE.SphereGeometry(0.118, 24, 12, 0, Math.PI * 2, 0, 1.45)), hm);
        c.rotation.x = -0.4;
        c.position.y = 0.02;
        c.castShadow = true;
        head.add(c);
        const brim = new THREE.Mesh(geo('brim', () => new THREE.CylinderGeometry(0.09, 0.09, 0.008, 20, 1, false, -Math.PI / 2, Math.PI)), hm);
        brim.position.set(0, 0.06, 0.09);
        brim.rotation.x = 0.12;
        brim.scale.z = 1.1;
        head.add(brim);
      }
    }

    // Kontaktskugga
    const blob = new THREE.Mesh(
      geo('blob', () => new THREE.PlaneGeometry(0.9, 0.9)),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    blob.renderOrder = 1;
    this.root.add(blob);

    // Osynlig träffyta för att trycka på karaktären
    const hit = new THREE.Mesh(
      geo('hit', () => new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8)),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.y = 0.9 * s;
    hit.userData.character = this;
    this.root.add(hit);
    this.hitMesh = hit;
    this.scale = s;
  }

  addHair(head, mat) {
    const style = this.look.hair;
    if (style === 'bald') return;
    const add = (m) => {
      m.castShadow = true;
      head.add(m);
      return m;
    };
    // Luta kalotten bakåt så att framkanten hamnar vid pannan (ca 62° från hjässan)
    const cap = (r, theta, tilt = 1.08 - theta) => {
      const m = add(new THREE.Mesh(geo(`hcap${r}_${theta}`, () => new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, theta)), mat));
      m.rotation.x = tilt;
      m.scale.set(0.93, 1.08, 1.0);
      m.position.set(0, 0.006, -0.006);
      return m;
    };
    if (style === 'buzz') cap(0.113, 1.75);
    if (style === 'short') {
      cap(0.119, 1.85);
      const fringe = add(new THREE.Mesh(geo('fringe', () => new THREE.SphereGeometry(0.06, 14, 10)), mat));
      fringe.scale.set(1.3, 0.45, 0.8);
      fringe.position.set(0.02, 0.085, 0.07);
      fringe.rotation.z = -0.3;
    }
    if (style === 'bob' || style === 'long' || style === 'ponytail' || style === 'bun') cap(0.121, style === 'bob' ? 2.05 : 1.95);
    if (style === 'long') {
      const back = add(new THREE.Mesh(geo('longback', () => {
        const g = new THREE.CylinderGeometry(0.115, 0.125, 0.3, 24, 1, true, 0.9, Math.PI * 2 - 1.8);
        g.translate(0, -0.12, 0);
        return g;
      }), mat));
      back.material.side = THREE.DoubleSide;
      back.scale.set(0.95, 1, 0.9);
      back.position.z = -0.01;
    }
    if (style === 'ponytail') {
      const tail = add(new THREE.Mesh(geo('tail', () => {
        const g = new THREE.CapsuleGeometry(0.03, 0.16, 4, 10);
        g.translate(0, -0.1, 0);
        return g;
      }), mat));
      tail.position.set(0, 0.05, -0.115);
      tail.rotation.x = 0.35;
      this.ponytail = tail;
    }
    if (style === 'bun') {
      const bun = add(new THREE.Mesh(geo('bun', () => new THREE.SphereGeometry(0.05, 16, 12)), mat));
      bun.position.set(0, 0.11, -0.08);
    }
    if (style === 'curly') {
      cap(0.118, 1.8);
      const curl = geo('curl', () => new THREE.SphereGeometry(0.03, 10, 8));
      for (let i = 0; i < 46; i++) {
        const t = Math.random() * 1.7;
        const p = Math.random() * Math.PI * 2;
        const v = new THREE.Vector3(Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p));
        if (v.z > 0.55 && v.y < 0.55) continue; // håll ansiktet fritt
        const m = add(new THREE.Mesh(curl, mat));
        m.position.copy(v.multiplyScalar(0.122));
        m.position.y += 0.01;
        m.position.z -= 0.01;
      }
    }
    if (style === 'afro') {
      const a = add(new THREE.Mesh(geo('afro', () => {
        // Sammanfoga hörnen så att normalerna blir mjuka, och ge ytan lite struktur
        const g = mergeVertices(new THREE.IcosahedronGeometry(0.16, 5));
        const p = g.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i);
          v.multiplyScalar(1 + Math.sin(v.x * 90) * Math.sin(v.y * 80) * Math.sin(v.z * 85) * 0.04);
          p.setXYZ(i, v.x, v.y, v.z);
        }
        g.computeVertexNormals();
        return g;
      }), mat));
      a.position.set(0, 0.06, -0.035);
      a.scale.set(1.05, 0.95, 1);
    }
  }

  addBeard(head, mat) {
    const kind = this.look.beard;
    if (kind === 'mustache') {
      const m = new THREE.Mesh(geo('stache', () => new RoundedBoxGeometry(0.06, 0.014, 0.02, 2, 0.006)), mat);
      m.position.set(0, -0.034, 0.101);
      head.add(m);
      return;
    }
    const b = new THREE.Mesh(
      geo(`beard${kind}`, () => new THREE.SphereGeometry(kind === 'full' ? 0.093 : 0.09, 24, 12, 0.2, Math.PI - 0.4, Math.PI * 0.64, Math.PI * 0.3)),
      kind === 'full' ? mat : new THREE.MeshStandardMaterial({ color: mat.color, roughness: 1, transparent: true, opacity: 0.55 }),
    );
    b.scale.set(0.98, 1.0, 1.1);
    b.position.set(0, -0.028, 0.012);
    b.castShadow = kind === 'full';
    head.add(b);
  }

  get position() {
    return this.root.position;
  }

  // ---------- Beteende ----------
  setPath(nav, x, z) {
    const p = nav.findPath(this.position.x, this.position.z, x, z);
    if (!p) return false;
    this.path = p.slice(1);
    if (!this.path.length) this.path = [[x, z]];
    this.target = [x, z];
    return true;
  }

  chooseNext(world) {
    const { nav, seats, pois } = world;
    if (this.age > this.stay) {
      this.state = 'leaving';
      this.setPath(nav, SPAWN.x, SPAWN.z);
      return;
    }
    const r = Math.random();
    const freeSeats = seats.filter((s) => !s.occupant);
    if (r < 0.42 && freeSeats.length) {
      const seat = pick(freeSeats);
      seat.occupant = this;
      this.seat = seat;
      this.state = 'toSeat';
      this.setPath(nav, seat.approach[0], seat.approach[1]);
      return;
    }
    if (r < 0.85) {
      const poi = pick(pois);
      this.poi = poi;
      this.state = 'toPoi';
      this.setPath(nav, poi.x + rand(-0.2, 0.2), poi.z + rand(-0.2, 0.2));
      return;
    }
    // Ställ dig nära någon annan eller mitt i rummet
    this.state = 'toPoi';
    this.poi = null;
    this.setPath(nav, rand(-3.5, 3.8), rand(-1, 2.6));
  }

  update(dt, world) {
    this.age += dt;
    this.timer -= dt;
    const { nav, player } = world;
    let moving = false;

    if (this.talking) {
      // Stanna och titta på spelaren
      this.lookTarget = player.headPos;
      if (!this.seat || this.sitAmount < 0.5) this.faceTowards(player.position.x, player.position.z, dt, 4);
    } else {
      switch (this.state) {
        case 'entering':
        case 'toSeat':
        case 'toPoi':
        case 'leaving':
        case 'wander': {
          moving = this.followPath(dt, world);
          if (!this.path || !this.path.length) {
            if (this.state === 'leaving') {
              this.done = true;
            } else if (this.state === 'toSeat') {
              this.state = 'sittingDown';
              this.timer = 0;
            } else {
              this.state = 'idle';
              this.timer = rand(4, 12);
              if (this.poi) this.desiredHeading = this.poi.face;
            }
          }
          break;
        }
        case 'sittingDown': {
          // Gå baklänges in i stolen och sätt dig
          const s = this.seat;
          const dx = s.x - this.position.x;
          const dz = s.z - this.position.z;
          const d = Math.hypot(dx, dz);
          this.faceAngle(s.face, dt, 6);
          if (d > 0.02) {
            const step = Math.min(d, dt * 0.8);
            this.position.x += (dx / d) * step;
            this.position.z += (dz / d) * step;
            moving = d > 0.15;
          }
          if (d < 0.05 && Math.abs(angleDiff(this.heading, s.face)) < 0.2) {
            this.state = 'sitting';
            this.timer = rand(14, 40);
          }
          break;
        }
        case 'sitting': {
          this.faceAngle(this.seat.face, dt, 4);
          if (this.timer <= 0) this.state = 'standingUp';
          this.idleLook(dt, world);
          break;
        }
        case 'standingUp': {
          if (this.sitAmount < 0.05) {
            const s = this.seat;
            const dx = s.approach[0] - this.position.x;
            const dz = s.approach[1] - this.position.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.05) {
              const step = Math.min(d, dt * 0.8);
              this.position.x += (dx / d) * step;
              this.position.z += (dz / d) * step;
              moving = true;
            } else {
              s.occupant = null;
              this.seat = null;
              this.chooseNext(world);
            }
          }
          break;
        }
        case 'idle':
        default: {
          if (this.desiredHeading !== undefined) this.faceAngle(this.desiredHeading, dt, 3);
          this.idleLook(dt, world);
          if (this.timer <= 0) {
            this.desiredHeading = undefined;
            this.chooseNext(world);
          }
        }
      }
    }

    // Separation mellan karaktärer och spelaren (bara när de går)
    if (moving && this.state !== 'sittingDown' && this.state !== 'standingUp') {
      for (const o of world.characters) {
        if (o === this) continue;
        const dx = this.position.x - o.position.x;
        const dz = this.position.z - o.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.55 && d > 0.001) {
          this.position.x += (dx / d) * (0.55 - d) * 0.5;
          this.position.z += (dz / d) * (0.55 - d) * 0.5;
        }
      }
      const pdx = this.position.x - player.position.x;
      const pdz = this.position.z - player.position.z;
      const pd = Math.hypot(pdx, pdz);
      if (pd < 0.6 && pd > 0.001) {
        this.position.x += (pdx / pd) * (0.6 - pd) * 0.6;
        this.position.z += (pdz / pd) * (0.6 - pd) * 0.6;
      }
    }

    this.animate(dt, moving);
  }

  followPath(dt, world) {
    if (!this.path || !this.path.length) return false;
    const [tx, tz] = this.path[0];
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) {
      this.path.shift();
      return this.path.length > 0;
    }
    // Vänta om spelaren står i vägen
    const p = world.player.position;
    const ahead = Math.hypot(p.x - (this.position.x + (dx / d) * 0.5), p.z - (this.position.z + (dz / d) * 0.5));
    let speed = this.speed;
    if (ahead < 0.45) speed *= 0.2;
    const want = Math.atan2(dx, dz);
    this.faceAngle(want, dt, 7);
    // Gå framåt i blickriktningen så att svängarna blir mjuka
    const turnFactor = Math.max(0.25, Math.cos(angleDiff(this.heading, want)));
    const step = Math.min(d, speed * dt * turnFactor);
    this.position.x += Math.sin(this.heading) * step;
    this.position.z += Math.cos(this.heading) * step;
    this.lookTarget = null;
    return true;
  }

  faceAngle(a, dt, rate) {
    const diff = angleDiff(this.heading, a);
    this.heading += diff * Math.min(1, dt * rate);
    this.root.rotation.y = this.heading;
  }

  faceTowards(x, z, dt, rate) {
    this.faceAngle(Math.atan2(x - this.position.x, z - this.position.z), dt, rate);
  }

  idleLook(dt, world) {
    // Titta på spelaren om den är nära, annars på någon annan ibland
    const p = world.player.position;
    const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    if (d < 3.2) {
      this.lookTarget = world.player.headPos;
    } else if (!this.lookTarget || Math.random() < dt * 0.15) {
      const others = world.characters.filter((c) => c !== this);
      this.lookTarget = others.length && Math.random() < 0.6 ? pick(others).headWorld() : null;
    }
  }

  headWorld() {
    return new THREE.Vector3(this.position.x, this.look.height - 0.08, this.position.z);
  }

  animate(dt, moving) {
    const t = performance.now() / 1000;
    this.walkAmount += ((moving ? 1 : 0) - this.walkAmount) * Math.min(1, dt * 8);
    const nearSeat = this.seat && Math.hypot(this.seat.x - this.position.x, this.seat.z - this.position.z) < 0.12;
    const seated = this.state === 'sitting' || (this.state === 'sittingDown' && nearSeat);
    this.sitAmount += ((seated ? 1 : 0) - this.sitAmount) * Math.min(1, dt * 3.5);

    this.walkPhase += dt * this.speed * 6.2 * this.walkAmount;
    const ph = this.walkPhase;
    const wa = this.walkAmount;
    const sa = this.sitAmount;

    const swing = Math.sin(ph) * 0.55 * wa;
    const [lL, lR] = this.legs;
    const legX = (sw) => -sw;
    lL.thigh.rotation.x = legX(swing) * (1 - sa) + -1.5 * sa;
    lR.thigh.rotation.x = legX(-swing) * (1 - sa) + -1.5 * sa;
    lL.knee.rotation.x = Math.max(0, -Math.cos(ph)) * 0.9 * wa * (1 - sa) + 1.5 * sa;
    lR.knee.rotation.x = Math.max(0, Math.cos(ph)) * 0.9 * wa * (1 - sa) + 1.5 * sa;
    lL.thigh.rotation.z = 0;
    lR.thigh.rotation.z = 0;

    const seatH = this.seat ? this.seat.height / this.scale : 0.48;
    const standY = 0.95 + Math.abs(Math.cos(ph)) * 0.025 * wa - 0.012 * wa;
    this.hips.position.y = standY * (1 - sa) + (seatH + 0.06) * sa;
    this.hips.position.z = -0.12 * sa;
    this.hips.rotation.y = Math.sin(ph) * 0.08 * wa;
    if (this.skirt) this.skirt.scale.z = 0.85 + sa * 0.9;

    // Andning och överkropp
    const breathe = Math.sin(t * 1.6 + this.id) * 0.012;
    this.spine.rotation.x = 0.04 * wa - 0.06 * sa + breathe;
    this.spine.rotation.y = -Math.sin(ph) * 0.1 * wa;
    this.spine.scale.set(1, 1 + breathe * 0.3, 1);

    // Armar
    this.gesture = Math.max(0, this.gesture - dt);
    for (const a of this.arms) {
      const s = a.side;
      const armSwing = Math.sin(ph) * 0.5 * wa * s;
      let rx = armSwing + Math.sin(t * 1.3 + s) * 0.02;
      let rz = s * (0.08 + 0.02 * Math.sin(t * 1.6));
      let ex = -0.15 - 0.25 * wa;
      if (sa > 0.5) {
        rx = -0.45;
        ex = -0.75;
        rz = s * 0.12;
      }
      if (this.speaking > 0 && s === 1) {
        // Gestikulera medan karaktären pratar
        rx = -0.5 + Math.sin(t * 3.1) * 0.25;
        ex = -1.1 + Math.sin(t * 4.3) * 0.3;
        rz = 0.25;
      }
      a.shoulder.rotation.x += (rx - a.shoulder.rotation.x) * Math.min(1, dt * 8);
      a.shoulder.rotation.z += (rz - a.shoulder.rotation.z) * Math.min(1, dt * 8);
      a.elbow.rotation.x += (ex - a.elbow.rotation.x) * Math.min(1, dt * 8);
    }

    // Huvudet följer blicken
    let yaw = 0;
    let pitch = 0;
    if (this.lookTarget) {
      const hp = this.headWorld();
      const dx = this.lookTarget.x - hp.x;
      const dz = this.lookTarget.z - hp.z;
      const dy = this.lookTarget.y - (hp.y - (this.hips.position.y < 0.8 ? 0.4 : 0));
      yaw = angleDiff(this.heading, Math.atan2(dx, dz));
      pitch = -Math.atan2(dy, Math.hypot(dx, dz));
      if (Math.abs(yaw) > 1.4) {
        yaw = 0;
        pitch = 0;
      }
    } else {
      yaw = Math.sin(t * 0.3 + this.id * 2) * 0.35;
    }
    this.headYaw += (Math.max(-1.1, Math.min(1.1, yaw)) - this.headYaw) * Math.min(1, dt * 5);
    this.headPitch += (Math.max(-0.5, Math.min(0.5, pitch)) - this.headPitch) * Math.min(1, dt * 5);
    this.head.rotation.y = this.headYaw - this.spine.rotation.y;
    this.head.rotation.x = this.headPitch;

    // Blinkningar
    this.blinkTimer -= dt;
    const blink = this.blinkTimer < 0.12 ? 0.1 : 1;
    if (this.blinkTimer < 0) this.blinkTimer = rand(2, 5);
    for (const e of this.eyes) e.scale.y = blink;

    // Munnen
    this.speaking = Math.max(0, this.speaking - dt);
    const open = this.speaking > 0 ? 0.6 + Math.abs(Math.sin(t * 17) * Math.sin(t * 7.3)) * 3.2 : 1;
    this.mouth.scale.y += (open - this.mouth.scale.y) * Math.min(1, dt * 20);

    if (this.ponytail) this.ponytail.rotation.z = Math.sin(ph) * 0.2 * wa;
  }

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
