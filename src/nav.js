import { ROOM, HALL, DOOR } from './room.js';

// Rutnät för vägplanering (A*) och kollision.
const CELL = 0.2;
const MIN_X = HALL.minX;
const MAX_X = ROOM.maxX;
const MIN_Z = ROOM.minZ;
const MAX_Z = ROOM.maxZ;
const COLS = Math.ceil((MAX_X - MIN_X) / CELL);
const ROWS = Math.ceil((MAX_Z - MIN_Z) / CELL);

function inRect(x, z, r, pad = 0) {
  return x > r.x1 - pad && x < r.x2 + pad && z > r.z1 - pad && z < r.z2 + pad;
}

// Fritt utrymme (utan möbler) för en cirkel med radien r
function openSpace(x, z, r) {
  const inRoom = x > ROOM.minX + r && x < ROOM.maxX - r && z > ROOM.minZ + r && z < ROOM.maxZ - r;
  const inHall = x > HALL.minX + r && x < HALL.maxX + 0.01 && z > HALL.minZ + r && z < HALL.maxZ - r;
  const inDoor = x > ROOM.minX - 0.4 && x < ROOM.minX + 0.4 && z > DOOR.z1 + r && z < DOOR.z2 - r;
  return inRoom || inHall || inDoor;
}

export class Nav {
  constructor(blockers) {
    // Väggarna som tjocka block (bara för spelarens kollision, rutnätet hanterar dem själv)
    const walls = [
      [ROOM.minX - 0.5, ROOM.minZ - 0.5, ROOM.maxX + 0.5, ROOM.minZ],
      [ROOM.minX - 0.5, ROOM.maxZ, ROOM.maxX + 0.5, ROOM.maxZ + 0.5],
      [ROOM.maxX, ROOM.minZ - 0.5, ROOM.maxX + 0.5, ROOM.maxZ + 0.5],
      [ROOM.minX - 0.15, ROOM.minZ, ROOM.minX, DOOR.z1],
      [ROOM.minX - 0.15, DOOR.z2, ROOM.minX, ROOM.maxZ],
      [HALL.minX - 0.5, HALL.minZ - 0.5, HALL.maxX, HALL.minZ],
      [HALL.minX - 0.5, HALL.maxZ, HALL.maxX, HALL.maxZ + 0.5],
      [HALL.minX - 0.5, HALL.minZ, HALL.minX, HALL.maxZ],
    ].map(([x1, z1, x2, z2]) => ({ x1, z1, x2, z2, nav: false }));
    this.blockers = [...blockers, ...walls];
    this.grid = new Uint8Array(COLS * ROWS);
    const R = 0.28;
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const [x, z] = this.center(i, j);
        let ok = openSpace(x, z, R);
        if (ok) ok = !blockers.some((b) => b.nav && inRect(x, z, b, R));
        this.grid[j * COLS + i] = ok ? 1 : 0;
      }
    }
  }

  center(i, j) {
    return [MIN_X + (i + 0.5) * CELL, MIN_Z + (j + 0.5) * CELL];
  }

  cellOf(x, z) {
    return [Math.floor((x - MIN_X) / CELL), Math.floor((z - MIN_Z) / CELL)];
  }

  walkable(i, j) {
    return i >= 0 && j >= 0 && i < COLS && j < ROWS && this.grid[j * COLS + i] === 1;
  }

  nearestWalkable(x, z) {
    const [ci, cj] = this.cellOf(x, z);
    if (this.walkable(ci, cj)) return [ci, cj];
    for (let r = 1; r < 10; r++) {
      let best = null;
      let bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.walkable(ci + di, cj + dj)) {
            const d = di * di + dj * dj;
            if (d < bestD) {
              bestD = d;
              best = [ci + di, cj + dj];
            }
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Kollision för spelaren: knuffar ut en cirkel från väggar och möbler.
  resolve(pos, r) {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.blockers) {
        const cx = Math.max(b.x1, Math.min(pos.x, b.x2));
        const cz = Math.max(b.z1, Math.min(pos.z, b.z2));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x += (dx / d) * (r - d);
            pos.z += (dz / d) * (r - d);
          } else {
            // Mitten hamnade inne i blocket: knuffa ut längs kortaste axeln
            const pushes = [
              [b.x1 - r - pos.x, 0],
              [b.x2 + r - pos.x, 0],
              [0, b.z1 - r - pos.z],
              [0, b.z2 + r - pos.z],
            ];
            pushes.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
            pos.x += pushes[0][0];
            pos.z += pushes[0][1];
          }
        }
      }
    }
  }

  findPath(fromX, fromZ, toX, toZ) {
    const start = this.nearestWalkable(fromX, fromZ);
    const goal = this.nearestWalkable(toX, toZ);
    if (!start || !goal) return null;
    const N = COLS * ROWS;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const sIdx = start[1] * COLS + start[0];
    const gIdx = goal[1] * COLS + goal[0];
    g[sIdx] = 0;
    // Enkel binär heap
    const heap = [[0, sIdx]];
    const push = (f, idx) => {
      heap.push([f, idx]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const h = (idx) => {
      const i = idx % COLS;
      const j = (idx / COLS) | 0;
      const dx = Math.abs(i - goal[0]);
      const dz = Math.abs(j - goal[1]);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    while (heap.length) {
      const [, cur] = pop();
      if (cur === gIdx) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % COLS;
      const cj = (cur / COLS) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (!this.walkable(ni, nj)) continue;
          if (di && dj && (!this.walkable(ci + di, cj) || !this.walkable(ci, cj + dj))) continue;
          const nIdx = nj * COLS + ni;
          const cost = g[cur] + (di && dj ? 1.414 : 1);
          if (cost < g[nIdx]) {
            g[nIdx] = cost;
            came[nIdx] = cur;
            push(cost + h(nIdx), nIdx);
          }
        }
      }
    }
    if (came[gIdx] === -1 && gIdx !== sIdx) return null;
    const cells = [];
    for (let c = gIdx; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.center(c % COLS, (c / COLS) | 0));
    return this.smooth(pts);
  }

  lineClear(a, b) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.ceil(d / (CELL * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const [i, j] = this.cellOf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      if (!this.walkable(i, j)) return false;
    }
    return true;
  }

  // Ta bort onödiga mellanpunkter så att gången blir naturlig
  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let anchor = 0;
    for (let k = 2; k < pts.length; k++) {
      if (!this.lineClear(pts[anchor], pts[k])) {
        out.push(pts[k - 1]);
        anchor = k - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
}
