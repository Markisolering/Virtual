import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildRoom, SPAWN, DOOR, ROOM } from './room.js';
import { Nav } from './nav.js';
import { Character, angleDiff, library } from './characters.js';
import { OfflineBrain, ClaudeBrain, loadSettings, saveSettings, DEFAULT_MODEL, apiMessage } from './dialogue.js';
import { rateMotion, updateLessons, motionLessons, learnedCount, resetLearning, recordCorrection } from './learning.js';
import { PoseEditor } from './editor.js';
import { Interactions } from './interact.js';
import { listAvatars, saveAvatar, updateAvatar, deleteAvatar, isGlb, createWithAvaturn } from './avaturn.js';
import { parseCommand, commandReply } from './commands.js';
import { PRESETS, findMotion, motionTitle, setWorld } from './motion.js';
import { voice, speakable } from './voice.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { t, en, lang, translateDom } from './i18n.js';

translateDom();

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------------- Inställningar och kvalitet ----------------
let settings = {
  quality: 'auto',
  show: 'all',
  mode: 'room',
  // Samtal: kompakt vy med pratbubbla, svar som text och röst, mikrofonknapp som skickar direkt
  view: 'compact',
  replyMode: 'both',
  mic: true,
  autoSend: true,
  micMode: 'toggle',
  voiceName: '',
  voiceRate: 1,
  ...loadSettings(),
};
library.filter = settings.show;
library.avaturn = settings.people === 'avaturn';
// Närbild: en eller två personer åt gången, detaljerade modeller med ansiktsuttryck och högsta grafikkvalitet.
// Talking head: en person, kameran bara på huvudet, porträttljus och suddig bakgrund.
const headMode = settings.mode === 'head';
const closeup = settings.mode === 'closeup' || headMode;
if (headMode) document.body.classList.add('headmode');
if (closeup) {
  library.dir = 'avatars-hq';
  library.initialCount = 1;
}
const resolveQuality = (q) => (q === 'auto' ? (closeup || !isTouch ? 'high' : 'medium') : q);
let quality = resolveQuality(settings.quality);

// ---------------- Renderare ----------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#14110f');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 60);
camera.rotation.order = 'YXZ';
// Håll ett brett horisontellt synfält även när mobilen hålls stående
function fitFov() {
  const aspect = innerWidth / innerHeight;
  const hfov = THREE.MathUtils.degToRad(aspect < 1 ? 78 : 96);
  const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
  // Talking head: smal bildvinkel som ett porträttobjektiv (bredare på liggande skärm)
  camera.fov = headMode ? (aspect < 1 ? 30 : 24) : Math.min(95, Math.max(58, vfov));
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
fitFov();

const world = buildRoom(scene, quality);
const nav = new Nav(world.blockers);

let composer = null;
function setupPipeline() {
  const dpr = quality === 'low' ? 1 : Math.min(devicePixelRatio, quality === 'high' ? 2 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  if (composer) {
    composer.dispose();
    composer = null;
  }
  // Infällda spotlights stängs av på låg kvalitet för att spara prestanda
  for (const l of world.lights) l.visible = quality !== 'low' || l.intensity > 2;
  if (quality === 'low') return;
  const rt = new THREE.WebGLRenderTarget(innerWidth * dpr, innerHeight * dpr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  if (quality === 'high') {
    const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 12 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
  }
  // Talking head: kort skärpedjup som i ett porträtt, bakgrunden blir suddig
  if (headMode) {
    bokeh = new BokehPass(scene, camera, { focus: 0.8, aperture: 0.012, maxblur: 0.01 });
    composer.addPass(bokeh);
  } else bokeh = null;
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.35, 2.2));
  composer.addPass(new OutputPass());
  // Svag vinjett och filmkorn, som en riktig kamera (döljer också den "datorrena" ytan)
  if (headMode) composer.addPass((filmPass = new ShaderPass(FILM)));
}
let bokeh = null;
let filmPass = null;
const FILM = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= mix(1.0, 0.72, smoothstep(0.35, 0.85, d));
      c.rgb += (hash(vUv * 1000.0) - 0.5) * 0.025;
      gl_FragColor = c;
    }`,
};
setupPipeline();

addEventListener('resize', () => {
  fitFov();
  renderer.setSize(innerWidth, innerHeight, false);
  composer?.setSize(innerWidth, innerHeight);
});

// ---------------- Spelaren ----------------
const EYE = 1.62;
const player = {
  position: new THREE.Vector3(0, 0, 1.6),
  yaw: 0,
  pitch: -0.05,
  headPos: new THREE.Vector3(),
  bob: 0,
};
const input = { joy: new THREE.Vector2(), keys: new Set() };

// ---------------- Karaktärer ----------------
const characters = [];
let nextId = 1;
const interactions = new Interactions({ camera });
const simWorld = { nav, seats: world.seats, pois: world.pois, beds: world.beds, solids: world.solids, player, characters, interactions };
// Det som kroppen inte får gå igenom: golv och möbler, väggarna och de andra personerna i närheten
const _bodyPos = new THREE.Vector3();
setWorld({
  support: world.supportAt,
  solids: world.solids,
  walls: { minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.minZ, maxZ: ROOM.maxZ, door: { z1: DOOR.z1, z2: DOOR.z2, h: DOOR.height } },
  bodies: (rig) => {
    rig.model.getWorldPosition(_bodyPos);
    return characters.filter((c) => c.rig !== rig && c.root.visible && c.position.distanceTo(_bodyPos) < 2.6).flatMap((c) => c.capsules());
  },
});

async function addCharacter(entry) {
  const asset = await library.create(entry);
  const c = new Character(nextId++, asset);
  characters.push(c);
  scene.add(c.root);
  return c;
}

async function spawnInside(entry) {
  const c = await addCharacter(entry);
  const free = world.seats.filter((s) => !s.occupant);
  if (Math.random() < 0.55 && free.length) {
    const seat = free[Math.floor(Math.random() * free.length)];
    seat.occupant = c;
    c.seat = seat;
    c.position.set(seat.x, 0, seat.z);
    c.heading = seat.face;
    c.state = 'sitting';
    c.sitAmount = 1;
    c.play('sit1', 0);
    c.timer = 8 + Math.random() * 30;
  } else {
    const poi = world.pois[Math.floor(Math.random() * world.pois.length)];
    c.poi = poi;
    c.position.set(poi.x, 0, poi.z);
    c.heading = poi.face;
    c.desiredHeading = poi.face;
    c.state = 'idle';
    c.timer = 3 + Math.random() * 10;
  }
  c.root.rotation.y = c.heading;
  c.age = Math.random() * 60;
}

// Nästa person laddas i förväg medan den förra är i rummet
let spawning = false;
let nextEntry = null;
async function spawnAtDoor() {
  if (spawning) return;
  spawning = true;
  try {
    const c = await addCharacter(nextEntry || undefined);
    c.position.copy(SPAWN);
    c.heading = Math.PI / 2;
    c.root.rotation.y = c.heading;
    c.chooseNext(simWorld);
    toast(t('{name} kom in.', { name: c.name }));
  } catch (err) {
    console.error('Kunde inte ladda en person', err);
  } finally {
    nextEntry = library.pickEntry();
    library.model(nextEntry.id).catch(() => {});
    spawning = false;
  }
}

let spawnTimer = 6;
const randomTarget = () => (headMode ? 1 : closeup ? 1 + (Math.random() < 0.5 ? 1 : 0) : 2 + Math.floor(Math.random() * 4));
let targetCount = headMode ? 1 : closeup ? 2 : 4;

// ---------------- Porträttljus (närbild) ----------------
// Ett mjukt strålkastarljus snett framifrån som följer den man tittar på eller pratar med,
// så att ansiktet får form och skuggor.
const keyLight = new THREE.SpotLight('#fff1e2', 0, 8, 0.42, 0.9, 2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.bias = -0.0002;
keyLight.shadow.normalBias = 0.01;
keyLight.shadow.radius = 3;
keyLight.visible = closeup;
scene.add(keyLight, keyLight.target);
const keyPos = new THREE.Vector3();

function updateKeyLight(dt) {
  if (!closeup) return;
  let subject = chatWith || focused;
  if (!subject) {
    let best = 4.5;
    for (const c of characters) {
      const d = Math.hypot(c.position.x - player.position.x, c.position.z - player.position.z);
      if (d < best) {
        best = d;
        subject = c;
      }
    }
  }
  keyLight.intensity += ((subject ? 14 : 0) - keyLight.intensity) * Math.min(1, dt * 3);
  if (!subject) return;
  const head = subject.headWorld();
  const toPlayer = new THREE.Vector3(player.position.x - head.x, 0, player.position.z - head.z).normalize();
  const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
  keyPos.copy(head).addScaledVector(toPlayer, 1.3).addScaledVector(side, 0.8).add(new THREE.Vector3(0, 0.75, 0));
  keyPos.y = Math.min(keyPos.y, ROOM.height - 0.15);
  keyLight.position.lerp(keyPos, Math.min(1, dt * 4));
  keyLight.target.position.lerp(head, Math.min(1, dt * 6));
}

// ---------------- Talking head ----------------
// En person står framför bokhyllan, kameran ramar in huvudet och axlarna med ett "teleobjektiv",
// och tre ljus (huvudljus, fylljus och kantljus) ger ett porträtt. Dra för att vrida kameran lite,
// nyp eller scrolla för att zooma.
const STAGE = { x: 0.3, z: 0.9, face: 0 };
const headCam = { yaw: 0, pitch: 0, dist: 1.05, target: new THREE.Vector3(), ready: false };
const fillLight = new THREE.PointLight('#cfdcff', 0, 4, 2);
const rimLight = new THREE.SpotLight('#ffe2c4', 0, 5, 0.6, 0.8, 2);
scene.add(fillLight, rimLight, rimLight.target);

// Syns ansiktet? En stråle framifrån mot ögonen ska träffa ansiktet först, inte t.ex. en burka.
function faceVisible(c) {
  c.root.updateMatrixWorld(true);
  // Utan ögon (t.ex. en burka utan ansikte under) finns det inget ansikte att visa
  const eyes = c.bones.eyes;
  if (!eyes.length) return false;
  c.visual.traverse((o) => o.isSkinnedMesh && o.computeBoundingSphere());
  const target = new THREE.Vector3();
  for (const e of eyes) target.add(e.getWorldPosition(new THREE.Vector3()));
  target.divideScalar(eyes.length);
  const fwd = new THREE.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading));
  const from = target.clone().addScaledVector(fwd, 0.8);
  const ray = new THREE.Raycaster(from, fwd.clone().negate(), 0, 1.2);
  const hit = ray.intersectObject(c.visual, true).find((h) => h.object.visible && h.object.isMesh);
  return !!hit && c.faceMeshes.includes(hit.object);
}

async function setupStage(c, tries = 0) {
  if (!c) return;
  // Personer med täckt ansikte passar inte här; byt till någon annan
  if (c.hasFace === false || (!faceVisible(c) && tries < 6)) {
    library.skip.add(c.avatarId);
    const next = await addCharacter(library.pickEntry()).catch(() => null);
    if (next) {
      scene.remove(c.root);
      c.dispose();
      characters.splice(characters.indexOf(c), 1);
      return setupStage(next, tries + 1);
    }
  }
  for (const s of world.seats) if (s.occupant === c) s.occupant = null;
  c.seat = null;
  c.stopMotion();
  c.position.set(STAGE.x, 0, STAGE.z);
  c.heading = STAGE.face;
  c.desiredHeading = STAGE.face;
  c.root.rotation.y = STAGE.face;
  c.state = 'idle';
  c.path = null;
  c.sitAmount = 0;
  c.stay = 1e9;
  c.timer = 1e9;
  c.holdUntil = 1e9;
  c.following = false;
  improveSkin(c);
  headCam.ready = false;
  fitFov();
  // Spelaren står där kameran är, så att personen får ögonkontakt
  player.position.set(STAGE.x, 0, STAGE.z + 1);
  openChat(c);
}

// Hudens material: lite sammetsglans (sheen) i kanterna och mjukare reflexer, som riktig hud
function improveSkin(c) {
  c.visual.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.isMeshPhysicalMaterial || /opacity|lash|hair/i.test(o.material.name)) return;
    const m = o.material;
    const phys = new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(phys, m);
    phys.sheen = 0.2;
    phys.sheenRoughness = 0.55;
    phys.sheenColor = new THREE.Color('#ffb59c');
    phys.specularIntensity = 0.55;
    phys.roughness = Math.max(0.45, m.roughness);
    phys.envMapIntensity = 0.7;
    o.material = phys;
  });
}

function updateHeadCamera(dt) {
  const c = characters.find((x) => x.state !== 'leaving') || null;
  if (!c) return;
  const head = c.headWorld();
  // Huvudbenet sitter vid hakan; sikta en bit ovanför så att hela huvudet och axlarna syns
  const aim = head.clone().add(new THREE.Vector3(0, 0.06, 0));
  if (!headCam.ready) {
    headCam.target.copy(aim);
    headCam.ready = true;
  }
  // Följ huvudet mjukt, som en kameraman (huvudets små rörelser syns i bilden)
  headCam.target.lerp(aim, Math.min(1, dt * 2.5));
  const yaw = c.heading + headCam.yaw;
  const pitch = 0.04 + headCam.pitch;
  const t = performance.now() / 1000;
  camera.position.set(
    headCam.target.x + Math.sin(yaw) * Math.cos(pitch) * headCam.dist + Math.sin(t * 0.31) * 0.004,
    headCam.target.y + Math.sin(pitch) * headCam.dist + Math.sin(t * 0.43) * 0.003,
    headCam.target.z + Math.cos(yaw) * Math.cos(pitch) * headCam.dist,
  );
  camera.lookAt(headCam.target.x, headCam.target.y - 0.02, headCam.target.z);
  player.headPos.copy(camera.position);
  // Porträttljus som följer huvudet
  const fwd = new THREE.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
  fillLight.intensity = 0.9;
  fillLight.position.copy(head).addScaledVector(fwd, 0.9).addScaledVector(side, -0.8).add(new THREE.Vector3(0, -0.1, 0));
  rimLight.intensity = 9;
  rimLight.position.copy(head).addScaledVector(fwd, -0.9).addScaledVector(side, 0.6).add(new THREE.Vector3(0, 0.5, 0));
  rimLight.target.position.copy(head);
  if (bokeh) bokeh.uniforms.focus.value = camera.position.distanceTo(head);
  if (filmPass) filmPass.uniforms.time.value = (t % 100) * 0.37;
}

// Dra för att vrida kameran runt huvudet, nyp eller scrolla för att zooma
{
  const pts = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    if (!headMode || !started || editor.active) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) {
      headCam.yaw = Math.max(-0.7, Math.min(0.7, headCam.yaw - (e.clientX - p.x) * 0.004));
      headCam.pitch = Math.max(-0.25, Math.min(0.35, headCam.pitch + (e.clientY - p.y) * 0.003));
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX;
      p.y = e.clientY;
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      headCam.dist = Math.max(0.45, Math.min(1.6, headCam.dist * (before / Math.max(1, after))));
      return;
    }
    p.x = e.clientX;
    p.y = e.clientY;
  });
  const up = (e) => pts.delete(e.pointerId);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => headMode && (headCam.dist = Math.max(0.45, Math.min(1.6, headCam.dist * (e.deltaY > 0 ? 1.08 : 0.92)))), { passive: true });
}

// Byt till en ny person
$('next-person').addEventListener('click', async () => {
  const old = characters[0];
  if (chatOpen) closeChat();
  try {
    const c = await addCharacter(library.pickEntry());
    if (old) {
      scene.remove(old.root);
      old.dispose();
      characters.splice(characters.indexOf(old), 1);
    }
    await setupStage(c);
  } catch (err) {
    console.error(err);
    toast(t('Kunde inte ladda en ny person.'));
  }
});

// ---------------- Dörren ----------------
let doorAngle = 0;
function updateDoor(dt) {
  const dc = new THREE.Vector2(DOOR.x, (DOOR.z1 + DOOR.z2) / 2);
  const near = (p) => Math.hypot(p.x - dc.x, p.z - dc.y) < 1.7;
  const open = near(player.position) || characters.some((c) => near(c.position));
  const target = open ? 1.45 : 0;
  doorAngle += (target - doorAngle) * Math.min(1, dt * (open ? 4 : 2.2));
  world.doorPivot.rotation.y = doorAngle;
}

// ---------------- Styrning ----------------
const joyBase = $('joy-base');
const joyKnob = $('joy-knob');
const pointers = new Map();
let joyId = null;
const LOOK_SENS = isTouch ? 0.0055 : 0.0035;

canvas.addEventListener('pointerdown', (e) => {
  if (chatOpen || !started || editor.active) return;
  canvas.setPointerCapture(e.pointerId);
  const isLeft = e.clientX < innerWidth * 0.45;
  if (e.pointerType === 'touch' && isLeft && joyId === null) {
    joyId = e.pointerId;
    pointers.set(e.pointerId, { kind: 'joy', ox: e.clientX, oy: e.clientY });
    joyBase.style.left = `${e.clientX}px`;
    joyBase.style.top = `${e.clientY}px`;
    joyBase.classList.add('active');
    joyKnob.style.transform = 'translate(0,0)';
  } else {
    pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (p.kind === 'joy') {
    let dx = e.clientX - p.ox;
    let dy = e.clientY - p.oy;
    const d = Math.hypot(dx, dy);
    const max = 50;
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.joy.set(dx / max, dy / max);
  } else {
    player.yaw -= (e.clientX - p.x) * LOOK_SENS;
    player.pitch -= (e.clientY - p.y) * LOOK_SENS;
    player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch));
    p.x = e.clientX;
    p.y = e.clientY;
  }
});

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (p.kind === 'joy') {
    joyId = null;
    input.joy.set(0, 0);
    joyBase.classList.remove('active');
  } else if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 12 && performance.now() - p.t < 350) {
    tapAt(e.clientX, e.clientY);
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

addEventListener('keydown', (e) => {
  if (document.activeElement === $('chat-input') || document.activeElement?.tagName === 'INPUT') {
    if (e.key === 'Escape') closeChat();
    return;
  }
  input.keys.add(e.code);
  if (e.code === 'KeyE' && started && !chatOpen && focused) openChat(focused);
  if (e.code === 'Escape' && chatOpen) closeChat();
});
addEventListener('keyup', (e) => input.keys.delete(e.code));
addEventListener('blur', () => input.keys.clear());

const raycaster = new THREE.Raycaster();
function tapAt(x, y) {
  raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const hits = raycaster.intersectObjects(characters.map((c) => c.hitMesh), false);
  if (!hits.length) return;
  const c = hits[0].object.userData.character;
  if (hits[0].distance > 4.5) {
    toast(t('Gå närmare för att prata med {name}.', { name: c.name }));
    return;
  }
  openChat(c);
}

function updatePlayer(dt) {
  if (chatOpen && chatWith) {
    // Vänd blicken mot den man pratar med och placera ansiktet mitt i den del av skärmen som chatten inte täcker
    const h = chatWith.headWorld();
    const dx = h.x - player.position.x;
    const dz = h.z - player.position.z;
    const dy = h.y - EYE;
    const panel = !compactView();
    const landscapePanel = panel && innerWidth > innerHeight && innerHeight <= 520;
    const vfov = THREE.MathUtils.degToRad(camera.fov) / camera.zoom;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    // Liggande: chatten ligger till höger, så ansiktet hamnar i mitten av vänstra delen.
    // Stående: chatten täcker nedre ~58 %, så ansiktet hamnar i mitten av övre delen.
    const wantYaw = Math.atan2(-dx, -dz) + (landscapePanel ? -0.24 * hfov : 0);
    // Kompakt vy: ansiktet strax ovanför mitten så att pratbubblan får plats ovanför
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) - (landscapePanel ? 0 : panel ? 0.27 * vfov : 0.04 * vfov);
    player.yaw += angleDiff(player.yaw, wantYaw) * Math.min(1, dt * 4);
    player.pitch += (wantPitch - player.pitch) * Math.min(1, dt * 4);
    return;
  }
  const k = input.keys;
  let mx = input.joy.x;
  let my = input.joy.y;
  if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
  if (k.has('KeyA')) mx -= 1;
  if (k.has('KeyD')) mx += 1;
  if (k.has('ArrowLeft')) player.yaw += dt * 2;
  if (k.has('ArrowRight')) player.yaw -= dt * 2;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const speed = k.has('ShiftLeft') ? 3.2 : 2.0;
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw);
  const rz = -Math.sin(player.yaw);
  const vx = (fx * -my + rx * mx) * speed;
  const vz = (fz * -my + rz * mx) * speed;
  player.position.x += vx * dt;
  player.position.z += vz * dt;
  nav.resolve(player.position, 0.3);
  for (const c of characters) {
    const dx = player.position.x - c.position.x;
    const dz = player.position.z - c.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5 && d > 0.001) {
      player.position.x += (dx / d) * (0.5 - d);
      player.position.z += (dz / d) * (0.5 - d);
    }
  }
  const moving = Math.min(1, Math.hypot(vx, vz) / 2);
  player.bob += dt * 9 * moving;
  player.bobAmt = (player.bobAmt || 0) + (moving - (player.bobAmt || 0)) * Math.min(1, dt * 6);
}

// I närbildsläget zoomar kameran in mot ansiktet under samtal
function updateZoom(dt) {
  const target = closeup && chatOpen && chatWith ? Math.min(2.2, Math.max(1, Math.hypot(chatWith.position.x - player.position.x, chatWith.position.z - player.position.z) * 1.4)) : 1;
  if (Math.abs(camera.zoom - target) < 0.002) return;
  camera.zoom += (target - camera.zoom) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
}

function updateCamera() {
  const bob = Math.sin(player.bob) * 0.028 * player.bobAmt;
  camera.position.set(player.position.x, EYE + bob, player.position.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = Math.sin(player.bob * 0.5) * 0.004 * player.bobAmt;
  player.headPos.set(player.position.x, EYE, player.position.z);
}

// ---------------- Fokus och etikett ----------------
let focused = null;
const focusLabel = $('focus-label');
const talkBtn = $('talk-btn');
const tmpV = new THREE.Vector3();
const fwd = new THREE.Vector3();

function updateFocus() {
  let best = null;
  let bestScore = Infinity;
  if (!chatOpen) {
    camera.getWorldDirection(fwd);
    for (const c of characters) {
      const h = c.headWorld();
      h.y -= 0.25;
      tmpV.copy(h).sub(camera.position);
      const d = tmpV.length();
      if (d > 3.6) continue;
      const ang = fwd.angleTo(tmpV.normalize());
      const limit = 0.3 + 0.35 / Math.max(1, d);
      if (ang < limit && ang + d * 0.05 < bestScore) {
        bestScore = ang + d * 0.05;
        best = c;
      }
    }
  }
  focused = best;
  talkBtn.hidden = !best;
  if (best) {
    const h = best.headWorld();
    h.y += 0.3;
    h.project(camera);
    if (h.z < 1) {
      focusLabel.classList.add('show');
      focusLabel.style.transform = `translate(${(h.x * 0.5 + 0.5) * innerWidth}px, ${(-h.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
      focusLabel.querySelector('.name').textContent = best.name;
      focusLabel.querySelector('.hint').textContent = isTouch ? t('Tryck för att prata') : t('Tryck E för att prata');
    } else focusLabel.classList.remove('show');
  } else {
    focusLabel.classList.remove('show');
  }
}
talkBtn.addEventListener('click', () => focused && openChat(focused));

// ---------------- Samtal ----------------
// Två vyer: "compact" (pratbubbla ovanför personen och en smal rad längst ner) och "chat" (chattruta
// med historik). Svaren kan visas som text, läsas upp med röst eller båda, och spelaren kan prata in.
let chatOpen = false;
let chatWith = null;
let busy = false;
let leaveAfterChat = false;
const offline = new OfflineBrain();
const chatEl = $('chat');
const log = $('chat-log');
const talkbar = $('talkbar');
const bubbleEl = $('speech-bubble');
const heardEl = $('talk-heard');
const QUICK = en
  ? ['Hi!', "What's your name?", 'Sit on the sofa', 'Follow me', 'Dance!', 'Come here', 'Go to the kitchen', 'Wave', 'How are you?', 'What do you do?', 'Tell me about yourself', 'Bye!']
  : ['Hej!', 'Vad heter du?', 'Sätt dig i soffan', 'Följ mig', 'Dansa!', 'Kom hit', 'Gå till köket', 'Vinka', 'Hur mår du?', 'Vad jobbar du med?', 'Berätta något om dig', 'Hej då!'];
const PLACEHOLDER = t('Säg något eller be om något…');
const compactView = () => settings.view !== 'chat';
const showText = () => settings.replyMode !== 'voice';
const useVoice = () => settings.replyMode !== 'text' && voice.canSpeak();
const activeInput = () => (compactView() ? $('talk-input') : $('chat-input'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function addMsg(text, who) {
  const m = document.createElement('div');
  m.className = `msg ${who}`;
  m.textContent = text;
  log.appendChild(m);
  log.scrollTop = log.scrollHeight;
  // I den kompakta vyn syns inte chattrutan: egna repliker visas kort ovanför raden, systemtexter som toast
  if (compactView() && who === 'me') showHeard(text);
  if (compactView() && who === 'sys' && text !== '…') toast(text);
  return m;
}

// ---- Pratbubbla ovanför personen (kompakt vy) ----
let bubbleUntil = 0;
function setBubble(text, typing = false) {
  if (!compactView() || !showText()) return;
  // Handlingar inom *stjärnor* visas kursivt utan stjärnorna
  const el = bubbleEl.querySelector('.text');
  el.textContent = '';
  if (!typing) {
    for (const [i, part] of text.split(/\*([^*]+)\*/).entries()) {
      if (!part) continue;
      const span = document.createElement(i % 2 ? 'i' : 'span');
      span.textContent = part;
      el.appendChild(span);
    }
  }
  bubbleEl.classList.toggle('typing', typing);
  bubbleEl.hidden = false;
  bubbleUntil = Infinity;
}
function releaseBubble(seconds) {
  bubbleUntil = performance.now() / 1000 + seconds;
}
const bubblePos = new THREE.Vector3();
function updateBubble() {
  if (bubbleEl.hidden) return;
  if (!chatWith || performance.now() / 1000 > bubbleUntil) {
    bubbleEl.hidden = true;
    return;
  }
  bubblePos.copy(chatWith.headWorld());
  bubblePos.y += 0.24;
  bubblePos.project(camera);
  if (bubblePos.z > 1) {
    bubbleEl.style.opacity = 0;
    return;
  }
  bubbleEl.style.opacity = 1;
  // Håll bubblan inom skärmen
  const x = Math.min(innerWidth - 12, Math.max(12, (bubblePos.x * 0.5 + 0.5) * innerWidth));
  const y = Math.max(bubbleEl.offsetHeight + 60, (-bubblePos.y * 0.5 + 0.5) * innerHeight);
  bubbleEl.style.setProperty('--x', `${x}px`);
  bubbleEl.style.setProperty('--y', `${y}px`);
}

// Det spelaren sa (eller håller på att säga) visas kort ovanför raden
let heardTimer = 0;
function showHeard(text, interim = false) {
  heardEl.textContent = text;
  heardEl.classList.toggle('interim', interim);
  heardEl.hidden = !text;
  clearTimeout(heardTimer);
  if (text && !interim) heardTimer = setTimeout(() => (heardEl.hidden = true), 3500);
}

function openChat(c) {
  if (chatOpen || !c) return;
  chatOpen = true;
  chatWith = c;
  leaveAfterChat = false;
  c.talking = true;
  input.joy.set(0, 0);
  joyBase.classList.remove('active');
  pointers.clear();
  joyId = null;
  $('chat-name').textContent = `${c.persona.firstName} ${c.persona.lastName}`;
  $('chat-sub').textContent = `${t('{age} år', { age: c.persona.age })} · ${c.persona.job}${settings.apiKey ? ` · ${t('AI-samtal')}` : ''}`;
  $('talk-input').placeholder = t('Säg något till {name}…', { name: c.persona.firstName });
  log.innerHTML = '';
  if (c.transcript?.length) {
    for (const [t, w] of c.transcript) addMsg(t, w);
    addMsg('…', 'sys');
  }
  showHeard('');
  c.transcript ||= [];
  if (!c.memory.met) c.wave();
  const hello = offline.reply(c, en ? 'hello' : 'hej', simWorld);
  const greet = hello.text;
  if (hello.emotion) c.setExpression(hello.emotion, 3);
  c.greeting = greet;
  const quick = $('chat-quick');
  quick.innerHTML = '';
  for (const q of QUICK) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = q;
    b.addEventListener('click', () => send(q));
    quick.appendChild(b);
  }
  if (compactView()) talkbar.hidden = false;
  else chatEl.hidden = false;
  updateMicButtons();
  document.body.classList.add('chatting');
  talkBtn.hidden = true;
  focusLabel.classList.remove('show');
  if (!isTouch) activeInput().focus();
  say(c, greet);
}

// Personens replik: i chatten eller pratbubblan, uppläst om rösten är på, och med läppsynk
async function say(c, text, el) {
  if (el) el.textContent = text;
  else addMsg(text, 'them');
  c.transcript.push([text, 'them']);
  setBubble(text);
  if (useVoice() && chatWith === c) {
    // Ljusare röst för kvinnor och mörkare för män, med lite variation mellan personer
    const pitch = (c.gender === 'f' ? 1.12 : 0.88) * (0.95 + (c.id % 5) * 0.025);
    const rate = settings.voiceRate || 1;
    const spoken = speakable(text);
    const talk = () => {
      c.speakText(spoken, rate);
      c.speaking = 30; // munnen rör sig tills rösten är klar
    };
    talk();
    // Läppsynken följer rösten ord för ord
    await voice.speak(text, { rate, pitch, voiceId: settings.voiceName || '', onStart: talk, onWord: (i) => c.faceAnim.onWord(i) });
    c.faceAnim.stop();
    c.speaking = 0;
    releaseBubble(2.5);
  } else {
    const d = c.speakText(speakable(text));
    releaseBubble(Math.max(4, d + 2.5));
    await wait(d * 1000);
  }
}

function closeChat() {
  if (!chatOpen) return;
  chatOpen = false;
  chatEl.hidden = true;
  talkbar.hidden = true;
  bubbleEl.hidden = true;
  showHeard('');
  setMic(false);
  voice.cancel();
  document.body.classList.remove('chatting');
  $('chat-input').blur();
  $('talk-input').blur();
  const c = chatWith;
  chatWith = null;
  if (!c) return;
  c.talking = false;
  c.speaking = 0;
  if (leaveAfterChat && characters.includes(c) && c.state !== 'leaving') c.command({ action: 'lamna_rummet' }, simWorld);
}

async function send(text) {
  text = text.trim();
  if (!text || busy || !chatWith) return;
  const c = chatWith;
  busy = true;
  voice.cancel();
  addMsg(text, 'me');
  c.transcript.push([text, 'me']);
  $('chat-input').value = '';
  $('talk-input').value = '';
  const bubble = addMsg('', 'them typing');
  setBubble('', true);
  // Personen tänker (tittar bort) tills svaret börjar komma
  c.listening = false;
  c.thinking = true;
  const execute = (cmd) => c.command(cmd, simWorld);
  let result = null;
  if (settings.apiKey) {
    try {
      const brain = new ClaudeBrain(settings);
      result = await brain.reply(
        c,
        text,
        simWorld,
        (partial) => {
          c.thinking = false;
          bubble.classList.remove('typing');
          bubble.textContent = partial;
          setBubble(partial);
          c.speech = null;
          c.speaking = 1.2;
          log.scrollTop = log.scrollHeight;
        },
        execute,
        (emotion) => c.setExpression(emotion, 5),
      );
    } catch (err) {
      console.error(err);
      // Visa API:ts eget felmeddelande (förkortat) så att felet går att förstå
      const detail = err?.status ? ` (${err.status}: ${apiMessage(err).slice(0, 140)})` : '';
      addMsg(t('Kunde inte nå Claude{detail}. Den inbyggda samtalsmotorn svarar i stället.', { detail }), 'sys');
    }
  }
  if (!result) {
    await wait(450 + Math.random() * 600);
    // Ber spelaren personen göra något? Annars ett vanligt samtalssvar.
    const cmd = parseCommand(text, characters.filter((x) => x !== c && x.state !== 'leaving').map((x) => x.persona.firstName));
    if (cmd) {
      const res = execute(cmd);
      result = { text: commandReply(c.persona, cmd, res), outcomes: [{ cmd, res }] };
    } else {
      result = { ...offline.reply(c, text, simWorld), outcomes: [] };
      if (result.emotion) c.setExpression(result.emotion, 4);
    }
  }
  c.thinking = false;
  bubble.classList.remove('typing');
  const outcomes = result.outcomes || [];
  let spoken = Promise.resolve();
  if (chatWith === c) {
    // Claude kan anropa verktyget utan att säga något; då svarar personen med en standardreplik
    const reply = result.text || (outcomes[0] ? commandReply(c.persona, outcomes[0].cmd, outcomes[0].res) : '…');
    // Om Claude lovade något som inte gick att göra, säger personen det efteråt
    const failures = settings.apiKey && result.text ? outcomes.filter((o) => !o.res.ok).map((o) => commandReply(c.persona, o.cmd, o.res)) : [];
    spoken = (async () => {
      await say(c, reply, bubble);
      for (const f of failures) if (chatWith === c) await say(c, f);
    })();
  } else {
    setBubble('');
  }
  busy = false;
  // Låt spelaren betygsätta varje rörelse som personen gjorde
  for (const o of outcomes) if (o.cmd.action === 'rorelse' && o.res.ok && o.cmd.name) addRating(c, o.cmd.name);
  const did = (action) => outcomes.some((o) => o.cmd.action === action && o.res.ok);
  if (result.leave) {
    leaveAfterChat = true;
    spoken.then(() => wait(800)).then(() => chatWith === c && closeChat());
  } else if (did('lamna_rummet')) {
    spoken.then(() => wait(800)).then(() => chatWith === c && closeChat());
  } else if (did('folj_mig')) {
    // Stäng samtalet så att spelaren kan gå iväg
    spoken.then(() => wait(500)).then(() => {
      if (chatWith !== c) return;
      closeChat();
      toast(
        en
          ? `${c.name} is following you. Say "stop" to make ${c.persona.pronoun === 'hon' ? 'her' : c.persona.pronoun === 'han' ? 'him' : 'them'} stop.`
          : `${c.name} följer efter dig. Säg "stanna" för att få ${c.persona.pronoun === 'hon' ? 'henne' : c.persona.pronoun === 'han' ? 'honom' : 'hen'} att sluta.`,
      );
    });
  } else {
  }
}

// Skickat från textfältet eller mikrofonen
function submitText(raw) {
  const text = raw.trim();
  if (!text) return;
  if (feedbackFor) {
    // Spelaren beskriver vad som var fel med en rörelse
    const { name, c, grade } = feedbackFor;
    feedbackFor = null;
    $('chat-input').placeholder = PLACEHOLDER;
    $('talk-input').placeholder = chatWith ? t('Säg något till {name}…', { name: chatWith.persona.firstName }) : PLACEHOLDER;
    $('chat-input').value = '';
    $('talk-input').value = '';
    giveFeedback(name, grade || 'down', text, c);
    return;
  }
  send(text);
}
$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitText($('chat-input').value);
});
$('talk-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitText($('talk-input').value);
});
$('talk-close').addEventListener('click', closeChat);

// Personen lyssnar (nickar ibland) medan spelaren pratar eller skriver
let listenTimer = 0;
function markListening() {
  const c = chatWith;
  if (!c) return;
  c.listening = true;
  clearTimeout(listenTimer);
  listenTimer = setTimeout(() => (c.listening = false), 1800);
}
for (const id of ['talk-input', 'chat-input']) $(id).addEventListener('input', markListening);

// ---- Prata in med rösten ----
// Mikrofonknappen slår inspelningen på och av. När den är på lyssnar spelet mening för mening tills man
// trycker igen: varje mening skickas, och medan personen svarar pausas lyssnandet så att den inte hör
// sig själv. En statusrad högst upp visar hela tiden vad mikrofonen gör och vad den har uppfattat.
const micStatus = $('mic-status');
const mic = { on: false, gen: 0 };
let micStatusTimer = 0;
const MIC_TEXT = {
  starting: t('🎙️ Startar mikrofonen…'),
  listening: t('🔴 Lyssnar – prata nu'),
  hearing: '🔴 ',
  paused: t('⏸ Väntar på svaret – lyssnar sedan igen'),
  sent: t('✓ Uppfattat: '),
  silence: t('🔴 Hörde inget – prata igen'),
  off: t('🎙️ Mikrofonen är av'),
};

function micUI(state, text = '') {
  const active = mic.on && state !== 'off';
  for (const b of document.querySelectorAll('.mic-btn')) {
    b.classList.toggle('listening', active && state !== 'paused');
    b.classList.toggle('paused', active && state === 'paused');
    b.setAttribute('aria-pressed', String(mic.on));
  }
  micStatus.textContent = `${MIC_TEXT[state] || ''}${text}`;
  micStatus.className = `mic-status ${state}`;
  micStatus.hidden = false;
  clearTimeout(micStatusTimer);
  if (!mic.on) micStatusTimer = setTimeout(() => (micStatus.hidden = true), state === 'off' ? 1500 : 3000);
}

function updateMicButtons() {
  const show = settings.mic !== false && voice.canListen();
  for (const b of document.querySelectorAll('.mic-btn')) b.hidden = !show;
}

function setMic(on) {
  if (on === mic.on) return;
  if (on && !voice.canListen()) {
    toast(t('Röstinmatning stöds inte i den här webbläsaren.'));
    return;
  }
  mic.on = on;
  mic.gen++;
  try {
    navigator.vibrate?.(on ? 25 : [15, 50, 15]);
  } catch {
    // Vibration stöds inte
  }
  if (on) {
    voice.cancel(); // tysta personen om hen pratar
    micLoop(mic.gen);
  } else {
    // Det som hunnit sägas skickas ändå när inspelningen avslutas
    voice.stop();
    micUI('off');
  }
}

async function micLoop(gen) {
  let failures = 0;
  const current = () => mic.on && mic.gen === gen;
  while (current()) {
    // Vänta medan svaret räknas fram eller personen pratar
    if (busy || voice.speaking) {
      micUI('paused');
      await wait(250);
      continue;
    }
    const editing = editor.active;
    const field = editing ? $('pose-note') : activeInput();
    micUI('starting');
    let heard = false;
    const r = await voice.listenOnce({
      onSound: () => current() && !heard && micUI('listening'),
      onPartial: (t) => {
        if (mic.gen !== gen) return;
        heard = true;
        markListening();
        micUI('hearing', t);
        field.value = t;
        if (compactView() && !editing) showHeard(t, true);
      },
    });
    const text = r.text;
    if (!text) {
      if (compactView()) showHeard('');
      if (!current()) break;
      if (r.error && r.error !== 'no-speech') {
        if (/not-allowed|denied|permission|service-not-allowed/i.test(r.error)) {
          setMic(false);
          toast(t('Appen får inte använda mikrofonen. Tillåt det i telefonens inställningar.'));
          break;
        }
        if (++failures >= 3) {
          setMic(false);
          toast(t('Mikrofonen fungerar inte just nu ({error}). Försök igen om en stund.', { error: r.error }));
          break;
        }
      }
      micUI('silence');
      await wait(400);
      continue;
    }
    failures = 0;
    const still = current();
    micUI('sent', text);
    if (editing) {
      field.value = text;
      setMic(false);
      micUI('sent', text);
      break;
    }
    if (settings.autoSend !== false) {
      field.value = '';
      submitText(text);
    } else {
      field.value = text;
      showHeard('');
      field.focus();
      setMic(false);
      micUI('sent', text);
      break;
    }
    if (!still || settings.micMode === 'once') {
      if (still) setMic(false);
      micUI('sent', text);
      break;
    }
    // Låt svaret börja innan nästa mening lyssnas på
    await wait(600);
  }
}

for (const b of document.querySelectorAll('.mic-btn')) b.addEventListener('click', () => setMic(!mic.on));

// ---------------- Betyg på rörelser ----------------
// Ett litet kort med rörelsens namn och 👍/👎: i chattrutan, eller flytande ovanför raden i den kompakta vyn.
let feedbackFor = null;
const PROBLEMS = [t('Fel position'), t('För snabb'), t('För långsam'), t('För stel'), t('Helt fel rörelse')];
const ratePop = $('rate-pop');
let rateTimer = 0;

function addRating(c, name) {
  const card = ratingCard(c, name);
  if (compactView()) {
    ratePop.innerHTML = '';
    ratePop.appendChild(card);
    ratePop.hidden = false;
    clearTimeout(rateTimer);
    // Försvinner av sig själv om man inte bryr sig om att betygsätta
    rateTimer = setTimeout(() => (ratePop.hidden = true), 30000);
  } else {
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
  }
}

// Snabbval när rörelsen var "nästan" rätt: vad som ska justeras
const ADJUST = [t('Mer'), t('Mindre'), t('Snabbare'), t('Långsammare'), t('Håll posen längre')];

function ratingCard(c, name) {
  const card = document.createElement('div');
  card.className = 'rate';
  const label = motionTitle(name);
  const buttons = () => {
    card.innerHTML = `<span>${t('Hur blev <b></b>?')}</span><div class="rate-buttons">
      <button type="button" data-v="up" aria-label="${t('Bra')}">👍</button>
      <button type="button" data-v="close" aria-label="${t('Nästan, åt rätt håll')}">${t('↗️ Nästan')}</button>
      <button type="button" data-v="down" aria-label="${t('Dålig')}">👎</button>
      <button type="button" data-v="again" aria-label="${t('Gör igen')}">${t('🔁 Igen')}</button>
      <button type="button" data-v="show" aria-label="${t('Visa själv hur den ska se ut')}">${t('✋ Visa')}</button></div>`;
    card.querySelector('b').textContent = label;
    card.querySelector('[data-v="up"]').addEventListener('click', () => {
      done(t('👍 Tack! "{label}" blir en förebild för nya rörelser.', { label }));
      giveFeedback(name, 'up', null, c);
    });
    card.querySelector('[data-v="close"]').addEventListener('click', () => ask('close', t('Vad ska justeras?'), ADJUST, '↗️'));
    card.querySelector('[data-v="down"]').addEventListener('click', () => ask('down', t('Vad var fel?'), PROBLEMS, '👎'));
    // Gör rörelsen en gång till direkt, utan att fråga AI:n
    card.querySelector('[data-v="again"]').addEventListener('click', () => {
      const def = findMotion(name);
      if (!def || !characters.includes(c)) {
        toast(t('Personen är inte kvar i rummet.'));
        return;
      }
      c.command({ action: 'rorelse', motion: def, name }, simWorld);
      armHide(30000);
    });
    // Frys rörelsen och flytta kroppsdelarna själv
    card.querySelector('[data-v="show"]').addEventListener('click', () => {
      if (openEditor(c, name)) done(t('✋ Visa hur det ska se ut …'));
    });
  };
  const armHide = (ms) => {
    if (card.parentElement !== ratePop) return;
    clearTimeout(rateTimer);
    rateTimer = setTimeout(() => (ratePop.hidden = true), ms);
  };
  const done = (text) => {
    card.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = text;
    card.appendChild(span);
    card.classList.add('done');
    armHide(2500);
  };
  const ask = (grade, question, options, icon) => {
    clearTimeout(rateTimer);
    card.innerHTML = '<span></span><div class="rate-chips"></div>';
    card.querySelector('span').textContent = question;
    const chips = card.querySelector('.rate-chips');
    // "Inget särskilt" ger bara betyget, utan att säga vad som var fel
    const NOTHING = t('Inget särskilt');
    const OTHER = t('Annat…');
    const BACK = t('← Tillbaka');
    for (const p of [NOTHING, ...options, OTHER, BACK]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p;
      b.addEventListener('click', () => {
        if (p === BACK) {
          buttons();
          return;
        }
        if (p === OTHER) {
          done(`${icon} ${t('Skriv eller säg vad som ska bli annorlunda.')}`);
          feedbackFor = { name, c, grade };
          if (!chatOpen && characters.includes(c)) openChat(c);
          activeInput().placeholder = t('Vad ska ändras i "{label}"?', { label });
          activeInput().focus();
          return;
        }
        done(`${icon} ${p}`);
        giveFeedback(name, grade, p === NOTHING ? null : p.toLowerCase(), c);
      });
      chips.appendChild(b);
    }
    log.scrollTop = log.scrollHeight;
  };
  buttons();
  return card;
}

// ---------------- Redigeraren ----------------
const editor = new PoseEditor({
  camera,
  canvas,
  ui: {
    root: $('pose-editor'),
    handles: $('pose-handles'),
    slider: $('pose-slider'),
    time: $('pose-time'),
    title: $('pose-title'),
    step1: $('pose-step1'),
    step2: $('pose-step2'),
    note: $('pose-note'),
    changes: $('pose-changes'),
  },
  onClose: () => document.body.classList.remove('editing'),
  onSave: (c, name, def, correction) => {
    recordCorrection(name, correction);
    // Rörelsecoachen drar lärdomar av rättelsen, t.ex. var håret sitter
    updateLessons(settings, name, 'close', correction.note, correction).then((lessons) => lessons && toast(t('Lärdomarna är uppdaterade utifrån din rättelse ({n} st).', { n: lessons.length })));
    toast(t('Sparat! "{label}" görs nu som du visade.', { label: motionTitle(name) }));
    if (!characters.includes(c)) return;
    c.command({ action: 'rorelse', motion: def, name }, simWorld);
    setTimeout(() => characters.includes(c) && addRating(c, name), 600);
  },
});

function openEditor(c, name) {
  const def = findMotion(name);
  if (!def || !characters.includes(c) || c.state === 'leaving') {
    toast(t('Personen är inte kvar i rummet.'));
    return false;
  }
  // Börja vid det ögonblick rörelsen är nu (eller slutposen om den är klar)
  const m = c.motion;
  let time;
  if (m && m.def === def) time = m.def.loop && m.duration > 0 ? m.t % m.duration : Math.min(m.t, m.duration);
  if (chatOpen) closeChat();
  ratePop.hidden = true;
  voice.cancel();
  document.body.classList.add('editing');
  editor.open(c, name, def, time);
  return true;
}

$('pose-cancel').addEventListener('click', () => editor.close(false));
$('pose-reset').addEventListener('click', () => editor.reset());
$('pose-next').addEventListener('click', () => editor.showStep(2));
$('pose-back').addEventListener('click', () => editor.showStep(1));
$('pose-save').addEventListener('click', () => editor.save($('pose-note').value.trim()));
$('pose-note').addEventListener('keydown', (e) => e.key === 'Enter' && editor.save($('pose-note').value.trim()));
$('pose-slider').addEventListener('input', (e) => editor.setTime(Number(e.target.value)));

// grade: 'up' (bra), 'close' (inte bra men åt rätt håll) eller 'down' (dålig)
function giveFeedback(name, grade, note, c) {
  rateMotion(name, grade, note);
  const label = motionTitle(name);
  // Rörelsecoachen sammanfattar betygen till lärdomar i bakgrunden
  updateLessons(settings, name, grade, note).then((lessons) => lessons && toast(t('Lärdomarna om rörelser är uppdaterade ({n} st).', { n: lessons.length })));
  if (grade === 'up') return;
  if (settings.apiKey && c && characters.includes(c)) {
    // Be personen göra om rörelsen direkt (samtalet öppnas igen om det var stängt)
    const ask =
      grade === 'close'
        ? en
          ? `The "${label}" move was almost right and going the right way${note ? ` – ${note}` : ''}. Keep what was good, adjust just that, and do it again.`
          : `Rörelsen "${label}" var nästan bra och åt rätt håll${note ? ` – ${note}` : ''}. Behåll det som var bra, justera bara det och gör om den.`
        : en
          ? `The "${label}" move wasn't good${note ? `: ${note}` : ''}. Do it again, better.`
          : `Rörelsen "${label}" blev inte bra${note ? `: ${note}` : ''}. Gör om den bättre.`;
    if (!chatOpen) openChat(c);
    if (chatWith === c) setTimeout(() => send(ask), chatWith.memory.met ? 300 : 1200);
  } else if (!settings.apiKey) {
    toast(t('Tack för betyget! Med AI-samtal påslaget kan personen göra om rörelsen och lära sig av det.'));
  }
}

// ---------------- Vilka som syns ----------------
const SHOW_TEXT = { all: t('Alla får komma in.'), f: t('Nu kommer bara kvinnor in.'), m: t('Nu kommer bara män in.') };

// Personer som inte passar det nya valet går ut, och nya personer väljs enligt valet
function applyShowFilter() {
  library.filter = settings.show;
  let leaving = 0;
  for (const c of characters) {
    if (library.allowed({ gender: c.gender }) || c.state === 'leaving') continue;
    if (c === chatWith) closeChat();
    c.command({ action: 'lamna_rummet' }, simWorld);
    leaving++;
  }
  if (library.list) {
    nextEntry = library.pickEntry();
    library.model(nextEntry.id).catch(() => {});
  }
  spawnTimer = Math.min(spawnTimer, 4);
  toast(`${SHOW_TEXT[settings.show]}${leaving ? ` ${t('De andra går nu.')}` : ''}`);
}

// ---------------- Toast ----------------
let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------------- Start och inställningar ----------------
let started = false;
const startBtn = $('start-btn');
// Lägesväljare på startskärmen
for (const b of document.querySelectorAll('#mode-pick button')) {
  b.classList.toggle('on', b.dataset.mode === (settings.mode || 'room'));
  b.addEventListener('click', () => {
    if (b.dataset.mode === settings.mode) return;
    settings.mode = b.dataset.mode;
    saveSettings(settings);
    location.reload();
  });
}
// Språkväljare på startskärmen
for (const b of document.querySelectorAll('#lang-pick button')) {
  b.classList.toggle('on', b.dataset.lang === lang);
  b.addEventListener('click', () => {
    if (b.dataset.lang === lang) return;
    settings.lang = b.dataset.lang;
    saveSettings(settings);
    location.reload();
  });
}
startBtn.disabled = true;
startBtn.textContent = t('Laddar personer…');
library
  .init((p) => (startBtn.textContent = `${t('Laddar personer…')} ${Math.round(p * 100)} %`))
  .then(async () => {
    await Promise.all(library.initial.map((e) => spawnInside(e)));
    nextEntry = library.pickEntry();
    library.model(nextEntry.id).catch(() => {});
    startBtn.disabled = false;
    startBtn.textContent = t('Gå in');
    if (library.avaturnMissing) toast(t('Du har inga Avaturn-avatarer än. Skapa en under ⚙︎ Inställningar – så länge visas de inbyggda personerna.'));
  })
  .catch((err) => {
    console.error(err);
    startBtn.textContent = t('Kunde inte ladda. Försök igen');
    startBtn.disabled = false;
    startBtn.onclick = () => location.reload();
  });

startBtn.addEventListener('click', async () => {
  if (!library.list || !characters.length) return;
  $('start').hidden = true;
  $('hud').hidden = false;
  started = true;
  if (headMode) setupStage(characters[0]);
  if (isTouch && !androidApp && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      // Helskärm stöds inte överallt (t.ex. iOS Safari) – spelet fungerar ändå
    }
  }
});

function openSettings() {
  $('set-lang').value = lang;
  $('set-quality').value = settings.quality || 'auto';
  $('set-show').value = settings.show || 'all';
  $('set-mode').value = settings.mode || 'room';
  $('set-people').value = settings.people || 'rocketbox';
  fillAvaturn();
  $('set-key').value = settings.apiKey || '';
  $('set-model').value = settings.model || DEFAULT_MODEL;
  $('set-view').value = settings.view || 'compact';
  $('set-reply').value = settings.replyMode || 'both';
  $('set-mic').checked = settings.mic !== false;
  $('set-autosend').checked = settings.autoSend !== false;
  $('set-micmode').value = settings.micMode || 'toggle';
  $('set-rate').value = settings.voiceRate || 1;
  $('rate-val').textContent = `${Number(settings.voiceRate || 1).toFixed(2)}×`;
  $('voice-note').hidden = voice.canListen() && voice.canSpeak();
  fillVoices();
  fillLearning();
  $('settings').hidden = false;
}
$('start-settings').addEventListener('click', openSettings);
$('settings-btn').addEventListener('click', () => {
  closeChat();
  openSettings();
});
$('set-cancel').addEventListener('click', () => ($('settings').hidden = true));

// Röster att välja mellan (svenska röster som finns i telefonen eller webbläsaren)
async function fillVoices() {
  const sel = $('set-voice');
  const list = await voice.voices();
  sel.innerHTML = `<option value="">${t('Automatisk')}</option>`;
  for (const v of list) {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
  sel.value = list.some((v) => v.id === settings.voiceName) ? settings.voiceName : '';
}
$('set-rate').addEventListener('input', () => ($('rate-val').textContent = `${Number($('set-rate').value).toFixed(2)}×`));
$('test-voice').addEventListener('click', () => {
  voice.speak(t('Hej! Så här låter jag när jag pratar med dig.'), { rate: Number($('set-rate').value), voiceId: $('set-voice').value });
});

// Vad personerna har lärt sig, i inställningarna
function fillLearning() {
  const n = learnedCount();
  $('learn-summary').textContent = t('Inlärda rörelser: {motions} · betygsatta: {rated} · lärdomar: {lessons}', n);
  const ul = $('learn-lessons');
  ul.innerHTML = '';
  for (const l of motionLessons()) {
    const li = document.createElement('li');
    li.textContent = l;
    ul.appendChild(li);
  }
  if (!ul.children.length) ul.innerHTML = `<li>${t('Inga lärdomar ännu. Betygsätt rörelser i chatten så samlas de här.')}</li>`;
}
$('learn-reset').addEventListener('click', () => {
  if (!confirm(t('Glömma alla inlärda rörelser, betyg och lärdomar?'))) return;
  resetLearning();
  fillLearning();
  toast(t('Allt inlärt om rörelser är borttaget.'));
});
$('set-save').addEventListener('click', async () => {
  const prevShow = settings.show;
  const prevMode = settings.mode;
  const prevPeople = settings.people || 'rocketbox';
  settings = {
    ...settings,
    lang: $('set-lang').value,
    mode: $('set-mode').value,
    people: $('set-people').value,
    quality: $('set-quality').value,
    show: $('set-show').value,
    apiKey: $('set-key').value.trim(),
    model: $('set-model').value,
    view: $('set-view').value,
    replyMode: $('set-reply').value,
    mic: $('set-mic').checked,
    autoSend: $('set-autosend').checked,
    micMode: $('set-micmode').value,
    voiceName: $('set-voice').value,
    voiceRate: Number($('set-rate').value),
  };
  saveSettings(settings);
  // Läget avgör vilka modeller som laddas, så appen startas om
  // Avaturn var valt men saknade avatarer: nu finns det några
  const newAvatars = settings.people === 'avaturn' && library.avaturnMissing && (await listAvatars()).length > 0;
  if (settings.mode !== prevMode || settings.people !== prevPeople || newAvatars || settings.lang !== lang) {
    location.reload();
    return;
  }
  const q = resolveQuality(settings.quality);
  if (q !== quality) {
    quality = q;
    setupPipeline();
  }
  $('settings').hidden = true;
  if (settings.show !== prevShow) applyShowFilter();
  else toast(settings.apiKey ? t('AI-samtal är på.') : t('Inbyggd samtalsmotor används.'));
});

// ---------------- Egna avatarer från Avaturn ----------------
async function fillAvaturn() {
  $('avaturn-panel').hidden = $('set-people').value !== 'avaturn';
  const ul = $('avaturn-list');
  const list = await listAvatars();
  ul.innerHTML = '';
  if (!list.length) ul.innerHTML = `<li class="note">${t('Inga avatarer ännu.')}</li>`;
  for (const a of list) {
    const li = document.createElement('li');
    li.innerHTML = `<input type="text" maxlength="30" aria-label="${t('Namn')}" /><select aria-label="${t('Kön')}"><option value="f">${t('Kvinna')}</option><option value="m">${t('Man')}</option></select><button type="button" aria-label="${t('Ta bort')}">🗑</button>`;
    const [name, gender, del] = li.children;
    name.value = a.name;
    gender.value = a.gender;
    name.addEventListener('change', () => updateAvatar(a.id, { name: name.value.trim() || a.name }));
    gender.addEventListener('change', () => updateAvatar(a.id, { gender: gender.value }));
    del.addEventListener('click', async () => {
      if (!confirm(t('Ta bort {name}?', { name: a.name }))) return;
      await deleteAvatar(a.id);
      fillAvaturn();
    });
    ul.appendChild(li);
  }
}
$('set-people').addEventListener('change', fillAvaturn);

async function addAvatar(blob, gender) {
  if (!(await isGlb(blob))) {
    toast(t('Filen är ingen GLB-modell.'));
    return;
  }
  const count = (await listAvatars()).length;
  const name = `Avatar ${count + 1}`;
  const id = await saveAvatar(blob, { name, gender });
  $('set-people').value = 'avaturn';
  await fillAvaturn();
  // Är Avaturn redan valt kan avataren komma in i rummet direkt
  if (library.avaturn) {
    library.list.push({ id, gender, name, avaturn: true });
    toast(t('Avataren är sparad och kommer snart in i rummet.'));
  } else toast(t('Avataren är sparad. Tryck på Spara för att använda Avaturn-avatarer.'));
}

$('avaturn-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) await addAvatar(file, 'f');
});

$('avaturn-create').addEventListener('click', async () => {
  const overlay = $('avaturn-overlay');
  const host = $('avaturn-host');
  host.innerHTML = '';
  overlay.hidden = false;
  try {
    const result = await createWithAvaturn(host);
    overlay.hidden = true;
    if (result) await addAvatar(result.blob, result.gender);
  } catch (err) {
    console.error(err);
    overlay.hidden = true;
    toast(t('Kunde inte öppna eller spara från Avaturn. Du kan i stället ladda upp en GLB-fil från avaturn.me.'));
  }
});
$('avaturn-close').addEventListener('click', () => $('avaturn-host').closeAvaturn?.());

// ---------------- App-installation ----------------
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;

// ---------------- Uppdateringar ----------------
// Varje publicering ger en ny service worker. När den har laddats ner visas en banner, och
// först när man trycker på "Uppdatera" tar den nya versionen över och sidan laddas om.
$('app-version').textContent = `${t('Version')} ${__APP_VERSION__}`;
let swReg = null;
let waitingWorker = null;
let updateRequested = false;

function showUpdate(worker) {
  waitingWorker = worker;
  $('update-banner').hidden = false;
  document.body.classList.add('has-update');
}

function watchInstalling(worker) {
  worker.addEventListener('statechange', () => {
    // Bara en uppdatering om en äldre version redan styr sidan (inte vid första installationen)
    if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
  });
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      if (reg.installing) watchInstalling(reg.installing);
      reg.addEventListener('updatefound', () => watchInstalling(reg.installing));
      // Leta efter nya versioner när appen öppnas igen och med jämna mellanrum
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
      setInterval(() => reg.update().catch(() => {}), 20 * 60 * 1000);
    })
    .catch((err) => console.warn('Service worker kunde inte registreras', err));
  // Ladda bara om när användaren själv har valt att uppdatera, inte när cachen aktiveras första gången
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested) return;
    updateRequested = false;
    location.reload();
  });
}

$('update-btn').addEventListener('click', () => {
  $('update-btn').textContent = t('Uppdaterar…');
  updateRequested = true;
  if (waitingWorker) waitingWorker.postMessage('SKIP_WAITING');
  else location.reload();
});

$('check-update').addEventListener('click', async () => {
  const btn = $('check-update');
  if (await checkApkUpdate()) {
    toast(t('En ny version av Android-appen finns.'));
    return;
  }
  if (!swReg) {
    toast(t('Uppdateringar fungerar i den installerade appen.'));
    return;
  }
  btn.disabled = true;
  btn.textContent = t('Söker…');
  try {
    await swReg.update();
    if (swReg.waiting) {
      showUpdate(swReg.waiting);
    } else if (swReg.installing) {
      toast(t('En ny version laddas ner…'));
    } else {
      toast(t('Du har den senaste versionen.'));
    }
  } catch {
    toast(t('Kunde inte söka efter uppdateringar. Är du ansluten till internet?'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('Sök efter uppdatering');
  }
});
let installPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  // Android/Chrome: visa en egen knapp i stället för webbläsarens standardruta
  e.preventDefault();
  installPrompt = e;
  $('install-btn').hidden = false;
});
$('install-btn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('install-btn').hidden = true;
});
addEventListener('appinstalled', () => ($('install-btn').hidden = true));
// Android-appen (Capacitor) lägger till "VardagsrummetApp/<byggnummer>" i webbläsarens user agent
const androidApp = navigator.userAgent.match(/VardagsrummetApp\/(\d+)/);
const appBuild = androidApp ? Number(androidApp[1]) : 0;
if (!standalone && !androidApp && /iphone|ipad|ipod/i.test(navigator.userAgent)) $('install-ios').hidden = false;
if (androidApp) {
  $('install-btn').remove();
  $('app-version').textContent += ` · Android-app ${appBuild}`;
}

// Själva Android-appen ändras sällan (spelet hämtas från webben), men när en ny APK har
// publicerats under GitHub Releases visas en banner med en länk för att ladda ner den.
const RELEASES = 'https://api.github.com/repos/Markisolering/Virtual/releases/latest';
const APK_URL = 'https://github.com/Markisolering/Virtual/releases/latest/download/Vardagsrummet.apk';
async function checkApkUpdate() {
  if (!androidApp) return false;
  try {
    const res = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return false;
    const latest = Number((await res.json()).tag_name?.match(/^app-(\d+)$/)?.[1] || 0);
    if (latest > appBuild) {
      $('apk-banner').hidden = false;
      return true;
    }
  } catch {
    // Offline eller GitHub svarar inte: försök igen nästa gång
  }
  return false;
}
$('apk-btn').addEventListener('click', () => {
  // Länkar till andra webbplatser öppnas i webbläsaren, som laddar ner och installerar APK:n
  location.href = APK_URL;
});
checkApkUpdate();

// ---------------- Huvudloop ----------------
const timer = new THREE.Timer();
timer.connect(document);
let fpsAccum = 0;
let fpsFrames = 0;
let lowFpsStrikes = 0;

function frame(now) {
  timer.update(now);
  const dt = Math.min(0.05, timer.getDelta());

  // Folk kommer och går
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = 8 + Math.random() * 14;
    if (Math.random() < 0.3) targetCount = randomTarget();
    const doorBusy = characters.some((c) => c.position.x < -4 && c.state !== 'leaving');
    if (library.list && characters.length < targetCount && !doorBusy) spawnAtDoor();
  }

  for (const c of characters) c.update(dt, simWorld);
  interactions.update(dt, simWorld);
  for (let i = characters.length - 1; i >= 0; i--) {
    const c = characters[i];
    if (c.done) {
      if (c.seat) c.seat.occupant = null;
      scene.remove(c.root);
      c.dispose();
      characters.splice(i, 1);
      if (focused === c) focused = null;
    } else if (c.state === 'leaving' && !c.announced && c.position.x < ROOM.minX + 0.2) {
      c.announced = true;
      toast(t('{name} gick.', { name: c.name }));
    }
  }

  if (editor.active) editor.update(dt);
  else if (headMode && started) updateHeadCamera(dt);
  else {
    updatePlayer(dt);
    updateZoom(dt);
    updateCamera();
  }
  updateDoor(dt);
  updateKeyLight(dt);
  scene.userData.clock?.userData.update();
  if (started && !editor.active) updateFocus();
  updateBubble();

  if (composer) composer.render(dt);
  else renderer.render(scene, camera);

  // Sänk kvaliteten automatiskt om bildfrekvensen är för låg
  if (settings.quality === 'auto' && started) {
    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum > 3) {
      const fps = fpsFrames / fpsAccum;
      fpsAccum = 0;
      fpsFrames = 0;
      if (fps < 32 && quality !== 'low') {
        if (++lowFpsStrikes >= 2) {
          quality = quality === 'high' ? 'medium' : 'low';
          lowFpsStrikes = 0;
          setupPipeline();
        }
      } else lowFpsStrikes = 0;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exponera för felsökning i konsolen
window.__game = { faceVisible, addCharacter, editor, scene, characters, player, camera, sim: simWorld, spawnAtDoor, openChat, send, library, motions: PRESETS };
