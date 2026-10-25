import * as THREE from 'three';

// Byta kläder: modellerna har kläderna målade i samma textur som kroppen, så vi kan inte ta av eller
// på plagg, men vi kan färga om dem. Varje hörn i kroppen får ett område efter vilket ben det sitter på
// (överdel, underdel, skor), och en shader färgar om allt i området som inte ser ut som hud. Skuggor,
// veck och mönster i tyget behålls eftersom ljusheten från originaltexturen följer med.

export const COLORS = {
  röd: '#b3262e',
  vinröd: '#6b1b2a',
  rosa: '#e58fb0',
  orange: '#e0782a',
  gul: '#e6c33a',
  grön: '#3d8a4a',
  mörkgrön: '#1f4a2c',
  turkos: '#2aa3a3',
  ljusblå: '#7fb2e0',
  blå: '#2f5bb5',
  marinblå: '#1b2a4d',
  lila: '#6d3f9e',
  brun: '#6b4428',
  beige: '#cdb894',
  vit: '#f0efea',
  grå: '#7c7f84',
  svart: '#1d1d1f',
};
export const PARTS = ['overdel', 'underdel', 'skor'];
export const PART_NAMES = { overdel: 'överdel', underdel: 'underdel', skor: 'skor' };

// Vilket område ett ben hör till: 0 = rör inte (huvud, händer), 1 = överdel, 2 = underdel, 3 = skor
function regionOf(name) {
  if (/Head|Neck|Hand|Finger|Eye|Jaw|Tongue|Brow|Lip|Ponytail|Mouth|Cheek/.test(name)) return 0;
  if (/Foot|Toe/.test(name)) return 3;
  if (/Thigh|Calf|Pelvis|^Bip01$/.test(name)) return 2;
  return 1;
}

// Sätter ett område per hörn (en gång per geometri, delas av alla som har samma modell)
function prepareGeometry(mesh) {
  const g = mesh.geometry;
  if (g.attributes.clothRegion) return;
  const idx = g.attributes.skinIndex;
  const w = g.attributes.skinWeight;
  const regions = new Float32Array(g.attributes.position.count);
  const names = mesh.skeleton.bones.map((b) => b.name);
  for (let i = 0; i < regions.length; i++) {
    let best = 0;
    let bone = 0;
    for (let k = 0; k < 4; k++) {
      const wk = w.getComponent(i, k);
      if (wk > best) {
        best = wk;
        bone = idx.getComponent(i, k);
      }
    }
    regions[i] = regionOf(names[bone] || '');
  }
  g.setAttribute('clothRegion', new THREE.BufferAttribute(regions, 1));
}

// Läs texturens färger på de ställen där hörnen i varje område sitter.
// Ger hudens färg (från händerna) och tygets genomsnittliga ljushet i varje område.
function analyse(mesh) {
  const g = mesh.geometry;
  const img = mesh.material.map?.image;
  if (g.userData.clothInfo) return g.userData.clothInfo;
  const info = { skin: new THREE.Vector4(0.42, 0.33, 0.25, 0.5), avg: new THREE.Vector3(0.15, 0.15, 0.15) };
  g.userData.clothInfo = info;
  if (!img || !g.attributes.uv) return info;
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(img, 0, 0, S, S);
  } catch {
    return info;
  }
  const data = ctx.getImageData(0, 0, S, S).data;
  const uv = g.attributes.uv;
  const regions = g.attributes.clothRegion.array;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const idx = g.attributes.skinIndex;
  const w = g.attributes.skinWeight;
  const col = new THREE.Color();
  const sample = (i) => {
    const x = Math.min(S - 1, Math.max(0, Math.floor(uv.getX(i) * S)));
    const y = Math.min(S - 1, Math.max(0, Math.floor(uv.getY(i) * S)));
    const o = (y * S + x) * 4;
    return col.setRGB(data[o] / 255, data[o + 1] / 255, data[o + 2] / 255, THREE.SRGBColorSpace).clone();
  };
  // Hud: hörn som sitter på händerna (handflata och fingrar)
  const skin = [];
  for (let i = 0; i < uv.count; i++) {
    for (let k = 0; k < 4; k++) {
      if (w.getComponent(i, k) > 0.6 && /Hand|Finger/.test(names[idx.getComponent(i, k)] || '')) {
        skin.push(sample(i));
        break;
      }
    }
  }
  if (skin.length > 10) {
    // Median per kanal tål enstaka hörn som hamnat på en ärm
    const med = (k) => skin.map((c) => c[k]).sort((a, b) => a - b)[skin.length >> 1];
    const r = med('r');
    const gg = med('g');
    const b = med('b');
    const s = r + gg + b + 1e-4;
    info.skin.set(r / s, gg / s, b / s, s);
  }
  // Tygets ljushet per område (det som inte liknar huden)
  const sums = [0, 0, 0];
  const counts = [0, 0, 0];
  const sk = info.skin;
  for (let i = 0; i < uv.count; i += 2) {
    const r = regions[i];
    if (r < 1) continue;
    const c = sample(i);
    const s = c.r + c.g + c.b + 1e-4;
    const d = Math.hypot(c.r / s - sk.x, c.g / s - sk.y, c.b / s - sk.z);
    if (d < 0.05 && s / sk.w > 0.35 && s / sk.w < 2.5) continue;
    sums[r - 1] += 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    counts[r - 1]++;
  }
  info.avg.set(...sums.map((v, k) => (counts[k] ? Math.max(0.01, v / counts[k]) : 0.15)));
  return info;
}

const FRAGMENT = /* glsl */ `
#ifdef USE_MAP
{
  int ri = int(floor(vClothRegion + 0.5));
  vec4 tint = ri == 1 ? clothTint[0] : ri == 2 ? clothTint[1] : ri == 3 ? clothTint[2] : vec4(0.0);
  if (tint.a > 0.0) {
    vec3 col = diffuseColor.rgb;
    float s = col.r + col.g + col.b + 1e-4;
    // Liknar färgen huden (samma färgton och ungefär samma ljushet) lämnas den orörd
    float skin = 1.0 - smoothstep(0.035, 0.075, distance(col / s, clothSkin.xyz));
    float rel = s / clothSkin.w;
    skin *= smoothstep(0.25, 0.45, rel) * (1.0 - smoothstep(2.2, 3.0, rel));
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float avg = ri == 1 ? clothAvg.x : ri == 2 ? clothAvg.y : clothAvg.z;
    vec3 rec = tint.rgb * clamp(lum / max(avg, 0.002), 0.2, 2.0);
    diffuseColor.rgb = mix(col, rec, tint.a * (1.0 - skin));
  }
}
#endif
`;

// Klädfärger för en person. Materialet kopieras först när något färgas om, så att andra personer
// med samma modell inte påverkas.
export class Wardrobe {
  constructor(model) {
    this.model = model;
    this.state = { overdel: null, underdel: null, skor: null };
    this.uniforms = null;
  }

  setup() {
    if (this.uniforms) return true;
    // Kroppen är det nät som har flest hörn på armar och ben (inte huvudet eller ögonfransarna)
    let body = null;
    this.model.traverse((o) => {
      if (o.isSkinnedMesh && o.material?.map && !/opacity|head/i.test(o.material.name) && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o;
    });
    if (!body) return false;
    prepareGeometry(body);
    const info = analyse(body);
    this.uniforms = {
      clothTint: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      clothSkin: { value: info.skin },
      clothAvg: { value: info.avg },
    };
    const mat = body.material.clone();
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float clothRegion;\nvarying float vClothRegion;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvClothRegion = clothRegion;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec4 clothTint[3];\nuniform vec4 clothSkin;\nuniform vec3 clothAvg;\nvarying float vClothRegion;')
        .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAGMENT}`);
    };
    mat.customProgramCacheKey = () => 'wardrobe';
    body.material = mat;
    this.material = mat;
    return true;
  }

  // parts: { overdel, underdel, skor } med färgnamn (se COLORS), "original" eller null (behåll)
  set(parts) {
    if (!this.setup()) return false;
    PARTS.forEach((p, i) => {
      const v = parts[p];
      if (!v) return;
      const t = this.uniforms.clothTint.value[i];
      if (v === 'original' || !COLORS[v]) {
        t.set(0, 0, 0, 0);
        this.state[p] = null;
      } else {
        const c = new THREE.Color(COLORS[v]);
        t.set(c.r, c.g, c.b, 1);
        this.state[p] = v;
      }
    });
    return true;
  }

  describe() {
    const on = PARTS.filter((p) => this.state[p]).map((p) => `${this.state[p]} ${PART_NAMES[p]}`);
    return on.length ? on.join(', ') : '';
  }
}

// Slumpa nya kläder: "byt kläder" utan att säga vilka
export function randomOutfit() {
  const names = Object.keys(COLORS);
  const pick = () => names[Math.floor(Math.random() * names.length)];
  return { overdel: pick(), underdel: pick(), skor: Math.random() < 0.6 ? pick() : null };
}
