// Generates the extension's icons as PNGs without any image dependencies.
//   node scripts/make-icons.js                 write extension/icons/*.png (current design)
//   node scripts/make-icons.js --preview FILE  write a sheet comparing all designs
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'extension', 'icons');
const CURRENT = 'select';

// ---- PNG encoding ------------------------------------------------------------

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- geometry ----------------------------------------------------------------

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && Math.hypot(x - cx, y - cy) <= r;
}

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

function edgeDist(x, y, pts, closed = true) {
  let d = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) d = Math.min(d, segDist(x, y, pts[i], pts[(i + 1) % pts.length]));
  return d;
}

// Classic arrow pointer, tip at (tx, ty), `h` tall.
function cursor(tx, ty, h) {
  return [[0, 0], [0, 0.8], [0.2, 0.62], [0.33, 0.92], [0.46, 0.86], [0.33, 0.57], [0.58, 0.57]].map(([x, y]) => [tx + x * h, ty + y * h]);
}

// Four-pointed sparkle (an astroid-like star).
function inSparkle(x, y, cx, cy, r) {
  return Math.sqrt(Math.abs(x - cx) / r) + Math.sqrt(Math.abs(y - cy) / r) <= 1;
}

// Dashed outline of a rectangle; dash length in the same unit space.
function onDashedRect(x, y, x0, y0, x1, y1, w, dash) {
  const nearH = (Math.abs(y - y0) < w || Math.abs(y - y1) < w) && x > x0 - w && x < x1 + w;
  const nearV = (Math.abs(x - x0) < w || Math.abs(x - x1) < w) && y > y0 - w && y < y1 + w;
  if (nearH && Math.floor((x - x0 + w) / dash) % 2 === 0) return true;
  if (nearV && Math.floor((y - y0 + w) / dash) % 2 === 0) return true;
  return false;
}

// ---- designs -------------------------------------------------------------------
// Each returns the colour at (x, y) in a unit square, or null for transparent.
// `size` lets small renders drop detail that would turn into noise.

const DESIGNS = {
  // A dashed "selected element" box, a pointer clicking it, and a spark for the AI fix.
  select(x, y, size) {
    if (!inRoundedRect(x, y, 0, 0, 1, 1, 0.22)) return null;
    let c = mix(hex('#3b82f6'), hex('#1d4ed8'), (x + y) / 2);
    const small = size <= 16;
    const box = small ? [0.16, 0.16, 0.62, 0.62] : [0.17, 0.17, 0.63, 0.63];
    if (small ? edgeDist(x, y, [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]) < 0.045 : onDashedRect(x, y, ...box, 0.034, 0.092)) {
      c = mix(c, [255, 255, 255], small ? 0.75 : 0.9);
    }
    const arrow = cursor(0.47, 0.45, small ? 0.5 : 0.46);
    const inside = inPolygon(x, y, arrow);
    if (inside) c = [255, 255, 255];
    else if (edgeDist(x, y, arrow) < (small ? 0.06 : 0.04)) c = hex('#172554');
    if (!small && inSparkle(x, y, 0.79, 0.21, 0.13)) c = hex('#fde047');
    return c;
  },

  // A big pointer with sparkles on a dark tile: "point, and AI does the rest".
  spark(x, y, size) {
    if (!inRoundedRect(x, y, 0, 0, 1, 1, 0.22)) return null;
    let c = mix(hex('#111827'), hex('#1f2937'), y);
    const arrow = cursor(0.26, 0.2, 0.62);
    if (inPolygon(x, y, arrow)) c = [255, 255, 255];
    if (inSparkle(x, y, 0.73, 0.3, size <= 16 ? 0.19 : 0.16)) c = hex('#f97316');
    if (size > 16 && inSparkle(x, y, 0.85, 0.53, 0.075)) c = hex('#fdba74');
    return c;
  },

  // A pointer with a green check badge: "fixed".
  fixed(x, y, size) {
    if (!inRoundedRect(x, y, 0, 0, 1, 1, 0.22)) return null;
    let c = mix(hex('#2563eb'), hex('#0891b2'), (x + y) / 2);
    const arrow = cursor(0.22, 0.17, 0.6);
    if (inPolygon(x, y, arrow)) c = [255, 255, 255];
    else if (edgeDist(x, y, arrow) < 0.04) c = hex('#1e3a8a');
    const [bx, by, br] = [0.7, 0.7, size <= 16 ? 0.24 : 0.2];
    const d = Math.hypot(x - bx, y - by);
    if (d < br + 0.035) c = hex('#1e3a8a');
    if (d < br) {
      c = hex('#22c55e');
      const s = br / 0.2;
      const check = [[bx - 0.09 * s, by + 0.005 * s], [bx - 0.025 * s, by + 0.07 * s], [bx + 0.095 * s, by - 0.065 * s]];
      if (edgeDist(x, y, check, false) < 0.032 * s) c = [255, 255, 255];
    }
    return c;
  },
};

// ---- rendering -----------------------------------------------------------------

function render(design, size) {
  const ss = 6; // supersampling for smooth edges
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const color = design((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, size);
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          a += 1;
        }
      }
      const o = (py * size + px) * 4;
      out[o] = a ? r / a : 0;
      out[o + 1] = a ? g / a : 0;
      out[o + 2] = a ? b / a : 0;
      out[o + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return out;
}

// Comparison sheet: each design at 128/48/32/16 on light, then 32/16 on dark.
function previewSheet(file) {
  const names = Object.keys(DESIGNS);
  const W = 520;
  const rowH = 148;
  const H = rowH * names.length;
  const sheet = Buffer.alloc(W * H * 4);
  const fill = (x0, y0, w, h, rgb) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) sheet.set([...rgb, 255], (y * W + x) * 4);
  };
  const blit = (img, size, x0, y0, scale = 1) => {
    for (let y = 0; y < size * scale; y++) {
      for (let x = 0; x < size * scale; x++) {
        const s = ((Math.floor(y / scale) * size) + Math.floor(x / scale)) * 4;
        const d = ((y0 + y) * W + (x0 + x)) * 4;
        const a = img[s + 3] / 255;
        for (let k = 0; k < 3; k++) sheet[d + k] = img[s + k] * a + sheet[d + k] * (1 - a);
        sheet[d + 3] = 255;
      }
    }
  };
  names.forEach((name, i) => {
    const y = i * rowH;
    fill(0, y, 330, rowH, hex('#f1f5f9'));
    fill(330, y, W - 330, rowH, hex('#202124'));
    const d = DESIGNS[name];
    blit(render(d, 128), 128, 10, y + 10);
    blit(render(d, 48), 48, 150, y + 50);
    blit(render(d, 32), 32, 210, y + 58);
    blit(render(d, 16), 16, 254, y + 66);
    blit(render(d, 16), 16, 280, y + 50, 3); // 16px blown up to show its pixels
    blit(render(d, 32), 32, 345, y + 58);
    blit(render(d, 16), 16, 390, y + 66);
    blit(render(d, 16), 16, 420, y + 50, 3);
  });
  fs.writeFileSync(file, encodePng(W, H, sheet));
  console.log(`Preview of ${names.join(', ')} written to ${file}`);
}

const previewAt = process.argv.indexOf('--preview');
if (previewAt !== -1) {
  previewSheet(process.argv[previewAt + 1]);
} else {
  fs.mkdirSync(OUT, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    fs.writeFileSync(path.join(OUT, `icon${size}.png`), encodePng(size, size, render(DESIGNS[CURRENT], size)));
  }
  console.log(`Icons (${CURRENT}) written to ${OUT}`);
}
