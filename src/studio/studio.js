import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Character, library, EXPRESSIONS } from '../characters.js';
import { loadSettings, saveSettings } from '../dialogue.js';
import { voice, speakable } from '../voice.js';
import { subdivide, curvature } from './subdivide.js';
import { makeSkinMaterial, sampleSkinTone, skinParams } from './skin.js';
import { cutEyes, buildEye } from './eyes.js';
import { makeHairMaterial } from './hair.js';
import { loadScanHead } from './scanhead.js';
import { t, locale, translateDom } from '../i18n.js';

// Huvudstudion: ett separat testläge med en egen renderare för så realistiska huvuden som möjligt.
// Inget rum, bara ett huvud i ett fotostudioljus. Allt som förbättrar huvudet kan slås av och på
// för att jämföra: fler polygoner (subdivision), hud med ljusspridning och porer, riktiga ögon med
// bruten iris, hår med längsgående glans, mjuka skuggor, ljusinställningar och kantutjämning.

const $ = (id) => document.getElementById(id);
const settings = { ...loadSettings() };
// model: 'scan' = skannat huvud (ICT-FaceKit), 'game' = spelets närbildsmodeller
const opts = { model: settings.studioModel === 'game' ? 'game' : 'scan', level: 2, skin: true, eyes: true, hair: true, light: 'studio', ao: true };

// ---------------- Renderare ----------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
let dpr = Math.min(devicePixelRatio, 2);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, innerWidth / innerHeight, 0.02, 30);

// Bakgrund: grå studiobakgrund som mörknar mot kanterna
const backdrop = new THREE.Mesh(
  new THREE.SphereGeometry(12, 48, 32),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#3b3a3c') }, bottom: { value: new THREE.Color('#121113') } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vDir;
      void main() {
        float f = smoothstep(-0.3, 0.6, vDir.y) * (0.65 + 0.35 * smoothstep(-1.0, 0.2, vDir.z));
        gl_FragColor = vec4(mix(bottom, top, f), 1.0);
      }`,
  }),
);
scene.add(backdrop);

// Miljöljus: en mörk studio med mjuka ljuslådor, som reflexer i ögon och hud
function studioEnvironment() {
  const env = new THREE.Scene();
  env.background = new THREE.Color('#0c0b0c');
  const box = (w, h, color, intensity, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(2.2, 1.6, '#fff4e8', 5, -2.2, 1.6, 2.6); // huvudljusets låda
  box(2.6, 1.2, '#dfe8ff', 1.4, 2.6, 0.4, 2.2); // fylljus
  box(0.8, 2.8, '#ffffff', 3, 1.8, 1.2, -2.6); // kantljus
  box(6, 1, '#2a2522', 1, 0, -2.5, 0); // golv
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}
scene.environment = studioEnvironment();
scene.environmentIntensity = 0.55;

// Ljus: huvudljus (mjuka skuggor), fylljus och kantljus
const key = new THREE.SpotLight('#fff1e0', 30, 8, 0.5, 0.85, 2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 7;
key.shadow.blurSamples = 16;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.004;
key.shadow.camera.near = 0.3;
key.shadow.camera.far = 6;
const fill = new THREE.SpotLight('#dfe7ff', 4, 8, 0.8, 1, 2);
const rim = new THREE.SpotLight('#ffffff', 22, 8, 0.45, 0.7, 2);
const bounce = new THREE.HemisphereLight('#cfc6bd', '#2a2420', 0.25);
scene.add(key, key.target, fill, fill.target, rim, rim.target, bounce);

// Ljusinställningar: [huvudljus: sida, höjd, fram, styrka, färg], fyll, kant, miljö
const LIGHTS = {
  studio: { key: [-0.9, 0.6, 1.2, 30, '#fff1e0'], fill: [1.1, 0.0, 1.1, 4, '#dfe7ff'], rim: [0.8, 0.7, -1.1, 22, '#ffffff'], env: 0.55 },
  fonster: { key: [-1.6, 0.2, 0.5, 40, '#eef3ff'], fill: [1.2, 0.1, 1.0, 2.5, '#ffe9d6'], rim: [0.9, 0.5, -1.0, 8, '#fff6ea'], env: 0.8 },
  dramatisk: { key: [-1.4, 0.4, 0.2, 45, '#ffe6c8'], fill: [1.2, 0.0, 1.0, 0.6, '#c8d6ff'], rim: [1.0, 0.8, -1.0, 35, '#bcd2ff'], env: 0.25 },
  kvall: { key: [-0.8, 0.1, 1.0, 22, '#ffc78f'], fill: [1.0, 0.2, 1.0, 1.5, '#8fa6ff'], rim: [-0.9, 0.7, -1.0, 28, '#6f8dff'], env: 0.3 },
};

function placeLights(head) {
  const p = LIGHTS[opts.light];
  for (const [light, [x, y, z, intensity, color]] of [
    [key, p.key],
    [fill, p.fill],
    [rim, p.rim],
  ]) {
    light.position.set(head.x + x, head.y + y, head.z + z);
    light.target.position.copy(head);
    light.intensity = intensity * (opts.model === 'scan' ? 0.4 : 1);
    light.color.set(color);
  }
  scene.environmentIntensity = p.env * (opts.model === 'scan' ? 0.6 : 1);
  // Det skannade huvudets hudfärger är fysikaliskt rimliga (verklig reflektans); spelets texturer har
  // inbakade skuggor och tål starkare ljus
  renderer.toneMappingExposure = opts.model === 'scan' ? 0.9 : 0.82;
  // Neutral tonmappning behåller hudens färgmättnad bättre än AgX
  renderer.toneMapping = opts.model === 'scan' ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
}

// ---------------- Efterbehandling ----------------
const FILM = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float amount; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      // Lite färgförskjutning mot kanterna (som i ett objektiv), vinjett och filmkorn
      vec2 o = (vUv - 0.5) * 0.0025 * amount;
      vec3 c = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
      float d = distance(vUv, vec2(0.5));
      c *= mix(1.0, 0.7, smoothstep(0.3, 0.85, d) * amount);
      c += (hash(vUv * 1000.0) - 0.5) * 0.022 * amount;
      gl_FragColor = vec4(c, 1.0);
    }`,
};
let composer;
let ao;
let film;
function setupPipeline() {
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  composer?.dispose();
  const rt = new THREE.WebGLRenderTarget(innerWidth * dpr, innerHeight * dpr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  ao.updateGtaoMaterial({ radius: 0.06, distanceExponent: 1.4, thickness: 0.4, scale: 1.2, samples: 16 });
  ao.blendIntensity = 0.9;
  ao.enabled = opts.ao;
  composer.addPass(ao);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.12, 0.4, 0.92));
  composer.addPass(new OutputPass());
  film = new ShaderPass(FILM);
  composer.addPass(film);
}

function fit() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 30 : 22;
  camera.updateProjectionMatrix();
  setupPipeline();
}
addEventListener('resize', fit);

// ---------------- Personen ----------------
const player = { position: new THREE.Vector3(0, 0, 1), headPos: new THREE.Vector3() };
let person = null;
let world = null;
const original = new Map(); // nät -> { geometry, material }
const cache = new Map(); // nät + nivå -> geometri

function meshesOf(c) {
  const list = [];
  c.visual.traverse((o) => o.isSkinnedMesh && list.push(o));
  return list;
}

// ---------------- Skannat huvud ----------------
let scan = null;
let scanLoading = null;
async function newScanPerson() {
  status(t('Skapar en ny person…'));
  await new Promise((r) => setTimeout(r, 30));
  if (!scan) {
    scanLoading ||= loadScanHead();
    scan = await scanLoading;
    scene.add(scan.root);
  }
  if (person) person.root.visible = false;
  scan.root.visible = true;
  await scan.newPerson(renderer);
  cam.ready = false;
  status('');
  updateInfo();
}

function showModel() {
  if (opts.model === 'scan') return newScanPerson();
  if (scan) scan.root.visible = false;
  if (person) {
    person.root.visible = true;
    return applyOptions();
  }
  return loadPerson(library.pickEntry());
}

async function loadPerson(entry) {
  status(t('Laddar person…'));
  const asset = await library.create(entry);
  const c = new Character(Date.now() % 1000, asset);
  if (!c.bones.eyes.length) {
    // Personer utan synligt ansikte (t.ex. burka) passar inte i studion
    library.release(asset.entry.id);
    library.skip.add(asset.entry.id);
    return loadPerson(library.pickEntry());
  }
  if (person) {
    scene.remove(person.root);
    person.dispose();
  }
  original.clear();
  cache.clear();
  person = c;
  if (scan) scan.root.visible = false;
  c.position.set(0, 0, 0);
  c.heading = 0;
  c.root.rotation.y = 0;
  c.state = 'idle';
  c.timer = 1e9;
  c.holdUntil = 1e9;
  c.stay = 1e9;
  c.talking = true;
  world = { player, characters: [c], seats: [], pois: [], beds: [], solids: [], nav: null };
  scene.add(c.root);
  for (const m of meshesOf(c)) original.set(m, { geometry: m.geometry, material: m.material });
  c.root.updateMatrixWorld(true);
  await applyOptions();
  status('');
}

// Bygg huvudet enligt inställningarna (polygoner, hud, ögon, hår)
async function applyOptions() {
  const c = person;
  if (!c || opts.model === 'scan') return;
  status(t('Räknar fram huvudet…'));
  await new Promise((r) => setTimeout(r, 30));
  // Ta bort tidigare ögon
  for (const b of c.bones.eyes) for (const ch of [...b.children]) if (ch.name === 'studio-eye') b.remove(ch);
  const meshes = meshesOf(c);
  const head = meshes.find((m) => /head/i.test(m.material.name)) || meshes[0];
  const tone = sampleSkinTone(original.get(head)?.material.map ? Object.assign(Object.create(head), { material: original.get(head).material, geometry: original.get(head).geometry }) : head);
  for (const m of meshes) {
    const orig = original.get(m);
    const hair = /opacity|hair|lash/i.test(orig.material.name);
    const isHead = m === head;
    // Geometri: ögonen bort (ersätts) och förtätning
    const level = hair ? 0 : isHead ? opts.level : Math.min(1, opts.level);
    const cutKey = isHead && opts.eyes;
    const k = `${m.uuid}:${level}:${cutKey}`;
    if (!cache.has(k)) {
      let g = orig.geometry.clone();
      if (cutKey) {
        const tmp = Object.assign(Object.create(m), { geometry: g });
        const eyes = cutEyes(tmp, ['Bip01_LEye', 'Bip01_REye']);
        cache.set(`${m.uuid}:eyes`, eyes);
        if (!eyes) g = orig.geometry.clone();
      }
      if (level > 0) g = subdivide(g, level);
      if (!hair) curvature(g.attributes.normal ? g : (g.computeVertexNormals(), g));
      cache.set(k, g);
    }
    m.geometry = cache.get(k);
    // Material
    if (hair) m.material = opts.hair ? makeHairMaterial(orig.material) : orig.material;
    else m.material = opts.skin ? makeSkinMaterial(orig.material, tone) : orig.material;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    if (isHead && opts.eyes) {
      const eyes = cache.get(`${m.uuid}:eyes`);
      if (eyes) eyes.forEach((eye, i) => buildEye(Object.assign(Object.create(m), { geometry: orig.geometry }), eye, c.eyeForward[i], orig.material).castShadow = false);
    }
  }
  status('');
  updateInfo();
}

// ---------------- Kamera ----------------
const cam = { yaw: 0.25, pitch: 0.05, dist: 0.85, target: new THREE.Vector3(), ready: false };
function updateCamera(dt) {
  const useScan = opts.model === 'scan' && scan;
  if (!useScan && !person) return;
  const head = useScan ? scan.root.localToWorld(new THREE.Vector3(0, 0.035, 0.02)) : person.headWorld();
  const aim = useScan ? head.clone() : head.clone().add(new THREE.Vector3(0, 0.07, 0));
  if (!cam.ready) {
    cam.target.copy(aim);
    cam.ready = true;
  }
  cam.target.lerp(aim, Math.min(1, dt * 3));
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
  );
  camera.lookAt(cam.target.x, cam.target.y - 0.02 * cam.dist, cam.target.z);
  player.headPos.copy(camera.position);
  player.position.set(camera.position.x, 0, camera.position.z);
  placeLights(head);
}

{
  const pts = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) {
      cam.yaw -= (e.clientX - p.x) * 0.006;
      cam.pitch = Math.max(-0.5, Math.min(0.7, cam.pitch + (e.clientY - p.y) * 0.004));
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX;
      p.y = e.clientY;
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      cam.dist = Math.max(0.22, Math.min(2, cam.dist * (before / Math.max(1, after))));
      return;
    }
    p.x = e.clientX;
    p.y = e.clientY;
  });
  const up = (e) => pts.delete(e.pointerId);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => (cam.dist = Math.max(0.22, Math.min(2, cam.dist * (e.deltaY > 0 ? 1.08 : 0.92)))), { passive: true });
}

// ---------------- Gränssnitt ----------------
function buildUi() {
  for (const id of ['start', 'hud', 'chat', 'talkbar']) $(id) && ($(id).hidden = true);
  const ui = document.createElement('div');
  ui.id = 'studio';
  ui.innerHTML = `
    <div class="studio-top">
      <button type="button" id="studio-back" aria-label="Tillbaka">←</button>
      <span>Huvudstudio <small>test</small></span>
      <button type="button" id="studio-next" aria-label="Ny person">🔄</button>
      <button type="button" id="studio-panel-btn" aria-label="Inställningar">⚙︎</button>
    </div>
    <div class="studio-panel" id="studio-panel" hidden>
      <label>Modell
        <select id="st-model"><option value="scan">Skannat huvud (ICT-FaceKit)</option><option value="game">Spelets personer (Rocketbox)</option></select>
      </label>
      <label>Polygoner
        <select id="st-level"><option value="0">Original</option><option value="1">×4</option><option value="2">×16 (max)</option></select>
      </label>
      <label class="check"><input type="checkbox" id="st-skin" /> Hud: ljusspridning, porer och två glanslager</label>
      <label>Ljusspridning <input type="range" id="st-scatter" min="0" max="2" step="0.05" /></label>
      <label>Porer <input type="range" id="st-pores" min="0" max="1" step="0.05" /></label>
      <label class="check"><input type="checkbox" id="st-eyes" /> Ögon: hornhinna, bruten iris och skuggor</label>
      <label class="check"><input type="checkbox" id="st-hair" /> Hår: längsgående glans och mjuka kanter</label>
      <label class="check"><input type="checkbox" id="st-ao" /> Kontaktskuggor (ambient occlusion)</label>
      <label>Ljus
        <select id="st-light"><option value="studio">Studio</option><option value="fonster">Fönsterljus</option><option value="dramatisk">Dramatiskt</option><option value="kvall">Kväll</option></select>
      </label>
      <button type="button" id="st-compare">Håll in för att jämföra med originalet</button>
      <p class="studio-info" id="studio-info"></p>
    </div>
    <div class="studio-status" id="studio-status"></div>
    <div class="studio-bottom">
      <div class="studio-chips" id="studio-chips"></div>
      <form id="studio-say"><input type="text" id="studio-text" placeholder="Skriv något som personen ska säga…" enterkeyhint="send" /><button type="submit">🔊</button></form>
    </div>
    <div class="studio-update" id="studio-update" hidden><span>En ny version finns.</span><button type="button" id="studio-update-btn">Uppdatera</button></div>`;
  document.body.appendChild(ui);
  translateDom(ui);
  document.body.classList.add('studio-mode');

  $('studio-back').onclick = () => {
    saveSettings({ ...loadSettings(), mode: 'head' });
    location.reload();
  };
  $('studio-next').onclick = () => (opts.model === 'scan' ? newScanPerson() : loadPerson(library.pickEntry())).catch((e) => status(t('Kunde inte ladda: {error}', { error: e.message })));
  $('st-model').value = opts.model;
  const gameOnly = ['st-level', 'st-eyes', 'st-hair', 'st-compare'].map((id) => $(id).closest('label') || $(id));
  const showGameOnly = () => gameOnly.forEach((el) => (el.hidden = opts.model === 'scan'));
  showGameOnly();
  $('st-model').onchange = (e) => {
    opts.model = e.target.value;
    saveSettings({ ...loadSettings(), studioModel: opts.model });
    showGameOnly();
    cam.ready = false;
    showModel().catch((err) => status(t('Kunde inte ladda: {error}', { error: err.message })));
  };
  $('studio-panel-btn').onclick = () => ($('studio-panel').hidden = !$('studio-panel').hidden);
  $('st-level').value = String(opts.level);
  $('st-skin').checked = opts.skin;
  $('st-eyes').checked = opts.eyes;
  $('st-hair').checked = opts.hair;
  $('st-ao').checked = opts.ao;
  $('st-light').value = opts.light;
  $('st-scatter').value = '1';
  $('st-pores').value = String(skinParams.detail.value);
  const rebuild = () => applyOptions();
  $('st-level').onchange = (e) => {
    opts.level = Number(e.target.value);
    rebuild();
  };
  $('st-skin').onchange = (e) => {
    opts.skin = e.target.checked;
    rebuild();
  };
  $('st-eyes').onchange = (e) => {
    opts.eyes = e.target.checked;
    rebuild();
  };
  $('st-hair').onchange = (e) => {
    opts.hair = e.target.checked;
    rebuild();
  };
  $('st-ao').onchange = (e) => {
    opts.ao = e.target.checked;
    ao.enabled = opts.ao;
  };
  $('st-light').onchange = (e) => (opts.light = e.target.value);
  const base = skinParams.scatter.value.clone();
  $('st-scatter').oninput = (e) => skinParams.scatter.value.copy(base).multiplyScalar(Number(e.target.value));
  $('st-pores').oninput = (e) => {
    skinParams.detail.value = Number(e.target.value);
    scan?.materials.skin?.normalScale.setScalar(skinParams.detail.value / 0.35);
  };
  // Jämför: håll in för att se originalet
  const compare = $('st-compare');
  let saved = null;
  const down = () => {
    saved = { ...opts };
    Object.assign(opts, { level: 0, skin: false, eyes: false, hair: false });
    film.uniforms.amount.value = 0;
    applyOptions();
  };
  const upCompare = () => {
    if (!saved) return;
    Object.assign(opts, saved);
    saved = null;
    film.uniforms.amount.value = 1;
    applyOptions();
  };
  compare.addEventListener('pointerdown', down);
  compare.addEventListener('pointerup', upCompare);
  compare.addEventListener('pointerleave', upCompare);

  // Uttryck och tal
  const chips = $('studio-chips');
  for (const [label, expr] of [
    ['😊', 'happy'],
    ['😄', 'laugh'],
    ['😢', 'sad'],
    ['😠', 'angry'],
    ['😮', 'surprised'],
    ['🤔', 'thinking'],
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => (opts.model === 'scan' ? scan?.setExpression(expr, 4) : person?.setExpression(expr, 4));
    chips.appendChild(b);
  }
  $('studio-say').onsubmit = (e) => {
    e.preventDefault();
    const text = $('studio-text').value.trim() || t('Hej! Jag heter Saga. Visst ser jag verklig ut? Titta på mina ögon.');
    $('studio-text').value = '';
    say(text);
  };
}

async function say(text) {
  if (opts.model === 'scan') return sayScan(text);
  const c = person;
  if (!c) return;
  const rate = settings.voiceRate || 1;
  const spoken = speakable(text);
  const talk = () => {
    c.speakText(spoken, rate);
    c.speaking = 30;
  };
  talk();
  if (voice.canSpeak() && settings.replyMode !== 'text') {
    const pitch = c.gender === 'f' ? 1.1 : 0.9;
    await voice.speak(text, { rate, pitch, voiceId: settings.voiceName || '', onStart: talk, onWord: (i) => c.faceAnim.onWord(i) });
    c.faceAnim.stop();
    c.speaking = 0;
  } else {
    setTimeout(() => (c.speaking = 0), c.speakText(spoken, rate) * 1000);
  }
}

async function sayScan(text) {
  if (!scan) return;
  const rate = settings.voiceRate || 1;
  const spoken = speakable(text);
  const talk = () => scan.speak(spoken, rate);
  talk();
  if (voice.canSpeak() && settings.replyMode !== 'text') {
    await voice.speak(text, { rate, pitch: 1, voiceId: settings.voiceName || '', onStart: talk, onWord: (i) => scan.face.onWord(i) });
    scan.face.stop();
  }
}

function status(text) {
  const el = $('studio-status');
  if (el) {
    el.textContent = text;
    el.hidden = !text;
  }
}

function updateInfo() {
  const el = $('studio-info');
  if (!el) return;
  let tris = 0;
  if (opts.model === 'scan' && scan) tris = scan.geometry.index.count / 3;
  else if (person) for (const m of meshesOf(person)) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  el.textContent = t('{tris} trianglar · upplösning {dpr}× · {fps} bilder/s', { tris: Math.round(tris).toLocaleString(locale), dpr: dpr.toFixed(2), fps: fps.toFixed(0) });
}

// ---------------- Uppdateringar (samma service worker som spelet) ----------------
function watchUpdates() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const show = (w) => {
      $('studio-update').hidden = false;
      $('studio-update-btn').onclick = () => w.postMessage('SKIP_WAITING');
    };
    if (reg.waiting && navigator.serviceWorker.controller) show(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => w.state === 'installed' && navigator.serviceWorker.controller && show(w));
    });
    reg.update().catch(() => {});
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

// ---------------- Huvudloop ----------------
let fps = 60;
let fpsTime = 0;
let fpsFrames = 0;
const timer = new THREE.Timer();
let paused = false; // för tester: rendera en bild i taget med renderOnce()
function updateSubject(dt) {
  if (opts.model === 'scan') {
    if (scan) {
      scan.lookAt = camera.position;
      scan.update(dt, EXPRESSIONS);
    }
  } else if (person) person.update(dt, world);
}
function renderOnce(dt = 1 / 30) {
  updateSubject(dt);
  updateCamera(dt);
  composer.render(dt);
}
function loop(now) {
  requestAnimationFrame(loop);
  if (paused) return;
  timer.update(now);
  const dt = Math.min(0.05, timer.getDelta());
  updateSubject(dt);
  updateCamera(dt);
  film.uniforms.time.value = (now / 1000) % 100;
  composer.render(dt);
  // Sänk eller höj upplösningen så att bilden flyter (mobilen hinner inte alltid med 2×)
  fpsTime += dt;
  fpsFrames++;
  if (fpsTime > 2) {
    fps = fpsFrames / fpsTime;
    fpsTime = 0;
    fpsFrames = 0;
    const max = Math.min(devicePixelRatio, 2);
    const next = fps < 24 ? Math.max(0.75, dpr - 0.25) : fps > 50 ? Math.min(max, dpr + 0.25) : dpr;
    if (next !== dpr) {
      dpr = next;
      setupPipeline();
    }
    updateInfo();
  }
}

// ---------------- Start ----------------
async function start() {
  buildUi();
  fit();
  watchUpdates();
  library.dir = 'avatars-hq';
  library.initialCount = 1;
  library.avaturn = settings.people === 'avaturn';
  status(t('Laddar…'));
  await library.init();
  await showModel();
  requestAnimationFrame(loop);
}
start().catch((err) => {
  console.error(err);
  status(t('Kunde inte starta studion: {error}', { error: err.message }));
});

window.__studio = { scene, camera, renderer, opts, applyOptions, cam, renderOnce, pause: (p = true) => (paused = p), get person() { return person; }, get scan() { return scan; }, newScanPerson, say, loadPerson, library };
