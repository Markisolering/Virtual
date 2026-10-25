import * as THREE from 'three';

// Procedurella texturer ritade på canvas, så att spelet inte behöver ladda några bildfiler.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { repeat = [1, 1], srgb = true, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, w, h, amount, rand, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = rand() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rand() * alpha})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

export function woodFloor() {
  const size = 1024;
  const [c, ctx] = canvas(size);
  const [rc, rctx] = canvas(size);
  const rand = rng(7);
  const rows = 8;
  const plankH = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * size * 0.5;
    while (x < size) {
      const len = size * (0.35 + rand() * 0.4);
      const base = 120 + rand() * 40;
      const hue = 28 + rand() * 8;
      ctx.fillStyle = `hsl(${hue}, ${40 + rand() * 15}%, ${(base / 255) * 52}%)`;
      ctx.fillRect(x, r * plankH, len, plankH);
      // Ådring
      for (let g = 0; g < 26; g++) {
        const y = r * plankH + rand() * plankH;
        ctx.strokeStyle = `rgba(60,30,10,${0.05 + rand() * 0.12})`;
        ctx.lineWidth = 0.6 + rand() * 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const amp = 2 + rand() * 4;
        for (let px = 0; px <= len; px += 16) {
          ctx.lineTo(x + px, y + Math.sin(px * 0.02 + g) * amp);
        }
        ctx.stroke();
      }
      // Kvist
      if (rand() > 0.65) {
        const kx = x + rand() * len;
        const ky = r * plankH + plankH * (0.3 + rand() * 0.4);
        const grad = ctx.createRadialGradient(kx, ky, 1, kx, ky, 9);
        grad.addColorStop(0, 'rgba(50,25,8,0.7)');
        grad.addColorStop(1, 'rgba(50,25,8,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Fogar
      ctx.fillStyle = 'rgba(25,12,5,0.85)';
      ctx.fillRect(x, r * plankH, 2, plankH);
      rctx.fillStyle = `rgb(${150 + rand() * 50},0,0)`;
      rctx.fillRect(x, r * plankH, len, plankH);
      rctx.fillStyle = 'rgb(255,0,0)';
      rctx.fillRect(x, r * plankH, 2, plankH);
      x += len;
    }
    ctx.fillStyle = 'rgba(25,12,5,0.85)';
    ctx.fillRect(0, r * plankH, size, 2);
    rctx.fillStyle = 'rgb(255,0,0)';
    rctx.fillRect(0, r * plankH, size, 2);
  }
  noise(ctx, size, size, 20000, rand, 0.05);
  // Grönkanalen läses som roughness i three.js
  const img = rctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i];
    img.data[i] = 0;
    img.data[i + 1] = v;
    img.data[i + 2] = 0;
  }
  rctx.putImageData(img, 0, 0);
  return {
    map: toTexture(c, { repeat: [2.5, 2.5] }),
    roughnessMap: toTexture(rc, { repeat: [2.5, 2.5], srgb: false }),
  };
}

export function plaster(color = '#e9e2d6', seed = 3) {
  const size = 512;
  const [c, ctx] = canvas(size);
  const rand = rng(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = rand() > 0.5 ? 255 : 0;
    g.addColorStop(0, `rgba(${v},${v},${v},0.025)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  noise(ctx, size, size, 15000, rand, 0.04);
  return toTexture(c, { repeat: [3, 1.5] });
}

export function wallpaper() {
  const size = 512;
  const [c, ctx] = canvas(size);
  const rand = rng(11);
  ctx.fillStyle = '#5d7464';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(230,220,190,0.22)';
  ctx.lineWidth = 3;
  const step = 64;
  for (let y = 0; y <= size; y += step) {
    for (let x = 0; x <= size; x += step) {
      const ox = (y / step) % 2 ? step / 2 : 0;
      ctx.beginPath();
      ctx.ellipse(x + ox, y, 10, 18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + ox, y - 26);
      ctx.lineTo(x + ox, y - 18);
      ctx.moveTo(x + ox, y + 18);
      ctx.lineTo(x + ox, y + 26);
      ctx.stroke();
    }
  }
  noise(ctx, size, size, 12000, rand, 0.05);
  return toTexture(c, { repeat: [5, 2.2] });
}

export function fabric(color, seed = 1, scale = 4) {
  const size = 256;
  const [c, ctx] = canvas(size);
  const rand = rng(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.05})`;
    ctx.fillRect(0, y, size, 1);
  }
  for (let x = 0; x < size; x += 2) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.04})`;
    ctx.fillRect(x, 0, 1, size);
  }
  noise(ctx, size, size, 5000, rand, 0.08);
  return toTexture(c, { repeat: [scale, scale] });
}

export function rug() {
  const w = 1024;
  const h = 700;
  const [c, ctx] = canvas(w, h);
  const rand = rng(21);
  ctx.fillStyle = '#7a2e2a';
  ctx.fillRect(0, 0, w, h);
  const border = (inset, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  };
  border(20, '#1f2b46', 30);
  border(52, '#d9b77a', 8);
  border(70, '#1f2b46', 14);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  for (let i = 6; i > 0; i--) {
    ctx.fillStyle = i % 2 ? '#d9b77a' : '#1f2b46';
    ctx.beginPath();
    ctx.moveTo(0, -i * 38);
    ctx.lineTo(i * 62, 0);
    ctx.lineTo(0, i * 38);
    ctx.lineTo(-i * 62, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  for (let k = 0; k < 4; k++) {
    const x = k % 2 ? w - 170 : 170;
    const y = k < 2 ? 160 : h - 160;
    for (let i = 3; i > 0; i--) {
      ctx.fillStyle = i % 2 ? '#c96f3d' : '#e8d8b4';
      ctx.beginPath();
      ctx.arc(x, y, i * 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  noise(ctx, w, h, 60000, rand, 0.12);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function painting(seed) {
  const w = 512;
  const h = 384;
  const [c, ctx] = canvas(w, h);
  const rand = rng(seed);
  const palettes = [
    ['#f2e3c6', '#e07a5f', '#3d405b', '#81b29a', '#f2cc8f'],
    ['#0b132b', '#1c2541', '#3a506b', '#5bc0be', '#f4f4f4'],
    ['#fefae0', '#dda15e', '#bc6c25', '#606c38', '#283618'],
    ['#ffe5ec', '#ffb3c6', '#fb6f92', '#22223b', '#c9ada7'],
  ];
  const p = palettes[seed % palettes.length];
  const style = seed % 3;
  if (style === 0) {
    // Landskap
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, p[1]);
    sky.addColorStop(0.6, p[4]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = p[0];
    ctx.beginPath();
    ctx.arc(w * (0.3 + rand() * 0.4), h * 0.35, 40, 0, Math.PI * 2);
    ctx.fill();
    for (let l = 0; l < 4; l++) {
      ctx.fillStyle = p[(l + 2) % p.length];
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(0, h);
      const base = h * (0.5 + l * 0.12);
      for (let x = 0; x <= w; x += 16) {
        ctx.lineTo(x, base - Math.sin(x * 0.01 + l * 2 + rand()) * (30 - l * 5) - rand() * 6);
      }
      ctx.lineTo(w, h);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (style === 1) {
    // Abstrakt geometriskt
    ctx.fillStyle = p[0];
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = p[1 + Math.floor(rand() * (p.length - 1))];
      ctx.globalAlpha = 0.75 + rand() * 0.25;
      if (rand() > 0.5) {
        ctx.beginPath();
        ctx.arc(rand() * w, rand() * h, 20 + rand() * 90, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(rand() * w, rand() * h, 30 + rand() * 160, 20 + rand() * 120);
      }
    }
    ctx.globalAlpha = 1;
  } else {
    // Penseldrag
    ctx.fillStyle = p[4];
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      ctx.strokeStyle = p[Math.floor(rand() * p.length)];
      ctx.globalAlpha = 0.25 + rand() * 0.5;
      ctx.lineWidth = 4 + rand() * 18;
      ctx.lineCap = 'round';
      const x = rand() * w;
      const y = rand() * h;
      const a = rand() * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * 40, y + 30 * rand(), x + Math.cos(a) * 80, y + Math.sin(a) * 50);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  noise(ctx, w, h, 8000, rand, 0.08);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function outsideView() {
  const w = 1024;
  const h = 512;
  const [c, ctx] = canvas(w, h);
  const rand = rng(99);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#6fa8dc');
  sky.addColorStop(0.55, '#cfe3f3');
  sky.addColorStop(0.75, '#f6e7cf');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Moln
  for (let i = 0; i < 14; i++) {
    const cx = rand() * w;
    const cy = 40 + rand() * 160;
    for (let j = 0; j < 8; j++) {
      const g = ctx.createRadialGradient(cx + j * 18, cy + rand() * 12, 0, cx + j * 18, cy, 40);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx + j * 18 - 40, cy - 40, 80, 80);
    }
  }
  // Stad i fjärran
  for (let layer = 0; layer < 3; layer++) {
    const shade = 150 - layer * 35;
    ctx.fillStyle = `rgb(${shade - 20},${shade - 5},${shade + 20})`;
    let x = 0;
    while (x < w) {
      const bw = 20 + rand() * 50;
      const bh = 40 + rand() * (80 + layer * 50);
      ctx.fillRect(x, h * 0.72 - bh + layer * 20, bw, bh + 200);
      if (layer === 2) {
        ctx.fillStyle = 'rgba(255,240,200,0.5)';
        for (let wy = h * 0.72 - bh + 30; wy < h * 0.8; wy += 10) {
          for (let wx = x + 4; wx < x + bw - 4; wx += 8) {
            if (rand() > 0.6) ctx.fillRect(wx, wy, 3, 4);
          }
        }
        ctx.fillStyle = `rgb(${shade - 20},${shade - 5},${shade + 20})`;
      }
      x += bw + rand() * 8;
    }
  }
  // Träd i förgrunden
  for (let i = 0; i < 40; i++) {
    const x = rand() * w;
    const y = h * 0.85 + rand() * 40;
    const r = 30 + rand() * 40;
    ctx.fillStyle = `hsl(${100 + rand() * 30}, 35%, ${22 + rand() * 12}%)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function screenTexture() {
  const [c, ctx] = canvas(512, 288);
  const g = ctx.createLinearGradient(0, 0, 512, 288);
  g.addColorStop(0, '#0a0f1a');
  g.addColorStop(1, '#141c2c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 288);
  ctx.fillStyle = 'rgba(120,170,255,0.08)';
  ctx.beginPath();
  ctx.arc(380, 60, 160, 0, Math.PI * 2);
  ctx.fill();
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
