import * as THREE from 'three';

// Överföring av en pose från Rocketbox-skelettet (Bip01, som spelets animationer och egna rörelser
// styr) till en avatar med standardskelett (Avaturn, Mixamo och Ready Player Me: Hips, Spine, LeftArm …).
//
// Båda skeletten ställs först i samma T-pose: armarna rakt ut åt sidorna, benen rakt ner och ryggen
// rakt upp, oavsett vilken grundpose modellen sparades i. Varje leds vridning bort från T-posen förs
// sedan över, så att avataren gör exakt samma sak som Rocketbox-skelettet.

const SIDE = { L: 'Left', R: 'Right' };
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

// Rocketbox-namn -> standardnamn
function targetName(bip) {
  const n = bip.replace(/^Bip01_/, '');
  const simple = { Pelvis: 'Hips', Spine: 'Spine', Spine1: 'Spine1', Spine2: 'Spine2', Neck: 'Neck', Head: 'Head', LEye: 'LeftEye', REye: 'RightEye' };
  if (simple[n]) return simple[n];
  const m = n.match(/^([LR])_(.+)$/);
  if (!m) return null;
  const side = SIDE[m[1]];
  const part = { Clavicle: 'Shoulder', UpperArm: 'Arm', Forearm: 'ForeArm', Hand: 'Hand', Thigh: 'UpLeg', Calf: 'Leg', Foot: 'Foot', Toe0: 'ToeBase' }[m[2]];
  if (part) return side + part;
  const f = m[2].match(/^Finger(\d)(\d?)$/);
  if (f) return `${side}Hand${FINGERS[+f[1]]}${f[2] ? +f[2] + 1 : 1}`;
  return null;
}

// Ledernas riktning i T-posen (personen tittar längs +z, vänster är +x) och leden riktningen mäts mot
const UPV = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
function canonical() {
  const list = [
    ['Bip01_Spine', 'Bip01_Spine1', UPV],
    ['Bip01_Spine1', 'Bip01_Spine2', UPV],
    ['Bip01_Spine2', 'Bip01_Neck', UPV],
    ['Bip01_Neck', 'Bip01_Head', UPV],
  ];
  for (const [s, x] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const out = new THREE.Vector3(x, 0, 0);
    const p = `Bip01_${s}_`;
    list.push([`${p}Clavicle`, `${p}UpperArm`, out], [`${p}UpperArm`, `${p}Forearm`, out], [`${p}Forearm`, `${p}Hand`, out], [`${p}Hand`, `${p}Finger2`, out]);
    for (let f = 1; f <= 4; f++) list.push([`${p}Finger${f}`, `${p}Finger${f}1`, out], [`${p}Finger${f}1`, `${p}Finger${f}2`, out]);
    list.push([`${p}Thigh`, `${p}Calf`, DOWN], [`${p}Calf`, `${p}Foot`, DOWN]);
  }
  return list;
}
const CANON = canonical();

const norm = (name) => name.replace(/^mixamorig/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const depth = (o) => {
  let d = 0;
  for (let p = o.parent; p; p = p.parent) d++;
  return d;
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Vrid ett ben i världen så att riktningen mot barnet pekar åt `dir`
function aim(bone, child, dir) {
  bone.updateMatrixWorld(true);
  const from = child.getWorldPosition(_v).sub(bone.getWorldPosition(_v2));
  if (from.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(from.normalize(), dir);
  bone.parent.getWorldQuaternion(_q2);
  const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(_q);
  bone.quaternion.copy(_q2.invert().multiply(world));
  bone.updateMatrixWorld(true);
}

// T-posens vridning (relativt personens rot) för benen i `bones` (namn -> ben), utan att ändra modellen
function tPose(root, bones) {
  const saved = new Map([...Object.values(bones)].map((b) => [b, b.quaternion.clone()]));
  root.updateMatrixWorld(true);
  for (const [name, childName, dir] of CANON) {
    const b = bones[name];
    const c = bones[childName];
    if (b && c) aim(b, c, dir);
  }
  root.updateMatrixWorld(true);
  const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const out = {};
  for (const [name, b] of Object.entries(bones)) out[name] = rootInv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
  for (const [b, q] of saved) b.quaternion.copy(q);
  root.updateMatrixWorld(true);
  return out;
}

export class Retarget {
  // root: personens rotgrupp. source: Rocketbox-modellen. target: avatarens scen. Båda ska stå i sin
  // grundpose (innan någon animation har spelats) och ha roten utan vridning.
  constructor(root, source, target) {
    this.root = root;
    this.target = target;
    const src = {};
    source.traverse((o) => o.isBone && /^Bip01/.test(o.name) && (src[o.name] = o));
    const tgtByName = {};
    target.traverse((o) => o.isBone && (tgtByName[norm(o.name)] = o));
    // Par av ben som finns i båda skeletten
    const pairs = [];
    const srcMapped = {};
    const tgtMapped = {};
    for (const [name, bone] of Object.entries(src)) {
      const t = targetName(name);
      const tb = t && tgtByName[t.toLowerCase()];
      if (!tb) continue;
      pairs.push({ name, src: bone, tgt: tb });
      srcMapped[name] = bone;
      tgtMapped[name] = tb;
    }
    this.ok = pairs.some((p) => p.name === 'Bip01_Pelvis') && pairs.length >= 15;
    if (!this.ok) return;
    this.fitProportions(root, pairs);
    const sT = tPose(root, srcMapped);
    const tT = tPose(root, tgtMapped);
    for (const p of pairs) {
      // Avatarens vridning = källans vridning från dess T-pose, applicerad på avatarens T-pose
      p.offset = sT[p.name].clone().invert().multiply(tT[p.name]);
    }
    // Föräldrar före barn, så att varje ben räknas ut från en redan uppdaterad förälder
    this.pairs = pairs.sort((a, b) => depth(a.tgt) - depth(b.tgt));
    this.hips = pairs.find((p) => p.name === 'Bip01_Pelvis');
    // Höftens läge: avståndet mellan avatarens höft och Rocketbox-höften i grundposen (i höftens T-ram)
    root.updateMatrixWorld(true);
    const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const toRoot = (b) => root.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    this.hipOffset = toRoot(this.hips.tgt).sub(toRoot(this.hips.src)).applyQuaternion(sT.Bip01_Pelvis.clone().invert());
    this.rootInv = rootInv;
  }

  // Gör Rocketbox-skelettets delar (överarm, underarm, rygg …) lika långa som avatarens, så att
  // händer, fötter och huvud hamnar på samma ställe. Då stämmer kollisionerna och redigeraren.
  // Animationerna vrider bara lederna, så längderna ligger kvar.
  fitProportions(root, pairs) {
    const byTgt = new Map(pairs.map((p) => [p.tgt, p]));
    const srcSet = new Set(pairs.map((p) => p.src));
    root.updateMatrixWorld(true);
    for (const p of [...pairs].sort((a, b) => depth(a.tgt) - depth(b.tgt))) {
      let ta = p.tgt.parent;
      while (ta && !byTgt.has(ta)) ta = ta.parent;
      if (!ta) continue;
      const parent = byTgt.get(ta);
      // Bara delar som går mellan samma leder i båda skeletten (i Biped sitter t.ex. nyckelbenet på nacken)
      if (p.src.parent !== parent.src || !srcSet.has(p.src.parent)) continue;
      const lenT = p.tgt.getWorldPosition(_v).distanceTo(ta.getWorldPosition(_v2));
      const lenS = p.src.getWorldPosition(_v).distanceTo(parent.src.getWorldPosition(_v2));
      const k = lenT / lenS;
      if (lenS < 1e-4 || !(k > 0.4 && k < 2.5)) continue;
      p.src.position.multiplyScalar(k);
      root.updateMatrixWorld(true);
    }
  }

  // Kopiera källans pose till avataren (anropas varje bildruta, efter all animation)
  apply() {
    if (!this.ok) return;
    const root = this.root;
    root.updateMatrixWorld(true);
    const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
    const rootInv = rootQ.clone().invert();
    const q = new THREE.Quaternion();
    for (const p of this.pairs) {
      const { src, tgt } = p;
      // Källans vridning relativt roten, flyttad till avatarens T-pose, tillbaka till världen
      q.copy(rootInv).multiply(src.getWorldQuaternion(_q)).multiply(p.offset).premultiply(rootQ);
      tgt.parent.getWorldQuaternion(_q2);
      tgt.quaternion.copy(_q2.invert().multiply(q));
      if (p === this.hips) {
        // Höften följer källans höft (plus skillnaden mellan modellerna, vriden med höften)
        const rel = rootInv.clone().multiply(src.getWorldQuaternion(_q));
        const off = this.hipOffset.clone().applyQuaternion(rel);
        const world = root.localToWorld(root.worldToLocal(src.getWorldPosition(_v)).add(off));
        tgt.position.copy(tgt.parent.worldToLocal(world));
      }
      tgt.updateMatrix();
      tgt.matrixWorld.multiplyMatrices(tgt.parent.matrixWorld, tgt.matrix);
    }
    this.target.updateMatrixWorld(true);
  }
}
