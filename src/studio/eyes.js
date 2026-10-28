import * as THREE from 'three';

// Ögon för huvudstudion. Modellens egna ögon (en del av huvudets nät) tas bort och ersätts med
// ögonglober som sitter på ögonbenen:
// - en välvd, blank hornhinna med skarpa reflexer (ser våt ut),
// - irisen ligger på ett plan bakom hornhinnan, och ljuset bryts genom hornhinnan (brytningsindex 1,376),
//   så irisen får djup och flyttar sig rätt när man tittar från sidan,
// - mörkare kant runt irisen (limbus) och skugga från ovanlocket.
// Färgerna hämtas från modellens egen ögontextur, så ögonen behåller sin färg.

const IRIS_ANGLE = Math.cos((33 * Math.PI) / 180); // hornhinnans/irisens kant, sett från ögats mitt

// Vertexens läge i ett bens egna koordinater i grundposen (bindningen)
function bindLocal(mesh, i, boneIndex, out) {
  out.fromBufferAttribute(mesh.geometry.attributes.position, i);
  out.applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[boneIndex]);
  return out;
}

// Ta bort trianglarna som bara sitter på ögonbenen och returnera deras hörn per öga
export function cutEyes(mesh, eyeNames) {
  const g = mesh.geometry;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const bones = eyeNames.map((n) => mesh.skeleton.bones.findIndex((b) => b.name === n));
  if (bones.some((b) => b < 0)) return null;
  const owner = new Int8Array(si.count).fill(-1);
  for (let i = 0; i < si.count; i++) {
    bones.forEach((b, e) => {
      let w = 0;
      for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === b) w += sw.getComponent(i, k);
      if (w > 0.98) owner[i] = e;
    });
  }
  const idx = g.index.array;
  const keep = [];
  const verts = bones.map(() => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const a = owner[idx[t]];
    if (a >= 0 && a === owner[idx[t + 1]] && a === owner[idx[t + 2]]) {
      for (let k = 0; k < 3; k++) verts[a].add(idx[t + k]);
    } else keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (verts.some((v) => v.size < 20)) return null;
  g.setIndex(keep);
  return bones.map((b, e) => ({ boneIndex: b, bone: mesh.skeleton.bones[b], verts: [...verts[e]] }));
}

// Bygg en ögonglob för ett öga. forward = ögats blickriktning i benets koordinater.
export function buildEye(mesh, eye, forward, eyeMaterialSource) {
  const g = mesh.geometry;
  const uvAttr = g.attributes.uv;
  const v = new THREE.Vector3();
  const pts = eye.verts.map((i) => ({ p: bindLocal(mesh, i, eye.boneIndex, v.clone()), uv: new THREE.Vector2(uvAttr.getX(i), uvAttr.getY(i)) }));
  // Mitt och radie: medelpunkten flyttad bakåt tills avstånden blir lika (modellens öga är bara framsidan)
  const f = forward.clone().normalize();
  const mean = pts.reduce((s, x) => s.add(x.p), new THREE.Vector3()).divideScalar(pts.length);
  let best = { err: Infinity, c: mean, r: 0.012 };
  for (let back = 0; back < 0.02; back += 0.0005) {
    const c = mean.clone().addScaledVector(f, -back);
    const ds = pts.map((x) => x.p.distanceTo(c));
    const r = ds.reduce((a, b) => a + b, 0) / ds.length;
    const err = ds.reduce((a, d) => a + (d - r) ** 2, 0);
    if (err < best.err) best = { err, c, r };
  }
  const { c: center, r: radius } = best;
  // Ögats egna axlar: u åt sidan, w uppåt, f framåt
  const up = Math.abs(f.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(up, f).normalize();
  const w = new THREE.Vector3().crossVectors(f, u).normalize();
  const local = (p) => {
    const d = p.clone().sub(center).normalize();
    return new THREE.Vector3(d.dot(u), d.dot(w), d.dot(f));
  };
  const dirs = pts.map((x) => ({ d: local(x.p), uv: x.uv }));
  // Irisens UV som en plan avbildning av (x, y) på enhetssfären (minsta kvadrat)
  const iris = dirs.filter((x) => x.d.z > IRIS_ANGLE - 0.05);
  const fit = fitAffine(iris.length >= 6 ? iris : dirs);

  // Sfären, med en lätt utbuktning för hornhinnan
  const sphere = new THREE.SphereGeometry(1, 64, 48);
  sphere.rotateX(Math.PI / 2); // polen pekar längs +z
  const pos = sphere.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  const eyeDir = new Float32Array(pos.count * 3);
  const basis = new THREE.Matrix4().makeBasis(u, w, f);
  for (let i = 0; i < pos.count; i++) {
    const d = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    eyeDir.set([d.x, d.y, d.z], i * 3);
    // Färgen för ögonvitan: närmaste av modellens egna hörn
    let near = dirs[0];
    let bestD = Infinity;
    for (const x of dirs) {
      const dd = x.d.distanceToSquared(d);
      if (dd < bestD) {
        bestD = dd;
        near = x;
      }
    }
    uvs[i * 2] = near.uv.x;
    uvs[i * 2 + 1] = near.uv.y;
    const bulge = 1 + 0.07 * smooth(IRIS_ANGLE - 0.05, 1, d.z);
    const p = d.clone().multiplyScalar(radius * bulge).applyMatrix4(basis).add(center);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  sphere.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  sphere.setAttribute('eyeDir', new THREE.BufferAttribute(eyeDir, 3));
  sphere.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    map: eyeMaterialSource.map,
    roughness: 0.18,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    ior: 1.376,
    envMapIntensity: 1.2,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      eyeU: { value: u },
      eyeW: { value: w },
      eyeF: { value: f },
      irisA: { value: fit[0] },
      irisB: { value: fit[1] },
      irisEdge: { value: IRIS_ANGLE },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 eyeDir;\nvarying vec3 vEyeDir;\nvarying vec3 vViewU;\nvarying vec3 vViewW;\nvarying vec3 vViewF;\nuniform vec3 eyeU;\nuniform vec3 eyeW;\nuniform vec3 eyeF;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vEyeDir = eyeDir;
        vViewU = normalize( mat3( modelViewMatrix ) * eyeU );
        vViewW = normalize( mat3( modelViewMatrix ) * eyeW );
        vViewF = normalize( mat3( modelViewMatrix ) * eyeF );`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyeDir;\nvarying vec3 vViewU;\nvarying vec3 vViewW;\nvarying vec3 vViewF;\nuniform vec3 irisA;\nuniform vec3 irisB;\nuniform float irisEdge;')
      .replace(
        '#include <map_fragment>',
        `{
          vec3 d = normalize( vEyeDir );
          // Synlinjen i ögats koordinater, bruten genom hornhinnan och följd till irisens plan
          vec3 I = - normalize( vViewPosition );
          vec3 Ie = vec3( dot( I, vViewU ), dot( I, vViewW ), dot( I, vViewF ) );
          vec3 R = refract( Ie, d, 1.0 / 1.376 );
          float plane = irisEdge - 0.06;
          float t = ( plane - d.z ) / min( R.z, -0.05 );
          vec3 hit = d + R * t;
          vec2 irisUv = vec2( dot( irisA, vec3( hit.xy, 1.0 ) ), dot( irisB, vec3( hit.xy, 1.0 ) ) );
          float inIris = smoothstep( irisEdge - 0.02, irisEdge + 0.01, d.z );
          vec4 sampledDiffuseColor = texture2D( map, mix( vMapUv, irisUv, inIris ) );
          // Mörkare ring i irisens kant och skugga från ovanlocket
          float limbus = 1.0 - 0.45 * exp( - pow( ( d.z - irisEdge ) * 28.0, 2.0 ) );
          float lid = mix( 0.55, 1.0, smoothstep( 0.55, 0.05, d.y ) );
          sampledDiffuseColor.rgb *= limbus * lid;
          diffuseColor *= sampledDiffuseColor;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'studio-eye';
  const ball = new THREE.Mesh(sphere, mat);
  ball.name = 'studio-eye';
  ball.frustumCulled = false;
  eye.bone.add(ball);
  return ball;
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// uv = A · (x, y, 1) med minsta kvadratmetoden
function fitAffine(samples) {
  const M = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const bu = [0, 0, 0];
  const bv = [0, 0, 0];
  for (const { d, uv } of samples) {
    const r = [d.x, d.y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) M[i][j] += r[i] * r[j];
      bu[i] += r[i] * uv.x;
      bv[i] += r[i] * uv.y;
    }
  }
  const inv = new THREE.Matrix3().set(...M.flat()).invert();
  const a = new THREE.Vector3(...bu).applyMatrix3(inv);
  const b = new THREE.Vector3(...bv).applyMatrix3(inv);
  return [a, b];
}
