// Konverterar Microsoft Rocketbox-avatarer och animationer (MIT) till komprimerade GLB-filer för spelet.
//
// Användning:
//   cd tools && npm install
//   node convert-rocketbox.mjs <sökväg till klon av microsoft/Microsoft-Rocketbox> [avatar ...]
//
// Klonen kan vara en "partial clone" utan utcheckade filer: filerna hämtas en i taget med `git show`
// så att disken inte behöver rymma alla texturer (ca 100 MB per avatar) samtidigt.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { prune, dedup, quantize, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const here = dirname(fileURLToPath(import.meta.url));
const repo = process.argv[2];
if (!repo) {
  console.error('Ange sökvägen till Rocketbox-klonen.');
  process.exit(1);
}
const OUT = join(here, '..', 'public');
const TMP = join(here, '.tmp');
const FBX2GLTF = join(here, 'node_modules', 'fbx2gltf', 'bin', process.platform === 'darwin' ? 'Darwin' : 'Linux', 'FBX2glTF');
mkdirSync(TMP, { recursive: true });
mkdirSync(join(OUT, 'avatars'), { recursive: true });
mkdirSync(join(OUT, 'anims'), { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTTextureWebP, EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 1 << 30 });
const listFiles = (dir) => git('ls-tree', '-r', '--name-only', 'HEAD', dir).toString().trim().split('\n').filter(Boolean);
const extract = (path, dst) => writeFileSync(dst, git('show', `HEAD:${path}`));
const fbx2gltf = (src, dstNoExt) => execFileSync(FBX2GLTF, ['--binary', '-i', src, '-o', dstNoExt], { stdio: 'pipe' });
const tex = (kind, src, dst, size) => execFileSync('python3', [join(here, 'textures.py'), kind, src, dst, String(size)]);

// ---------------- Avatarer ----------------
async function convertAvatar(name) {
  const base = `Assets/Avatars/Adults/${name}`;
  const files = listFiles(base);
  const fbx = files.find((f) => f.endsWith(`/Export/${name}.fbx`));
  if (!fbx) throw new Error(`Hittar ingen FBX för ${name}`);
  const work = join(TMP, name);
  mkdirSync(work, { recursive: true });
  extract(fbx, join(work, 'model.fbx'));
  fbx2gltf(join(work, 'model.fbx'), join(work, 'model'));
  const doc = await io.read(join(work, 'model.glb'));
  const root = doc.getRoot();
  doc.createExtension(EXTTextureWebP).setRequired(true);

  const tgaFor = (matName, suffix) => {
    const want = `${matName}_${suffix}.tga`.toLowerCase();
    let f = files.find((p) => p.toLowerCase().endsWith('/' + want));
    if (!f) {
      // Reserv: matcha på delen efter prefixet, t.ex. "_body_color"
      const part = matName.split('_').slice(1).join('_');
      f = files.find((p) => p.toLowerCase().endsWith(`_${part}_${suffix}.tga`.toLowerCase()));
    }
    return f;
  };
  const makeTexture = (kind, tgaPath, size) => {
    const tga = join(work, 'in.tga');
    const out = join(work, `${kind}.webp`);
    extract(tgaPath, tga);
    tex(kind, tga, out, size);
    rmSync(tga);
    return doc.createTexture(`${kind}`).setImage(readFileSync(out)).setMimeType('image/webp');
  };

  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMaterials()) {
    const n = m.getName();
    m.setMetallicFactor(0).setRoughnessFactor(1).setBaseColorFactor([1, 1, 1, 1]);
    if (/opacity/i.test(n)) {
      const color = tgaFor(n, 'color');
      if (color) m.setBaseColorTexture(makeTexture('alpha', color, 1024));
      m.setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true).setRoughnessFactor(0.75);
      continue;
    }
    const isHead = /head/i.test(n);
    const color = tgaFor(n, 'color');
    const normal = tgaFor(n, 'normal');
    const spec = tgaFor(n, 'specular');
    if (color) m.setBaseColorTexture(makeTexture('color', color, 1024));
    if (normal) m.setNormalTexture(makeTexture('normal', normal, isHead ? 1024 : 512));
    if (spec) m.setMetallicRoughnessTexture(makeTexture('rough', spec, 512));
    else m.setRoughnessFactor(0.7);
  }
  for (const a of root.listAnimations()) a.dispose();

  await doc.transform(prune(), dedup(), quantize({ quantizeNormal: 10, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder }));
  const out = join(OUT, 'avatars', `${name}.glb`);
  await io.write(out, doc);
  rmSync(work, { recursive: true, force: true });
  return readFileSync(out).byteLength;
}

// ---------------- Animationer ----------------
// Klippnamn i spelet -> fil i Rocketbox ({g} = f eller m)
const CLIPS = {
  idle1: 'static/{g}_idle_neutral_01',
  idle2: 'static/{g}_idle_neutral_02',
  idle3: 'static/{g}_idle_look_around_01',
  idle4: 'static/{g}_idle_breathe_01',
  walk: 'xy/{g}_walk_neutral_01',
  sit1: 'static/{g}_sit_chair_idle_neutral_01',
  sit2: 'static/{g}_sit_chair_idle_relaxed_01',
  sit3: 'static/{g}_sit_chair_breathe_01',
  sitTalk: 'static/{g}_sit_chair_gestic_thoughtful',
  talk1: 'static/{g}_gestic_talk_neutral_01',
  talk2: 'static/{g}_gestic_talk_relaxed_01',
  talk3: 'static/{g}_gestic_talk_neutral_02',
  listen1: 'static/{g}_gestic_listen_neutral_01',
  listen2: 'static/{g}_gestic_listen_accept_01',
  wave: 'static/{g}_wave_01',
  // Handlingar man kan be personerna om
  dance: 'static/{g}_dancing_neutral',
  clap: 'static/{g}_claphands_01',
  cheer: 'static/{g}_cheer_01',
  laugh: 'static/{g}_gestic_laugh_loud',
  shrug: 'static/{g}_gestic_shrug_01',
  sitShrug: 'static/{g}_sit_chair_gestic_shrug_01',
  stretch: 'static/{g}_idle_stretch_arms_01',
  yawn: 'static/{g}_idle_yawn_01',
  crouch: 'static/{g}_crouch_idle',
  photo: 'static/{g}_take_picture',
  think: 'static/{g}_gestic_thoughtful_01',
};

async function convertAnims(g) {
  let target = null;
  let nodeByName = null;
  for (const [clip, rel] of Object.entries(CLIPS)) {
    const [folder, file] = rel.replace('{g}', g).split('/');
    const path = `Assets/Animations/all_animations_max_motextr_${folder}/${file}.max.fbx`;
    const work = join(TMP, `anim_${g}_${clip}`);
    extract(path, `${work}.fbx`);
    fbx2gltf(`${work}.fbx`, work);
    const src = await io.read(`${work}.glb`);
    rmSync(`${work}.fbx`);
    rmSync(`${work}.glb`);
    if (!target) {
      // Första klippet blir basdokumentet; skelettet följer med så att kanalerna har noder att peka på
      target = src;
      nodeByName = new Map(target.getRoot().listNodes().map((n) => [n.getName(), n]));
    }
    const srcAnim = src.getRoot().listAnimations()[0];
    const anim = target === src ? srcAnim : target.createAnimation();
    anim.setName(clip);
    const buffer = target.getRoot().listBuffers()[0];
    for (const ch of [...srcAnim.listChannels()]) {
      const nodeName = ch.getTargetNode().getName();
      const path = ch.getTargetPath();
      const keep = path === 'rotation' || (path === 'translation' && nodeName === 'Bip01');
      if (!keep) {
        if (target === src) {
          ch.getSampler().dispose();
          ch.dispose();
        }
        continue;
      }
      const s = ch.getSampler();
      const input = s.getInput().getArray().slice();
      const output = s.getOutput().getArray().slice();
      if (path === 'translation' && folder === 'xy') {
        // Gå på stället: spelet flyttar karaktären själv
        for (let i = 0; i < output.length; i += 3) {
          output[i] = output[0];
          output[i + 2] = output[2];
        }
      }
      if (target === src) {
        s.getOutput().setArray(output);
        continue;
      }
      const node = nodeByName.get(nodeName);
      if (!node) continue;
      const inAcc = target.createAccessor().setType('SCALAR').setArray(input).setBuffer(buffer);
      const outAcc = target.createAccessor().setType(s.getOutput().getType()).setArray(output).setBuffer(buffer);
      const sampler = target.createAnimationSampler().setInput(inAcc).setOutput(outAcc).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler);
      anim.addChannel(target.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
    }
    console.log(`  ${g}/${clip}`);
  }
  await target.transform(resample({ tolerance: 0.0005 }), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder }));
  const out = join(OUT, 'anims', `${g}.glb`);
  await io.write(out, target);
  return readFileSync(out).byteLength;
}

// ---------------- Kör ----------------
const all = listFiles('Assets/Avatars/Adults')
  .map((p) => p.split('/')[3])
  .filter((v, i, a) => a.indexOf(v) === i);
const wanted = process.argv.slice(3).filter((a) => a !== '--anims');
const avatars = wanted.length ? wanted : all;
if (!wanted.length || process.argv.includes('--anims')) {
  for (const g of ['f', 'm']) console.log(`anims/${g}.glb`, ((await convertAnims(g)) / 1024).toFixed(0), 'kB');
}
const manifest = [];
for (const name of avatars) {
  if (!all.includes(name)) continue;
  const size = await convertAvatar(name);
  manifest.push({ id: name, gender: name.startsWith('Female') ? 'f' : 'm' });
  console.log(name, (size / 1024).toFixed(0), 'kB');
}
const manifestPath = join(OUT, 'avatars', 'index.json');
const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
const merged = [...prev.filter((p) => !manifest.some((m) => m.id === p.id)), ...manifest].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(manifestPath, JSON.stringify(merged, null, 1));
rmSync(TMP, { recursive: true, force: true });
