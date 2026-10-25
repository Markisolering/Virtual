import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';

// Rummets mått (meter). Rummet: x [-5, 5], z [-4, 4]. Hall utanför dörren: x [-8, -5].
export const ROOM = { minX: -5, maxX: 5, minZ: -4, maxZ: 4, height: 2.8 };
export const HALL = { minX: -8, maxX: -5, minZ: 0.3, maxZ: 3.3 };
export const DOOR = { x: -5, z1: 1.25, z2: 2.35, height: 2.1 };
export const SPAWN = new THREE.Vector3(-7.2, 0, 1.8);

const WALL_T = 0.15;

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0, opts) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat, opts);
  m.position.set(x, y, z);
  return m;
}

function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0, opts) {
  const m = mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, opts);
  m.position.set(x, y, z);
  return m;
}

function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 24, opts) {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, opts);
  m.position.set(x, y, z);
  return m;
}

// Vägg längs lokal x-axel med rektangulära öppningar (fönster/dörr).
function wallWithOpenings(length, height, openings, mat) {
  const g = new THREE.Group();
  const cuts = [...openings].sort((a, b) => a.start - b.start);
  let cursor = -length / 2;
  const addSeg = (x1, x2, y1, y2) => {
    if (x2 - x1 < 0.001 || y2 - y1 < 0.001) return;
    const w = x2 - x1;
    const h = y2 - y1;
    const m = box(w, h, WALL_T, mat, (x1 + x2) / 2, (y1 + y2) / 2, 0);
    // Skala UV så att texturen inte töjs ut på små väggbitar
    const uv = m.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / length), uv.getY(i) * (h / height));
    g.add(m);
  };
  for (const o of cuts) {
    addSeg(cursor, o.start, 0, height);
    addSeg(o.start, o.end, 0, o.bottom);
    addSeg(o.start, o.end, o.top, height);
    cursor = o.end;
  }
  addSeg(cursor, length / 2, 0, height);
  return g;
}

export function buildRoom(scene, quality) {
  const blockers = []; // {x1,z1,x2,z2, nav}
  const seats = [];
  const pois = [];
  const lights = [];
  const block = (x1, z1, x2, z2, nav = true) => blockers.push({ x1, z1, x2, z2, nav });

  // ---------- Material ----------
  const floorTex = TX.woodFloor();
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex.map,
    roughnessMap: floorTex.roughnessMap,
    roughness: 0.55,
    metalness: 0,
    envMapIntensity: 0.8,
  });
  const plasterMat = new THREE.MeshStandardMaterial({ map: TX.plaster(), roughness: 0.92 });
  const wallpaperMat = new THREE.MeshStandardMaterial({ map: TX.wallpaper(), roughness: 0.85 });
  const ceilingMat = new THREE.MeshStandardMaterial({ map: TX.plaster('#f4f1ea', 8), roughness: 0.95 });
  const whitePaint = new THREE.MeshStandardMaterial({ color: '#f3f0e8', roughness: 0.45 });
  const oak = new THREE.MeshStandardMaterial({ map: floorTex.map.clone(), color: '#d6a878', roughness: 0.5 });
  oak.map.repeat.set(0.6, 0.6);
  const walnut = new THREE.MeshStandardMaterial({ map: floorTex.map.clone(), color: '#7a5038', roughness: 0.45 });
  walnut.map.repeat.set(0.5, 0.5);
  const blackMetal = new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.35, metalness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a45c', roughness: 0.25, metalness: 1 });
  const ceramic = new THREE.MeshStandardMaterial({ color: '#efe9df', roughness: 0.3 });
  const sofaFabric = new THREE.MeshStandardMaterial({ map: TX.fabric('#4a5d7a', 2, 3), roughness: 0.95 });
  const chairFabric = new THREE.MeshStandardMaterial({ map: TX.fabric('#b8643c', 5, 3), roughness: 0.95 });
  const creamFabric = new THREE.MeshStandardMaterial({ map: TX.fabric('#ddd3c0', 9, 3), roughness: 0.95 });
  const stone = new THREE.MeshStandardMaterial({ color: '#d9d6d0', roughness: 0.25, metalness: 0.05 });
  const cabinetMat = new THREE.MeshStandardMaterial({ color: '#2f4a43', roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: '#c0c4c8', roughness: 0.2, metalness: 1 });

  // ---------- Golv och tak ----------
  const floor = mesh(new THREE.PlaneGeometry(10, 8), floorMat, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceiling = mesh(new THREE.PlaneGeometry(10, 8), ceilingMat, { cast: false });
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.height;
  scene.add(ceiling);

  // ---------- Väggar ----------
  const H = ROOM.height;
  const windows = [
    { z: -0.6, w: 1.4 },
    { z: 2.0, w: 1.4 },
  ];
  const sill = 0.85;
  const winTop = 2.35;

  const back = wallWithOpenings(10 + WALL_T * 2, H, [], wallpaperMat);
  back.position.set(0, 0, ROOM.minZ - WALL_T / 2);
  scene.add(back);

  const front = wallWithOpenings(10 + WALL_T * 2, H, [], plasterMat);
  front.position.set(0, 0, ROOM.maxZ + WALL_T / 2);
  front.rotation.y = Math.PI;
  scene.add(front);

  // Höger vägg (fönster). Rotationen -90° gör att lokal x längs väggen = +z i världen.
  const right = wallWithOpenings(
    8,
    H,
    windows.map((w) => ({ start: w.z - w.w / 2, end: w.z + w.w / 2, bottom: sill, top: winTop })),
    plasterMat,
  );
  right.position.set(ROOM.maxX + WALL_T / 2, 0, 0);
  right.rotation.y = -Math.PI / 2;
  scene.add(right);

  // Vänster vägg (dörr). Rotationen +90° gör att lokal x = -z i världen.
  const left = wallWithOpenings(8, H, [{ start: -DOOR.z2, end: -DOOR.z1, bottom: 0, top: DOOR.height }], plasterMat);
  left.position.set(ROOM.minX - WALL_T / 2, 0, 0);
  left.rotation.y = Math.PI / 2;
  scene.add(left);

  // Golvlister och taklister
  const skirting = (len, x, z, rotY) => {
    const s = box(len, 0.1, 0.02, whitePaint, 0, 0.05, 0, { cast: false });
    const c = box(len, 0.06, 0.06, whitePaint, 0, H - 0.03, 0, { cast: false });
    const g = new THREE.Group();
    g.add(s, c);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
  };
  skirting(10, 0, ROOM.minZ + 0.01, 0);
  skirting(10, 0, ROOM.maxZ - 0.01, 0);
  skirting(8, ROOM.maxX - 0.01, 0, Math.PI / 2);
  skirting(8, ROOM.minX + 0.01, 0, Math.PI / 2);

  // ---------- Fönster ----------
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#dfefff',
    roughness: 0.02,
    metalness: 0,
    transparent: true,
    opacity: 0.12,
    envMapIntensity: 1.5,
  });
  const curtainMat = new THREE.MeshStandardMaterial({
    map: TX.fabric('#e8dcc4', 13, 2),
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const curtainGeo = (() => {
    const g = new THREE.PlaneGeometry(0.55, 2.5, 40, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 38) * 0.035);
    g.computeVertexNormals();
    return g;
  })();
  for (const w of windows) {
    const g = new THREE.Group();
    g.position.set(ROOM.maxX, 0, w.z);
    const fw = 0.06;
    const fh = winTop - sill;
    g.add(box(0.12, fw, w.w + 0.1, whitePaint, 0, sill - fw / 2 + 0.02, 0));
    g.add(box(0.28, 0.04, w.w + 0.2, whitePaint, -0.1, sill - 0.02, 0)); // fönsterbräda
    g.add(box(0.12, fw, w.w + 0.1, whitePaint, 0, winTop + fw / 2 - 0.02, 0));
    g.add(box(0.12, fh, fw, whitePaint, 0, (sill + winTop) / 2, -w.w / 2 + fw / 2));
    g.add(box(0.12, fh, fw, whitePaint, 0, (sill + winTop) / 2, w.w / 2 - fw / 2));
    g.add(box(0.08, fh, 0.04, whitePaint, 0, (sill + winTop) / 2, 0));
    g.add(box(0.08, 0.04, w.w, whitePaint, 0, sill + fh * 0.62, 0));
    const glass = mesh(new THREE.PlaneGeometry(w.w, fh), glassMat, { cast: false, receive: false });
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(0.02, (sill + winTop) / 2, 0);
    g.add(glass);
    for (const side of [-1, 1]) {
      const c = mesh(curtainGeo, curtainMat);
      c.rotation.y = -Math.PI / 2;
      c.position.set(-0.12, 1.3, side * (w.w / 2 + 0.2));
      g.add(c);
    }
    g.add(cyl(0.015, 0.015, w.w + 1.1, brass, -0.12, 2.58, 0, 8).rotateX(Math.PI / 2));
    // En liten krukväxt på fönsterbrädan
    const pot = cyl(0.07, 0.055, 0.12, ceramic, -0.12, sill + 0.06, w.w * 0.3, 16);
    g.add(pot);
    const succ = mesh(new THREE.IcosahedronGeometry(0.08, 1), new THREE.MeshStandardMaterial({ color: '#5f8a4a', roughness: 0.6, flatShading: true }));
    succ.position.set(-0.12, sill + 0.17, w.w * 0.3);
    succ.scale.set(1, 0.7, 1);
    g.add(succ);
    scene.add(g);
    pois.push({ x: ROOM.maxX - 0.65, z: w.z, face: Math.PI / 2, label: 'fönstret' });
  }

  // Utsikt
  const outside = mesh(
    new THREE.PlaneGeometry(40, 20),
    new THREE.MeshBasicMaterial({ map: TX.outsideView(), toneMapped: false, color: '#e6e6e6' }),
    { cast: false, receive: false },
  );
  outside.position.set(14, 3, 0);
  outside.rotation.y = -Math.PI / 2;
  scene.add(outside);

  // ---------- Dörr och hall ----------
  const doorW = DOOR.z2 - DOOR.z1;
  const frameMat = whitePaint;
  const frame = new THREE.Group();
  frame.position.set(ROOM.minX, 0, 0);
  frame.add(box(0.22, DOOR.height + 0.08, 0.07, frameMat, 0, (DOOR.height + 0.08) / 2, DOOR.z1 - 0.035));
  frame.add(box(0.22, DOOR.height + 0.08, 0.07, frameMat, 0, (DOOR.height + 0.08) / 2, DOOR.z2 + 0.035));
  frame.add(box(0.22, 0.08, doorW + 0.14, frameMat, 0, DOOR.height + 0.04, (DOOR.z1 + DOOR.z2) / 2));
  scene.add(frame);

  const doorPivot = new THREE.Group();
  doorPivot.position.set(ROOM.minX - 0.03, 0, DOOR.z2);
  const doorMat = new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.4 });
  const leaf = new THREE.Group();
  leaf.add(rbox(0.045, DOOR.height - 0.01, doorW - 0.02, 0.01, doorMat, 0, DOOR.height / 2, -doorW / 2));
  // Speglar på dörren
  for (const y of [0.55, 1.45]) {
    leaf.add(box(0.06, 0.62, doorW - 0.3, doorMat, 0, y, -doorW / 2));
  }
  for (const sx of [0.04, -0.04]) {
    const handle = cyl(0.012, 0.012, 0.13, brass, sx, 1.0, -doorW + 0.12, 12);
    handle.rotation.x = Math.PI / 2;
    leaf.add(handle);
  }
  doorPivot.add(leaf);
  scene.add(doorPivot);

  const hallFloor = mesh(new THREE.PlaneGeometry(3, 3), floorMat, { cast: false });
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set(-6.5, 0.001, 1.8);
  scene.add(hallFloor);
  const hallCeil = mesh(new THREE.PlaneGeometry(3, 3), ceilingMat, { cast: false });
  hallCeil.rotation.x = Math.PI / 2;
  hallCeil.position.set(-6.5, H, 1.8);
  scene.add(hallCeil);
  const hallWallMat = new THREE.MeshStandardMaterial({ map: TX.plaster('#d8cbb6', 17), roughness: 0.9 });
  scene.add(box(3, H, WALL_T, hallWallMat, -6.5, H / 2, HALL.minZ - WALL_T / 2));
  scene.add(box(3, H, WALL_T, hallWallMat, -6.5, H / 2, HALL.maxZ + WALL_T / 2));
  scene.add(box(WALL_T, H, 3.3, hallWallMat, HALL.minX - WALL_T / 2, H / 2, 1.8));
  // Klädhängare i hallen
  const rack = new THREE.Group();
  rack.position.set(-7.8, 0, 0.6);
  rack.add(cyl(0.02, 0.02, 1.75, walnut, 0, 0.875, 0, 10));
  rack.add(cyl(0.18, 0.2, 0.03, walnut, 0, 0.015, 0, 20));
  for (let i = 0; i < 4; i++) {
    const hook = cyl(0.01, 0.01, 0.18, walnut, 0, 1.68, 0, 6);
    hook.rotation.z = 0.9;
    hook.rotation.y = (i * Math.PI) / 2;
    rack.add(hook);
  }
  const coat = rbox(0.32, 0.75, 0.16, 0.06, new THREE.MeshStandardMaterial({ map: TX.fabric('#6b4f3a', 33, 2), roughness: 1 }), 0.12, 1.25, 0);
  rack.add(coat);
  scene.add(rack);
  const hallLight = new THREE.PointLight('#ffd9a8', 2.5, 6, 2);
  hallLight.position.set(-6.5, 2.5, 1.8);
  scene.add(hallLight);
  scene.add(cyl(0.12, 0.12, 0.04, new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffe7c4', emissiveIntensity: 2 }), -6.5, H - 0.02, 1.8));
  // Dörrmatta
  const mat = box(0.7, 0.01, 1.0, new THREE.MeshStandardMaterial({ map: TX.fabric('#5a4a3a', 44, 4), roughness: 1 }), -5.6, 0.005, 1.8, { cast: false });
  scene.add(mat);

  // ---------- Vardagsrum ----------
  // Matta
  const rugMesh = mesh(new THREE.PlaneGeometry(3.4, 2.4), new THREE.MeshStandardMaterial({ map: TX.rug(), roughness: 1 }), { cast: false });
  rugMesh.rotation.x = -Math.PI / 2;
  rugMesh.position.set(2.0, 0.006, -1.9);
  scene.add(rugMesh);

  // Soffa
  {
    const g = new THREE.Group();
    const w = 2.3;
    g.add(rbox(w, 0.22, 0.9, 0.04, sofaFabric, 0, 0.25, 0));
    g.add(rbox(w - 0.3, 0.75, 0.22, 0.06, sofaFabric, 0, 0.55, 0.34));
    g.add(rbox(0.18, 0.62, 0.9, 0.06, sofaFabric, -w / 2 + 0.09, 0.42, 0));
    g.add(rbox(0.18, 0.62, 0.9, 0.06, sofaFabric, w / 2 - 0.09, 0.42, 0));
    for (const sx of [-0.49, 0.49]) {
      g.add(rbox(0.96, 0.16, 0.66, 0.07, sofaFabric, sx, 0.44, -0.08));
      g.add(rbox(0.9, 0.5, 0.18, 0.08, sofaFabric, sx, 0.72, 0.18).rotateX(-0.12));
    }
    // Kuddar
    const pillowMat = new THREE.MeshStandardMaterial({ map: TX.fabric('#d9a441', 19, 2), roughness: 1 });
    const p1 = rbox(0.42, 0.42, 0.12, 0.06, pillowMat, -0.75, 0.68, 0.06);
    p1.rotation.set(-0.25, 0.3, 0.1);
    const p2 = rbox(0.42, 0.42, 0.12, 0.06, creamFabric, 0.78, 0.68, 0.06);
    p2.rotation.set(-0.25, -0.3, -0.08);
    g.add(p1, p2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.025, 0.018, 0.14, walnut, sx * (w / 2 - 0.1), 0.07, sz * 0.36, 10));
    g.position.set(2.0, 0, -0.55);
    scene.add(g);
    block(0.85, -1.0, 3.15, -0.1);
    seats.push({ x: 1.5, z: -0.62, face: Math.PI, approach: [1.5, -1.42], height: 0.48, label: 'soffan' });
    seats.push({ x: 2.5, z: -0.62, face: Math.PI, approach: [2.5, -1.42], height: 0.48, label: 'soffan' });
  }

  // Soffbord
  {
    const g = new THREE.Group();
    g.add(rbox(1.15, 0.05, 0.62, 0.015, oak, 0, 0.42, 0));
    g.add(box(1.05, 0.02, 0.52, oak, 0, 0.14, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.022, 0.022, 0.42, blackMetal, sx * 0.52, 0.21, sz * 0.26, 8));
    // Saker på bordet
    const bookCols = ['#8c2f39', '#2d4059', '#e2b13c'];
    bookCols.forEach((c, i) => {
      const b = rbox(0.24, 0.035, 0.17, 0.004, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }), -0.3, 0.465 + i * 0.036, 0.05);
      b.rotation.y = i * 0.15;
      g.add(b);
    });
    const mug = cyl(0.04, 0.036, 0.09, ceramic, 0.18, 0.49, -0.1, 18);
    g.add(mug);
    const vase = mesh(
      new THREE.LatheGeometry(
        [0, 0.04, 0.07, 0.075, 0.05, 0.03, 0.035].map((r, i) => new THREE.Vector2(r, i * 0.04)),
        24,
      ),
      new THREE.MeshStandardMaterial({ color: '#2b6f77', roughness: 0.15 }),
    );
    vase.position.set(0.35, 0.445, 0.1);
    g.add(vase);
    for (let i = 0; i < 3; i++) {
      const stem = cyl(0.004, 0.004, 0.32, new THREE.MeshStandardMaterial({ color: '#4d6b35' }), 0.35 + (i - 1) * 0.02, 0.6, 0.1, 4);
      stem.rotation.z = (i - 1) * 0.25;
      g.add(stem);
      const flower = mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: ['#f4d35e', '#ee964b', '#f95738'][i], roughness: 0.6 }));
      flower.position.set(0.35 + (i - 1) * 0.06, 0.76, 0.1);
      g.add(flower);
    }
    g.position.set(2.0, 0, -2.2);
    scene.add(g);
    block(1.4, -2.55, 2.6, -1.85);
  }

  // TV-bänk + TV
  {
    const g = new THREE.Group();
    g.add(rbox(1.9, 0.45, 0.45, 0.02, walnut, 0, 0.32, 0));
    for (const sx of [-0.85, 0.85]) g.add(cyl(0.02, 0.015, 0.1, blackMetal, sx, 0.05, 0, 8));
    for (const sx of [-0.47, 0.47]) g.add(box(0.9, 0.38, 0.01, oak, sx, 0.32, 0.226, { cast: false }));
    const tv = new THREE.Group();
    tv.add(rbox(1.45, 0.84, 0.04, 0.01, blackMetal, 0, 0, 0));
    const screen = mesh(new THREE.PlaneGeometry(1.41, 0.8), new THREE.MeshStandardMaterial({ map: TX.screenTexture(), roughness: 0.08, metalness: 0.2, emissive: '#0b1220', emissiveIntensity: 0.4 }), { cast: false });
    screen.position.z = 0.021;
    tv.add(screen);
    tv.position.set(0, 1.25, -0.1);
    g.add(tv);
    // Högtalare och prylar
    g.add(rbox(0.5, 0.07, 0.1, 0.03, blackMetal, 0, 0.59, 0.1));
    const lampBase = cyl(0.06, 0.08, 0.2, ceramic, -0.75, 0.65, 0, 16);
    g.add(lampBase);
    g.position.set(2.0, 0, -3.77);
    scene.add(g);
    block(1.0, -4, 3.0, -3.5);
    pois.push({ x: 2.0, z: -1.45, face: Math.PI, label: 'tv:n' });
  }

  // Fåtölj
  const armchair = (x, z, rot, fabricMat) => {
    const g = new THREE.Group();
    g.add(rbox(0.85, 0.22, 0.8, 0.05, fabricMat, 0, 0.28, 0));
    g.add(rbox(0.85, 0.72, 0.2, 0.07, fabricMat, 0, 0.6, 0.32).rotateX(-0.1));
    g.add(rbox(0.16, 0.5, 0.8, 0.06, fabricMat, -0.36, 0.45, 0));
    g.add(rbox(0.16, 0.5, 0.8, 0.06, fabricMat, 0.36, 0.45, 0));
    g.add(rbox(0.56, 0.14, 0.6, 0.06, fabricMat, 0, 0.44, -0.06));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = cyl(0.022, 0.014, 0.18, walnut, sx * 0.34, 0.09, sz * 0.32, 8);
      leg.rotation.z = sx * 0.12;
      g.add(leg);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
  };
  armchair(4.2, -2.0, Math.PI / 2, chairFabric);
  block(3.75, -2.45, 4.65, -1.55);
  seats.push({ x: 4.15, z: -2.0, face: -Math.PI / 2, approach: [3.35, -2.0], height: 0.5, label: 'fåtöljen' });

  armchair(2.85, 3.45, 0, creamFabric);
  block(2.4, 3.0, 3.3, 3.95);
  seats.push({ x: 2.85, z: 3.4, face: Math.PI, approach: [2.85, 2.55], height: 0.5, label: 'läsfåtöljen' });

  // Golvlampor
  const floorLamp = (x, z) => {
    const g = new THREE.Group();
    g.add(cyl(0.16, 0.18, 0.03, blackMetal, 0, 0.015, 0, 24));
    g.add(cyl(0.012, 0.012, 1.5, brass, 0, 0.77, 0, 8));
    const shadeMat = new THREE.MeshStandardMaterial({
      color: '#f5ead6',
      emissive: '#ffcf8a',
      emissiveIntensity: 1.2,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.3, 28, 1, true), shadeMat, { cast: false }).translateY(1.6));
    const l = new THREE.PointLight('#ffc57d', 2.2, 6, 2);
    l.position.y = 1.55;
    g.add(l);
    lights.push(l);
    g.position.set(x, 0, z);
    scene.add(g);
    block(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
  };
  floorLamp(4.55, -2.95);
  floorLamp(2.05, 3.7);

  // Sidobord vid läsfåtöljen
  {
    const g = new THREE.Group();
    g.add(cyl(0.24, 0.24, 0.03, walnut, 0, 0.55, 0, 28));
    g.add(cyl(0.025, 0.025, 0.54, blackMetal, 0, 0.27, 0, 10));
    g.add(cyl(0.17, 0.17, 0.02, blackMetal, 0, 0.01, 0, 20));
    const book = rbox(0.2, 0.04, 0.15, 0.004, new THREE.MeshStandardMaterial({ color: '#3a5a40' }), 0.02, 0.585, 0);
    book.rotation.y = 0.4;
    g.add(book);
    g.add(cyl(0.035, 0.03, 0.12, ceramic, -0.1, 0.63, 0.08, 14));
    g.position.set(3.65, 0, 3.6);
    scene.add(g);
    block(3.4, 3.35, 3.9, 3.85);
  }

  // Bokhylla
  {
    const g = new THREE.Group();
    const w = 1.7;
    const h = 2.1;
    const d = 0.36;
    g.add(box(0.03, h, d, walnut, -w / 2, h / 2, 0));
    g.add(box(0.03, h, d, walnut, w / 2, h / 2, 0));
    g.add(box(w, 0.02, d, walnut, 0, h - 0.01, 0));
    g.add(box(w, h, 0.01, walnut, 0, h / 2, -d / 2 + 0.005));
    const shelves = 5;
    let seed = 1;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const bookPalette = ['#8c2f39', '#2d4059', '#e2b13c', '#3a5a40', '#d4a373', '#6d597a', '#b56576', '#355070', '#e9c46a', '#264653', '#f4a261', '#efe6dd'];
    const bookMats = bookPalette.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
    const bookGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let s = 0; s < shelves; s++) {
      const y = 0.06 + s * (h / shelves);
      g.add(box(w, 0.025, d, walnut, 0, y, 0));
      let x = -w / 2 + 0.03;
      while (x < w / 2 - 0.1) {
        if (r() < 0.12) {
          // Prydnad i stället för bok
          if (r() > 0.5) {
            const orb = mesh(new THREE.SphereGeometry(0.06, 16, 12), brass);
            orb.position.set(x + 0.08, y + 0.075, 0);
            g.add(orb);
          } else {
            const pot = cyl(0.06, 0.05, 0.1, ceramic, x + 0.08, y + 0.06, 0, 14);
            g.add(pot);
            const ivy = mesh(new THREE.IcosahedronGeometry(0.08, 1), new THREE.MeshStandardMaterial({ color: '#4f7d3a', flatShading: true, roughness: 0.7 }));
            ivy.position.set(x + 0.08, y + 0.15, 0);
            g.add(ivy);
          }
          x += 0.2;
          continue;
        }
        const bw = 0.025 + r() * 0.035;
        const bh = 0.18 + r() * 0.12;
        const b = mesh(bookGeo, bookMats[Math.floor(r() * bookMats.length)]);
        b.scale.set(bw, bh, 0.2 + r() * 0.08);
        b.position.set(x + bw / 2, y + 0.0125 + bh / 2, 0.02);
        if (r() < 0.08) {
          b.rotation.z = -0.25;
          b.position.x += 0.03;
        }
        g.add(b);
        x += bw + 0.002;
      }
    }
    g.position.set(-0.4, 0, -3.8);
    scene.add(g);
    block(-1.3, -4, 0.5, -3.55);
    pois.push({ x: -0.4, z: -3.05, face: Math.PI, label: 'bokhyllan' });
  }

  // Matbord med stolar och taklampa
  {
    const g = new THREE.Group();
    g.add(rbox(1.7, 0.05, 0.95, 0.02, oak, 0, 0.74, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.03, 0.022, 0.72, oak, sx * 0.75, 0.36, sz * 0.38, 10));
    // Dukning
    g.add(box(1.5, 0.003, 0.3, new THREE.MeshStandardMaterial({ map: TX.fabric('#c2c5aa', 50, 4) }), 0, 0.767, 0, { cast: false }));
    const bowl = mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ceramic);
    bowl.position.y = 0.92;
    bowl.scale.y = 0.6;
    g.add(bowl);
    const fruitCols = ['#e63946', '#f4a261', '#90be6d', '#e63946', '#ffb703'];
    fruitCols.forEach((c, i) => {
      const f = mesh(new THREE.SphereGeometry(0.045, 14, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
      const a = (i / fruitCols.length) * Math.PI * 2;
      f.position.set(Math.cos(a) * 0.07, 0.84 + (i === 4 ? 0.05 : 0), Math.sin(a) * 0.07);
      g.add(f);
    });
    for (const sx of [-0.45, 0.45]) {
      g.add(cyl(0.035, 0.03, 0.002, ceramic, sx, 0.767, 0.28, 20));
      g.add(cyl(0.11, 0.11, 0.012, ceramic, sx, 0.773, -0.28, 28));
    }
    g.position.set(-2.6, 0, -1.4);
    scene.add(g);
    block(-3.45, -1.875, -1.75, -0.925);

    const chairMat = new THREE.MeshStandardMaterial({ color: '#2a2a2c', roughness: 0.55 });
    const chair = (x, z, rot) => {
      const c = new THREE.Group();
      c.add(rbox(0.44, 0.04, 0.42, 0.015, oak, 0, 0.46, 0));
      const back = rbox(0.42, 0.26, 0.03, 0.012, oak, 0, 0.78, 0.2);
      back.rotation.x = -0.08;
      c.add(back);
      for (const sx of [-1, 1]) {
        c.add(cyl(0.016, 0.016, 0.46, chairMat, sx * 0.19, 0.23, -0.18, 8));
        c.add(cyl(0.016, 0.016, 0.9, chairMat, sx * 0.19, 0.45, 0.19, 8));
      }
      c.position.set(x, 0, z);
      c.rotation.y = rot;
      scene.add(c);
      block(x - 0.22, z - 0.22, x + 0.22, z + 0.22, false);
    };
    for (const cx of [-3.0, -2.2]) {
      chair(cx, -2.12, Math.PI);
      seats.push({ x: cx, z: -2.12, face: 0, approach: [cx, -2.75], height: 0.48, label: 'matbordet' });
      chair(cx, -0.68, 0);
      seats.push({ x: cx, z: -0.68, face: Math.PI, approach: [cx, -0.05], height: 0.48, label: 'matbordet' });
    }
    // Pendellampa
    const pend = new THREE.Group();
    pend.add(cyl(0.004, 0.004, 1.0, blackMetal, 0, 0.5, 0, 4));
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#1f3b36', roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
    const shade = mesh(new THREE.SphereGeometry(0.26, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.2), shadeMat, { cast: false });
    pend.add(shade);
    const bulb = mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffdca8', emissiveIntensity: 6 }), { cast: false });
    bulb.position.y = 0.04;
    pend.add(bulb);
    const pl = new THREE.PointLight('#ffd39a', 3, 6, 2);
    pl.position.y = -0.05;
    pend.add(pl);
    lights.push(pl);
    pend.position.set(-2.6, H - 1.0, -1.4);
    scene.add(pend);
    pois.push({ x: -2.6, z: -2.75, face: 0, label: 'matbordet' });
  }

  // Kök längs främre väggen
  {
    const g = new THREE.Group();
    const x1 = -4.85;
    const x2 = -1.65;
    const len = x2 - x1;
    const cx = (x1 + x2) / 2;
    g.add(box(len, 0.82, 0.6, cabinetMat, cx, 0.41 + 0.08, 3.7));
    g.add(box(len, 0.08, 0.55, new THREE.MeshStandardMaterial({ color: '#111' }), cx, 0.04, 3.72));
    g.add(box(len + 0.02, 0.04, 0.64, stone, cx, 0.92, 3.68));
    const doors = Math.round(len / 0.6);
    for (let i = 0; i < doors; i++) {
      const dx = x1 + (i + 0.5) * (len / doors);
      g.add(box(len / doors - 0.01, 0.78, 0.02, cabinetMat, dx, 0.5, 3.39, { cast: false }));
      g.add(box(0.12, 0.012, 0.02, brass, dx, 0.82, 3.375, { cast: false }));
    }
    // Överskåp och kakel
    const tileMat = new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.15 });
    const tile = box(len, 0.6, 0.01, tileMat, cx, 1.24, 3.995, { cast: false });
    g.add(tile);
    g.add(box(len, 0.7, 0.35, cabinetMat, cx, 1.95, 3.82));
    for (let i = 0; i < doors; i++) {
      const dx = x1 + (i + 0.5) * (len / doors);
      g.add(box(0.012, 0.12, 0.02, brass, dx + 0.2, 1.7, 3.635, { cast: false }));
    }
    // Diskho
    g.add(box(0.6, 0.02, 0.42, steel, -2.6, 0.945, 3.65, { cast: false }));
    const faucet = new THREE.Group();
    faucet.add(cyl(0.015, 0.02, 0.3, steel, 0, 0.15, 0, 12));
    const spout = cyl(0.012, 0.012, 0.2, steel, 0, 0.3, -0.1, 10);
    spout.rotation.x = Math.PI / 2;
    faucet.add(spout);
    faucet.position.set(-2.6, 0.94, 3.88);
    g.add(faucet);
    // Vattenkokare, skärbräda, kryddor
    const kettle = mesh(new THREE.LatheGeometry([0, 0.08, 0.09, 0.085, 0.06, 0].map((r, i) => new THREE.Vector2(r, i * 0.045)), 24), new THREE.MeshStandardMaterial({ color: '#c1121f', roughness: 0.25, metalness: 0.3 }));
    kettle.position.set(-4.3, 0.94, 3.75);
    g.add(kettle);
    const board = rbox(0.4, 0.025, 0.28, 0.01, oak, -3.5, 0.955, 3.7);
    board.rotation.y = 0.15;
    g.add(board);
    for (let i = 0; i < 4; i++) {
      g.add(cyl(0.025, 0.025, 0.1, new THREE.MeshStandardMaterial({ color: ['#e9c46a', '#e76f51', '#2a9d8f', '#f4a261'][i], roughness: 0.4 }), -1.95 - i * 0.07, 0.99, 3.88, 10));
    }
    // Undermonterad belysning
    const strip = box(len - 0.1, 0.015, 0.03, new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffe8c2', emissiveIntensity: 3 }), cx, 1.595, 3.7, { cast: false });
    g.add(strip);
    const kl = new THREE.PointLight('#ffe2b8', 1.2, 2.5, 2);
    kl.position.set(cx, 1.4, 3.55);
    g.add(kl);
    lights.push(kl);
    scene.add(g);
    block(x1, 3.35, x2, 4);
    pois.push({ x: -3.4, z: 2.85, face: 0, label: 'köket' });
    pois.push({ x: -2.3, z: 2.85, face: 0, label: 'köket' });

    // Kylskåp
    const fridge = new THREE.Group();
    fridge.add(rbox(0.7, 1.9, 0.66, 0.03, new THREE.MeshStandardMaterial({ color: '#e6e8ea', roughness: 0.25, metalness: 0.4 }), 0, 0.95, 0));
    fridge.add(box(0.7, 0.01, 0.01, blackMetal, 0, 1.25, -0.335, { cast: false }));
    fridge.add(cyl(0.012, 0.012, 0.5, steel, 0.28, 1.55, -0.36, 8));
    fridge.add(cyl(0.012, 0.012, 0.4, steel, 0.28, 0.85, -0.36, 8));
    // Magneter och lapp
    fridge.add(box(0.12, 0.16, 0.003, new THREE.MeshStandardMaterial({ color: '#fff7d6' }), -0.12, 1.55, -0.336, { cast: false }));
    fridge.position.set(-1.25, 0, 3.66);
    scene.add(fridge);
    block(-1.62, 3.3, -0.88, 4);
    pois.push({ x: -1.25, z: 2.85, face: 0, label: 'kylskåpet' });
  }

  // Skänk på främre väggen med tavla ovanför
  {
    const g = new THREE.Group();
    g.add(rbox(1.4, 0.6, 0.42, 0.015, walnut, 0, 0.42, 0));
    for (const sx of [-0.6, 0.6]) g.add(cyl(0.018, 0.012, 0.12, blackMetal, sx, 0.06, 0, 8));
    for (let i = 0; i < 3; i++) g.add(box(0.44, 0.52, 0.01, oak, -0.46 + i * 0.46, 0.42, -0.215, { cast: false }));
    // Skivspelare
    g.add(rbox(0.45, 0.1, 0.36, 0.01, oak, -0.3, 0.77, 0));
    const vinyl = cyl(0.15, 0.15, 0.006, new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.2 }), -0.3, 0.825, 0, 32);
    g.add(vinyl);
    g.add(cyl(0.05, 0.05, 0.007, new THREE.MeshStandardMaterial({ color: '#d62828' }), -0.3, 0.826, 0, 20));
    const vase2 = cyl(0.06, 0.08, 0.32, new THREE.MeshStandardMaterial({ color: '#c8553d', roughness: 0.6 }), 0.42, 0.88, 0, 20);
    g.add(vase2);
    g.position.set(1.0, 0, 3.78);
    g.rotation.y = Math.PI;
    scene.add(g);
    block(0.3, 3.55, 1.7, 4);
    pois.push({ x: 1.0, z: 3.0, face: 0, label: 'skivspelaren' });
  }

  // Krukväxter
  const bigPlant = (x, z, scale = 1) => {
    const g = new THREE.Group();
    const pot = mesh(
      new THREE.LatheGeometry([0.001, 0.17, 0.2, 0.22, 0.23].map((r, i) => new THREE.Vector2(r, i * 0.1)), 28),
      new THREE.MeshStandardMaterial({ color: '#d8cfc0', roughness: 0.8 }),
    );
    g.add(pot);
    g.add(cyl(0.21, 0.21, 0.02, new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 1 }), 0, 0.38, 0, 20));
    const leafMat = new THREE.MeshStandardMaterial({ color: '#3f6b35', roughness: 0.55, side: THREE.DoubleSide });
    const leafGeo = new THREE.SphereGeometry(0.12, 12, 8);
    leafGeo.scale(1, 0.12, 0.45);
    leafGeo.translate(0.12, 0, 0);
    for (let i = 0; i < 26; i++) {
      const stemH = 0.5 + Math.random() * 0.9;
      const a = Math.random() * Math.PI * 2;
      const stem = cyl(0.006, 0.008, stemH, new THREE.MeshStandardMaterial({ color: '#4d6b35' }), 0, 0.38 + stemH / 2, 0, 5, { cast: false });
      const tilt = 0.15 + Math.random() * 0.35;
      stem.rotation.set(Math.sin(a) * tilt, 0, Math.cos(a) * tilt);
      g.add(stem);
      const leaf = mesh(leafGeo, leafMat);
      const tip = new THREE.Vector3(0, stemH / 2, 0).applyEuler(stem.rotation).add(stem.position);
      leaf.position.copy(tip);
      leaf.rotation.set((Math.random() - 0.5) * 0.6, a, -0.5 - Math.random() * 0.6);
      leaf.scale.setScalar(1.4 + Math.random() * 0.9);
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    scene.add(g);
    block(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  };
  bigPlant(-4.5, -3.5, 1.1);
  bigPlant(-0.4, 3.6, 0.9);
  bigPlant(4.55, 0.7, 0.85);

  // Tavlor
  const pictureFrameMat = new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.4 });
  const goldFrame = new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 0.35, metalness: 0.8 });
  const paintingAt = (x, y, z, rotY, w, h, seed, fm = pictureFrameMat) => {
    const g = new THREE.Group();
    g.add(box(w + 0.08, h + 0.08, 0.035, fm, 0, 0, 0));
    g.add(box(w + 0.01, h + 0.01, 0.01, new THREE.MeshStandardMaterial({ color: '#f5f1e8' }), 0, 0, 0.015, { cast: false }));
    const art = mesh(new THREE.PlaneGeometry(w * 0.86, h * 0.86), new THREE.MeshStandardMaterial({ map: TX.painting(seed), roughness: 0.7 }), { cast: false });
    art.position.z = 0.022;
    g.add(art);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    scene.add(g);
  };
  paintingAt(1.0, 1.65, 3.97, Math.PI, 1.0, 0.75, 1);
  paintingAt(-4.97, 1.6, -1.4, Math.PI / 2, 1.3, 0.9, 2, goldFrame);
  paintingAt(-3.2, 1.55, -3.97, 0, 0.6, 0.8, 3);
  paintingAt(-2.4, 1.75, -3.97, 0, 0.5, 0.4, 4);
  paintingAt(-2.4, 1.25, -3.97, 0, 0.5, 0.4, 6);
  pois.push({ x: -4.2, z: -1.4, face: -Math.PI / 2, label: 'tavlan' });
  pois.push({ x: -4.25, z: 1.8, face: -Math.PI / 2, label: 'dörren' });

  // Väggklocka
  {
    const clock = new THREE.Group();
    clock.add(cyl(0.18, 0.18, 0.04, ceramic, 0, 0, 0, 40).rotateX(Math.PI / 2));
    clock.add(mesh(new THREE.TorusGeometry(0.18, 0.012, 8, 40), brass));
    const hand = (len, w) => {
      const p = new THREE.Group();
      p.add(box(w, len, 0.004, blackMetal, 0, len / 2 - 0.01, 0, { cast: false }));
      p.position.z = 0.025;
      clock.add(p);
      return p;
    };
    const hourHand = hand(0.09, 0.012);
    const minHand = hand(0.14, 0.008);
    clock.position.set(-4.96, 2.15, 2.9);
    clock.rotation.y = Math.PI / 2;
    clock.userData.update = () => {
      const d = new Date();
      const m = d.getMinutes() + d.getSeconds() / 60;
      const h = (d.getHours() % 12) + m / 60;
      minHand.rotation.z = -(m / 60) * Math.PI * 2;
      hourHand.rotation.z = -(h / 12) * Math.PI * 2;
    };
    scene.add(clock);
    scene.userData.clock = clock;
  }

  // Taklampor (infällda spotlights som ljuskällor)
  const spotMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff1db', emissiveIntensity: 3 });
  for (const [x, z] of [[2.0, -1.5], [2.0, 2.0], [-2.6, 2.4], [-0.5, 0.5]]) {
    scene.add(cyl(0.07, 0.07, 0.01, spotMat, x, H - 0.005, z, 20, { cast: false }));
    const l = new THREE.PointLight('#ffe7c7', 1.1, 5, 2);
    l.position.set(x, H - 0.25, z);
    scene.add(l);
    lights.push(l);
  }

  // ---------- Ljussättning ----------
  const hemi = new THREE.HemisphereLight('#dfe9ff', '#5a4632', 0.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 3.2);
  sun.position.set(13, 9, 4);
  sun.target.position.set(1, 0, -0.5);
  sun.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  return { blockers, seats, pois, doorPivot, lights };
}
