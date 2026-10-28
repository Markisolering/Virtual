import * as THREE from 'three';
import { angleDiff } from './characters.js';
import { PLACES } from './commands.js';
import { en } from './i18n.js';

// Personer som gör saker tillsammans: kramas, gör high five, skakar hand, dansar, pratar med varandra
// eller sätter sig bredvid varandra. Den som spelaren ber går fram till den andra, de vänder sig mot
// varandra och gör en rörelse var som passar ihop.

const HUG = {
  beskrivning: 'kramar',
  nyckelbilder: [
    { tid: 0.6, h_arm_framat: 80, h_arm_utat: 25, h_arm_vrid: 45, h_armbage: 75, v_arm_framat: 80, v_arm_utat: 25, v_arm_vrid: 45, v_armbage: 75, huvud_vrid: 25, huvud_luta: -10, overkropp_framat: 8 },
    { tid: 2.6, h_arm_framat: 78, h_arm_utat: 22, h_arm_vrid: 50, h_armbage: 85, v_arm_framat: 78, v_arm_utat: 22, v_arm_vrid: 50, v_armbage: 85, huvud_vrid: 25, huvud_luta: -10, overkropp_framat: 8 },
    { tid: 3.3, h_arm_framat: 0, h_arm_utat: 0, h_arm_vrid: 0, h_armbage: 0, v_arm_framat: 0, v_arm_utat: 0, v_arm_vrid: 0, v_armbage: 0, huvud_vrid: 0, huvud_luta: 0, overkropp_framat: 0 },
  ],
};
const highFive = (p) => ({
  beskrivning: 'gör high five',
  nyckelbilder: [
    { tid: 0.45, [`${p}_arm_framat`]: 135, [`${p}_arm_utat`]: 10, [`${p}_armbage`]: 35, [`${p}_hand`]: 'oppen' },
    { tid: 0.7, [`${p}_arm_framat`]: 150, [`${p}_arm_utat`]: 8, [`${p}_armbage`]: 10, [`${p}_hand`]: 'oppen' },
    { tid: 0.95, [`${p}_arm_framat`]: 140, [`${p}_arm_utat`]: 10, [`${p}_armbage`]: 25, [`${p}_hand`]: 'oppen' },
    { tid: 1.5, [`${p}_arm_framat`]: 0, [`${p}_arm_utat`]: 0, [`${p}_armbage`]: 0 },
  ],
});
const SHAKE = {
  beskrivning: 'skakar hand',
  nyckelbilder: [
    { tid: 0.5, h_arm_framat: 45, h_arm_utat: -18, h_arm_vrid: 15, h_armbage: 40, h_hand: 'oppen', huvud_nick: 5 },
    { tid: 0.75, h_arm_framat: 52, h_arm_utat: -18, h_arm_vrid: 15, h_armbage: 40, h_hand: 'oppen' },
    { tid: 1.0, h_arm_framat: 40, h_arm_utat: -18, h_arm_vrid: 15, h_armbage: 40, h_hand: 'oppen' },
    { tid: 1.25, h_arm_framat: 52, h_arm_utat: -18, h_arm_vrid: 15, h_armbage: 40, h_hand: 'oppen' },
    { tid: 1.5, h_arm_framat: 45, h_arm_utat: -18, h_arm_vrid: 15, h_armbage: 40, h_hand: 'oppen', huvud_nick: 0 },
    { tid: 2.1, h_arm_framat: 0, h_arm_utat: 0, h_arm_vrid: 0, h_armbage: 0 },
  ],
};

// dist = avstånd mellan personerna när de gör det; stand = båda måste stå upp
export const INTERACTIONS = {
  kram: { dist: 0.44, a: HUG, b: HUG, time: 3.4, stand: true, text: 'kramas' },
  high_five: { dist: 0.72, a: highFive('h'), b: highFive('v'), time: 1.6, stand: true, text: 'gör high five' },
  skaka_hand: { dist: 0.7, a: SHAKE, b: SHAKE, time: 2.2, stand: true, text: 'skakar hand' },
  dansa: { dist: 1.0, gesture: 'dansa', time: 9, stand: true, text: 'dansar tillsammans' },
  prata: { dist: 1.05, talk: true, text: 'pratar med varandra' },
  satt_bredvid: { seat: true, text: 'sätter sig bredvid' },
  ga_fram: { dist: 0.95, time: 1, text: 'går fram till' },
};

// Repliker när spelaren inte har AI-samtal påslaget
const SMALL_TALK = en
  ? [
      ['Hi! How’s it going?', 'Good, and you?'],
      ['Cosy in here, isn’t it?', 'Definitely. Nice lamp, by the way.'],
      ['Seen anything good on TV lately?', 'Not really. Any tips?'],
      ['What weather, eh?', 'I know, you never know what to wear.'],
      ['Do you know the person who lives here?', 'A little. Do you?'],
    ]
  : [
      ['Hej! Hur är läget?', 'Bara bra, och du?'],
      ['Visst är det mysigt här?', 'Verkligen. Fin lampa förresten.'],
      ['Har du sett något bra på tv på sistone?', 'Inte direkt. Tips?'],
      ['Vilket väder alltså.', 'Ja, man vet aldrig vad man ska ta på sig.'],
      ['Känner du personen som bor här?', 'Lite grann. Själv då?'],
    ];

export class Interactions {
  constructor({ camera }) {
    this.camera = camera;
    this.active = [];
  }

  // a = den spelaren pratar med, b = den andra. Returnerar { ok, reason } som andra kommandon.
  start(a, b, kind, lines, world) {
    const spec = INTERACTIONS[kind];
    if (!spec) return { ok: false, reason: 'unknown' };
    if (!b || b === a || !world.characters.includes(b) || b.state === 'leaving' || b.done) return { ok: false, reason: 'noPerson' };
    this.end(a);
    this.end(b);
    if (spec.seat) return this.sitBeside(a, b, world);
    const it = { a, b, kind, spec, phase: 'gather', t: 0, lines: lines?.length ? lines : null };
    a.partner = b;
    b.partner = a;
    // Den andra stannar där hen är (och reser sig först om det behövs)
    if (b.seated && spec.stand) b.command({ action: 'res_dig', internal: true }, world);
    else this.hold(b);
    if (a.seated) a.command({ action: 'res_dig', internal: true }, world);
    else if (a.state !== 'standingUp') this.hold(a);
    a.following = false;
    a.commandActive = true;
    this.active.push(it);
    return { ok: true };
  }

  // Släpp en stol personen var på väg till (efter att ha rest sig väljer personen annars något nytt att göra)
  release(c) {
    if (c.state === 'toSeat' && c.seat) {
      if (c.seat.occupant === c) c.seat.occupant = null;
      c.seat = null;
    }
  }

  hold(c) {
    if (c.seated) return;
    this.release(c);
    c.path = null;
    c.state = 'idle';
    c.following = false;
    c.timer = 60;
    c.holdUntil = Math.max(c.holdUntil, c.age + 60);
    c.commandActive = true;
  }

  // Sätt dig på den lediga plats som är närmast den andra
  sitBeside(a, b, world) {
    if (!b.seated) return { ok: false, reason: 'notSeated' };
    const seat = world.seats.filter((s) => !s.occupant && s !== b.seat).sort((p, q) => Math.hypot(p.x - b.seat.x, p.z - b.seat.z) - Math.hypot(q.x - b.seat.x, q.z - b.seat.z))[0];
    if (!seat) return { ok: false, reason: 'occupied' };
    const place = Object.keys(PLACES).find((k) => PLACES[k].seat === seat.label);
    return a.command({ action: 'satt_dig', place, internal: true }, world);
  }

  end(c) {
    const it = this.active.find((x) => x.a === c || x.b === c);
    if (it) this.finish(it);
  }

  finish(it) {
    this.active = this.active.filter((x) => x !== it);
    for (const c of [it.a, it.b]) {
      if (c.partner === it.a || c.partner === it.b) c.partner = null;
      c.commandActive = false;
      c.desiredHeading = undefined;
      if (!c.seated && c.state === 'idle') c.timer = 4 + Math.random() * 6;
      if (c.npcTalk) {
        c.talking = c.chatting || false;
        c.npcTalk = false;
      }
    }
    for (const el of it.bubbles || []) el.remove();
  }

  update(dt, world) {
    for (const it of [...this.active]) {
      const { a, b, spec } = it;
      // Avbrutet: någon gick, eller spelaren bad någon av dem om något annat
      if (a.done || b.done || a.state === 'leaving' || b.state === 'leaving' || a.partner !== b || b.partner !== a) {
        this.finish(it);
        continue;
      }
      it.t += dt;
      // Upptagna med varandra (annars vänder sig den spelaren pratar med mot spelaren)
      if (it.phase !== 'gather') a.commandActive = b.commandActive = true;
      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const d = Math.hypot(dx, dz);
      if (it.phase === 'gather') {
        // Vänta tills båda står och gå sedan fram
        if (b.seated || b.state === 'standingUp' || a.seated || a.state === 'standingUp') {
          if (it.t > 20) this.finish(it);
          continue;
        }
        if (b.state !== 'idle') this.hold(b);
        this.release(a);
        a.path = null;
        a.state = 'idle';
        const k = (spec.dist + 0.35) / Math.max(d, 0.01);
        if (d > spec.dist + 0.5 && a.setPath(world.nav, b.position.x - dx * k, b.position.z - dz * k)) {
          a.state = 'toPoi';
          a.poi = null;
          a.faceTarget = null;
        }
        a.commandActive = true;
        it.phase = 'approach';
        it.t = 0;
        continue;
      }
      if (it.phase === 'approach') {
        if (a.state === 'toPoi' && a.path?.length && it.t < 20) continue;
        a.path = null;
        a.state = 'idle';
        a.timer = 60;
        a.holdUntil = Math.max(a.holdUntil, a.age + 30);
        // Vänd er mot varandra och ta de sista stegen till rätt avstånd
        a.desiredHeading = Math.atan2(dx, dz);
        b.desiredHeading = Math.atan2(-dx, -dz);
        const gap = d - spec.dist;
        if (Math.abs(gap) > 0.02) {
          const step = Math.sign(gap) * Math.min(Math.abs(gap), dt * 0.6);
          a.position.x += (dx / d) * step;
          a.position.z += (dz / d) * step;
        }
        const turned = Math.abs(angleDiff(a.heading, a.desiredHeading)) < 0.2 && Math.abs(angleDiff(b.heading, b.desiredHeading)) < 0.2;
        if ((Math.abs(gap) <= 0.02 && turned) || it.t > 6) {
          it.phase = 'act';
          it.t = 0;
          this.act(it, world);
        }
        continue;
      }
      // act: håll riktningen och vänta tills de är klara
      a.desiredHeading = Math.atan2(dx, dz);
      b.desiredHeading = Math.atan2(-dx, -dz);
      if (spec.talk) this.updateTalk(it, dt);
      else if (it.t > spec.time) this.finish(it);
    }
    this.placeBubbles();
  }

  act(it, world) {
    const { a, b, spec } = it;
    if (spec.a) {
      a.command({ action: 'rorelse', motion: spec.a, name: null, internal: true }, world);
      b.command({ action: 'rorelse', motion: spec.b, name: null, internal: true }, world);
    } else if (spec.gesture) {
      a.command({ action: spec.gesture, internal: true }, world);
      b.command({ action: spec.gesture, internal: true }, world);
    }
    for (const c of [a, b]) {
      c.commandActive = true;
      c.timer = 60;
    }
    if (spec.talk) {
      const lines = it.lines || SMALL_TALK[Math.floor(Math.random() * SMALL_TALK.length)].map((text, i) => ({ vem: i % 2 ? 'den_andra' : 'jag', text }));
      it.queue = lines.slice(0, 8);
      it.lineT = 0;
      it.bubbles = [a, b].map(() => {
        const el = document.createElement('div');
        el.className = 'npc-bubble';
        el.hidden = true;
        document.body.appendChild(el);
        return el;
      });
      for (const c of [a, b]) {
        c.chatting = c.talking;
        c.npcTalk = true;
        c.talking = true;
      }
    }
  }

  updateTalk(it, dt) {
    it.lineT -= dt;
    if (it.lineT > 0) return;
    const line = it.queue.shift();
    for (const el of it.bubbles) el.hidden = true;
    if (!line) {
      this.finish(it);
      return;
    }
    const i = line.vem === 'den_andra' ? 1 : 0;
    const who = i ? it.b : it.a;
    const el = it.bubbles[i];
    el.textContent = line.text;
    el.hidden = false;
    it.lineT = 1.6 + line.text.length * 0.055;
    who.speaking = it.lineT;
    who.speakText?.(line.text);
  }

  placeBubbles() {
    const v = new THREE.Vector3();
    for (const it of this.active) {
      if (!it.bubbles) continue;
      [it.a, it.b].forEach((c, i) => {
        const el = it.bubbles[i];
        if (el.hidden) return;
        v.copy(c.headWorld());
        v.y += 0.32;
        v.project(this.camera);
        const show = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
        el.style.display = show ? '' : 'none';
        el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
      });
    }
  }
}
