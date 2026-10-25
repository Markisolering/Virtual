import * as THREE from 'three';
import { prepareMotion, sampleMotion, saveMotion, motionTitle } from './motion.js';

// Redigeraren: spelaren fryser en rörelse, drar personens händer, fötter, huvud eller bröst dit de ska,
// och beskriver kort vad hen gjorde. Den rättade posen sparas i rörelsen och skickas till rörelsecoachen,
// så att AI:n lär sig (t.ex. var huvudet och håret finns).
//
// Kroppsdelarna flyttas med en enkel "inverterad kinematik": vinklarna för leden (t.ex. axel och armbåge)
// justeras stegvis tills handen hamnar där fingret drar den.

// Handtag: vilken punkt som dras och vilka vinklar som får ändras för att nå dit
const HANDLES = [
  { id: 'h_hand', label: 'Höger hand', params: ['h_arm_framat', 'h_arm_utat', 'h_arm_vrid', 'h_armbage'] },
  { id: 'v_hand', label: 'Vänster hand', params: ['v_arm_framat', 'v_arm_utat', 'v_arm_vrid', 'v_armbage'] },
  { id: 'h_fot', label: 'Höger fot', params: ['h_ben_framat', 'h_ben_utat', 'h_kna'] },
  { id: 'v_fot', label: 'Vänster fot', params: ['v_ben_framat', 'v_ben_utat', 'v_kna'] },
  { id: 'huvud', label: 'Huvud', params: ['huvud_nick', 'huvud_vrid'] },
  { id: 'brost', label: 'Bröst', params: ['overkropp_framat', 'overkropp_luta'] },
];

// Rimliga gränser så att lederna inte vrids åt omöjliga håll
const LIMITS = {
  arm_framat: [-60, 185],
  arm_utat: [-40, 185],
  arm_vrid: [-100, 100],
  armbage: [0, 150],
  handled: [-70, 70],
  ben_framat: [-45, 125],
  ben_utat: [-30, 80],
  kna: [0, 150],
  huvud_nick: [-60, 70],
  huvud_vrid: [-85, 85],
  overkropp_framat: [-35, 95],
  overkropp_luta: [-45, 45],
};
const limit = (param) => LIMITS[param.replace(/^[hv]_/, '')] || [-180, 180];

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class PoseEditor {
  constructor({ camera, canvas, ui, onClose, onSave }) {
    this.camera = camera;
    this.canvas = canvas;
    this.ui = ui; // { root, handles, slider, time, title, step1, step2, note, ... }
    this.onClose = onClose;
    this.onSave = onSave;
    this.active = false;
    this.orbit = { yaw: 0, pitch: 0.15, dist: 1.8 };
    this.pointers = new Map();
    this.raycaster = new THREE.Raycaster();
    this.bindEvents();
  }

  // ---------- Öppna och stäng ----------
  open(c, name, def, time) {
    this.c = c;
    this.name = name;
    this.def = JSON.parse(JSON.stringify(def));
    this.prepared = prepareMotion(this.def, c.rig);
    this.duration = Math.max(0.05, this.prepared.duration);
    // Börja vid närmaste nyckelbild (eller slutposen), så att ändringen hamnar i en befintlig nyckelbild
    const keys = this.def.nyckelbilder.map((k) => k.tid);
    const wanted = time ?? this.duration;
    this.time = Math.min(this.duration, keys.reduce((a, k) => (Math.abs(k - wanted) < Math.abs(a - wanted) ? k : a), keys[keys.length - 1] ?? 0));
    this.overrides = {}; // vinklar spelaren har ändrat: { param: värde }
    this.before = {}; // vinklarna innan ändringen, för att kunna beskriva skillnaden
    // Övriga kroppsdelar står kvar som i animationen tills spelaren tar tag i dem
    c.startEdit(this.def, c.rig.usedBones(this.def));
    this.setTime(this.time);
    // Kameran börjar framför personen, lite från sidan
    this.orbit = { yaw: c.heading + 0.45, pitch: 0.1, dist: 1.55 };
    this.center = this.focusPoint().clone();
    this.active = true;
    this.ui.title.textContent = `Visa hur "${motionTitle(name)}" ska se ut`;
    this.ui.slider.max = String(this.duration);
    this.ui.slider.value = String(this.time);
    this.ui.slider.disabled = this.duration < 0.1;
    this.showStep(1);
    this.ui.root.hidden = false;
    this.buildHandles();
  }

  close(saved = false) {
    if (!this.active) return;
    this.active = false;
    this.ui.root.hidden = true;
    this.ui.handles.innerHTML = '';
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.c.endEdit();
    this.onClose?.(this.c, saved);
  }

  showStep(n) {
    this.ui.step1.hidden = n !== 1;
    this.ui.step2.hidden = n !== 2;
    this.ui.handles.hidden = n !== 1;
    if (n === 2) {
      this.ui.note.value = '';
      this.ui.changes.textContent = this.describeChanges() || 'Inga ändringar ännu.';
    }
  }

  // ---------- Tid och pose ----------
  setTime(t) {
    this.time = t;
    this.ui.time.textContent = `${t.toFixed(1)} s`;
    const base = sampleMotion(this.prepared.frames, t);
    // Vinklar som inte finns i rörelsen räknas som 0 (neutral pose)
    this.base = base;
    this.c.editPose = { ...base, ...this.overrides };
  }

  value(param) {
    return this.c.editPose[param] ?? 0;
  }

  reset() {
    this.overrides = {};
    this.before = {};
    this.setTime(this.time);
  }

  // ---------- Kroppsdelarnas positioner ----------
  endPoint(id) {
    const { b } = this.c.rig;
    const side = id.startsWith('h_') ? b.R : b.L;
    if (id.endsWith('hand')) return (side.fingers[2]?.[0] || side.hand).getWorldPosition(new THREE.Vector3());
    if (id.endsWith('fot')) return side.foot.getWorldPosition(new THREE.Vector3());
    if (id === 'huvud') {
      // En punkt framför ansiktet, så att det går att styra vart huvudet tittar
      const head = b.head.getWorldPosition(new THREE.Vector3());
      const fwd = this.c.headForward.clone().applyQuaternion(b.head.getWorldQuaternion(_q));
      return head.addScaledVector(fwd, 0.2);
    }
    return (b.neck || b.spine[b.spine.length - 1]).getWorldPosition(new THREE.Vector3());
  }

  focusPoint() {
    const b = this.c.rig.b;
    return (b.spine[1] || b.pelvis).getWorldPosition(new THREE.Vector3());
  }

  // ---------- Lösaren ----------
  // Prova små ändringar i vinklarna och behåll dem som för punkten närmare målet
  solve(handle, target, budget = 30) {
    const c = this.c;
    const pose = { ...c.editPose };
    // Liten straffavgift för att ändra lederna mycket, så att den naturligaste posen vinner
    const start = this.drag?.startPose || c.editPose;
    const cost = () => {
      c.applyEditPose(pose);
      let change = 0;
      for (const p of handle.params) change += Math.abs((pose[p] ?? 0) - (start[p] ?? 0));
      return this.endPoint(handle.id).distanceTo(target) + change * 0.00008;
    };
    let best = cost();
    let evals = 1;
    this.step ||= 16;
    while (evals < budget && this.step >= 0.5) {
      let improved = false;
      for (const p of handle.params) {
        const [lo, hi] = limit(p);
        for (const dir of [1, -1]) {
          const old = pose[p] ?? 0;
          const next = Math.max(lo, Math.min(hi, old + dir * this.step));
          if (next === old) continue;
          pose[p] = next;
          const c2 = cost();
          evals++;
          if (c2 < best - 1e-4) {
            best = c2;
            improved = true;
            break;
          }
          pose[p] = old;
        }
        if (evals >= budget) break;
      }
      if (!improved) this.step /= 2;
    }
    // Spara de nya vinklarna som spelarens ändringar
    for (const p of handle.params) {
      if (pose[p] === undefined) continue;
      if (!(p in this.before)) this.before[p] = this.base[p] ?? 0;
      this.overrides[p] = Math.round(pose[p]);
    }
    c.editPose = { ...this.base, ...this.overrides };
    c.applyEditPose();
    return best;
  }

  describeChanges() {
    const names = Object.keys(this.overrides).filter((p) => Math.abs((this.overrides[p] ?? 0) - (this.before[p] ?? 0)) >= 2);
    return names.map((p) => `${p}: ${Math.round(this.before[p] ?? 0)} → ${this.overrides[p]}`).join(', ');
  }

  // Den rättade rörelsen: spelarens vinklar läggs in som nyckelbild vid den valda tiden
  correctedMotion() {
    const def = JSON.parse(JSON.stringify(this.def));
    const keys = def.nyckelbilder;
    const near = keys.find((k) => Math.abs(k.tid - this.time) < 0.06);
    if (near) Object.assign(near, this.overrides);
    else {
      keys.push({ tid: Math.round(this.time * 100) / 100, ...this.base, ...this.overrides });
      keys.sort((a, b) => a.tid - b.tid);
    }
    // Ändringar i en rörelse som bara rör armarna gäller ändå benen om fötterna flyttades
    if (Object.keys(this.overrides).some((p) => /ben|kna/.test(p))) def.hela_kroppen = true;
    return def;
  }

  save(note) {
    const def = this.correctedMotion();
    saveMotion(this.name, def);
    const correction = { tid: Math.round(this.time * 100) / 100, andringar: this.describeChanges(), note: note || '' };
    this.onSave?.(this.c, this.name, def, correction);
    this.close(true);
  }

  // ---------- Handtag och kamera ----------
  buildHandles() {
    this.ui.handles.innerHTML = '';
    this.handleEls = HANDLES.map((h) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pose-handle';
      el.dataset.id = h.id;
      el.innerHTML = `<span></span>`;
      el.querySelector('span').textContent = h.label;
      el.addEventListener('pointerdown', (e) => this.startDrag(e, h, el));
      this.ui.handles.appendChild(el);
      return { h, el };
    });
  }

  // Benen som ett handtag flyttar styrs av riggen från och med att man tar tag i det
  takeBones(id) {
    const b = this.c.rig.b;
    const x = id.startsWith('h_') ? b.R : b.L;
    const bones = id.endsWith('hand') ? [x.upper, x.fore, x.hand] : id.endsWith('fot') ? [x.thigh, x.calf] : id === 'huvud' ? [b.neck, b.head] : b.spine;
    for (const bone of bones) bone && this.c.editUsed.add(bone);
  }

  startDrag(e, handle, el) {
    e.preventDefault();
    e.stopPropagation();
    this.takeBones(handle.id);
    this.c.applyEditPose();
    el.setPointerCapture(e.pointerId);
    const start = this.endPoint(handle.id);
    // Dra i ett plan genom kroppsdelen, vänt mot kameran
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    this.drag = { handle, el, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start), target: start.clone(), id: e.pointerId, startPose: { ...this.c.editPose }, cast: 0 };
    // Kroppens yta (för att kunna lägga handen på huvudet, axeln osv.)
    if (!this.bodyReady) {
      this.c.model.traverse((o) => o.isSkinnedMesh && o.computeBoundingSphere());
      this.bodyReady = true;
    }
    this.step = 16;
    el.classList.add('dragging');
    const move = (ev) => {
      if (ev.pointerId !== this.drag?.id) return;
      const ndc = new THREE.Vector2((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.bodyHit(this.drag.handle.id) || this.raycaster.ray.intersectPlane(this.drag.plane, _v);
      if (hit) {
        this.drag.target.copy(hit);
        this.step = Math.max(this.step, 6);
      }
    };
    const up = (ev) => {
      if (ev.pointerId !== this.drag?.id) return;
      el.classList.remove('dragging');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      // Finjustera en sista gång när fingret släpps
      this.solve(this.drag.handle, this.drag.target, 120);
      this.drag = null;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // Pekar fingret på kroppen (inte på den del som dras) läggs kroppsdelen mot ytan där,
  // annars hamnar den i ett plan vänt mot kameran
  bodyHit(id) {
    const now = performance.now();
    if (now - this.drag.cast < 40) return this.drag.lastHit;
    this.drag.cast = now;
    const { b } = this.c.rig;
    const x = id.startsWith('h_') ? b.R : b.L;
    const chain = (id.endsWith('hand') ? [x.upper, x.fore, x.hand, x.fingers[2]?.[1]] : id.endsWith('fot') ? [x.thigh, x.calf, x.foot] : []).filter(Boolean);
    const pts = chain.map((bone) => bone.getWorldPosition(new THREE.Vector3()));
    const seg = new THREE.Line3();
    const near = (p) => pts.some((a, i) => i > 0 && seg.set(pts[i - 1], a).closestPointToPoint(p, true, _v).distanceTo(p) < 0.075);
    const hits = this.raycaster.intersectObject(this.c.model, true).filter((h) => h.object.visible && h.object.isMesh && !near(h.point));
    const hit = hits[0];
    this.drag.lastHit = hit ? hit.point.clone().addScaledVector(this.raycaster.ray.direction, -0.03) : null;
    return this.drag.lastHit;
  }

  bindEvents() {
    // Ett finger på bakgrunden vrider kameran runt personen, två fingrar zoomar
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.active || !this.pointers.has(e.pointerId)) return;
      const p = this.pointers.get(e.pointerId);
      if (this.pointers.size === 1) {
        this.orbit.yaw -= (e.clientX - p.x) * 0.008;
        this.orbit.pitch = Math.max(-0.6, Math.min(1.2, this.orbit.pitch + (e.clientY - p.y) * 0.006));
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX;
        p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        this.orbit.dist = Math.max(0.6, Math.min(4, this.orbit.dist * (before / Math.max(1, after))));
        return;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const end = (e) => this.pointers.delete(e.pointerId);
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        this.orbit.dist = Math.max(0.6, Math.min(4, this.orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
      },
      { passive: true },
    );
  }

  // Körs varje bildruta medan redigeraren är öppen
  update(dt) {
    if (!this.active) return;
    if (this.drag) this.solve(this.drag.handle, this.drag.target, 24);
    else this.c.applyEditPose();
    // Kamera runt personen
    this.center.lerp(this.focusPoint(), Math.min(1, dt * 5));
    const o = this.orbit;
    this.camera.position.set(
      this.center.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
      this.center.y + Math.sin(o.pitch) * o.dist,
      this.center.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
    );
    // Titta lite under bröstet, så att personen syns ovanför panelen längst ner
    this.camera.lookAt(this.center.x, this.center.y - 0.22, this.center.z);
    this.camera.updateMatrixWorld();
    // Placera handtagen över kroppsdelarna
    for (const { h, el } of this.handleEls || []) {
      const p = (this.drag?.handle === h ? this.drag.target.clone() : this.endPoint(h.id)).project(this.camera);
      const visible = p.z < 1;
      el.style.display = visible ? '' : 'none';
      el.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
    }
  }
}
