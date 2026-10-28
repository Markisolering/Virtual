import * as THREE from 'three';
import { FaceAnimator, textToVisemes } from '../face.js';
import { curvature } from './subdivide.js';
import { skinParams, SKIN_DIRECT } from './skin.js';
import { bakeSkin, randomLook } from './skinbake.js';

// Skannat huvud för huvudstudion: ICT-FaceKit (USC Institute for Creative Technologies, MIT-licens).
// Formen kommer från ljusscenskanningar av riktiga ansikten (26 719 hörn), med 53 ansiktsuttryck i
// ARKit-stil och formvariationer (identiteter) som blandas till nya personer. Allt som finns i ett riktigt
// huvud är med: munhåla, tandkött, tunga, tänder, ögonglober med hornhinna och iris, tårvätska längs
// ögonlocken, ögonfransar och ett skuggnät som mjukar upp övergången mellan ögonlock och öga.
//
// Huden saknar texturer i originalet, så de räknas fram på grafikkortet för varje ny person
// (se skinbake.js): hudton, blodfärg, fräknar, porer, rynkor, läppar, ögonbryn, skäggstubb och snaggat hår.

const BASE = import.meta.env.BASE_URL;
const CM = 0.01;

// Grupperna i filen -> delar som ritas med olika material
const PARTS = {
  Face: 'skin',
  BackHead: 'skin',
  GumsTongue: 'mouth',
  Teeth: 'teeth',
  ScleraLeft: 'sclera',
  ScleraRight: 'sclera',
  IrisLeft: 'iris',
  IrisRight: 'iris',
  LacrimalFluid: 'wet',
  EyeBlend: 'blend',
  EyeOcclusion: 'occlusion',
  EyeLashes: 'lashes',
};
// Ordningen de ritas i (genomskinliga delar sist)
const ORDER = ['skin', 'mouth', 'teeth', 'sclera', 'iris', 'cornea', 'lashes', 'blend', 'wet', 'occlusion'];

// Delar av grundnätet (hörnindex enligt ICT-FaceKits dokumentation)
const MOUTH_SOCKET = [11248, 13293];
const EYE_SOCKETS = [13294, 14061];

// Uttrycken i spelets namn (Rocketbox-ARKit) -> ICT-FaceKits namn
const AK_TO_ICT = {
  AK_01_BrowDownLeft: ['browDown_L'],
  AK_02_BrowDownRight: ['browDown_R'],
  AK_03_BrowInnerUp: ['browInnerUp_L', 'browInnerUp_R'],
  AK_04_BrowOuterUpLeft: ['browOuterUp_L'],
  AK_05_BrowOuterUpRight: ['browOuterUp_R'],
  AK_07_CheekSquintLeft: ['cheekSquint_L'],
  AK_08_CheekSquintRight: ['cheekSquint_R'],
  AK_09_EyeBlinkLeft: ['eyeBlink_L'],
  AK_10_EyeBlinkRight: ['eyeBlink_R'],
  AK_19_EyeSquintLeft: ['eyeSquint_L'],
  AK_20_EyeSquintRight: ['eyeSquint_R'],
  AK_21_EyeWideLeft: ['eyeWide_L'],
  AK_22_EyeWideRight: ['eyeWide_R'],
  AK_25_JawOpen: ['jawOpen'],
  AK_30_MouthFrownLeft: ['mouthFrown_L'],
  AK_31_MouthFrownRight: ['mouthFrown_R'],
  AK_36_MouthPressLeft: ['mouthPress_L'],
  AK_37_MouthPressRight: ['mouthPress_R'],
  AK_38_MouthPucker: ['mouthPucker'],
  AK_44_MouthSmileLeft: ['mouthSmile_L'],
  AK_45_MouthSmileRight: ['mouthSmile_R'],
  AK_50_NoseSneerLeft: ['noseSneer_L'],
  AK_51_NoseSneerRight: ['noseSneer_R'],
};

// Munformer (visem) som blandningar av ARKit-former. Käken sköts separat av FaceAnimator.
const VISEME_SHAPES = {
  PP: { mouthPress_L: 0.45, mouthPress_R: 0.45, mouthRollLower: 0.35, mouthRollUpper: 0.3, mouthClose: 0.1 },
  FF: { mouthRollLower: 0.65, mouthUpperUp_L: 0.25, mouthUpperUp_R: 0.25, mouthStretch_L: 0.1, mouthStretch_R: 0.1 },
  TH: { mouthLowerDown_L: 0.2, mouthLowerDown_R: 0.2, mouthStretch_L: 0.15, mouthStretch_R: 0.15 },
  DD: { mouthStretch_L: 0.25, mouthStretch_R: 0.25, mouthLowerDown_L: 0.15, mouthLowerDown_R: 0.15 },
  kk: { mouthStretch_L: 0.2, mouthStretch_R: 0.2, mouthLowerDown_L: 0.1, mouthLowerDown_R: 0.1 },
  CH: { mouthFunnel: 0.55, mouthShrugUpper: 0.25, mouthUpperUp_L: 0.15, mouthUpperUp_R: 0.15 },
  SS: { mouthStretch_L: 0.4, mouthStretch_R: 0.4, mouthSmile_L: 0.12, mouthSmile_R: 0.12 },
  nn: { mouthStretch_L: 0.2, mouthStretch_R: 0.2, mouthClose: 0.05 },
  RR: { mouthFunnel: 0.35, mouthPucker: 0.2 },
  aa: { mouthLowerDown_L: 0.3, mouthLowerDown_R: 0.3, mouthUpperUp_L: 0.12, mouthUpperUp_R: 0.12 },
  E: { mouthStretch_L: 0.45, mouthStretch_R: 0.45, mouthSmile_L: 0.2, mouthSmile_R: 0.2, mouthLowerDown_L: 0.15, mouthLowerDown_R: 0.15 },
  I: { mouthSmile_L: 0.35, mouthSmile_R: 0.35, mouthStretch_L: 0.3, mouthStretch_R: 0.3 },
  O: { mouthFunnel: 0.65, mouthPucker: 0.2 },
  U: { mouthPucker: 0.85, mouthFunnel: 0.3 },
};

export async function loadScanHead() {
  const [meta, buf] = await Promise.all([
    fetch(`${BASE}scanhead/head.json`).then((r) => r.json()),
    fetch(`${BASE}scanhead/head.bin`).then((r) => r.arrayBuffer()),
  ]);
  return new ScanHead(meta, buf);
}

// Ytnormaler för ett nät i grundnätets hörn (sömmar i UV-kartan delar hörn, så ingen synlig söm)
function vertexNormals(pos, tris, out) {
  out.fill(0);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3;
    const b = tris[t + 1] * 3;
    const c = tris[t + 2] * 3;
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      out[i] += nx;
      out[i + 1] += ny;
      out[i + 2] += nz;
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l;
    out[i + 1] /= l;
    out[i + 2] /= l;
  }
  return out;
}

export class ScanHead {
  constructor(meta, buf) {
    this.meta = meta;
    const n = meta.vertices;
    const corners = meta.corners;
    this.n = n;
    this.base = new Float32Array(buf, meta.position, n * 3);
    this.src = new Uint16Array(buf, meta.src, corners);
    const uv = new Float32Array(buf, meta.uv, corners * 2);
    const index = corners < 65536 ? new Uint16Array(buf, meta.index, meta.indexCount) : new Uint32Array(buf, meta.index, meta.indexCount);
    this.expressions = meta.expressions.map((e) => ({
      name: e.name,
      ids: new Uint16Array(buf, e.ids, e.count),
      delta: new Int16Array(buf, e.delta, e.count * 3),
      scale: e.scale,
    }));
    this.identities = meta.identities.map((e) => ({ name: e.name, delta: new Int16Array(buf, e.delta, n * 3), scale: e.scale }));
    // Trianglar i grundnätets hörn (för normaler)
    this.tris = new Uint32Array(index.length);
    for (let i = 0; i < index.length; i++) this.tris[i] = this.src[index[i]];

    // Vilken del varje triangel hör till, och hornhinnan som egen del (den genomskinliga framsidan av ögat)
    const triPart = new Array(index.length / 3);
    for (const g of meta.groups) for (let t = g.start / 3; t < (g.start + g.count) / 3; t++) triPart[t] = PARTS[g.name] || 'skin';
    this.eyes = this.findEyes(meta.groups, index);
    for (const eye of this.eyes) for (const t of eye.corneaTris) triPart[t] = 'cornea';
    const order = [];
    const groups = [];
    for (const part of ORDER) {
      const start = order.length;
      for (let t = 0; t < triPart.length; t++) if (triPart[t] === part) order.push(index[t * 3], index[t * 3 + 1], index[t * 3 + 2]);
      if (order.length > start) groups.push({ part, start, count: order.length - start });
    }

    const g = new THREE.BufferGeometry();
    g.setIndex(new THREE.BufferAttribute(corners < 65536 ? Uint16Array.from(order) : Uint32Array.from(order), 1));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(corners * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(corners * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    // Hörnens egna data för skuggningen: region (0 hud, 1 munhåla, 2 ögonhåla), djup i munnen,
    // och ögonkoordinater (läge i förhållande till irisens mitt, i irisradier)
    const region = new Float32Array(corners);
    const depth = new Float32Array(corners);
    const eyeCoord = new Float32Array(corners * 3);
    for (let c = 0; c < corners; c++) {
      const v = this.src[c];
      region[c] = v >= MOUTH_SOCKET[0] && v <= MOUTH_SOCKET[1] ? 1 : v >= EYE_SOCKETS[0] && v <= EYE_SOCKETS[1] ? 2 : 0;
      depth[c] = THREE.MathUtils.smoothstep(this.base[v * 3 + 2], 4.5, 10.6);
    }
    for (const eye of this.eyes) {
      for (const v of eye.verts) {
        const p = new THREE.Vector3(this.base[v * 3], this.base[v * 3 + 1], this.base[v * 3 + 2]).sub(eye.irisCenter);
        eye.coord.set(v, [p.dot(eye.right) / eye.irisRadius, p.dot(eye.up) / eye.irisRadius, p.dot(eye.axis) / eye.irisRadius]);
      }
    }
    this.cornersOf = Array.from({ length: n }, () => []);
    for (let c = 0; c < corners; c++) this.cornersOf[this.src[c]].push(c);
    for (const eye of this.eyes) for (const [v, xyz] of eye.coord) for (const c of this.cornersOf[v]) eyeCoord.set(xyz, c * 3);
    // Ögonfransarna: vinkel runt ögat och avstånd från ögonlockskanten (0 rot, 1 spets), ovan/under
    for (const [v, xyz] of this.lashCoords(meta.groups, index)) for (const c of this.cornersOf[v]) eyeCoord.set(xyz, c * 3);
    g.setAttribute('region', new THREE.BufferAttribute(region, 1));
    g.setAttribute('mouthDepth', new THREE.BufferAttribute(depth, 1));
    g.setAttribute('eyeCoord', new THREE.BufferAttribute(eyeCoord, 3));
    for (const gr of groups) g.addGroup(gr.start, gr.count, ORDER.indexOf(gr.part));
    g.morphTargetsRelative = true;
    g.morphAttributes.position = this.expressions.map((e) => {
      const a = new Float32Array(corners * 3);
      e.ids.forEach((v, j) => {
        for (const c of this.cornersOf[v]) for (let k = 0; k < 3; k++) a[c * 3 + k] = e.delta[j * 3 + k] * e.scale * CM;
      });
      return new THREE.BufferAttribute(a, 3);
    });
    g.morphAttributes.normal = this.expressions.map(() => new THREE.BufferAttribute(new Float32Array(corners * 3), 3));
    this.geometry = g;
    this.morph = Object.fromEntries(this.expressions.map((e, i) => [e.name, i]));

    this.materials = {};
    this.mesh = new THREE.Mesh(g, ORDER.map(() => new THREE.MeshStandardMaterial()));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.morphTargetInfluences = new Array(this.expressions.length).fill(0);
    // Huvudet vrids kring halsens överdel
    this.pivot = new THREE.Group();
    this.pivot.position.set(0, -4 * CM, -2 * CM);
    this.mesh.position.set(0, 4 * CM, 2 * CM);
    this.pivot.add(this.mesh);
    this.root = new THREE.Group();
    this.root.add(this.pivot);
    this.mesh.scale.setScalar(1);

    this.face = new FaceAnimator(Math.random() * 10);
    this.state = {};
    this.expression = 'neutral';
    this.expressionUntil = 0;
    this.age = 0;
    this.speaking = 0;
    this.gaze = new THREE.Vector2();
    this.lookAt = null; // kamerans läge: personen tittar mot den
    this.cur = new Float32Array(n * 3);
    this.normals = new Float32Array(n * 3);
  }

  // Ögonen: ögonglobens mitt, irisens mitt och radie, blickriktning och hornhinnans trianglar
  findEyes(groups, index) {
    const sides = [
      ['ScleraLeft', 'IrisLeft'],
      ['ScleraRight', 'IrisRight'],
    ];
    const P = (v) => new THREE.Vector3(this.base[v * 3], this.base[v * 3 + 1], this.base[v * 3 + 2]);
    const vertsOf = (name) => {
      const g = groups.find((x) => x.name === name);
      const set = new Set();
      for (let i = g.start; i < g.start + g.count; i++) set.add(this.src[index[i]]);
      return { g, verts: [...set] };
    };
    return sides.map(([scleraName, irisName]) => {
      const sclera = vertsOf(scleraName);
      const iris = vertsOf(irisName);
      const center = fitSphere(sclera.verts.map(P));
      // Hornhinnans topp: det sklerahörn som ligger längst fram
      const apex = sclera.verts.map(P).reduce((a, b) => (b.z > a.z ? b : a));
      const axis = apex.clone().sub(center).normalize();
      // Irisens främre yta: hörnen närmast hornhinnan
      const along = (v) => P(v).sub(center).dot(axis);
      let maxAlong = Math.max(...iris.verts.map(along));
      const front = iris.verts.filter((v) => along(v) > maxAlong - 0.3);
      const irisCenter = front.reduce((s, v) => s.add(P(v)), new THREE.Vector3()).divideScalar(front.length);
      // Blickriktningen genom irisens mitt (hornhinnans topp ligger inte alltid exakt framför den)
      axis.copy(irisCenter).sub(center).normalize();
      const maxAlong2 = Math.max(...iris.verts.map(along));
      const lateral = (v) => {
        const d = P(v).sub(irisCenter);
        return d.addScaledVector(axis, -d.dot(axis)).length();
      };
      // Irisens kant: där irisen böjer av bakåt (de främre 0,45 cm av irisnätet)
      const disc = iris.verts.filter((v) => along(v) > maxAlong2 - 0.45).map(lateral).sort((x, y) => x - y);
      const irisRadius = disc[Math.floor(disc.length * 0.97)];
      const right = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
      const up = axis.clone().cross(right).normalize();
      // Hornhinnan: sklerans trianglar framför irisens kant
      const isCornea = (v) => along(v) > 0 && lateral(v) < irisRadius * 1.04;
      const corneaTris = [];
      for (let i = sclera.g.start; i < sclera.g.start + sclera.g.count; i += 3) {
        if (isCornea(this.src[index[i]]) && isCornea(this.src[index[i + 1]]) && isCornea(this.src[index[i + 2]])) corneaTris.push(i / 3);
      }
      return { center, axis, right, up, irisCenter, irisRadius, corneaTris, verts: [...sclera.verts, ...iris.verts], coord: new Map() };
    });
  }

  lashCoords(groups, index) {
    const vertsOf = (name) => {
      const g = groups.find((x) => x.name === name);
      const set = new Set();
      for (let i = g.start; i < g.start + g.count; i++) set.add(this.src[index[i]]);
      return [...set];
    };
    const P = (v) => new THREE.Vector3(this.base[v * 3], this.base[v * 3 + 1], this.base[v * 3 + 2]);
    const lashes = vertsOf('EyeLashes').map((v) => ({ v, p: P(v) }));
    const skin = vertsOf('Face')
      .map(P)
      .filter((p) => this.eyes.some((e) => p.distanceTo(e.center) < 3.2));
    const out = new Map();
    const groupsMax = new Map();
    for (const l of lashes) {
      const eye = this.eyes.reduce((a, b) => (l.p.distanceTo(a.center) < l.p.distanceTo(b.center) ? a : b));
      let d = Infinity;
      for (const s of skin) d = Math.min(d, s.distanceToSquared(l.p));
      l.d = Math.sqrt(d);
      l.upper = l.p.y > eye.center.y - 0.15 ? 1 : 0;
      l.along = Math.atan2(l.p.y - eye.center.y, (l.p.x - eye.center.x) * Math.sign(eye.center.x || 1));
      const key = `${eye.center.x > 0}:${l.upper}`;
      l.key = key;
      groupsMax.set(key, Math.max(groupsMax.get(key) || 0, l.d));
    }
    for (const l of lashes) out.set(l.v, [l.along, Math.min(1, l.d / groupsMax.get(l.key)), l.upper]);
    return out;
  }

  // Ny person: blanda identiteter, räkna om normaler och baka nya hudtexturer
  async newPerson(renderer, seed = Math.floor(Math.random() * 1e9)) {
    const rnd = mulberry(seed);
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const n = this.n;
    const cur = this.cur;
    cur.set(this.base);
    for (const id of this.identities) {
      const w = gauss() * 0.75;
      const s = id.scale * w;
      for (let i = 0; i < n * 3; i++) cur[i] += id.delta[i] * s;
    }
    this.look = randomLook(rnd);
    this.seed = seed;
    this.updateGeometry();
    await this.applyLook(renderer);
    return this.look;
  }

  updateGeometry() {
    const g = this.geometry;
    const cur = this.cur;
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    vertexNormals(cur, this.tris, this.normals);
    const src = this.src;
    for (let c = 0; c < src.length; c++) {
      const v = src[c] * 3;
      pos[c * 3] = cur[v] * CM;
      pos[c * 3 + 1] = cur[v + 1] * CM;
      pos[c * 3 + 2] = cur[v + 2] * CM;
      nor[c * 3] = this.normals[v];
      nor[c * 3 + 1] = this.normals[v + 1];
      nor[c * 3 + 2] = this.normals[v + 2];
    }
    // Uttryckens normaler: skillnaden mot grundformens normaler, bara där formen rör sig
    const moved = new Float32Array(cur.length);
    const mn = new Float32Array(cur.length);
    this.expressions.forEach((e, i) => {
      moved.set(cur);
      e.ids.forEach((v, j) => {
        for (let k = 0; k < 3; k++) moved[v * 3 + k] += e.delta[j * 3 + k] * e.scale;
      });
      vertexNormals(moved, this.tris, mn);
      const out = g.morphAttributes.normal[i].array;
      out.fill(0);
      for (let c = 0; c < src.length; c++) {
        const v = src[c] * 3;
        for (let k = 0; k < 3; k++) out[c * 3 + k] = mn[v + k] - this.normals[v + k];
      }
      g.morphAttributes.normal[i].needsUpdate = true;
    });
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    curvature(g);
    g.computeBoundingSphere();
  }

  async applyLook(renderer) {
    const maps = bakeSkin(renderer, this, this.look);
    this.maps?.albedoTarget.dispose();
    this.maps?.normalTarget.dispose();
    this.maps = maps;
    const old = this.materials;
    this.materials = makeMaterials(maps, this.look, this.eyes);
    this.mesh.material = ORDER.map((p) => this.materials[p] || this.materials.skin);
    for (const m of Object.values(old)) m.dispose?.();
  }

  setExpression(name, seconds = 4) {
    this.expression = name;
    this.expressionUntil = this.age + seconds;
  }

  speak(text, rate = 1) {
    const d = this.face.speak(text, rate);
    this.speaking = d + 0.2;
    return d;
  }

  // weights: { ictNamn: värde }
  update(dt, expressions = {}) {
    this.age += dt;
    this.speaking = Math.max(0, this.speaking - dt);
    const want = {};
    const add = (k, v) => {
      const list = AK_TO_ICT[k];
      if (list) for (const x of list) want[x] = (want[x] || 0) + v;
      else if (k.startsWith('AA_VI_')) {
        const vis = k.replace(/^AA_VI_\d+_/, '').replace('KK', 'kk');
        for (const [x, w] of Object.entries(VISEME_SHAPES[vis] || {})) want[x] = (want[x] || 0) + w * v;
      } else want[k] = (want[k] || 0) + v;
    };
    const expr = this.age < this.expressionUntil ? this.expression : 'neutral';
    for (const [k, v] of Object.entries(expressions[expr] || {})) add(k, v);
    if (expr === 'neutral') {
      add('AK_44_MouthSmileLeft', 0.06);
      add('AK_45_MouthSmileRight', 0.06);
    }
    this.face.update(dt, add, this.state);
    // Blicken: mot kameran, plus ögats egna små hopp
    let gx = this.face.gaze.x;
    let gy = this.face.gaze.y;
    if (this.lookAt) {
      const local = this.mesh.worldToLocal(this.lookAt.clone()).multiplyScalar(1 / CM);
      const eyeMid = this.eyes[0].center.clone().add(this.eyes[1].center).multiplyScalar(0.5);
      const d = local.sub(eyeMid);
      gx += THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -0.5, 0.5);
      gy += THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.4, 0.4);
    }
    this.gaze.x += (gx - this.gaze.x) * Math.min(1, dt * 20);
    this.gaze.y += (gy - this.gaze.y) * Math.min(1, dt * 20);
    // Formerna eyeLook* vrider ögonen ungefär 25° vid 1
    const k = 1 / 0.44;
    const right = Math.max(0, this.gaze.x) * k;
    const left = Math.max(0, -this.gaze.x) * k;
    want.eyeLookOut_L = (want.eyeLookOut_L || 0) + right;
    want.eyeLookIn_R = (want.eyeLookIn_R || 0) + right;
    want.eyeLookIn_L = (want.eyeLookIn_L || 0) + left;
    want.eyeLookOut_R = (want.eyeLookOut_R || 0) + left;
    want.eyeLookUp_L = (want.eyeLookUp_L || 0) + Math.max(0, this.gaze.y) * k;
    want.eyeLookUp_R = (want.eyeLookUp_R || 0) + Math.max(0, this.gaze.y) * k;
    const down = Math.max(0, -this.gaze.y) * k;
    want.eyeLookDown_L = (want.eyeLookDown_L || 0) + down;
    want.eyeLookDown_R = (want.eyeLookDown_R || 0) + down;
    // Ögonlocken följer blicken upp och ned (som på riktigt)
    want.eyeWide_L = (want.eyeWide_L || 0) + Math.max(0, this.gaze.y) * 0.8;
    want.eyeWide_R = (want.eyeWide_R || 0) + Math.max(0, this.gaze.y) * 0.8;
    // Andning: lätt öppen mun och små rörelser
    want.jawOpen = (want.jawOpen || 0) + 0.015 + 0.01 * Math.sin(this.age * 1.6);

    const inf = this.mesh.morphTargetInfluences;
    for (const [name, i] of Object.entries(this.morph)) {
      const target = Math.min(1, want[name] || 0);
      const rate = /^mouth|^jaw/.test(name) ? 26 : /Blink/.test(name) ? 45 : /eyeLook/.test(name) ? 30 : 7;
      inf[i] += (target - inf[i]) * Math.min(1, dt * rate);
    }
    const h = this.face.head;
    this.pivot.rotation.set(-h.pitch, h.yaw, h.roll, 'YXZ');
  }

  dispose() {
    this.geometry.dispose();
    this.maps?.albedoTarget.dispose();
    this.maps?.normalTarget.dispose();
    for (const m of Object.values(this.materials)) m.dispose?.();
  }
}

export { textToVisemes };

// Klot som passar punkterna bäst (minsta kvadrat): |p|² = 2 c·p + k
function fitSphere(points) {
  const M = new Array(16).fill(0);
  const rhs = [0, 0, 0, 0];
  for (const p of points) {
    const row = [2 * p.x, 2 * p.y, 2 * p.z, 1];
    const b = p.lengthSq();
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) M[i * 4 + j] += row[i] * row[j];
      rhs[i] += row[i] * b;
    }
  }
  const inv = new THREE.Matrix4().set(...M).invert();
  const x = new THREE.Vector4(...rhs).applyMatrix4(inv);
  return new THREE.Vector3(x.x, x.y, x.z);
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- Material ----------------

const SHARED_VERT = `
attribute float region;
attribute float mouthDepth;
attribute vec3 eyeCoord;
varying float vRegion;
varying float vMouthDepth;
varying vec3 vEyeCoord;`;

function patchVertex(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${SHARED_VERT}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = region;\nvMouthDepth = mouthDepth;\nvEyeCoord = eyeCoord;');
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    '#include <common>\nvarying float vRegion;\nvarying float vMouthDepth;\nvarying vec3 vEyeCoord;',
  );
}

function makeMaterials(maps, look, eyes) {
  const m = {};
  // Hud: bakad färg, porer och rynkor (höjdkarta), glans per område, ljusspridning under ytan
  const skin = new THREE.MeshPhysicalMaterial({
    map: maps.albedo,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(1, 1).multiplyScalar(skinParams.detail.value / 0.35),
    roughness: 1,
    metalness: 0,
    ior: 1.4,
    specularIntensity: 0.6,
    clearcoat: 0.08,
    clearcoatRoughness: 0.38,
    sheen: 0.1,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#ffd0bd'),
    envMapIntensity: 0.6,
  });
  skin.onBeforeCompile = (shader) => {
    patchVertex(shader);
    Object.assign(shader.uniforms, { skinEnabled: skinParams.enabled, skinScatter: skinParams.scatter, skinTranslucency: skinParams.translucency });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float skinCurv;\nvarying float vSkinCurv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinCurv = skinCurv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSkinCurv;')
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${SKIN_DIRECT}`)
      .replace(
        '#include <normal_fragment_maps>',
        `gSkinCurv = vSkinCurv;
        gSkinDiffN = normal;
        vec4 skinTex = texture2D( normalMap, vNormalMapUv );
        gSkinMask = skinTex.a;
        {
          vec3 mapN = vec3( skinTex.xy * 2.0 - 1.0, 0.0 );
          mapN.xy *= normalScale;
          mapN.z = sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) );
          normal = normalize( tbn * mapN );
        }`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * texture2D( normalMap, vNormalMapUv ).b;')
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          // Munhålan och ögonhålorna: mörkare ju längre in
          float inside = vRegion > 0.5 ? mix( 0.06, 0.6, vMouthDepth ) : 1.0;
          reflectedLight.indirectDiffuse *= inside;
          reflectedLight.indirectSpecular *= inside;
          reflectedLight.directDiffuse *= mix( inside, 1.0, 0.4 );
        }`,
      );
  };
  skin.customProgramCacheKey = () => 'scan-skin';
  m.skin = skin;

  // Munnen inuti: tandkött och tunga, våta och mörka längre in
  const mouth = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#b8565a'), roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.15, ior: 1.38 });
  const teeth = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(look.teeth), roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.1, sheen: 0.4, sheenColor: new THREE.Color('#fff5e8') });
  for (const mat of [mouth, teeth]) {
    mat.onBeforeCompile = (shader) => {
      patchVertex(shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          float inside = mix( 0.04, 1.0, pow( vMouthDepth, 1.6 ) );
          reflectedLight.indirectDiffuse *= inside;
          reflectedLight.indirectSpecular *= inside;
          reflectedLight.directDiffuse *= mix( inside, 1.0, 0.3 );
          reflectedLight.directSpecular *= mix( inside, 1.0, 0.5 );
        }`,
      );
    };
    mat.customProgramCacheKey = () => `scan-mouth-${mat === teeth}`;
  }
  m.mouth = mouth;
  m.teeth = teeth;

  // Ögonvitan: blodkärl, lite gul/rosa mot vrårna, mörkare kant runt hornhinnan (limbus)
  const sclera = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, sheen: 0.3, sheenColor: new THREE.Color('#ffd9d0') });
  sclera.onBeforeCompile = (shader) => {
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}`).replace('#include <map_fragment>', SCLERA);
  };
  sclera.customProgramCacheKey = () => 'scan-sclera';
  m.sclera = sclera;

  // Iris: fibrer, krypter, krans och pupill, i personens ögonfärg
  const iris = new THREE.MeshPhysicalMaterial({ roughness: 0.55, metalness: 0 });
  iris.onBeforeCompile = (shader) => {
    patchVertex(shader);
    Object.assign(shader.uniforms, { irisColorA: { value: new THREE.Color(look.iris[0]) }, irisColorB: { value: new THREE.Color(look.iris[1]) }, pupil: { value: look.pupil } });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 irisColorA;\nuniform vec3 irisColorB;\nuniform float pupil;\n${NOISE}`)
      .replace('#include <map_fragment>', IRIS);
  };
  iris.customProgramCacheKey = () => 'scan-iris';
  m.iris = iris;

  // Hornhinnan: bara blanka reflexer (läggs ovanpå irisen)
  m.cornea = new THREE.MeshPhysicalMaterial({
    color: '#000000',
    roughness: 0.02,
    metalness: 0,
    ior: 1.376,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.01,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    envMapIntensity: 1.6,
  });

  // Tårvätskan längs ögonlockskanten: blank och nästan genomskinlig
  m.wet = new THREE.MeshPhysicalMaterial({ color: '#000000', roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.2 });

  // Övergången hud -> öga i ögonvrårna: hudfärg som tonar ut
  m.blend = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.skinLinear).multiplyScalar(0.55), transparent: true, opacity: 0.4, depthWrite: false });

  // Skuggan från ögonlocken och fransarna på ögat
  const occlusion = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    vertexShader: `#include <common>
      #include <morphtarget_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        #include <begin_vertex>
        #include <morphtarget_vertex>
        gl_Position = projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 );
      }`,
    fragmentShader: `varying vec2 vUv;
      void main() {
        // Mörkast närmast ovanlocket, ljusare nedåt och mot mitten
        float top = smoothstep( 0.55, 1.0, vUv.y );
        float bottom = smoothstep( 0.35, 0.0, vUv.y );
        float sides = smoothstep( 0.2, 0.0, min( vUv.x, 1.0 - vUv.x ) );
        float shade = clamp( top * 0.55 + bottom * 0.25 + sides * 0.3, 0.0, 0.6 );
        gl_FragColor = vec4( vec3( 1.0 - shade ), 1.0 );
      }`,
  });
  m.occlusion = occlusion;

  // Ögonfransar: hårstrån som ritas i fransarnas kort (genomskinliga mellan stråna)
  const lashes = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.hair).multiplyScalar(0.35), roughness: 0.45, side: THREE.DoubleSide, alphaTest: 0.35, alphaToCoverage: true });
  lashes.onBeforeCompile = (shader) => {
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphamap_fragment>',
      `{
        // vEyeCoord: x = vinkel runt ögat, y = 0 vid roten .. 1 längst ut, z = 1 ovanför ögat
        float upper = vEyeCoord.z;
        float t = vEyeCoord.y;
        float strand = 0.0;
        for ( int i = 0; i < 3; i ++ ) {
          float fi = float( i );
          float cells = ( upper > 0.5 ? 30.0 : 9.0 ) + fi * ( upper > 0.5 ? 9.0 : 3.0 );
          float x = vEyeCoord.x / 3.14159 * cells + fi * 0.37;
          float id = floor( x + t * ( 0.15 - fi * 0.1 ) );
          float h = fract( sin( id * 12.9898 + fi * 7.1 ) * 43758.5453 );
          float len = upper > 0.5 ? 0.7 + 0.3 * h : 0.15 + 0.22 * h;
          float d = abs( fract( x + t * ( 0.15 - fi * 0.1 ) + ( h - 0.5 ) * t * t * 0.6 ) - 0.5 );
          float width = upper > 0.5 ? mix( 0.2, 0.04, clamp( t / len, 0.0, 1.0 ) ) : mix( 0.07, 0.03, clamp( t / len, 0.0, 1.0 ) );
          strand = max( strand, step( t, len ) * smoothstep( width, width * 0.35, d ) );
        }
        diffuseColor.a *= strand;
      }`,
    );
  };
  lashes.customProgramCacheKey = () => 'scan-lashes';
  m.lashes = lashes;
  void eyes;
  return m;
}

const NOISE = /* glsl */ `
float sHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float sNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( sHash( i ), sHash( i + vec2( 1, 0 ) ), f.x ), mix( sHash( i + vec2( 0, 1 ) ), sHash( i + vec2( 1, 1 ) ), f.x ), f.y );
}
float sFbm( vec2 p ) { float a = 0.5; float s = 0.0; for ( int i = 0; i < 4; i ++ ) { s += a * sNoise( p ); p *= 2.03; a *= 0.5; } return s; }`;

const SCLERA = /* glsl */ `
{
  vec2 e = vEyeCoord.xy;
  float r = length( e );
  float ang = atan( e.y, e.x );
  // Ögonvitan är inte helt vit: lite varm mot kanterna, blodkärl som slingrar sig in mot irisen
  vec3 white = vec3( 0.86, 0.82, 0.78 );
  white = mix( white, vec3( 0.83, 0.62, 0.58 ), smoothstep( 1.4, 2.6, abs( e.x ) ) * 0.6 );
  float vessels = 0.0;
  for ( int i = 0; i < 2; i ++ ) {
    float fi = float( i );
    float n = sFbm( vec2( ang * ( 5.0 + fi * 3.0 ), r * 2.0 + fi * 5.0 ) );
    vessels += smoothstep( 0.035, 0.0, abs( n - 0.5 ) ) * ( 0.6 - fi * 0.25 );
  }
  vessels *= smoothstep( 1.3, 2.4, r );
  white = mix( white, vec3( 0.62, 0.18, 0.16 ), clamp( vessels * 0.45, 0.0, 0.6 ) );
  // Limbus: mjuk, mörk ring precis utanför irisen
  white *= 1.0 - 0.35 * exp( - pow( ( r - 1.06 ) * 7.0, 2.0 ) );
  diffuseColor.rgb *= white;
}`;

const IRIS = /* glsl */ `
{
  vec2 e = vEyeCoord.xy;
  float r = length( e );
  float ang = atan( e.y, e.x );
  // Radiella fibrer, krypter (mörka gropar) och kransen (collarette) runt pupillen
  float fib = sFbm( vec2( ang * 22.0, r * 3.0 ) ) * 0.6 + sFbm( vec2( ang * 60.0, r * 6.0 ) ) * 0.4;
  float crypt = smoothstep( 0.62, 0.78, sFbm( vec2( ang * 9.0, r * 7.0 ) + 3.0 ) );
  float collar = exp( - pow( ( r - pupil * 1.9 ) * 9.0, 2.0 ) );
  vec3 col = mix( irisColorB, irisColorA, smoothstep( pupil, 0.95, r ) );
  col *= 0.65 + 0.7 * fib;
  col = mix( col, irisColorB * 1.4 + 0.05, collar * 0.5 );
  col *= 1.0 - 0.35 * crypt * smoothstep( pupil * 2.0, 0.85, r );
  // Mörk kant ytterst och pupillen
  col *= 1.0 - 0.6 * smoothstep( 0.82, 1.0, r );
  col *= smoothstep( pupil, pupil + 0.04, r );
  // Utanför irisen (syns genom hornhinnans kant): ögonvita med mjuk limbus
  vec3 white = vec3( 0.82, 0.78, 0.74 ) * ( 1.0 - 0.45 * exp( - pow( ( r - 1.04 ) * 8.0, 2.0 ) ) );
  col = mix( col, white, smoothstep( 1.0, 1.08, r ) );
  diffuseColor.rgb = col;
}`;
