// Konverterar ICT-FaceKit (USC Institute for Creative Technologies, MIT-licens) till ett kompakt
// binärformat för huvudstudion: public/scanhead/head.json + head.bin.
//
// Användning:
//   git clone --filter=blob:none --sparse https://github.com/ICT-VGL/ICT-FaceKit.git
//   (cd ICT-FaceKit && git sparse-checkout set --no-cone /FaceXModel/)
//   node convert-ictfacekit.mjs <sökväg till ICT-FaceKit> [antal identiteter, standard 24]
//
// Huvudet är en skanning (Light Stage) med 26 719 hörn: ansikte, bakhuvud och hals, munhåla, tandkött,
// tunga, tänder, ögonglober med iris, tårvätska, ögonfransar och skuggnät runt ögonen. Ansiktsuttrycken
// (53 st, ARKit-namn) och identiteterna (formvariationer för nya personer) sparas som förskjutningar
// per hörn, avrundade till 16 bitar. Uttrycken sparas glest: bara hörn som rör sig.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const kit = process.argv[2];
const identities = Number(process.argv[3] || 24);
if (!kit) {
  console.error('Ange sökvägen till ICT-FaceKit.');
  process.exit(1);
}
const model = join(kit, 'FaceXModel');
const OUT = join(here, '..', 'public', 'scanhead');
mkdirSync(OUT, { recursive: true });

function readPositions(file) {
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) if (line.startsWith('v ')) out.push(...line.split(/\s+/).slice(1, 4).map(Number));
  return Float32Array.from(out);
}

// Grundnätet: hörn, UV, ytor per material (fyrhörningar delas i trianglar)
const text = readFileSync(join(model, 'generic_neutral_mesh.obj'), 'utf8').split('\n');
const pos = [];
const uvs = [];
const groups = []; // { name, start, count }
const corner = new Map(); // "v/vt" -> utdatahörn
const src = []; // utdatahörn -> hörn i grundnätet
const uvOut = [];
const index = [];
const useCorner = (v, t) => {
  const k = `${v}/${t}`;
  if (!corner.has(k)) {
    corner.set(k, src.length);
    src.push(v);
    uvOut.push(uvs[t * 2], uvs[t * 2 + 1]);
  }
  return corner.get(k);
};
for (const line of text) {
  const p = line.trim().split(/\s+/);
  if (p[0] === 'v') pos.push(+p[1], +p[2], +p[3]);
  else if (p[0] === 'vt') uvs.push(+p[1], +p[2]);
  else if (p[0] === 'usemtl') groups.push({ name: p[1].replace(/^M_/, ''), start: index.length, count: 0 });
  else if (p[0] === 'f') {
    const c = p.slice(1).map((s) => {
      const [v, t] = s.split('/').map((x) => Number(x) - 1);
      return useCorner(v, t);
    });
    for (let i = 1; i + 1 < c.length; i++) index.push(c[0], c[i], c[i + 1]);
    groups.at(-1).count = index.length - groups.at(-1).start;
  }
}
const base = Float32Array.from(pos);
const n = base.length / 3;
console.log(`${n} hörn, ${src.length} med UV-sömmar, ${index.length / 3} trianglar`);

const chunks = [];
let offset = 0;
const add = (typed) => {
  const at = offset;
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  chunks.push(bytes);
  offset += bytes.byteLength;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    chunks.push(new Uint8Array(pad));
    offset += pad;
  }
  return at;
};

const meta = {
  source: 'ICT-FaceKit (USC ICT, MIT-licens)',
  unit: 0.01, // centimeter i filen
  vertices: n,
  corners: src.length,
  groups,
  position: add(base),
  src: add(Uint16Array.from(src)),
  uv: add(Float32Array.from(uvOut)),
  index: add(index.length / 3 > 0 && src.length < 65536 ? Uint16Array.from(index) : Uint32Array.from(index)),
  indexCount: index.length,
  expressions: [],
  identities: [],
};

// Förskjutning mot grundnätet, 16 bitar per koordinat
function quantized(file, sparse) {
  const p = readPositions(file);
  const ids = [];
  let max = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.max(Math.abs(p[i * 3] - base[i * 3]), Math.abs(p[i * 3 + 1] - base[i * 3 + 1]), Math.abs(p[i * 3 + 2] - base[i * 3 + 2]));
    if (!sparse || d > 2e-4) ids.push(i);
    max = Math.max(max, d);
  }
  const scale = max / 32767 || 1;
  const q = new Int16Array(ids.length * 3);
  ids.forEach((i, j) => {
    for (let k = 0; k < 3; k++) q[j * 3 + k] = Math.round((p[i * 3 + k] - base[i * 3 + k]) / scale);
  });
  return { ids, q, scale };
}

const { expressions } = JSON.parse(readFileSync(join(model, 'vertex_indices.json'), 'utf8'));
for (const name of expressions) {
  const { ids, q, scale } = quantized(join(model, `${name}.obj`), true);
  meta.expressions.push({ name, count: ids.length, scale, ids: add(Uint16Array.from(ids)), delta: add(q) });
}
for (let i = 0; i < identities; i++) {
  const name = `identity${String(i).padStart(3, '0')}`;
  const { q, scale } = quantized(join(model, `${name}.obj`), false);
  meta.identities.push({ name, scale, delta: add(q) });
}

const bin = new Uint8Array(offset);
let at = 0;
for (const c of chunks) {
  bin.set(c, at);
  at += c.byteLength;
}
writeFileSync(join(OUT, 'head.bin'), bin);
writeFileSync(join(OUT, 'head.json'), JSON.stringify(meta));
console.log(`head.bin: ${(offset / 1e6).toFixed(1)} MB, ${meta.expressions.length} uttryck, ${meta.identities.length} identiteter`);
