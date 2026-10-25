import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SPAWN } from './room.js';
import { makePersona } from './persona.js';
import { GESTURES, PLACES } from './commands.js';
import { MotionRig, prepareMotion, sampleMotion } from './motion.js';
import { Wardrobe, randomOutfit } from './clothes.js';

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
  }

  allowed(entry) {
    return this.filter === 'all' || entry.gender === this.filter;
  }

  async init(onProgress) {
    const res = await fetch(`${BASE}${this.dir}/index.json`);
    this.list = await res.json();
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
    await Promise.all(this.initial.map((a) => this.model(a.id).then(tick)));
    onProgress?.(1);
  }

  load(url) {
    return new Promise((resolve, reject) => this.loader.load(url, resolve, undefined, reject));
  }

  model(id) {
    if (!this.models.has(id)) {
      this.models.set(
        id,
        this.load(`${BASE}${this.dir}/${id}.glb`).then((gltf) => {
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
export class Character {
  constructor(id, asset) {
    this.id = id;
    const { entry, scene, anim } = asset;
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
    this.setupModel(scene, anim);
  }

  setupModel(scene, anim) {
    const model = scene;
    model.scale.setScalar(rand(0.97, 1.04));
    this.root.add(model);
    this.model = model;
    this.wardrobe = new Wardrobe(model);
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
    model.traverse((o) => o.morphTargetDictionary && Object.keys(o.morphTargetDictionary).length && this.faceMeshes.push(o));
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
    // I redigeraren står personen still i den pose spelaren justerar
    if (this.editing) {
      this.applyEditPose();
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
              if (!this.pendingGesture) this.commandActive = false;
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

  // ---------- Redigeraren (spelaren visar hur rörelsen ska se ut) ----------
  startEdit(def, used) {
    this.stopMotion();
    this.editing = true;
    this.editUsed = used;
    this.path = null;
    if (!this.seated) this.state = 'idle';
    this.holdUntil = Math.max(this.holdUntil, this.age + 120);
    this.speaking = 0;
  }

  // Lägg posen på skelettet (används både för att visa den och för att prova varianter)
  applyEditPose(pose = this.editPose) {
    this.root.updateMatrixWorld(true);
    this.rig.apply(pose || {}, this.editUsed, 1);
  }

  endEdit() {
    this.editing = false;
    this.editPose = null;
    this.rig.reset();
  }

  // ---------- Egna rörelser ----------
  playMotion(def) {
    const prev = this.motion && this.motion.releaseAt === undefined ? this.motion : null;
    this.motion = { ...prepareMotion(def, this.rig, prev), t: 0, smoothStart: !!prev };
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

  updateMotion(dt) {
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
    const w = Math.max(0, Math.min(fadeIn, m.t < playFor ? 1 : 1 - (m.t - playFor) / FADE_OUT));
    const t = Math.min(m.t, playFor);
    const local = m.def.loop && !hold && m.duration > 0 ? t % m.duration : Math.min(t, m.duration);
    const pose = sampleMotion(m.frames, local);
    this.rig.apply(pose, m.used, w);
    // Posen som den syns just nu, så att nästa rörelse kan börja härifrån
    m.pose = Object.fromEntries(Object.entries(pose).map(([k, v]) => [k, typeof v === 'number' ? v * w : v]));
    if (m.t >= m.duration && !hold && m.releaseAt === undefined && !m.def.loop) this.commandActive = false;
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
      const i = m.morphTargetDictionary[name];
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
    if (this.motion && !['rorelse', 'stanna', 'sluta_folja', 'byt_klader'].includes(a)) this.stopMotion(true);
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
        // Den som ligger eller sitter på golvet reser sig genom att rörelsen tonas ut
        if (!this.seated) return wasPosed ? { ok: true } : { ok: false, reason: 'already' };
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

  animate(dt, moving) {
    this.chooseClip(dt, moving);
    const b = this.bones;
    if (b.jaw) b.jaw.quaternion.copy(this.rest.jaw);
    b.lids.forEach((l, i) => l.position.copy(this.rest.lids[i]));
    b.eyes.forEach((e, i) => e.quaternion.copy(this.rest.eyes[i]));
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    this.updateMotion(dt);

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

    // Små naturliga ögonryck
    this.saccade.timer -= dt;
    if (this.saccade.timer < 0) {
      this.saccade.timer = rand(0.4, 1.8);
      this.saccade.x = rand(-0.06, 0.06);
      this.saccade.y = rand(-0.04, 0.04);
    }
    // Ögonen tar resten av vägen mot målet (efter huvudets vridning), plus små ryck
    b.eyes.forEach((eye, i) => {
      let [ey, ep] = this.lookTarget && w === 1 ? aim(eye, this.eyeForward[i]) : [0, 0];
      ey = Math.max(-0.35, Math.min(0.35, ey)) + this.saccade.x;
      ep = Math.max(-0.25, Math.min(0.25, ep)) + this.saccade.y;
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
