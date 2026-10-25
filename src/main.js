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
import { parseCommand, commandReply } from './commands.js';
import { PRESETS, findMotion, motionTitle } from './motion.js';
import { voice } from './voice.js';

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
  handsFree: false,
  voiceName: '',
  voiceRate: 1,
  ...loadSettings(),
};
library.filter = settings.show;
// Närbild: en eller två personer åt gången, detaljerade modeller med ansiktsuttryck och högsta grafikkvalitet
const closeup = settings.mode === 'closeup';
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
  camera.fov = Math.min(95, Math.max(58, vfov));
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
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.35, 2.2));
  composer.addPass(new OutputPass());
}
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
const simWorld = { nav, seats: world.seats, pois: world.pois, player, characters, interactions };

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
    toast(`${c.name} kom in.`);
  } catch (err) {
    console.error('Kunde inte ladda en person', err);
  } finally {
    nextEntry = library.pickEntry();
    library.model(nextEntry.id).catch(() => {});
    spawning = false;
  }
}

let spawnTimer = 6;
const randomTarget = () => (closeup ? 1 + (Math.random() < 0.5 ? 1 : 0) : 2 + Math.floor(Math.random() * 4));
let targetCount = closeup ? 2 : 4;

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
    toast(`Gå närmare för att prata med ${c.name}.`);
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
      focusLabel.querySelector('.hint').textContent = isTouch ? 'Tryck för att prata' : 'Tryck E för att prata';
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
const QUICK = ['Hej!', 'Vad heter du?', 'Sätt dig i soffan', 'Följ mig', 'Dansa!', 'Kom hit', 'Gå till köket', 'Vinka', 'Hur mår du?', 'Vad jobbar du med?', 'Berätta något om dig', 'Hej då!'];
const PLACEHOLDER = 'Säg något eller be om något…';
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
  $('chat-sub').textContent = `${c.persona.age} år · ${c.persona.job}${settings.apiKey ? ' · AI-samtal' : ''}`;
  $('talk-input').placeholder = `Säg något till ${c.persona.firstName}…`;
  log.innerHTML = '';
  if (c.transcript?.length) {
    for (const [t, w] of c.transcript) addMsg(t, w);
    addMsg('…', 'sys');
  }
  showHeard('');
  c.transcript ||= [];
  if (!c.memory.met) c.wave();
  const hello = offline.reply(c, 'hej', simWorld);
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
  say(c, greet).then(() => afterReply(c));
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
    const talk = () => {
      c.speakText(text);
      c.speaking = 30; // munnen rör sig tills rösten är klar
    };
    talk();
    await voice.speak(text, { rate: settings.voiceRate || 1, pitch, voiceId: settings.voiceName || '', onStart: talk });
    c.speaking = 0;
    releaseBubble(2.5);
  } else {
    const d = c.speakText(text);
    releaseBubble(Math.max(4, d + 2.5));
    await wait(d * 1000);
  }
}

// Handsfree: lyssna igen när personen har svarat
function afterReply(c) {
  if (chatOpen && chatWith === c && settings.handsFree && settings.mic !== false && voice.canListen() && !voice.listening) startListening();
}

function closeChat() {
  if (!chatOpen) return;
  chatOpen = false;
  chatEl.hidden = true;
  talkbar.hidden = true;
  bubbleEl.hidden = true;
  showHeard('');
  voice.stopListening();
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
      addMsg(`Kunde inte nå Claude${detail}. Den inbyggda samtalsmotorn svarar i stället.`, 'sys');
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
      toast(`${c.name} följer efter dig. Säg "stanna" för att få ${c.persona.pronoun === 'hon' ? 'henne' : c.persona.pronoun === 'han' ? 'honom' : 'hen'} att sluta.`);
    });
  } else {
    spoken.then(() => afterReply(c));
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
    $('talk-input').placeholder = chatWith ? `Säg något till ${chatWith.persona.firstName}…` : PLACEHOLDER;
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

// ---- Prata in med rösten ----
function setMicState(on) {
  for (const b of document.querySelectorAll('.mic-btn')) b.classList.toggle('listening', on);
}
function updateMicButtons() {
  const show = settings.mic !== false && voice.canListen();
  for (const b of document.querySelectorAll('.mic-btn')) b.hidden = !show;
}
function startListening() {
  if (voice.listening) {
    voice.stopListening();
    return;
  }
  if (!voice.canListen()) {
    toast('Röstinmatning stöds inte i den här webbläsaren.');
    return;
  }
  voice.cancel(); // tysta personen om hen pratar
  setMicState(true);
  // I redigeraren skrivs det man säger in som förklaring
  const editing = editor.active;
  const field = editing ? $('pose-note') : activeInput();
  voice.listen({
    onPartial: (t) => {
      field.value = t;
      if (compactView() && !editing) showHeard(t, true);
    },
    onEnd: (t) => {
      setMicState(false);
      if (editing) {
        if (t) field.value = t;
        return;
      }
      if (!t) {
        showHeard('');
        return;
      }
      if (settings.autoSend !== false) {
        field.value = '';
        submitText(t);
      } else {
        field.value = t;
        showHeard('');
        field.focus();
      }
    },
    onError: (e) => {
      setMicState(false);
      showHeard('');
      toast(/not-allowed|denied|permission/i.test(e) ? 'Appen får inte använda mikrofonen. Tillåt det i telefonens inställningar.' : `Kunde inte lyssna (${e}).`);
    },
  });
}
for (const b of document.querySelectorAll('.mic-btn')) b.addEventListener('click', startListening);

// ---------------- Betyg på rörelser ----------------
// Ett litet kort med rörelsens namn och 👍/👎: i chattrutan, eller flytande ovanför raden i den kompakta vyn.
let feedbackFor = null;
const PROBLEMS = ['Fel position', 'För snabb', 'För långsam', 'För stel', 'Helt fel rörelse'];
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
const ADJUST = ['Mer', 'Mindre', 'Snabbare', 'Långsammare', 'Håll posen längre'];

function ratingCard(c, name) {
  const card = document.createElement('div');
  card.className = 'rate';
  const label = motionTitle(name);
  const buttons = () => {
    card.innerHTML = `<span>Hur blev <b></b>?</span><div class="rate-buttons">
      <button type="button" data-v="up" aria-label="Bra">👍</button>
      <button type="button" data-v="close" aria-label="Nästan, åt rätt håll">↗️ Nästan</button>
      <button type="button" data-v="down" aria-label="Dålig">👎</button>
      <button type="button" data-v="again" aria-label="Gör igen">🔁 Igen</button>
      <button type="button" data-v="show" aria-label="Visa själv hur den ska se ut">✋ Visa</button></div>`;
    card.querySelector('b').textContent = label;
    card.querySelector('[data-v="up"]').addEventListener('click', () => {
      done(`👍 Tack! "${label}" blir en förebild för nya rörelser.`);
      giveFeedback(name, 'up', null, c);
    });
    card.querySelector('[data-v="close"]').addEventListener('click', () => ask('close', 'Vad ska justeras?', ADJUST, '↗️'));
    card.querySelector('[data-v="down"]').addEventListener('click', () => ask('down', 'Vad var fel?', PROBLEMS, '👎'));
    // Gör rörelsen en gång till direkt, utan att fråga AI:n
    card.querySelector('[data-v="again"]').addEventListener('click', () => {
      const def = findMotion(name);
      if (!def || !characters.includes(c)) {
        toast('Personen är inte kvar i rummet.');
        return;
      }
      c.command({ action: 'rorelse', motion: def, name }, simWorld);
      armHide(30000);
    });
    // Frys rörelsen och flytta kroppsdelarna själv
    card.querySelector('[data-v="show"]').addEventListener('click', () => {
      if (openEditor(c, name)) done('✋ Visa hur det ska se ut …');
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
    for (const p of ['Inget särskilt', ...options, 'Annat…', '← Tillbaka']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p;
      b.addEventListener('click', () => {
        if (p === '← Tillbaka') {
          buttons();
          return;
        }
        if (p === 'Annat…') {
          done(`${icon} Skriv eller säg vad som ska bli annorlunda.`);
          feedbackFor = { name, c, grade };
          if (!chatOpen && characters.includes(c)) openChat(c);
          activeInput().placeholder = `Vad ska ändras i "${label}"?`;
          activeInput().focus();
          return;
        }
        done(`${icon} ${p}`);
        giveFeedback(name, grade, p === 'Inget särskilt' ? null : p.toLowerCase(), c);
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
    updateLessons(settings, name, 'close', correction.note, correction).then((lessons) => lessons && toast(`Lärdomarna är uppdaterade utifrån din rättelse (${lessons.length} st).`));
    toast(`Sparat! "${motionTitle(name)}" görs nu som du visade.`);
    if (!characters.includes(c)) return;
    c.command({ action: 'rorelse', motion: def, name }, simWorld);
    setTimeout(() => characters.includes(c) && addRating(c, name), 600);
  },
});

function openEditor(c, name) {
  const def = findMotion(name);
  if (!def || !characters.includes(c) || c.state === 'leaving') {
    toast('Personen är inte kvar i rummet.');
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
  updateLessons(settings, name, grade, note).then((lessons) => lessons && toast(`Lärdomarna om rörelser är uppdaterade (${lessons.length} st).`));
  if (grade === 'up') return;
  if (settings.apiKey && c && characters.includes(c)) {
    // Be personen göra om rörelsen direkt (samtalet öppnas igen om det var stängt)
    const ask =
      grade === 'close'
        ? `Rörelsen "${label}" var nästan bra och åt rätt håll${note ? ` – ${note}` : ''}. Behåll det som var bra, justera bara det och gör om den.`
        : `Rörelsen "${label}" blev inte bra${note ? `: ${note}` : ''}. Gör om den bättre.`;
    if (!chatOpen) openChat(c);
    if (chatWith === c) setTimeout(() => send(ask), chatWith.memory.met ? 300 : 1200);
  } else if (!settings.apiKey) {
    toast('Tack för betyget! Med AI-samtal påslaget kan personen göra om rörelsen och lära sig av det.');
  }
}

// ---------------- Vilka som syns ----------------
const SHOW_TEXT = { all: 'Alla får komma in.', f: 'Nu kommer bara kvinnor in.', m: 'Nu kommer bara män in.' };

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
  toast(`${SHOW_TEXT[settings.show]}${leaving ? ' De andra går nu.' : ''}`);
}

// ---------------- Toast ----------------
let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
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
startBtn.disabled = true;
startBtn.textContent = 'Laddar personer…';
library
  .init((p) => (startBtn.textContent = `Laddar personer… ${Math.round(p * 100)} %`))
  .then(async () => {
    await Promise.all(library.initial.map((e) => spawnInside(e)));
    nextEntry = library.pickEntry();
    library.model(nextEntry.id).catch(() => {});
    startBtn.disabled = false;
    startBtn.textContent = 'Gå in';
  })
  .catch((err) => {
    console.error(err);
    startBtn.textContent = 'Kunde inte ladda. Försök igen';
    startBtn.disabled = false;
    startBtn.onclick = () => location.reload();
  });

startBtn.addEventListener('click', async () => {
  if (!library.list || !characters.length) return;
  $('start').hidden = true;
  $('hud').hidden = false;
  started = true;
  if (isTouch && !androidApp && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      // Helskärm stöds inte överallt (t.ex. iOS Safari) – spelet fungerar ändå
    }
  }
});

function openSettings() {
  $('set-quality').value = settings.quality || 'auto';
  $('set-show').value = settings.show || 'all';
  $('set-mode').value = settings.mode || 'room';
  $('set-key').value = settings.apiKey || '';
  $('set-model').value = settings.model || DEFAULT_MODEL;
  $('set-view').value = settings.view || 'compact';
  $('set-reply').value = settings.replyMode || 'both';
  $('set-mic').checked = settings.mic !== false;
  $('set-autosend').checked = settings.autoSend !== false;
  $('set-handsfree').checked = !!settings.handsFree;
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
  sel.innerHTML = '<option value="">Automatisk</option>';
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
  voice.speak('Hej! Så här låter jag när jag pratar med dig.', { rate: Number($('set-rate').value), voiceId: $('set-voice').value });
});

// Vad personerna har lärt sig, i inställningarna
function fillLearning() {
  const n = learnedCount();
  $('learn-summary').textContent = `Inlärda rörelser: ${n.motions} · betygsatta: ${n.rated} · lärdomar: ${n.lessons}`;
  const ul = $('learn-lessons');
  ul.innerHTML = '';
  for (const l of motionLessons()) {
    const li = document.createElement('li');
    li.textContent = l;
    ul.appendChild(li);
  }
  if (!ul.children.length) ul.innerHTML = '<li>Inga lärdomar ännu. Betygsätt rörelser i chatten så samlas de här.</li>';
}
$('learn-reset').addEventListener('click', () => {
  if (!confirm('Glömma alla inlärda rörelser, betyg och lärdomar?')) return;
  resetLearning();
  fillLearning();
  toast('Allt inlärt om rörelser är borttaget.');
});
$('set-save').addEventListener('click', () => {
  const prevShow = settings.show;
  const prevMode = settings.mode;
  settings = {
    mode: $('set-mode').value,
    quality: $('set-quality').value,
    show: $('set-show').value,
    apiKey: $('set-key').value.trim(),
    model: $('set-model').value,
    view: $('set-view').value,
    replyMode: $('set-reply').value,
    mic: $('set-mic').checked,
    autoSend: $('set-autosend').checked,
    handsFree: $('set-handsfree').checked,
    voiceName: $('set-voice').value,
    voiceRate: Number($('set-rate').value),
  };
  saveSettings(settings);
  // Läget avgör vilka modeller som laddas, så appen startas om
  if (settings.mode !== prevMode) {
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
  else toast(settings.apiKey ? 'AI-samtal är på.' : 'Inbyggd samtalsmotor används.');
});

// ---------------- App-installation ----------------
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;

// ---------------- Uppdateringar ----------------
// Varje publicering ger en ny service worker. När den har laddats ner visas en banner, och
// först när man trycker på "Uppdatera" tar den nya versionen över och sidan laddas om.
$('app-version').textContent = `Version ${__APP_VERSION__}`;
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
  $('update-btn').textContent = 'Uppdaterar…';
  updateRequested = true;
  if (waitingWorker) waitingWorker.postMessage('SKIP_WAITING');
  else location.reload();
});

$('check-update').addEventListener('click', async () => {
  const btn = $('check-update');
  if (await checkApkUpdate()) {
    toast('En ny version av Android-appen finns.');
    return;
  }
  if (!swReg) {
    toast('Uppdateringar fungerar i den installerade appen.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Söker…';
  try {
    await swReg.update();
    if (swReg.waiting) {
      showUpdate(swReg.waiting);
    } else if (swReg.installing) {
      toast('En ny version laddas ner…');
    } else {
      toast('Du har den senaste versionen.');
    }
  } catch {
    toast('Kunde inte söka efter uppdateringar. Är du ansluten till internet?');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sök efter uppdatering';
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
      toast(`${c.name} gick.`);
    }
  }

  if (editor.active) editor.update(dt);
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
window.__game = { editor, scene, characters, player, camera, sim: simWorld, spawnAtDoor, openChat, send, library, motions: PRESETS };
