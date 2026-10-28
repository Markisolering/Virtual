import * as THREE from 'three';

// Hudmaterial för huvudstudion. Bygger på three.js fysikaliska material, men byter ut hur det direkta
// ljuset sprids i huden:
//
// - Ljusspridning under ytan (subsurface scattering, förenklad "pre-integrated" variant): ljuset
//   sprids olika långt för rött, grönt och blått. Skuggkanter blir mjuka och varma i stället för hårda
//   och grå. Ju mer krökt ytan är (näsa, läppar, öron), desto mer sprids ljuset.
// - Genomlysning: tunna delar (öron, näsvingar) lyser rött när ljuset kommer bakifrån.
// - Diffust ljus räknas mot en suddigare version av normalkartan (ljuset under ytan ser inte de minsta
//   ojämnheterna), medan glansen använder den skarpa.
// - Porer: en fin detaljkarta som syns i glansen.
// - Två lager glans: oljig yta (clearcoat) och matt underlag.
// - Bara det som liknar hud får spridningen; kläder och hår skuggas som vanligt.

// En tileable karta med porer och fina linjer, gjord i en canvas och omräknad till normaler
let detailTexture = null;
function poreTexture() {
  if (detailTexture) return detailTexture;
  const S = 256;
  const h = new Float32Array(S * S);
  const rnd = mulberry(7);
  // Porer: små gropar
  for (let i = 0; i < 2600; i++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    const r = 0.8 + rnd() * 1.6;
    const depth = 0.4 + rnd() * 0.6;
    for (let y = -3; y <= 3; y++) {
      for (let x = -3; x <= 3; x++) {
        const d = Math.hypot(x, y) / r;
        if (d > 1) continue;
        const px = (Math.floor(cx) + x + S) % S;
        const py = (Math.floor(cy) + y + S) % S;
        h[py * S + px] -= depth * (1 - d * d);
      }
    }
  }
  // Fint brus
  for (let i = 0; i < S * S; i++) h[i] += (rnd() - 0.5) * 0.25;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const at = (xx, yy) => h[((yy + S) % S) * S + ((xx + S) % S)];
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const n = new THREE.Vector3(-dx, -dy, 2).normalize();
      const o = (y * S + x) * 4;
      data[o] = (n.x * 0.5 + 0.5) * 255;
      data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  detailTexture = new THREE.DataTexture(data, S, S);
  detailTexture.wrapS = detailTexture.wrapT = THREE.RepeatWrapping;
  detailTexture.generateMipmaps = true;
  detailTexture.minFilter = THREE.LinearMipmapLinearFilter;
  detailTexture.magFilter = THREE.LinearFilter;
  detailTexture.needsUpdate = true;
  return detailTexture;
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

// Inställningar som kan ändras medan man tittar (delas av alla hudmaterial)
export const skinParams = {
  enabled: { value: 1 },
  scatter: { value: new THREE.Vector3(0.62, 0.24, 0.13) }, // hur långt ljuset sprids per färg
  translucency: { value: 0.9 },
  detail: { value: 0.35 },
  detailScale: { value: 70 },
};

const DIRECT = /* glsl */ `
vec3 gSkinDiffN;
float gSkinCurv;
float gSkinMask;
uniform float skinEnabled;
uniform vec3 skinScatter;
uniform float skinTranslucency;

void RE_Direct_Skin( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  ReflectedLight std = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, std );
  reflectedLight.directSpecular += std.directSpecular;
  float k = gSkinMask * skinEnabled;
  if ( k <= 0.0 ) {
    reflectedLight.directDiffuse += std.directDiffuse;
    return;
  }
  // Ljusspridning: "omslutande" belysning med olika räckvidd per färg, mer där ytan är krökt
  float nl = dot( gSkinDiffN, directLight.direction );
  vec3 w = skinScatter * ( 0.45 + gSkinCurv );
  vec3 wrapped = clamp( ( vec3( nl ) + w ) / ( 1.0 + w ), 0.0, 1.0 );
  wrapped = wrapped * wrapped * ( 3.0 - 2.0 * wrapped ) / ( 1.0 + w * 0.6 );
  vec3 skin = directLight.color * wrapped * BRDF_Lambert( material.diffuseContribution );
  // Genomlysning bakifrån i tunna delar
  vec3 back = normalize( directLight.direction + gSkinDiffN * 0.35 );
  float through = pow( saturate( dot( geometryViewDir, - back ) ), 3.0 ) * skinTranslucency * clamp( gSkinCurv, 0.0, 1.0 );
  skin += directLight.color * through * vec3( 1.0, 0.32, 0.18 ) * material.diffuseContribution * 0.6;
  reflectedLight.directDiffuse += mix( std.directDiffuse, skin, k );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Skin
`;

// skinTone = (r, g, b, ljushet) i linjär färg, hudens ton (för att skilja hud från kläder)
export function makeSkinMaterial(source, skinTone) {
  const m = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(m, source);
  m.roughness = Math.max(0.5, source.roughness ?? 0.6);
  m.metalness = 0;
  m.clearcoat = 0.18;
  m.clearcoatRoughness = 0.32;
  m.specularIntensity = 0.6;
  m.sheen = 0.12;
  m.sheenRoughness = 0.6;
  m.sheenColor = new THREE.Color('#ffc4b0');
  m.envMapIntensity = 0.8;
  m.userData.skin = true;
  const detail = poreTexture();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      skinEnabled: skinParams.enabled,
      skinScatter: skinParams.scatter,
      skinTranslucency: skinParams.translucency,
      skinDetailMap: { value: detail },
      skinDetailStrength: skinParams.detail,
      skinDetailScale: skinParams.detailScale,
      skinTone: { value: skinTone },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float skinCurv;\nvarying float vSkinCurv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinCurv = skinCurv;');
    const maps = THREE.ShaderChunk.normal_fragment_maps.replace(
      'mapN.xy *= normalScale;',
      `mapN.xy *= normalScale;
      vec2 skinDet = texture2D( skinDetailMap, vNormalMapUv * skinDetailScale ).xy * 2.0 - 1.0;
      mapN.xy += skinDet * skinDetailStrength * gSkinMask;
      vec3 mapNB = texture2D( normalMap, vNormalMapUv, 3.5 ).xyz * 2.0 - 1.0;
      mapNB.xy *= normalScale;
      gSkinDiffN = normalize( tbn * mapNB );`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSkinCurv;\nuniform sampler2D skinDetailMap;\nuniform float skinDetailStrength;\nuniform float skinDetailScale;\nuniform vec4 skinTone;')
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${DIRECT}`)
      .replace(
        '#include <normal_fragment_maps>',
        `gSkinCurv = vSkinCurv;
        gSkinDiffN = normal;
        {
          // Liknar färgen huden? (samma färgton och ungefär samma ljushet)
          vec3 c = diffuseColor.rgb;
          float s = c.r + c.g + c.b + 1e-4;
          float d = distance( c / s, skinTone.xyz );
          float rel = s / skinTone.w;
          gSkinMask = ( 1.0 - smoothstep( 0.045, 0.1, d ) ) * smoothstep( 0.2, 0.4, rel ) * ( 1.0 - smoothstep( 2.4, 3.2, rel ) );
        }
        ${maps}`,
      );
  };
  m.customProgramCacheKey = () => 'studio-skin';
  return m;
}

// Hudens ton: medianfärgen i texturen där huvudets hörn sitter (kinder, panna)
export function sampleSkinTone(mesh, boneName = 'Bip01_Head') {
  const tone = new THREE.Vector4(0.45, 0.32, 0.23, 0.6);
  const img = mesh.material.map?.image;
  const g = mesh.geometry;
  if (!img || !g.attributes.uv || !g.attributes.skinIndex) return tone;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(img, 0, 0, S, S);
  } catch {
    return tone;
  }
  const data = ctx.getImageData(0, 0, S, S).data;
  const bone = mesh.skeleton.bones.findIndex((b) => b.name === boneName);
  const uv = g.attributes.uv;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const col = new THREE.Color();
  const samples = [];
  for (let i = 0; i < uv.count; i += 3) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bone) w += sw.getComponent(i, k);
    if (w < 0.95) continue;
    const x = Math.min(S - 1, Math.floor(uv.getX(i) * S));
    const y = Math.min(S - 1, Math.floor(uv.getY(i) * S));
    const o = (y * S + x) * 4;
    col.setRGB(data[o] / 255, data[o + 1] / 255, data[o + 2] / 255, THREE.SRGBColorSpace);
    samples.push([col.r, col.g, col.b]);
  }
  if (samples.length < 20) return tone;
  const med = (k) => samples.map((c) => c[k]).sort((a, b) => a - b)[samples.length >> 1];
  const r = med(0);
  const gg = med(1);
  const b = med(2);
  const s = r + gg + b + 1e-4;
  return tone.set(r / s, gg / s, b / s, s);
}
