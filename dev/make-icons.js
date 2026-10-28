// Draws the cricket-ball toolbar icons (no dependencies): node dev/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Colour of one sample point in a unit square (0..1), or null for transparent.
function sample(x, y, size) {
  const cx = 0.5, cy = 0.5, r = 0.46;
  const d = Math.hypot(x - cx, y - cy);
  if (d > r) return null;
  // Seam: two gently curved lines crossing the ball diagonally.
  const sx = cx + 1.5 * r, sy = cy + 1.5 * r, R = 2 * r;
  const ds = Math.hypot(x - sx, y - sy) - R;
  const gap = size <= 16 ? 0.075 : 0.06;
  const w = Math.max(0.028, 0.75 / size);
  if (Math.abs(ds - gap) < w || Math.abs(ds + gap) < w) return [255, 244, 238];
  // Red leather with a soft highlight towards the top-left.
  const h = Math.max(0, 1 - Math.hypot(x - 0.36, y - 0.34) / 0.5);
  return [Math.round(196 + 50 * h), Math.round(30 + 40 * h), Math.round(30 + 30 * h)];
}

function draw(size) {
  const ss = 4;
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const c = sample((px + (i + 0.5) / ss) / size, (py + (j + 0.5) / ss) / size, size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const o = (py * size + px) * 4;
      if (a) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round((a / (ss * ss)) * 255);
      }
    }
  }
  return png(size, out);
}

const dir = path.join(__dirname, '..', 'cricket-float', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) fs.writeFileSync(path.join(dir, `icon${size}.png`), draw(size));
console.log('icons written to', dir);
