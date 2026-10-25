import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SPAWN } from './room.js';
import { makePersona } from './persona.js';

export { PERSONALITIES } from './persona.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);

// Gånganimationen förflyttar sig 1,21 m/s i originalet
const WALK_CLIP_SPEED = 1.21;
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
  }

  async init(onProgress) {
    const res = await fetch(`${BASE}avatars/index.json`);
    this.list = await res.json();
    let done = 0;
    const tick = () => onProgress?.(++done / 5);
    await Promise.all(['f', 'm'].map((g) => this.animations(g).then(tick)));
    // Förladda några personer så att rummet inte är tomt när spelet startar
    const f = this.list.filter((a) => a.gender === 'f');
    const m = this.list.filter((a) => a.gender === 'm');
    this.initial = [pick(f), pick(m), pick(Math.random() < 0.5 ? f : m)].filter((v, i, a) => a.indexOf(v) === i);
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
        this.load(`${BASE}avatars/${id}.glb`).then((gltf) => {
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
    const free = this.list.filter((a) => !this.inUse.get(a.id));
    const pool = free.length ? free : this.list;
    return pick(pool);
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
    this.setupModel(scene, anim);
  }

  setupModel(scene, anim) {
    const model = scene;
    model.scale.setScalar(rand(0.97, 1.04));
    this.root.add(model);
    this.model = model;
    const nodes = {};
    model.traverse((o) => (nodes[o.name] = o));
    this.bones = {
      hip: nodes.Bip01,
      neck: nodes.Bip01_Neck,
      head: nodes.Bip01_Head,
      jaw: nodes.Bip01_MJaw,
      lids: [nodes.Bip01_LEyeBlinkTop, nodes.Bip01_REyeBlinkTop].filter(Boolean),
    };
    // Ansiktsbenen saknar animationsspår, så vi återställer dem själva varje bildruta
    this.rest = {
      jaw: this.bones.jaw?.quaternion.clone(),
      lids: this.bones.lids.map((l) => l.position.clone()),
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
      if (name === 'wave') action.setLoop(THREE.LoopOnce, 1);
      this.actions[name] = action;
    }
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.actions.wave) {
        this.waving = false;
        this.currentName = null;
      }
    });
    this.current = null;
    this.play('idle1', 0);
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
    this.age += dt;
    this.timer -= dt;
    const { player } = world;
    let moving = false;

    if (this.talking) {
      this.lookTarget = player.headPos;
      if (this.state !== 'sitting' && this.state !== 'sittingDown') this.faceTowards(player.position.x, player.position.z, dt, 4);
    } else {
      switch (this.state) {
        case 'toSeat':
        case 'toPoi':
        case 'leaving': {
          moving = this.followPath(dt, world);
          if (!this.path || !this.path.length) {
            if (this.state === 'leaving') {
              this.done = true;
            } else if (this.state === 'toSeat') {
              this.state = 'sittingDown';
            } else {
              this.state = 'idle';
              this.timer = rand(5, 14);
              if (this.poi) this.desiredHeading = this.poi.face;
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
              this.timer = rand(16, 45);
            }
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

  wave() {
    if (this.state === 'sitting' || this.state === 'sittingDown' || this.waving) return;
    this.waving = true;
    this.play('wave', 0.3);
  }

  chooseClip(dt, moving) {
    const nearSeat = this.seat && Math.hypot(this.seat.x - this.position.x, this.seat.z - this.position.z) < 0.35;
    const seated = this.state === 'sitting' || (this.state === 'sittingDown' && nearSeat);
    this.sitAmount += ((seated ? 1 : 0) - this.sitAmount) * Math.min(1, dt * 2.5);
    this.walkAmount += ((moving ? 1 : 0) - this.walkAmount) * Math.min(1, dt * 6);
    this.clipTimer -= dt;
    if (this.waving && !moving) return;
    this.waving = false;

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
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);

    // Huvud och nacke vänds mot det personen tittar på
    let yaw = 0;
    let pitch = 0;
    if (this.lookTarget && b.head) {
      b.head.getWorldPosition(_v);
      _v2.copy(this.lookTarget).sub(_v);
      yaw = angleDiff(this.heading, Math.atan2(_v2.x, _v2.z));
      pitch = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
      if (Math.abs(yaw) > 1.6) {
        yaw = 0;
        pitch = 0;
      }
    }
    const w = this.walkAmount > 0.5 ? 0.35 : 1;
    this.headYaw += (Math.max(-1.1, Math.min(1.1, yaw)) * w - this.headYaw) * Math.min(1, dt * 4);
    this.headPitch += (Math.max(-0.45, Math.min(0.45, pitch)) * w - this.headPitch) * Math.min(1, dt * 4);
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
    if (b.jaw && this.jaw > 0.002) rotateBoneWorld(b.jaw, _axis, this.jaw);

    // Blinkningar: övre ögonlocken flyttas ner en kort stund
    this.blinkTimer -= dt;
    if (this.blinkTimer < 0) this.blinkTimer = rand(2, 5.5);
    if (this.blinkTimer < 0.14) {
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
