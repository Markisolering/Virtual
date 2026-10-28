import * as THREE from 'three';

// Loop-subdivision (Charles Loop, 1987) för huvuden: varje triangel delas i fyra, och nya och gamla hörn
// flyttas mot en mjuk yta. Ger många fler polygoner och runda konturer (näsa, käke, öron).
//
// Allt som hör till modellen följer med: UV-koordinater, hudvikter för skelettet och ansiktsformerna
// (morph targets). Loop-reglerna är linjära, så formernas förskjutningar kan räknas om med samma vikter
// och ansiktsuttrycken fungerar som förut. Sömmar i texturen (samma punkt med olika UV) hålls ihop
// genom att topologin byggs på positionen, medan UV:n följer varje sida för sig.

function toFloat(attr) {
  if (!attr) return null;
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) for (let k = 0; k < attr.itemSize; k++) out[i * attr.itemSize + k] = attr.getComponent(i, k);
  return out;
}

export function subdivide(geometry, levels = 1) {
  let g = geometry;
  for (let i = 0; i < levels; i++) g = subdivideOnce(g);
  return g;
}

function subdivideOnce(geo) {
  const index = geo.index ? Array.from(geo.index.array) : [...Array(geo.attributes.position.count).keys()];
  const n = geo.attributes.position.count;
  const pos = toFloat(geo.attributes.position);
  const nor = toFloat(geo.attributes.normal);
  const uv = toFloat(geo.attributes.uv);
  const col = toFloat(geo.attributes.color);
  const colSize = geo.attributes.color?.itemSize || 4;
  const skinI = toFloat(geo.attributes.skinIndex);
  const skinW = toFloat(geo.attributes.skinWeight);
  const morphs = (geo.morphAttributes.position || []).map(toFloat);
  const morphN = (geo.morphAttributes.normal || []).map(toFloat);

  // Samma position = samma punkt på ytan (även om UV skiljer sig vid en söm)
  const weld = new Int32Array(n);
  const keyOf = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    if (!keyOf.has(key)) keyOf.set(key, i);
    weld[i] = keyOf.get(key);
  }

  // Kanter på den sammansvetsade ytan: vilka hörn som står mitt emot (för kantregeln)
  const edgeKey = (a, b) => (a < b ? a * n + b : b * n + a);
  const opposite = new Map(); // svetsad kant -> [motstående svetsade hörn]
  const neighbors = Array.from({ length: n }, () => new Set()); // svetsade grannar per svetsat hörn
  const tris = index.length / 3;
  for (let t = 0; t < tris; t++) {
    const v = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
    for (let e = 0; e < 3; e++) {
      const a = weld[v[e]];
      const b = weld[v[(e + 1) % 3]];
      const c = weld[v[(e + 2) % 3]];
      const k = edgeKey(a, b);
      if (!opposite.has(k)) opposite.set(k, []);
      opposite.get(k).push(c);
      neighbors[a].add(b);
      neighbors[b].add(a);
    }
  }
  const boundary = new Set();
  for (const [k, opp] of opposite) {
    if (opp.length === 1) {
      boundary.add(Math.floor(k / n));
      boundary.add(k % n);
    }
  }

  // Nya hörn: ett per kant och sida (kantens två ursprungliga hörn)
  const midOf = new Map();
  const mids = []; // [a, b, oppA, oppB] i ursprungliga/svetsade index
  const newIndex = [];
  const mid = (a, b) => {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (midOf.has(k)) return midOf.get(k);
    const id = n + mids.length;
    const opp = opposite.get(edgeKey(weld[a], weld[b])) || [];
    mids.push([a, b, opp.length === 2 ? opp[0] : -1, opp.length === 2 ? opp[1] : -1]);
    midOf.set(k, id);
    return id;
  };
  for (let t = 0; t < tris; t++) {
    const a = index[t * 3];
    const b = index[t * 3 + 1];
    const c = index[t * 3 + 2];
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);
    newIndex.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const m = n + mids.length;

  // Loop-reglerna, använda på valfri vektor per hörn (position, normal, formförskjutning)
  const smoothVec = (src, size) => {
    const out = new Float32Array(m * size);
    // Gamla hörn: vägs mot sina grannar (beta enligt Loop/Warren), kanthörn står kvar
    const cache = new Map();
    for (let i = 0; i < n; i++) {
      const w = weld[i];
      let vals = cache.get(w);
      if (!vals) {
        vals = new Float64Array(size);
        const nb = neighbors[w];
        const k = nb.size;
        if (boundary.has(w) || k < 3) {
          for (let d = 0; d < size; d++) vals[d] = src[w * size + d];
        } else {
          const beta = k === 3 ? 3 / 16 : 3 / (8 * k);
          for (let d = 0; d < size; d++) vals[d] = src[w * size + d] * (1 - k * beta);
          for (const j of nb) for (let d = 0; d < size; d++) vals[d] += src[j * size + d] * beta;
        }
        cache.set(w, vals);
      }
      for (let d = 0; d < size; d++) out[i * size + d] = vals[d];
    }
    // Kantpunkter: 3/8 av kantens ändar och 1/8 av de motstående hörnen (mitt på kanten vid en rand)
    mids.forEach(([a, b, c, e], j) => {
      const o = (n + j) * size;
      const wa = weld[a];
      const wb = weld[b];
      for (let d = 0; d < size; d++) {
        out[o + d] = c < 0 ? (src[wa * size + d] + src[wb * size + d]) / 2 : (3 / 8) * (src[wa * size + d] + src[wb * size + d]) + (1 / 8) * (src[c * size + d] + src[e * size + d]);
      }
    });
    return out;
  };
  // Mittpunkt utan utjämning (UV, färg): följer varje sida av en söm för sig
  const midVec = (src, size) => {
    const out = new Float32Array(m * size);
    out.set(src.subarray(0, n * size));
    mids.forEach(([a, b], j) => {
      for (let d = 0; d < size; d++) out[(n + j) * size + d] = (src[a * size + d] + src[b * size + d]) / 2;
    });
    return out;
  };

  const res = new THREE.BufferGeometry();
  res.setIndex(m > 65535 ? new THREE.Uint32BufferAttribute(newIndex, 1) : new THREE.Uint16BufferAttribute(newIndex, 1));
  res.setAttribute('position', new THREE.BufferAttribute(smoothVec(pos, 3), 3));
  if (nor) {
    const sn = smoothVec(nor, 3);
    for (let i = 0; i < m; i++) {
      const l = Math.hypot(sn[i * 3], sn[i * 3 + 1], sn[i * 3 + 2]) || 1;
      sn[i * 3] /= l;
      sn[i * 3 + 1] /= l;
      sn[i * 3 + 2] /= l;
    }
    res.setAttribute('normal', new THREE.BufferAttribute(sn, 3));
  }
  if (uv) res.setAttribute('uv', new THREE.BufferAttribute(midVec(uv, 2), 2));
  if (col) res.setAttribute('color', new THREE.BufferAttribute(midVec(col, colSize), colSize));
  if (skinI && skinW) {
    // Hudvikter: slå ihop båda ändarnas vikter och behåll de fyra största
    const si = new Uint16Array(m * 4);
    const sw = new Float32Array(m * 4);
    si.set(skinI.subarray(0, n * 4));
    sw.set(skinW.subarray(0, n * 4));
    mids.forEach(([a, b], j) => {
      const acc = new Map();
      for (const v of [a, b]) for (let k = 0; k < 4; k++) acc.set(skinI[v * 4 + k], (acc.get(skinI[v * 4 + k]) || 0) + skinW[v * 4 + k] / 2);
      const top = [...acc].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
      top.forEach(([bone, w], k) => {
        si[(n + j) * 4 + k] = bone;
        sw[(n + j) * 4 + k] = w / sum;
      });
    });
    res.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    res.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  if (morphs.length) res.morphAttributes.position = morphs.map((a) => new THREE.BufferAttribute(smoothVec(a, 3), 3));
  if (morphN.length) res.morphAttributes.normal = morphN.map((a) => new THREE.BufferAttribute(smoothVec(a, 3), 3));
  res.morphTargetsRelative = geo.morphTargetsRelative;
  for (const g of geo.groups) res.addGroup(g.start * 4, g.count * 4, g.materialIndex);
  res.computeBoundingSphere();
  return res;
}

// Hur krökt ytan är vid varje hörn (1/meter): mer krökt = tunnare hud som släpper igenom mer ljus
// (näsvingar, öron, ögonlock). Används av hudens ljusspridning.
export function curvature(geometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const idx = geometry.index.array;
  // Hörn på samma plats (t.ex. två sidor av en söm i texturen) räknas som ett, annars blir det ett
  // synligt hopp i ljusspridningen längs sömmen
  const weld = new Int32Array(pos.count);
  const keyOf = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    if (!keyOf.has(key)) keyOf.set(key, i);
    weld[i] = keyOf.get(key);
  }
  const sum = new Float32Array(pos.count);
  const cnt = new Float32Array(pos.count);
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const na = new THREE.Vector3();
  const nb = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e];
      const b = idx[t + ((e + 1) % 3)];
      pa.fromBufferAttribute(pos, a);
      pb.fromBufferAttribute(pos, b);
      na.fromBufferAttribute(nor, a);
      nb.fromBufferAttribute(nor, b);
      const d = pa.distanceTo(pb);
      if (d < 1e-6) continue;
      const k = na.distanceTo(nb) / d;
      sum[weld[a]] += k;
      cnt[weld[a]]++;
      sum[weld[b]] += k;
      cnt[weld[b]]++;
    }
  }
  const out = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) out[i] = cnt[weld[i]] ? sum[weld[i]] / cnt[weld[i]] : 0;
  // Skala så att de 10 % mest krökta delarna får ungefär 1 (modellerna har olika skala internt)
  const sorted = Array.from(out).sort((x, y) => x - y);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 1;
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1.5, out[i] / p90);
  geometry.setAttribute('skinCurv', new THREE.BufferAttribute(out, 1));
  return out;
}
