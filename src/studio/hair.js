import * as THREE from 'three';

// Hår och ögonfransar (modellens "opacity"-nät med genomskinliga hårslingor):
// - glansen löper längs stråna (anisotropisk reflex, som på riktigt hår),
// - mjuka kanter med alpha-to-coverage (kräver MSAA) i stället för hackiga genomskinlighetskanter,
// - lite sammetsglans (sheen) för den ljusa kanten runt håret i motljus.
export function makeHairMaterial(source) {
  const m = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(m, source);
  m.transparent = false;
  m.alphaTest = 0.35;
  m.alphaToCoverage = true;
  m.side = THREE.DoubleSide;
  m.metalness = 0;
  m.roughness = 0.42;
  m.anisotropy = 0.75;
  m.anisotropyRotation = Math.PI / 2; // stråna går längs texturens v-led
  m.sheen = 0.5;
  m.sheenRoughness = 0.45;
  m.sheenColor = new THREE.Color('#d9c3a5');
  m.specularIntensity = 0.7;
  m.envMapIntensity = 0.6;
  return m;
}
