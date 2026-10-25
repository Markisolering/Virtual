import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildRoom, SPAWN, DOOR, ROOM } from './room.js';
import { Nav } from './nav.js';
import { Character, angleDiff } from './characters.js';
import { OfflineBrain, ClaudeBrain, loadSettings, saveSettings, DEFAULT_MODEL } from './dialogue.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------------- Inställningar och kvalitet ----------------
let settings = { quality: 'auto', ...loadSettings() };
const resolveQuality = (q) => (q === 'auto' ? (isTouch ? 'medium' : 'high') : q);
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
const simWorld = { nav, seats: world.seats, pois: world.pois, player, characters };

function addCharacter() {
  const c = new Character(nextId++);
  characters.push(c);
  scene.add(c.root);
  return c;
}

function spawnInside() {
  const c = addCharacter();
  const free = world.seats.filter((s) => !s.occupant);
  if (Math.random() < 0.55 && free.length) {
    const seat = free[Math.floor(Math.random() * free.length)];
    seat.occupant = c;
    c.seat = seat;
    c.position.set(seat.x, 0, seat.z);
    c.heading = seat.face;
    c.state = 'sitting';
    c.sitAmount = 1;
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

function spawnAtDoor() {
  const c = addCharacter();
  c.position.copy(SPAWN);
  c.heading = Math.PI / 2;
  c.root.rotation.y = c.heading;
  c.chooseNext(simWorld);
  toast(`${c.name} kom in.`);
}

for (let i = 0; i < 3; i++) spawnInside();
let spawnTimer = 6;
let targetCount = 4;

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
  if (chatOpen || !started) return;
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
    // Vänd blicken mot den man pratar med; lämna plats för chattpanelen
    const h = chatWith.headWorld();
    h.y -= chatWith.sitAmount * 0.42 * chatWith.scale;
    const dx = h.x - player.position.x;
    const dz = h.z - player.position.z;
    const dy = h.y - EYE;
    const landscapePanel = innerWidth > innerHeight && innerHeight <= 520;
    const wantYaw = Math.atan2(-dx, -dz) + (landscapePanel ? -0.32 : 0);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) - (landscapePanel ? 0 : 0.2);
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
      h.y -= c.sitAmount * 0.42 * c.scale + 0.25;
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
    h.y += 0.28 - best.sitAmount * 0.42 * best.scale;
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

// ---------------- Chatt ----------------
let chatOpen = false;
let chatWith = null;
let busy = false;
let leaveAfterChat = false;
const offline = new OfflineBrain();
const chatEl = $('chat');
const log = $('chat-log');
const QUICK = ['Hej!', 'Vad heter du?', 'Hur mår du?', 'Vad jobbar du med?', 'Varför är du här?', 'Berätta något om dig', 'Vad gillar du att göra?', 'Hej då!'];

function addMsg(text, who) {
  const m = document.createElement('div');
  m.className = `msg ${who}`;
  m.textContent = text;
  log.appendChild(m);
  log.scrollTop = log.scrollHeight;
  return m;
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
  log.innerHTML = '';
  if (c.transcript?.length) {
    for (const [t, w] of c.transcript) addMsg(t, w);
    addMsg('…', 'sys');
  }
  c.transcript ||= [];
  const greet = offline.reply(c, 'hej', simWorld).text;
  c.greeting = greet;
  say(c, greet);
  const quick = $('chat-quick');
  quick.innerHTML = '';
  for (const q of QUICK) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = q;
    b.addEventListener('click', () => send(q));
    quick.appendChild(b);
  }
  chatEl.hidden = false;
  talkBtn.hidden = true;
  focusLabel.classList.remove('show');
  if (!isTouch) $('chat-input').focus();
}

function say(c, text, el) {
  if (el) el.textContent = text;
  else addMsg(text, 'them');
  c.transcript.push([text, 'them']);
  c.speaking = Math.min(6, 0.6 + text.length * 0.055);
}

function closeChat() {
  if (!chatOpen) return;
  chatOpen = false;
  chatEl.hidden = true;
  $('chat-input').blur();
  const c = chatWith;
  chatWith = null;
  if (!c) return;
  c.talking = false;
  c.speaking = 0;
  if (leaveAfterChat && characters.includes(c)) {
    c.stay = 0;
    if (c.state === 'sitting' || c.state === 'sittingDown') c.state = 'standingUp';
    else if (c.state !== 'leaving') c.chooseNext(simWorld);
  }
}

async function send(text) {
  text = text.trim();
  if (!text || busy || !chatWith) return;
  const c = chatWith;
  busy = true;
  addMsg(text, 'me');
  c.transcript.push([text, 'me']);
  $('chat-input').value = '';
  const bubble = addMsg('', 'them typing');
  let result;
  if (settings.apiKey) {
    try {
      const brain = new ClaudeBrain(settings);
      result = await brain.reply(c, text, simWorld, (partial) => {
        bubble.classList.remove('typing');
        bubble.textContent = partial;
        c.speaking = 1.2;
        log.scrollTop = log.scrollHeight;
      });
    } catch (err) {
      // Ta bort det obesvarade meddelandet så att historiken inte får två användarturer i rad
      if (c.history.at(-1)?.role === 'user') c.history.pop();
      console.error(err);
      const status = err?.status ? ` (${err.status})` : '';
      addMsg(`Kunde inte nå Claude${status}. Den inbyggda samtalsmotorn svarar i stället.`, 'sys');
      result = null;
    }
  }
  if (!result) {
    await new Promise((r) => setTimeout(r, 450 + Math.random() * 600));
    result = offline.reply(c, text, simWorld);
  }
  bubble.classList.remove('typing');
  if (chatWith === c) {
    say(c, result.text || '…', bubble);
  }
  busy = false;
  if (result.leave) {
    leaveAfterChat = true;
    setTimeout(() => chatWith === c && closeChat(), 1600);
  }
}

$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  send($('chat-input').value);
});
$('chat-close').addEventListener('click', closeChat);

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
$('start-btn').addEventListener('click', async () => {
  $('start').hidden = true;
  $('hud').hidden = false;
  started = true;
  if (isTouch && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      // Helskärm stöds inte överallt (t.ex. iOS Safari) – spelet fungerar ändå
    }
  }
});

function openSettings() {
  $('set-quality').value = settings.quality || 'auto';
  $('set-key').value = settings.apiKey || '';
  $('set-model').value = settings.model || DEFAULT_MODEL;
  $('settings').hidden = false;
}
$('start-settings').addEventListener('click', openSettings);
$('settings-btn').addEventListener('click', () => {
  closeChat();
  openSettings();
});
$('set-cancel').addEventListener('click', () => ($('settings').hidden = true));
$('set-save').addEventListener('click', () => {
  settings = {
    quality: $('set-quality').value,
    apiKey: $('set-key').value.trim(),
    model: $('set-model').value,
  };
  saveSettings(settings);
  const q = resolveQuality(settings.quality);
  if (q !== quality) {
    quality = q;
    setupPipeline();
  }
  $('settings').hidden = true;
  toast(settings.apiKey ? 'AI-samtal är på.' : 'Inbyggd samtalsmotor används.');
});

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
    if (Math.random() < 0.3) targetCount = 2 + Math.floor(Math.random() * 4);
    const doorBusy = characters.some((c) => c.position.x < -4 && c.state !== 'leaving');
    if (characters.length < targetCount && !doorBusy) spawnAtDoor();
  }

  for (const c of characters) c.update(dt, simWorld);
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

  updatePlayer(dt);
  updateCamera();
  updateDoor(dt);
  scene.userData.clock?.userData.update();
  if (started) updateFocus();

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
window.__game = { scene, characters, player, camera, addCharacter, sim: simWorld };
