import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SPAWN } from './room.js';
import { makePersona } from './persona.js';
import { GESTURES, PLACES } from './commands.js';
import { MotionRig, prepareMotion, sampleMotion, PRESETS, lieOnMotion, sitOnMotion } from './motion.js';
import { Wardrobe, randomOutfit } from './clothes.js';
import { Retarget } from './retarget.js';
import { listAvatars, avatarBlob } from './avaturn.js';

export { PERSONALITIES } from './persona.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);

// Gånganimationen förflyttar sig 1,21 m/s i originalet
const WALK_CLIP_SPEED = 1.21;
// Hur länge en person stannar kvar där man bett den vara innan den gör något eget (sekunder)
const HOLD_TIME = 90;
// Munformer (Oculus-visem) i de detaljerade modellerna
const VISEMES = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'];
const VISEME_MORPH = Object.fromEntries(VISEMES.map((v, i) => [v, `AA_VI_${String(i).padStart(2, '0')}_${v === 'sil' ? 'Sil' : v === 'kk' ? 'KK' : v}`]));
// Hur mycket käken öppnas för varje munform
const VISEME_JAW = { aa: 0.32, E: 0.18, I: 0.1, O: 0.22, U: 0.12, RR: 0.1, CH: 0.06, SS: 0.04, DD: 0.08, nn: 0.06, kk: 0.1, TH: 0.06, FF: 0.02, PP: 0, sil: 0 };

// Ungefärlig svensk uttalsmodell: bokstäver till munformer
function textToVisemes(text) {
  const t = text.toLowerCase();
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const two = t.slice(i, i + 2);
    // sj-ljud: sj, tj, ch, stj, samt sk före mjuk vokal (skön, skina)
    if (['sj', 'tj', 'ch', 'stj'].some((d) => t.startsWith(d, i)) || (two === 'sk' && 'eiyäö'.includes(t[i + 2]))) {
      out.push(['CH', 0.1]);
      i += two === 'st' ? 2 : 1;
      continue;
    }
    if (two === 'th') {
      out.push(['TH', 0.08]);
      i++;
      continue;
    }
    const c = t[i];
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
    if (v) out.push([v, 'aEIOU'.includes(v) || v === 'aa' ? 0.09 : 0.065]);
    else if ('.!?…'.includes(c)) out.push(['sil', 0.32]);
    else if (',;:'.includes(c)) out.push(['sil', 0.18]);
    else if (c === ' ') out.push(['sil', 0.03]);
  }
  return out;
}

// Ansiktsuttryck som blandningar av ARKit-former
const EXPRESSIONS = {
  neutral: {},
  happy: { AK_44_MouthSmileLeft: 0.75, AK_45_MouthSmileRight: 0.75, AK_07_CheekSquintLeft: 0.4, AK_08_CheekSquintRight: 0.4, AK_19_EyeSquintLeft: 0.2, AK_20_EyeSquintRight: 0.2 },
  laugh: { AK_44_MouthSmileLeft: 1, AK_45_MouthSmileRight: 1, AK_07_CheekSquintLeft: 0.7, AK_08_CheekSquintRight: 0.7, AK_19_EyeSquintLeft: 0.5, AK_20_EyeSquintRight: 0.5, AK_25_JawOpen: 0.25, AK_03_BrowInnerUp: 0.2 },
  sad: { AK_30_MouthFrownLeft: 0.6, AK_31_MouthFrownRight: 0.6, AK_03_BrowInnerUp: 0.7, AK_36_MouthPressLeft: 0.2, AK_37_MouthPressRight: 0.2 },
  angry: { AK_01_BrowDownLeft: 0.8, AK_02_BrowDownRight: 0.8, AK_50_NoseSneerLeft: 0.35, AK_51_NoseSneerRight: 0.35, AK_36_MouthPressLeft: 0.4, AK_37_MouthPressRight: 0.4, AK_30_MouthFrownLeft: 0.3, AK_31_MouthFrownRight: 0.3 },
  surprised: { AK_21_EyeWideLeft: 0.7, AK_22_EyeWideRight: 0.7, AK_03_BrowInnerUp: 0.7, AK_04_BrowOuterUpLeft: 0.7, AK_05_BrowOuterUpRight: 0.7, AK_25_JawOpen: 0.2 },
  thinking: { AK_01_BrowDownLeft: 0.35, AK_05_BrowOuterUpRight: 0.4, AK_36_MouthPressLeft: 0.35, AK_37_MouthPressRight: 0.35, AK_19_EyeSquintLeft: 0.25, AK_20_EyeSquintRight: 0.25, AK_38_MouthPucker: 0.15 },
  tired: { AK_25_JawOpen: 0.75, AK_19_EyeSquintLeft: 0.6, AK_20_EyeSquintRight: 0.6, AK_03_BrowInnerUp: 0.4, AK_38_MouthPucker: 0.1 },
};
// Gester som också syns i ansiktet
const GESTURE_FACE = { laugh: 'laugh', cheer: 'happy', clap: 'happy', dance: 'happy', wave: 'happy', yawn: 'tired', think: 'thinking', shrug: 'thinking', sitShrug: 'thinking', photo: 'happy' };

// Klipp som spelas en gång (gester); övriga loopar
const ONCE_CLIPS = new Set(['wave', 'clap', 'cheer', 'laugh', 'shrug', 'sitShrug', 'stretch', 'yawn', 'photo', 'think']);
const BASE = import.meta.env.BASE_URL;

// Uttrycken heter olika i olika modeller: Rocketbox "AK_25_JawOpen" och "AA_VI_10_aa",
// Avaturn (ARKit) "jawOpen", Ready Player Me "viseme_aa" och "mouthOpen". Namnen jämförs förenklade.
const morphKey = (name) => {
  const n = name.toLowerCase().replace(/^ak_\d+_/, '');
  const vis = n.match(/^aa_vi_\d+_(.+)$/);
  return vis ? `viseme_${vis[1]}` : n.replace(/[^a-z0-9_]/g, '');
};
const MORPH_ALIASES = { jawopen: ['mouthopen'], mouthsmileleft: ['mouthsmile'], mouthsmileright: ['mouthsmile'], eyeblinkleft: ['eyesclosed', 'blink'], eyeblinkright: ['eyesclosed', 'blink'] };
function morphIndex(mesh, name) {
  const cache = (mesh.userData.morphCache ||= {});
  if (name in cache) return cache[name];
  const dict = mesh.morphTargetDictionary;
  let i = dict[name];
  if (i === undefined) {
    const lookup = (mesh.userData.morphLookup ||= Object.fromEntries(Object.entries(dict).map(([k, v]) => [morphKey(k), v])));
    const key = morphKey(name);
    i = lookup[key];
    for (const alias of MORPH_ALIASES[key] || []) if (i === undefined) i = lookup[alias];
  }
  cache[name] = i;
  return i;
}

// ---------------- Modellbibliotek ----------------
// Fotorealistiska avatarer från Microsoft Rocketbox (MIT-licens), konverterade med tools/convert-rocketbox.mjs
class AvatarLibrary {
  constructor() {
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.models = new Map(); // id -> Promise<gltf>
    this.anims = new Map(); // 'f' | 'm' -> Promise<{clips, refHip}>
    this.list = null;
    this.inUse = new Map();
    this.filter = 'all'; // 'all' | 'f' | 'm': vilka som får komma in i rummet
    this.dir = 'avatars'; // 'avatars-hq' i närbildsläget: detaljerade modeller med ansiktsuttryck
    this.initialCount = 3;
    // Egna avatarer från Avaturn i stället för de inbyggda. De styrs av ett osynligt Rocketbox-skelett.
    this.avaturn = false;
  }

  // Rocketbox-modellen som styr en Avaturn-avatar (samma kön, så att animationerna passar)
  driverFor(gender) {
    const same = this.standard.filter((a) => a.gender === gender);
    return (same.find((a) => /_01$/.test(a.id)) || same[0] || this.standard[0]).id;
  }

  allowed(entry) {
    return this.filter === 'all' || entry.gender === this.filter;
  }

  async init(onProgress) {
    const res = await fetch(`${BASE}${this.dir}/index.json`);
    this.standard = await res.json();
    this.list = this.standard;
    if (this.avaturn) {
      const own = await listAvatars();
      if (own.length) this.list = own.map((a) => ({ id: a.id, gender: a.gender, name: a.name, avaturn: true }));
      else {
        // Inga egna avatarer ännu: använd de inbyggda så länge
        this.avaturn = false;
        this.avaturnMissing = true;
      }
    }
    let done = 0;
    const tick = () => onProgress?.(++done / (2 + this.initialCount));
    await Promise.all(['f', 'm'].map((g) => this.animations(g).then(tick)));
    // Förladda några personer så att rummet inte är tomt när spelet startar
    const pool = this.list.filter((a) => this.allowed(a));
    this.initial = [];
    while (this.initial.length < this.initialCount && this.initial.length < pool.length) {
      const e = pick(pool);
      if (!this.initial.includes(e)) this.initial.push(e);
    }
    await Promise.all(this.initial.map((a) => (a.avaturn ? Promise.all([this.model(a.id), this.model(this.driverFor(a.gender))]) : this.model(a.id)).then(tick)));
    onProgress?.(1);
  }

  load(url) {
    return new Promise((resolve, reject) => this.loader.load(url, resolve, undefined, reject));
  }

  // Egna avatarer läses från webbläsarens databas
  async loadOwn(id) {
    const blob = await avatarBlob(id);
    if (!blob) throw new Error(`Avataren ${id} finns inte`);
    const url = URL.createObjectURL(blob);
    try {
      if (!this.dracoReady) {
        // Avaturn kan komprimera modellerna med Draco
        const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
        this.loader.setDRACOLoader(new DRACOLoader().setDecoderPath(`${BASE}draco/`));
        this.dracoReady = true;
      }
      return await this.load(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  model(id) {
    if (!this.models.has(id)) {
      this.models.set(
        id,
        (id.startsWith('av_') ? this.loadOwn(id) : this.load(`${BASE}${this.dir}/${id}.glb`)).then((gltf) => {
          gltf.scene.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              o.frustumCulled = false;
              o.material.envMapIntensity = 0.9;
            }
          });
          return gltf;
        }),
      );
    }
    return this.models.get(id);
  }

  animations(g) {
    if (!this.anims.has(g)) {
      this.anims.set(
        g,
        this.load(`${BASE}anims/${g}.glb`).then((gltf) => {
          const clips = {};
          for (const c of gltf.animations) {
            // Bip01 Footsteps finns bara i animationsfilerna, inte i avatarerna
            c.tracks = c.tracks.filter((t) => !t.name.startsWith('Bip01_Footsteps'));
            clips[c.name] = c;
          }
          // Höfthöjden i animationernas skelett, för att kunna skala om rotens rörelse till varje avatar
          const hip = clips.idle1.tracks.find((t) => t.name === 'Bip01.position');
          return { clips, refHip: hip ? hip.values[1] : 0.92 };
        }),
      );
    }
    return this.anims.get(g);
  }

  // Välj en avatar som inte redan finns i rummet om det går
  pickEntry() {
    const allowed = this.list.filter((a) => this.allowed(a));
    const free = allowed.filter((a) => !this.inUse.get(a.id));
    return pick(free.length ? free : allowed);
  }

  async create(entry = this.pickEntry()) {
    this.inUse.set(entry.id, (this.inUse.get(entry.id) || 0) + 1);
    try {
      if (entry.avaturn) {
        const [own, driver, anim] = await Promise.all([this.model(entry.id), this.model(this.driverFor(entry.gender)), this.animations(entry.gender)]);
        return { entry, scene: SkeletonUtils.clone(driver.scene), anim, avatar: SkeletonUtils.clone(own.scene) };
      }
      const [gltf, anim] = await Promise.all([this.model(entry.id), this.animations(entry.gender)]);
      return { entry, scene: SkeletonUtils.clone(gltf.scene), anim };
    } catch (e) {
      this.release(entry.id);
      throw e;
    }
  }

  release(id) {
    this.inUse.set(id, Math.max(0, (this.inUse.get(id) || 1) - 1));
  }
}

export const library = new AvatarLibrary();

let shadowTex = null;
function blobShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.4)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}
const blobGeo = new THREE.PlaneGeometry(0.9, 0.9);
const hitGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _axis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Rotera ett ben runt en axel i världskoordinater, oberoende av benets egna lokala axlar
function rotateBoneWorld(bone, axis, angle) {
  if (!bone || !angle) return;
  bone.parent.getWorldQuaternion(_q2);
  bone.getWorldQuaternion(_q);
  _q.premultiply(_q3.setFromAxisAngle(axis, angle));
  bone.quaternion.copy(_q2.invert().multiply(_q));
  bone.updateMatrixWorld(true);
}

// ---------------- Karaktären ----------------
const NO_BONES = new Set();

// Hur snabbt varje led följer rörelsen (Hz). Lägre = mer eftersläpning och mjukare.
function springFreq(k) {
  if (/^(hojd|kropp_|snurra|volt|hjulning|rulla|luft)/.test(k)) return 9;
  if (/(ben|kna|fot|tar)/.test(k)) return 8;
  if (/_f\d$|fingrar|tumme/.test(k)) return 7;
  if (/huvud/.test(k)) return 4.5;
  if (/(handled|underarm)/.test(k)) return 5;
  if (/brost/.test(k)) return 5.5;
  if (/(overkropp|hoft)/.test(k)) return 6;
  return 6.5;
}

export class Character {
  constructor(id, asset) {
    this.id = id;
    const { entry, scene, anim, avatar } = asset;
    this.avatarId = entry.id;
    this.gender = entry.gender;
    this.persona = makePersona(entry.gender === 'f' ? 'kvinna' : 'man');
    this.name = this.persona.firstName;
    this.history = []; // konversationshistorik för Claude
    this.memory = { playerName: null, topics: new Set(), met: false };
    this.root = new THREE.Group();
    this.root.userData.character = this;
    this.state = 'idle';
    this.path = null;
    this.target = null;
    this.timer = 0;
    this.stay = rand(70, 200);
    this.age = 0;
    this.speed = rand(1.0, 1.25);
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
    this.jaw = 0;
    // Uppdrag från spelaren
    this.commandActive = false; // personen är upptagen med något man bett om
    this.queuedCommand = null; // görs när personen har rest sig
    this.pendingGesture = null;
    this.gesture = null;
    this.holdUntil = 0;
    this.following = false;
    this.followUntil = 0;
    this.faceTarget = null;
    // Ansikte (bara i närbildsmodellerna)
    this.speech = null; // { seq, i, t } munformer för det som sägs
    this.expression = 'neutral';
    this.expressionUntil = 0;
    this.morphState = {};
    this.saccade = { x: 0, y: 0, timer: 0 };
    this.setupModel(scene, anim, avatar);
  }

  setupModel(scene, anim, avatar) {
    const model = scene;
    model.scale.setScalar(rand(0.97, 1.04));
    this.root.add(model);
    this.model = model;
    // Det som syns: Rocketbox-modellen själv, eller en Avaturn-avatar som följer den osynliga modellen
    this.visual = model;
    if (avatar) this.attachAvatar(model, avatar);
    this.wardrobe = new Wardrobe(this.visual, { outfitOnly: !!avatar });
    const nodes = {};
    model.traverse((o) => (nodes[o.name] = o));
    this.bones = {
      hip: nodes.Bip01,
      neck: nodes.Bip01_Neck,
      head: nodes.Bip01_Head,
      jaw: nodes.Bip01_MJaw,
      lids: [nodes.Bip01_LEyeBlinkTop, nodes.Bip01_REyeBlinkTop].filter(Boolean),
      eyes: [nodes.Bip01_LEye, nodes.Bip01_REye].filter(Boolean),
    };
    // Varåt huvud och ögon pekar i sina egna koordinater (modellen tittar längs +z i grundposen)
    model.updateMatrixWorld(true);
    const forwardIn = (bone) => (bone ? new THREE.Vector3(0, 0, 1).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()) : null);
    this.headForward = forwardIn(this.bones.head);
    this.eyeForward = this.bones.eyes.map(forwardIn);
    // Delar av modellen som har ansiktsuttryck (morph targets)
    this.faceMeshes = [];
    this.visual.traverse((o) => o.morphTargetDictionary && Object.keys(o.morphTargetDictionary).length && this.faceMeshes.push(o));
    // Ansiktsbenen saknar animationsspår, så vi återställer dem själva varje bildruta
    this.rest = {
      jaw: this.bones.jaw?.quaternion.clone(),
      lids: this.bones.lids.map((l) => l.position.clone()),
      eyes: this.bones.eyes.map((e) => e.quaternion.clone()),
    };

    // Skala rotens höjd i animationerna efter den här avatarens benlängd
    const hipY = this.bones.hip ? this.bones.hip.position.y : anim.refHip;
    const ratio = hipY / anim.refHip;
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [name, clip] of Object.entries(anim.clips)) {
      const tracks = clip.tracks.map((t) => {
        if (t.name !== 'Bip01.position') return t;
        const c = t.clone();
        for (let i = 0; i < c.values.length; i++) c.values[i] *= ratio;
        return c;
      });
      const action = this.mixer.clipAction(new THREE.AnimationClip(name, clip.duration, tracks));
      if (ONCE_CLIPS.has(name)) {
        action.setLoop(THREE.LoopOnce, 1);
        // Stanna kvar i slutpositionen tills nästa klipp tonar in, annars syns grundposen en bildruta
        action.clampWhenFinished = true;
      }
      this.actions[name] = action;
    }
    this.mixer.addEventListener('finished', (e) => {
      if (this.gesture && e.action === this.actions[this.gesture.clip]) this.endGesture();
    });
    this.current = null;
    this.play('idle1', 0);
    // Neutral stående pose (första bilden i viloanimationen) för egna rörelser
    this.mixer.update(0);
    model.updateMatrixWorld(true);
    this.rig = new MotionRig(model, nodes);
    this.motion = null;
    this.actions.idle1.time = Math.random() * this.actions.idle1.getClip().duration;

    this.mixer.update(0);
    model.updateMatrixWorld(true);
    const headPos = this.bones.head ? this.bones.head.getWorldPosition(new THREE.Vector3()) : null;
    this.height = headPos ? headPos.y + 0.12 : 1.7;
    this.scale = this.height / 1.75;

    const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    blob.renderOrder = 1;
    this.root.add(blob);

    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.y = 0.9;
    hit.userData.character = this;
    this.root.add(hit);
    this.hitMesh = hit;
  }

  play(name, fade = 0.4) {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
    this.currentName = name;
    this.clipTimer = rand(6, 14);
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
    if (this.following) {
      this.state = 'following';
      this.path = null;
      this.timer = 0;
      return;
    }
    if (this.age < this.holdUntil) {
      // Spelaren bad personen stanna här
      this.state = 'idle';
      this.timer = this.holdUntil - this.age;
      return;
    }
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
    this.state = 'toPoi';
    this.poi = null;
    this.setPath(nav, rand(-3.5, 3.8), rand(-1, 2.6));
  }

  update(dt, world) {
    // Hur snabbt personen vrider sig (för att ta steg när man vänder sig på stället)
    if (dt > 0) {
      const turn = Math.abs(angleDiff(this.lastHeading ?? this.heading, this.heading)) / dt;
      this.turnRate = (this.turnRate || 0) + (turn - (this.turnRate || 0)) * Math.min(1, dt * 8);
      this.lastHeading = this.heading;
    }
    // I redigeraren står personen still i den pose spelaren justerar
    if (this.editing) {
      this.applyEditPose();
      this.retarget?.apply();
      return;
    }
    this.age += dt;
    this.timer -= dt;
    const { player } = world;
    let moving = false;

    if (this.talking && !this.commandActive && !this.following) {
      this.lookTarget = player.headPos;
      // Den som ligger på golvet eller gör en helkroppsrörelse vrider sig inte mot spelaren
      if (this.state !== 'sitting' && this.state !== 'sittingDown' && !this.motion?.wholeBody) this.faceTowards(player.position.x, player.position.z, dt, 4);
    } else {
      switch (this.state) {
        case 'toSeat':
        case 'toPoi':
        case 'leaving': {
          moving = this.followPath(dt, world);
          // Långt in i hallen räcker; flera som går samtidigt kan annars knuffa varandra ifrån slutpunkten
          if (this.state === 'leaving' && this.position.x < SPAWN.x + 0.7) this.path = null;
          if (!this.path || !this.path.length) {
            if (this.state === 'leaving') {
              this.done = true;
            } else if (this.state === 'toSeat') {
              this.state = 'sittingDown';
            } else {
              this.state = 'idle';
              this.timer = Math.max(rand(5, 14), this.holdUntil - this.age);
              if (this.faceTarget === 'player') {
                const p = world.player.position;
                this.desiredHeading = Math.atan2(p.x - this.position.x, p.z - this.position.z);
              } else if (this.poi) this.desiredHeading = this.poi.face;
              this.faceTarget = null;
              if (!this.pendingGesture && !this.afterArrive) this.commandActive = false;
            }
          }
          break;
        }
        case 'sittingDown': {
          // Vänd ryggen mot stolen och glid in i sittpositionen medan sittanimationen tonar in
          const s = this.seat;
          this.faceAngle(s.face, dt, 6);
          if (Math.abs(angleDiff(this.heading, s.face)) < 0.35) {
            const dx = s.x - this.position.x;
            const dz = s.z - this.position.z;
            const d = Math.hypot(dx, dz);
            const step = Math.min(d, dt * 0.9);
            if (d > 0.001) {
              this.position.x += (dx / d) * step;
              this.position.z += (dz / d) * step;
            }
            if (d < 0.03) {
              this.state = 'sitting';
              this.timer = Math.max(rand(16, 45), this.holdUntil - this.age);
              this.commandActive = false;
            }
          }
          break;
        }
        case 'sitting': {
          this.faceAngle(this.seat.face, dt, 4);
          if (this.timer <= 0 && this.age >= this.holdUntil && !this.following) this.state = 'standingUp';
          this.idleLook(dt, world);
          break;
        }
        case 'standingUp': {
          if (this.sitAmount < 0.15) {
            const s = this.seat;
            const dx = s.approach[0] - this.position.x;
            const dz = s.approach[1] - this.position.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.05) {
              const step = Math.min(d, dt * 0.9);
              this.position.x += (dx / d) * step;
              this.position.z += (dz / d) * step;
            } else {
              if (s.occupant === this) s.occupant = null;
              this.seat = null;
              if (this.queuedCommand) {
                const q = this.queuedCommand;
                this.queuedCommand = null;
                this.command(q, world);
              } else {
                if (!this.pendingGesture) this.commandActive = false;
                this.chooseNext(world);
              }
            }
          }
          break;
        }
        case 'following': {
          const p = player.position;
          const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
          if (this.age > this.followUntil) {
            this.following = false;
            this.chooseNext(world);
            break;
          }
          if (d > 1.6) {
            // Gå mot en punkt strax bakom spelaren och räkna om vägen då och då när spelaren rör sig
            if (!this.path || !this.path.length || this.timer <= 0) {
              const k = 1.1 / d;
              this.setPath(world.nav, p.x + (this.position.x - p.x) * k, p.z + (this.position.z - p.z) * k);
              this.timer = 0.8;
            }
            moving = this.followPath(dt, world);
          } else {
            this.path = null;
            this.faceTowards(p.x, p.z, dt, 3);
            this.lookTarget = player.headPos;
          }
          break;
        }
        case 'idle':
        default: {
          if (this.desiredHeading !== undefined) this.faceAngle(this.desiredHeading, dt, 3);
          this.idleLook(dt, world);
          if (this.afterArrive && Math.abs(angleDiff(this.heading, this.desiredHeading ?? this.heading)) < 0.08) {
            const def = this.afterArrive;
            this.afterArrive = null;
            this.command({ action: 'rorelse', motion: def, name: null, internal: true }, world);
          }
          if (this.pendingGesture && this.sitAmount < 0.1) {
            const g = this.pendingGesture;
            this.pendingGesture = null;
            this.startGesture(g);
          }
          if (this.timer <= 0) {
            this.desiredHeading = undefined;
            this.chooseNext(world);
          }
        }
      }
    }

    // Håll avstånd till andra och till spelaren när man går
    if (moving) {
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

    this.animate(dt, moving, world);
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
    const p = world.player.position;
    const ahead = Math.hypot(p.x - (this.position.x + (dx / d) * 0.5), p.z - (this.position.z + (dz / d) * 0.5));
    let speed = this.speed;
    if (ahead < 0.45) speed *= 0.2;
    const want = Math.atan2(dx, dz);
    this.faceAngle(want, dt, 6);
    const turnFactor = Math.max(0.25, Math.cos(angleDiff(this.heading, want)));
    this.currentSpeed = speed * turnFactor;
    const step = Math.min(d, this.currentSpeed * dt);
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
    if (this.partner) {
      this.lookTarget = this.partner.headWorld();
      return;
    }
    const p = world.player.position;
    const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    if (d < 3.2) {
      this.lookTarget = world.player.headPos;
    } else if (!this.lookTarget || Math.random() < dt * 0.15) {
      const others = world.characters.filter((c) => c !== this);
      this.lookTarget = others.length && Math.random() < 0.6 ? pick(others).headWorld() : null;
    }
  }

  // Kroppen som kapslar (för att andra inte ska gå igenom den)
  capsules() {
    const b = this.rig.b;
    const P = (bone) => bone.getWorldPosition(new THREE.Vector3());
    const head = P(b.head);
    const caps = [
      { a: P(b.pelvis), b: P(b.neck), r: 0.13 },
      { a: head, b: head.clone().addScaledVector(this.rig.axis(b.head, UP), 0.12), r: 0.1 },
    ];
    for (const s of ['R', 'L']) {
      const x = b[s];
      caps.push({ a: P(x.thigh), b: P(x.calf), r: 0.075 }, { a: P(x.calf), b: P(x.foot), r: 0.055 }, { a: P(x.upper), b: P(x.fore), r: 0.05 }, { a: P(x.fore), b: P(x.hand), r: 0.04 });
    }
    return caps;
  }

  // Huvudets position i världen (följer animationen, så den stämmer även när personen sitter)
  headWorld() {
    if (this.bones.head) return this.bones.head.getWorldPosition(new THREE.Vector3());
    return new THREE.Vector3(this.position.x, this.height - 0.1, this.position.z);
  }

  get seated() {
    return this.state === 'sitting' || this.state === 'sittingDown';
  }

  wave() {
    if (this.seated || this.gesture) return;
    this.startGesture('vinka');
  }

  startGesture(id) {
    const def = GESTURES[id];
    const clip = this.seated && def.seatedClip ? def.seatedClip : def.clip;
    const action = this.actions[clip];
    if (!action) return;
    if (this.current === action) this.current = null; // spela om samma klipp från början
    this.play(clip, 0.35);
    this.gesture = { clip, until: def.loop ? this.age + def.loop : Infinity };
    this.commandActive = true;
    if (GESTURE_FACE[clip]) this.setExpression(GESTURE_FACE[clip], def.loop || action.getClip().duration);
  }

  // ---------- Sitta rätt ----------
  // Sittanimationerna är gjorda för en annan stol än möblerna i rummet. Kroppen lyfts eller sänks så
  // att baken och låren vilar på sitsen, och flyttas fram så att knäna hamnar framför sitsens kant.
  seatSolid(world) {
    const seat = this.seat;
    if (!seat || !world.solids) return null;
    if (this._seatFor === seat) return this._seatSolid;
    this._seatFor = seat;
    this._seatSolid =
      world.solids
        .filter((s) => seat.x >= s.x1 && seat.x <= s.x2 && seat.z >= s.z1 && seat.z <= s.z2 && s.y2 < 0.75 && Math.abs(s.y2 - seat.height) < 0.2)
        .sort((a, b) => b.y2 - a.y2)[0] || null;
    return this._seatSolid;
  }

  fitSeat(dt, world) {
    this.fit ||= { y: 0, z: 0 };
    let ty = 0;
    let tz = 0;
    const s = this.sitAmount > 0.02 && !this.motion?.wholeBody ? this.seatSolid(world) : null;
    if (s) {
      const b = this.rig.b;
      const P = (bone) => bone.getWorldPosition(new THREE.Vector3());
      const over = (p) => p.x > s.x1 - 0.02 && p.x < s.x2 + 0.02 && p.z > s.z1 - 0.02 && p.z < s.z2 + 0.02;
      // Baken (höftleden) och mitten av låren
      const pts = [[P(b.pelvis), 0.1]];
      for (const x of [b.R, b.L]) pts.push([P(x.thigh).lerp(P(x.calf), 0.5), 0.075]);
      let min = Infinity;
      for (const [p, r] of pts) if (over(p)) min = Math.min(min, p.y - r - s.y2);
      if (Number.isFinite(min)) ty = Math.max(-0.2, Math.min(0.25, -min));
      // Knäna framför sitsens framkant (sitsens sida åt det håll personen tittar)
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const front = Math.max(s.x1 * fx, s.x2 * fx) + Math.max(s.z1 * fz, s.z2 * fz);
      for (const x of [b.R, b.L]) {
        const k = P(x.calf);
        if (k.y + ty - 0.06 > s.y2) continue;
        const need = front + 0.06 - (k.x * fx + k.z * fz);
        if (need > 0) tz = Math.max(tz, Math.min(0.2, need));
      }
    }
    const w = Math.min(1, this.sitAmount * 1.5);
    const k = Math.min(1, dt * 6);
    this.fit.y += (ty * w - this.fit.y) * k;
    this.fit.z += (tz * w - this.fit.z) * k;
    if (Math.abs(this.fit.y) < 1e-4 && Math.abs(this.fit.z) < 1e-4 && !this.fit.lean) return;
    this.model.position.y += this.fit.y;
    this.model.position.z += this.fit.z;
    this.root.updateMatrixWorld(true);
    // Luta dig bakåt mot ryggstödet om det finns ett (och inte en egen rörelse styr överkroppen)
    let lean = 0;
    const back = s && !this.motion ? this.seatBack(world) : null;
    if (back) {
      const b = this.rig.b;
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const plane = Math.max(back.x1 * fx, back.x2 * fx) + Math.max(back.z1 * fz, back.z2 * fz);
      const top = (b.spine[b.spine.length - 1] || b.neck).getWorldPosition(new THREE.Vector3());
      const hip = b.pelvis.getWorldPosition(new THREE.Vector3());
      const gap = top.x * fx + top.z * fz - 0.12 - plane;
      const len = Math.max(0.2, top.distanceTo(hip));
      if (gap > 0) lean = Math.min(28, (Math.asin(Math.min(1, gap / len)) * 180) / Math.PI);
    }
    this.fit.lean = (this.fit.lean || 0) + (lean * w - (this.fit.lean || 0)) * k;
    if (this.fit.lean > 0.05) {
      this.rig.leanBack(this.fit.lean);
      this.root.updateMatrixWorld(true);
    }
  }

  // Ryggstödet bakom sittplatsen (en hög låda strax bakom sitsens mitt)
  seatBack(world) {
    const seat = this.seat;
    if (this._backFor === seat) return this._back;
    this._backFor = seat;
    const x = seat.x - Math.sin(seat.face) * 0.35;
    const z = seat.z - Math.cos(seat.face) * 0.35;
    this._back = world.solids.filter((s) => s.y2 > 0.75 && s.y2 < 1.3 && x >= s.x1 - 0.05 && x <= s.x2 + 0.05 && z >= s.z1 - 0.05 && z <= s.z2 + 0.05).sort((a, b) => a.y1 - b.y1)[0] || null;
    return this._back;
  }

  // ---------- Avaturn ----------
  // Avataren ritas, Rocketbox-modellen blir ett osynligt skelett som allt annat (animationer, egna
  // rörelser, kollisioner, redigeraren) styr. Rocketbox-modellen skalas till avatarens storlek.
  attachAvatar(model, avatar) {
    model.traverse((o) => o.isMesh && (o.visible = false));
    avatar.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.material) o.material.envMapIntensity = 0.9;
    });
    this.root.add(avatar);
    this.root.updateMatrixWorld(true);
    let hips = null;
    avatar.traverse((o) => o.isBone && !hips && /hips$/i.test(o.name) && (hips = o));
    const pelvis = model.getObjectByName('Bip01_Pelvis');
    if (hips && pelvis) {
      model.scale.setScalar(1);
      this.root.updateMatrixWorld(true);
      const ratio = hips.getWorldPosition(new THREE.Vector3()).y / pelvis.getWorldPosition(new THREE.Vector3()).y;
      if (ratio > 0.5 && ratio < 2) model.scale.setScalar(ratio);
      this.root.updateMatrixWorld(true);
    }
    this.retarget = new Retarget(this.root, model, avatar);
    if (!this.retarget.ok) {
      // Okänt skelett: visa Rocketbox-modellen i stället
      console.warn('Avataren har ett skelett som inte känns igen; visar en inbyggd person i stället.');
      this.root.remove(avatar);
      model.traverse((o) => o.isMesh && (o.visible = true));
      this.retarget = null;
      return;
    }
    this.visual = avatar;
  }

  // ---------- Redigeraren (spelaren visar hur rörelsen ska se ut) ----------
  startEdit(def, used) {
    this.stopMotion();
    this.editing = true;
    this.editUsed = used;
    this.editWhole = !!def.hela_kroppen;
    this.path = null;
    if (!this.seated) this.state = 'idle';
    this.holdUntil = Math.max(this.holdUntil, this.age + 120);
    this.speaking = 0;
  }

  // Lägg posen på skelettet (används både för att visa den och för att prova varianter)
  applyEditPose(pose = this.editPose) {
    this.root.updateMatrixWorld(true);
    this.rig.apply(pose || {}, this.editUsed, 1, this.editWhole ? 1 : 0);
  }

  endEdit() {
    this.editing = false;
    this.editPose = null;
    this.rig.reset();
  }

  // ---------- Egna rörelser ----------
  playMotion(def) {
    const prev = this.motion && this.motion.releaseAt === undefined ? this.motion : null;
    this.motion = { ...prepareMotion(def, this.rig, prev), t: 0, smoothStart: !!prev, spring: prev?.spring || {} };
    this.commandActive = !def.hall_kvar;
    // Stanna kvar i posen länge (tills spelaren ber om något annat)
    if (def.hall_kvar) this.holdUntil = Math.max(this.holdUntil, this.age + 1800);
  }

  // soft = tona tillbaka till den vanliga animationen i stället för att hoppa direkt
  stopMotion(soft = false) {
    this.commandActive = false;
    if (soft && this.motion) {
      if (this.motion.releaseAt === undefined) this.motion.releaseAt = this.motion.t;
      return;
    }
    this.motion = null;
    this.rig.reset();
  }

  updateMotion(dt, world) {
    const m = this.motion;
    if (!m) return;
    m.t += dt;
    const FADE_IN = 0.3;
    const FADE_OUT = m.wholeBody ? 0.9 : 0.45;
    const hold = m.def.hall_kvar && m.releaseAt === undefined;
    // Loopande rörelser upprepas i minst 6 sekunder (högst tre varv); hall_kvar stannar i sista posen
    const playFor = m.releaseAt ?? (hold ? Infinity : m.def.loop ? Math.max(m.duration, Math.min(m.duration * 3, 6)) : m.duration);
    if (m.t > playFor + FADE_OUT) {
      this.stopMotion();
      if (!this.pendingGesture && !this.gesture) this.commandActive = false;
      return;
    }
    // Rörelser som tar vid från en tidigare pose behöver ingen intoning
    const fadeIn = m.smoothStart ? 1 : Math.min(1, m.t / FADE_IN);
    const raw = Math.max(0, Math.min(fadeIn, m.t < playFor ? 1 : 1 - (m.t - playFor) / FADE_OUT));
    const w = raw * raw * (3 - 2 * raw);
    const t = Math.min(m.t, playFor);
    const local = m.def.loop && !hold && m.duration > 0 ? t % m.duration : Math.min(t, m.duration);
    // När rörelsen är klar flyttas personen dit kroppen tog vägen (efter en kullerbytta, ett hjul …)
    if (!m.committed && !m.def.loop && m.t >= m.duration && m.releaseAt === undefined) this.commitMotion(m, world);
    const target = sampleMotion(m.frames, local);
    if (m.wholeBody || hold) this.addLife(target, m);
    const pose = this.springPose(m, target, dt);
    this.rig.apply(pose, m.used, w, m.wholeBody ? w : 0);
    // Posen som den syns just nu, så att nästa rörelse kan börja härifrån
    m.pose = Object.fromEntries(Object.entries(pose).map(([k, v]) => [k, typeof v === 'number' ? v * w : v]));
    if (m.t >= m.duration && !hold && m.releaseAt === undefined && !m.def.loop) this.commandActive = false;
  }

  // Lederna följer rörelsen som fjädrar i stället för exakt: de accelererar och bromsar mjukt, och
  // huvud, händer och fingrar släpar lite efter resten av kroppen, som hos en riktig människa
  springPose(m, target, dt) {
    const sp = m.spring;
    const out = {};
    const keys = new Set([...Object.keys(target), ...Object.keys(sp)]);
    for (const k of keys) {
      const goal = target[k];
      if (typeof goal === 'string') {
        out[k] = goal;
        continue;
      }
      let st = sp[k];
      if (!st) st = sp[k] = { x: m.frames[0]?.[k] ?? goal ?? 0, v: 0 };
      const g = goal ?? 0;
      const w0 = 2 * Math.PI * springFreq(k);
      const zeta = 0.85;
      // Små delsteg så att fjädern är stabil även när bildfrekvensen är låg
      const n = Math.max(1, Math.ceil(dt * w0 / 0.25));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        st.v += (w0 * w0 * (g - st.x) - 2 * zeta * w0 * st.v) * h;
        st.x += st.v * h;
      }
      if (goal === undefined && Math.abs(st.x) < 0.05 && Math.abs(st.v) < 0.05) {
        delete sp[k];
        continue;
      }
      out[k] = st.x;
    }
    return out;
  }

  // Andning och små rörelser, så att personen inte står som en staty när hen håller en pose
  addLife(pose, m) {
    const t = this.age;
    const seed = this.id * 1.7;
    const breath = Math.sin(t * 2 * Math.PI * 0.24 + seed);
    const add = (k, v) => (pose[k] = (pose[k] || 0) + v);
    add('brost_framat', -1.6 * breath);
    add('h_axel', 1.2 * breath);
    add('v_axel', 1.2 * breath);
    add('huvud_nick', 1.5 * Math.sin(t * 0.37 + seed) + 0.8 * Math.sin(t * 1.13 + seed * 2));
    add('huvud_vrid', 2.5 * Math.sin(t * 0.29 + seed * 3));
    if (m.wholeBody && Math.abs(pose.kropp_lutning || 0) < 30 && Math.abs(pose.volt || 0) < 30) {
      // Står eller sitter: vikten skiftar långsamt mellan benen
      add('hoft_luta', 1.5 * Math.sin(t * 0.19 + seed));
      add('overkropp_luta', -0.8 * Math.sin(t * 0.19 + seed));
    }
  }

  // Flytta personen dit rörelsen slutar och ta bort förflyttningen ur rörelsen, så att den inte
  // glider tillbaka när den tonas ut. Hela varv runt (volt 360 osv.) räknas bort på samma sätt.
  commitMotion(m, world) {
    m.committed = true;
    const last = m.frames[m.frames.length - 1];
    // Där kroppen faktiskt är (en vägg eller möbel kan ha stoppat den på vägen)
    const moved = last.kropp_framat || last.kropp_sidled;
    const fwd = moved ? this.model.position.z : 0;
    const side = moved ? -this.model.position.x : 0;
    const turn = last.snurra || 0;
    const shift = {};
    for (const k of ['volt', 'hjulning', 'rulla', 'snurra']) {
      const turns = Math.round((last[k] || 0) / 360);
      if (turns) shift[k] = turns * 360;
    }
    // Förflyttningen görs bara om personen hamnar på golvet där man kan gå
    const lying = Math.abs(last.kropp_lutning || 0) > 30 || Math.abs(last.volt || 0) % 360 > 30 || (last.hojd || 0) > 25;
    if ((fwd || side) && !lying && world?.nav) {
      const sin = Math.sin(this.heading);
      const cos = Math.cos(this.heading);
      // Personens höger är -x i modellen, framåt +z
      // Så långt det går: står kroppen mot en möbel flyttas personen bara en bit
      for (const f of [1, 0.85, 0.7, 0.55, 0.4, 0.25]) {
        const x = this.position.x + (sin * fwd - cos * side) * f;
        const z = this.position.z + (cos * fwd + sin * side) * f;
        if (!world.nav.walkable(...world.nav.cellOf(x, z))) continue;
        this.position.x = x;
        this.position.z = z;
        // Resten av vägen (det som inte flyttades) ligger kvar i rörelsen, och knuffen nollställs
        if (last.kropp_framat) shift.kropp_framat = last.kropp_framat - fwd * (1 - f) * 100;
        if (last.kropp_sidled) shift.kropp_sidled = last.kropp_sidled - side * (1 - f) * 100;
        this.rig.carry?.set(0, 0, 0);
        break;
      }
    }
    if (shift.snurra) {
      this.heading += (shift.snurra * Math.PI) / 180;
      this.root.rotation.y = this.heading;
    }
    if (turn && !shift.snurra && Math.abs(turn) >= 45 && !lying) {
      // Personen har vänt sig: behåll den nya riktningen
      shift.snurra = turn;
      this.heading += (turn * Math.PI) / 180;
      this.root.rotation.y = this.heading;
    }
    if (!Object.keys(shift).length) return;
    for (const f of m.frames) for (const [k, v] of Object.entries(shift)) if (f[k] !== undefined) f[k] -= v;
    for (const [k, v] of Object.entries(shift)) if (m.spring[k]) m.spring[k].x -= v;
    this.desiredHeading = this.heading;
  }

  // ---------- Ansikte ----------
  get hasFace() {
    return this.faceMeshes.length > 0;
  }

  setExpression(name, seconds = 4) {
    if (!EXPRESSIONS[name]) return;
    this.expression = name;
    this.expressionUntil = this.age + seconds;
  }

  // Starta läppsynk för en replik; returnerar hur länge den tar att säga
  speakText(text) {
    const seq = textToVisemes(text);
    const duration = seq.reduce((sum, [, d]) => sum + d, 0);
    this.speech = { seq, i: 0, t: 0 };
    this.speaking = Math.min(14, duration + 0.2);
    return duration;
  }

  setMorph(name, value) {
    for (const m of this.faceMeshes) {
      const i = morphIndex(m, name);
      if (i !== undefined) m.morphTargetInfluences[i] = value;
    }
  }

  updateFace(dt) {
    const want = {};
    const add = (k, v) => (want[k] = Math.min(1, (want[k] || 0) + v));
    // Grunduttryck: ett litet leende när personen är på gott humör
    const expr = this.age < this.expressionUntil ? this.expression : 'neutral';
    if (expr === 'neutral') {
      const smile = Math.max(0, this.persona.mood - 0.45) * 0.35;
      add('AK_44_MouthSmileLeft', smile);
      add('AK_45_MouthSmileRight', smile);
    }
    for (const [k, v] of Object.entries(EXPRESSIONS[expr])) add(k, v);

    // Läppsynk: stega igenom munformerna i takt med repliken
    if (this.speaking > 0) {
      let vis = null;
      if (this.speech && this.speech.i < this.speech.seq.length) {
        this.speech.t += dt;
        while (this.speech.i < this.speech.seq.length && this.speech.t > this.speech.seq[this.speech.i][1]) {
          this.speech.t -= this.speech.seq[this.speech.i][1];
          this.speech.i++;
        }
        vis = this.speech.seq[this.speech.i]?.[0] || 'sil';
      } else {
        // Medan texten fortfarande strömmar in: rörlig mun utan exakt uttal
        vis = ['aa', 'E', 'O', 'DD', 'nn', 'PP', 'I'][Math.floor(performance.now() / 110 + this.id) % 7];
      }
      if (vis && vis !== 'sil') {
        add(VISEME_MORPH[vis], 0.85);
        add('AK_25_JawOpen', VISEME_JAW[vis] || 0);
      }
    } else {
      this.speech = null;
    }

    // Öppen mun i en egen rörelse
    const kake = this.motion?.pose?.kake;
    if (kake > 0) add('AK_25_JawOpen', Math.min(1, kake / 30));

    // Blinkningar
    if (this.blinkTimer < 0.14) {
      add('AK_09_EyeBlinkLeft', 1);
      add('AK_10_EyeBlinkRight', 1);
    }

    // Mjuka övergångar; munnen rör sig snabbare än resten av ansiktet
    const keys = new Set([...Object.keys(want), ...Object.keys(this.morphState)]);
    for (const k of keys) {
      const target = want[k] || 0;
      const rate = k.startsWith('AA_VI') || k === 'AK_25_JawOpen' ? 28 : k.includes('Blink') ? 40 : 6;
      const cur = this.morphState[k] || 0;
      const next = cur + (target - cur) * Math.min(1, dt * rate);
      if (next < 0.001 && target === 0) {
        delete this.morphState[k];
        this.setMorph(k, 0);
      } else {
        this.morphState[k] = next;
        this.setMorph(k, next);
      }
    }
  }

  endGesture() {
    this.gesture = null;
    this.currentName = null; // välj ett nytt viloklipp som tonar in från gestens slutposition
    this.commandActive = false;
  }

  // Utför något spelaren har bett om. Returnerar { ok, reason } där reason förklarar ett misslyckande.
  command(cmd, world) {
    const { nav, seats, pois, player } = world;
    const place = cmd.place ? PLACES[cmd.place] : null;
    const a = cmd.action;
    const gesture = GESTURES[a];
    this.pendingGesture = null;
    if (this.gesture) this.endGesture();
    // En ny rörelse tar vid där den förra slutade; "stanna" behåller posen; allt annat tonar ut den mjukt
    const wasPosed = !!this.motion && this.motion.releaseAt === undefined;
    if (this.motion && !['rorelse', 'stanna', 'sluta_folja', 'byt_klader', 'res_dig'].includes(a)) this.stopMotion(true);
    if (!cmd.internal) this.afterArrive = null;
    // Något nytt avbryter det personen gör tillsammans med någon annan
    if (this.partner && !cmd.internal) this.partner = null;
    if (a === 'byt_klader') return this.wardrobe.set(cmd.clothes || randomOutfit()) ? { ok: true } : { ok: false, reason: 'noClothes' };
    // Avbryt en pågående väg till en stol
    if (this.state === 'toSeat' && this.seat) {
      if (this.seat.occupant === this) this.seat.occupant = null;
      this.seat = null;
    }
    if (a === 'interagera') {
      const name = String(cmd.person || '').toLowerCase();
      const other = world.characters.find((c) => c !== this && c.persona.firstName.toLowerCase() === name);
      return world.interactions.start(this, other, cmd.kind, cmd.lines, world);
    }
    if (a === 'satt_dig' && this.seated && (!place || place.seat === this.seat?.label)) return { ok: false, reason: 'already' };
    // Det mesta kräver att personen står upp först
    // Egna rörelser för överkroppen går att göra sittande
    const needsStanding =
      a === 'rorelse'
        ? !!cmd.motion?.hela_kroppen
        : !['stanna', 'sluta_folja', 'res_dig'].includes(a) && !(gesture && gesture.seatedClip) && !(a === 'satt_dig' && this.seat && place?.seat === this.seat.label);
    if (this.seated && needsStanding) {
      if (a === 'satt_dig') {
        const target = this.pickSeat(seats, place);
        if (!target) return { ok: false, reason: 'occupied' };
        target.occupant = this; // reservera platsen medan personen reser sig
        this.reservedSeat = target;
      }
      this.queuedCommand = cmd;
      this.state = 'standingUp';
      this.commandActive = true;
      return { ok: true };
    }

    switch (a) {
      case 'lamna_rummet':
        this.following = false;
        this.holdUntil = 0;
        this.stay = 0;
        this.commandActive = true;
        this.chooseNext(world);
        return { ok: true };
      case 'folj_mig':
        this.following = true;
        this.followUntil = this.age + 240;
        this.holdUntil = 0;
        this.commandActive = false;
        this.chooseNext(world);
        return { ok: true };
      case 'sluta_folja':
      case 'stanna':
        this.following = false;
        this.holdUntil = Math.max(this.holdUntil, this.age + HOLD_TIME);
        this.commandActive = false;
        if (!this.seated) {
          this.path = null;
          this.state = 'idle';
          this.timer = HOLD_TIME;
        }
        return { ok: true };
      case 'res_dig':
        if (!this.seated) {
          if (!wasPosed) {
            if (this.motion) this.stopMotion(true);
            return { ok: false, reason: 'already' };
          }
          // Den som ligger, sitter på golvet eller på en möbel reser sig med en riktig rörelse
          const def = this.motion.def;
          const p = this.motion.pose || {};
          const low = (p.hojd || 0) < -25 || ['kropp_lutning', 'kropp_sida', 'volt', 'hjulning'].some((k) => Math.abs(p[k] || 0) > 30);
          if (def.resa_sig) this.playMotion({ beskrivning: 'reser sig', hela_kroppen: true, nyckelbilder: def.resa_sig });
          else if (low) this.playMotion(PRESETS.resa_sig);
          else this.stopMotion(true);
          this.holdUntil = this.age + HOLD_TIME;
          return { ok: true };
        }
        this.holdUntil = this.age + HOLD_TIME;
        this.state = 'standingUp';
        this.commandActive = true;
        return { ok: true };
      case 'satt_dig': {
        if (place && !place.seat) return { ok: false, reason: 'noSeat' };
        let target = this.reservedSeat;
        this.reservedSeat = null;
        if (!target) {
          if (this.seated && place?.seat === this.seat?.label) return { ok: false, reason: 'already' };
          target = this.pickSeat(seats, place);
        }
        if (!target) return { ok: false, reason: 'occupied' };
        if (!this.setPath(nav, target.approach[0], target.approach[1])) {
          if (target.occupant === this) target.occupant = null;
          return { ok: false, reason: 'noPath' };
        }
        target.occupant = this;
        this.seat = target;
        this.following = false;
        this.holdUntil = this.age + HOLD_TIME;
        this.state = 'toSeat';
        this.commandActive = true;
        return { ok: true };
      }
      case 'ga_till': {
        if (!place) return { ok: false, reason: 'noPlace' };
        if (!place.poi) return this.command({ action: 'satt_dig', place: cmd.place }, world);
        const spots = pois.filter((p) => p.label === place.poi);
        const spot = spots.sort((p, q) => this.dist(p) - this.dist(q))[0];
        if (!spot || !this.setPath(nav, spot.x, spot.z)) return { ok: false, reason: 'noPath' };
        this.poi = spot;
        this.following = false;
        this.holdUntil = this.age + HOLD_TIME;
        this.state = 'toPoi';
        this.commandActive = true;
        return { ok: true };
      }
      case 'kom_hit': {
        const p = player.position;
        const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
        this.following = false;
        this.holdUntil = this.age + HOLD_TIME;
        if (d < 1.4) {
          this.state = 'idle';
          this.timer = HOLD_TIME;
          this.desiredHeading = Math.atan2(p.x - this.position.x, p.z - this.position.z);
          return { ok: true };
        }
        const k = 1.0 / d;
        if (!this.setPath(nav, p.x + (this.position.x - p.x) * k, p.z + (this.position.z - p.z) * k)) return { ok: false, reason: 'noPath' };
        this.poi = null;
        this.faceTarget = 'player';
        this.state = 'toPoi';
        this.commandActive = true;
        return { ok: true };
      }
      case 'lagg_dig':
      case 'sitt_pa': {
        const bed = cmd.place && world.beds?.find((b) => b.label === cmd.place);
        if (!bed) {
          if (a === 'sitt_pa') return { ok: false, reason: 'noSeat' };
          return this.command({ action: 'rorelse', motion: PRESETS.ligga_pa_rygg, name: 'ligga_pa_rygg', internal: true }, world);
        }
        if (!this.setPath(nav, bed.x, bed.z)) return { ok: false, reason: 'noPath' };
        this.poi = { x: bed.x, z: bed.z, face: bed.face, label: bed.label };
        this.following = false;
        this.state = 'toPoi';
        this.faceTarget = null;
        this.holdUntil = this.age + HOLD_TIME;
        this.commandActive = true;
        // Väl framme: vänd ryggen mot möbeln och gör rörelsen
        this.afterArrive = a === 'lagg_dig' ? lieOnMotion(bed) : sitOnMotion(bed);
        return { ok: true };
      }
      case 'rorelse': {
        if (!cmd.motion) return { ok: false, reason: 'unknown' };
        if (!this.seated) {
          // Stanna där personen är och gör rörelsen
          this.following = false;
          this.path = null;
          this.state = 'idle';
          this.holdUntil = Math.max(this.holdUntil, this.age + 30);
          this.timer = Math.max(this.timer, 30);
        }
        this.playMotion(cmd.motion);
        return { ok: true };
      }
      default: {
        if (!gesture) return { ok: false, reason: 'unknown' };
        if (this.seated) {
          this.startGesture(a);
          return { ok: true };
        }
        // Stanna där personen är och gör gesten
        this.following = false;
        this.path = null;
        this.state = 'idle';
        this.holdUntil = Math.max(this.holdUntil, this.age + 30);
        this.timer = Math.max(this.timer, 30);
        this.pendingGesture = a;
        this.commandActive = true;
        return { ok: true };
      }
    }
  }

  dist(p) {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  // Närmaste lediga sittplats, eventuellt begränsat till en viss möbel
  pickSeat(seats, place) {
    const free = seats.filter((s) => (!place || s.label === place.seat) && (!s.occupant || s.occupant === this) && s !== this.seat);
    return free.sort((a, b) => this.dist(a) - this.dist(b))[0] || null;
  }

  chooseClip(dt, moving) {
    const nearSeat = this.seat && Math.hypot(this.seat.x - this.position.x, this.seat.z - this.position.z) < 0.35;
    const seated = this.state === 'sitting' || (this.state === 'sittingDown' && nearSeat);
    this.sitAmount += ((seated ? 1 : 0) - this.sitAmount) * Math.min(1, dt * 2.5);
    this.walkAmount += ((moving ? 1 : 0) - this.walkAmount) * Math.min(1, dt * 6);
    this.clipTimer -= dt;
    if (moving && this.motion?.wholeBody) this.stopMotion(true);
    if (this.gesture) {
      if (moving || this.age > this.gesture.until) this.endGesture();
      else return;
    }

    const name = this.currentName || '';
    // Vänder sig personen på stället tar hen små steg i stället för att glida runt på fötterna
    const turning = !moving && !seated && !this.motion && this.turnRate > 1.1;
    if (turning) {
      this.play('walk', 0.25);
      this.actions.walk.setEffectiveTimeScale(0.55);
      this.clipTimer = 0;
      return;
    }
    if (moving) {
      this.play('walk', 0.3);
      this.actions.walk.setEffectiveTimeScale(Math.max(0.4, (this.currentSpeed || this.speed) / (WALK_CLIP_SPEED * this.model.scale.x)));
      return;
    }
    if (seated) {
      if (this.talking && this.speaking > 0.3) {
        if (name !== 'sitTalk') this.play('sitTalk', 0.7);
      } else if (!name.startsWith('sit') || (name === 'sitTalk' && this.speaking <= 0) || this.clipTimer < 0) {
        this.play(pick(['sit1', 'sit2', 'sit3']), 0.9);
      }
      return;
    }
    if (this.talking) {
      if (this.speaking > 0) {
        if (!name.startsWith('talk') || this.clipTimer < 0) this.play(pick(['talk1', 'talk2', 'talk3']), 0.5);
      } else if (!name.startsWith('listen') || this.clipTimer < 0) {
        this.play(pick(['listen1', 'listen2']), 0.6);
      }
      return;
    }
    if (!name.startsWith('idle') || this.clipTimer < 0) {
      this.play(pick(['idle1', 'idle2', 'idle3', 'idle4']), name === 'walk' ? 0.35 : 0.8);
    }
  }

  animate(dt, moving, world) {
    this.chooseClip(dt, moving);
    const b = this.bones;
    if (b.jaw) b.jaw.quaternion.copy(this.rest.jaw);
    b.lids.forEach((l, i) => l.position.copy(this.rest.lids[i]));
    b.eyes.forEach((e, i) => e.quaternion.copy(this.rest.eyes[i]));
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    this.updateMotion(dt, world);
    // Sittande passas in på sitsen, och armarna hålls utanför möbler även i de vanliga animationerna
    if (!this.motion) this.model.position.set(0, 0, 0);
    this.fitSeat(dt, world);
    if (!this.motion) this.rig.fixLimbs([], this.seat && this.sitAmount > 0.3 ? this.rig.calves : NO_BONES);

    // Huvud och nacke vänds mot det personen tittar på. Korrigeringen räknas från huvudets
    // faktiska riktning i animationen, så att personen får riktig ögonkontakt.
    let yaw = 0;
    let pitch = 0;
    const aim = (bone, fwdLocal) => {
      bone.getWorldPosition(_v);
      _v2.copy(this.lookTarget).sub(_v);
      const fwd = _v.copy(fwdLocal).applyQuaternion(bone.getWorldQuaternion(_q));
      return [
        angleDiff(Math.atan2(fwd.x, fwd.z), Math.atan2(_v2.x, _v2.z)),
        Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z)) - Math.asin(Math.max(-1, Math.min(1, fwd.y))),
      ];
    };
    if (this.lookTarget && b.head && !this.motion?.usesHead && !this.motion?.wholeBody) {
      const toTarget = Math.atan2(this.lookTarget.x - this.position.x, this.lookTarget.z - this.position.z);
      // Mål bakom ryggen ignoreras; då vrider man hellre hela kroppen
      if (Math.abs(angleDiff(this.heading, toTarget)) < 1.6) [yaw, pitch] = aim(b.head, this.headForward);
    }
    const w = this.walkAmount > 0.5 ? 0.35 : 1;
    this.headYaw += (Math.max(-1.1, Math.min(1.1, yaw)) * w - this.headYaw) * Math.min(1, dt * 4);
    this.headPitch += (Math.max(-0.5, Math.min(0.5, pitch)) * w - this.headPitch) * Math.min(1, dt * 4);
    // Personens högra sida i världen, axel för nickrörelser
    _axis.set(1, 0, 0).applyAxisAngle(UP, this.heading);
    if (b.neck) {
      rotateBoneWorld(b.neck, UP, this.headYaw * 0.4);
      rotateBoneWorld(b.neck, _axis, -this.headPitch * 0.4);
    }
    if (b.head) {
      rotateBoneWorld(b.head, UP, this.headYaw * 0.6);
      rotateBoneWorld(b.head, _axis, -this.headPitch * 0.6);
    }

    // Käken rör sig när personen pratar
    this.speaking = Math.max(0, this.speaking - dt);
    const t = performance.now() / 1000;
    const targetJaw = this.speaking > 0 ? 0.03 + Math.abs(Math.sin(t * 13.7) * Math.sin(t * 5.3 + this.id)) * 0.2 : 0;
    this.jaw += (targetJaw - this.jaw) * Math.min(1, dt * 18);
    if (b.jaw && this.jaw > 0.002 && !this.hasFace) rotateBoneWorld(b.jaw, _axis, this.jaw);
    // Käke och ögon i en egen rörelse
    const mp = this.motion?.pose;
    if (b.jaw && mp?.kake) rotateBoneWorld(b.jaw, _axis, (Math.max(0, Math.min(30, mp.kake)) * Math.PI) / 180);
    const eyeYaw = mp?.ogon_vrid ? (Math.max(-35, Math.min(35, mp.ogon_vrid)) * Math.PI) / 180 : 0;
    const eyePitch = mp?.ogon_nick ? (Math.max(-30, Math.min(30, mp.ogon_nick)) * Math.PI) / 180 : 0;

    // Små naturliga ögonryck
    this.saccade.timer -= dt;
    if (this.saccade.timer < 0) {
      this.saccade.timer = rand(0.4, 1.8);
      this.saccade.x = rand(-0.06, 0.06);
      this.saccade.y = rand(-0.04, 0.04);
    }
    // Ögonen tar resten av vägen mot målet (efter huvudets vridning), plus små ryck
    b.eyes.forEach((eye, i) => {
      let [ey, ep] = this.lookTarget && w === 1 && !eyeYaw && !eyePitch ? aim(eye, this.eyeForward[i]) : [0, 0];
      ey = Math.max(-0.35, Math.min(0.35, ey)) + this.saccade.x + eyeYaw;
      ep = Math.max(-0.25, Math.min(0.25, ep)) + this.saccade.y - eyePitch;
      rotateBoneWorld(eye, UP, ey);
      rotateBoneWorld(eye, _axis, -ep);
    });

    if (this.hasFace) this.updateFace(dt);
    else if (this.blinkTimer < 0.14) {
      for (const lid of b.lids) {
        lid.parent.getWorldQuaternion(_q2).invert();
        _v.set(0, -this.blinkDrop, 0).applyQuaternion(_q2);
        lid.position.add(_v);
      }
    }
    // Avaturn-avataren tar samma pose som det osynliga skelettet
    this.retarget?.apply();
  }

  get blinkDrop() {
    // Benens lokala enhet kan vara skalad; dela med världsskalan
    return 0.009 / this.model.scale.x;
  }

  dispose() {
    this.mixer.stopAllAction();
    library.release(this.avatarId);
  }
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
