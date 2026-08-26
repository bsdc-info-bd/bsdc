/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Dependency-free brand icon generator. Renders the BSDC mark (rounded square,
 * green gradient, white chevron + B) with signed distance functions and writes
 * PNG files plus a favicon.ico (PNG-embedded) using Node's built-in zlib.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------- PNG writer */

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function pngFromRgba(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* -------------------------------------------------------- SDF renderer */

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

/** SDF of the "B" formed from a stem plus two right-half ring strokes. */
function sdB(px, py, bx, topY, botY, ringR, ringW, stemW, height) {
  const stem = Math.max(
    Math.abs(px - bx) - stemW / 2,
    Math.abs(py - (topY + botY) / 2) - (height / 2 - ringW / 2),
  );
  const ring = (cx, cy, r) => {
    const d = Math.hypot(px - cx, py - cy);
    const ringDist = Math.abs(d - (r - ringW / 2)) - ringW / 2;
    return Math.max(ringDist, cx - px); // right half only: px >= cx
  };
  const top = ring(bx, topY, ringR);
  const bot = ring(bx, botY, ringR + height * 0.08);
  return Math.min(stem, Math.max(top, bot));
}

function gradientAt(x, y, size) {
  const t = (x / size + y / size) / 2;
  const stops = [
    [0.0, [10, 143, 63]],
    [0.55, [16, 185, 129]],
    [1.0, [20, 184, 166]],
  ];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * f));
    }
  }
  return stops[stops.length - 1][1];
}

function aa(dist) {
  return Math.min(1, Math.max(0, 0.5 - dist));
}

/** Render the BSDC mark at a given size. */
function renderIcon(size) {
  const S = size;
  const rgba = Buffer.alloc(S * S * 4);
  const u = (v) => (v / 64) * S; // design units (64 grid)
  const stroke = u(4.5);
  const chevA = [u(24), u(18)];
  const chevB = [u(16), u(32)];
  const chevC = [u(24), u(46)];
  const bX = u(32);
  const bTop = u(27);
  const bBot = u(41);
  const ringR = u(7);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const idx = (y * S + x) * 4;
      const bgDist = sdRoundRect(px, py, S / 2, S / 2, u(30), u(30), u(16));
      const bgA = aa(bgDist);
      if (bgA <= 0) {
        rgba[idx + 3] = 0;
        continue;
      }
      const color = gradientAt(px, py, S);
      const chevronD = Math.min(
        sdSegment(px, py, chevA[0], chevA[1], chevB[0], chevB[1]),
        sdSegment(px, py, chevB[0], chevB[1], chevC[0], chevC[1]),
      ) - stroke / 2;
      const bD = sdB(px, py, bX, bTop, bBot, ringR, stroke, stroke, u(24)) - stroke / 2;
      const whiteA = Math.max(aa(chevronD), aa(bD));
      const r = Math.round(color[0] * (1 - whiteA) + 255 * whiteA);
      const g = Math.round(color[1] * (1 - whiteA) + 255 * whiteA);
      const b = Math.round(color[2] * (1 - whiteA) + 255 * whiteA);
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = Math.round(bgA * 255);
    }
  }
  return pngFromRgba(S, S, rgba);
}

function renderOg(width = 1200, height = 630) {
  const rgba = Buffer.alloc(width * height * 4);
  const iconSize = 320;
  const iconBuf = renderIcon(iconSize);
  // decode is avoidable: re-render icon pixels directly into OG canvas
  const S = iconSize;
  const u = (v) => (v / 64) * S;
  const stroke = u(4.5);
  const chevA = [u(24), u(18)];
  const chevB = [u(16), u(32)];
  const chevC = [u(24), u(46)];
  const bX = u(32);
  const bTop = u(27);
  const bBot = u(41);
  const ringR = u(7);
  const ox = Math.round((width - S) / 2);
  const oy = Math.round(height / 2 - S / 2 - 60);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      rgba[idx] = 255;
      rgba[idx + 1] = 255;
      rgba[idx + 2] = 255;
      rgba[idx + 3] = 255;
      const ix = x - ox;
      const iy = y - oy;
      if (ix < 0 || iy < 0 || ix >= S || iy >= S) continue;
      const px = ix + 0.5;
      const py = iy + 0.5;
      const bgDist = sdRoundRect(px, py, S / 2, S / 2, u(30), u(30), u(16));
      const bgA = aa(bgDist);
      if (bgA <= 0) continue;
      const color = gradientAt(px, py, S);
      const chevronD = Math.min(
        sdSegment(px, py, chevA[0], chevA[1], chevB[0], chevB[1]),
        sdSegment(px, py, chevB[0], chevB[1], chevC[0], chevC[1]),
      ) - stroke / 2;
      const bD = sdB(px, py, bX, bTop, bBot, ringR, stroke, stroke, u(24)) - stroke / 2;
      const whiteA = Math.max(aa(chevronD), aa(bD));
      rgba[idx] = Math.round(color[0] * (1 - whiteA) + 255 * whiteA);
      rgba[idx + 1] = Math.round(color[1] * (1 - whiteA) + 255 * whiteA);
      rgba[idx + 2] = Math.round(color[2] * (1 - whiteA) + 255 * whiteA);
      rgba[idx + 3] = 255;
    }
  }
  void iconBuf;
  return pngFromRgba(width, height, rgba);
}

/* ------------------------------------------------------------- ICO pack */

function icoWith(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + count * 16;
  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)]);
}

/* ----------------------------------------------------------------- main */

mkdirSync(join(root, 'public', 'assets', 'logos'), { recursive: true });
const targets = [
  ['public/favicon-512.png', renderIcon(512)],
  ['public/favicon-192.png', renderIcon(192)],
  ['public/apple-touch-icon.png', renderIcon(180)],
  ['public/assets/logos/bsdc-icon-512.png', renderIcon(512)],
  ['public/assets/logos/og-default.png', renderOg(1200, 630)],
  ['public/favicon.ico', icoWith([{ size: 16, png: renderIcon(16) }, { size: 32, png: renderIcon(32) }, { size: 48, png: renderIcon(48) }])],
];
for (const [rel, buf] of targets) {
  writeFileSync(join(root, rel), buf);
  console.log('wrote', rel, buf.length, 'bytes');
}
