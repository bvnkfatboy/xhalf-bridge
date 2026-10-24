// Generates a 1024x1024 app icon PNG (olive background, dark half-frame pair mark).
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const S = 1024;
const px = new Uint8Array(S * S * 4);

function setPx(x, y, r, g, b, a = 255) {
  const i = (y * S + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
}

// Rounded-square mask
const R = 200;
function insideRounded(x, y) {
  const cx = Math.min(Math.max(x, R), S - R);
  const cy = Math.min(Math.max(y, R), S - R);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= R * R;
}

// Colors
const BG = [163, 177, 138]; // muted olive #a3b18a
const INK = [20, 24, 13];   // near-black olive ink

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (insideRounded(x, y)) {
      let [r, g, b] = BG;
      // subtle diagonal texture band (film label vibe)
      if ((x + y) % 96 < 12) { r -= 10; g -= 10; b -= 8; }
      // two half-frame panels side by side
      const frames = [
        { x0: 200, y0: 260, x1: 486, y1: 764 },
        { x0: 538, y0: 260, x1: 824, y1: 764 },
      ];
      for (const f of frames) {
        const pad = 22;
        const inOuter = x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1;
        const inInner = x >= f.x0 + pad && x <= f.x1 - pad && y >= f.y0 + pad && y <= f.y1 - pad;
        if (inOuter && !inInner) { r = INK[0]; g = INK[1]; b = INK[2]; }
        if (inInner) {
          // inner "photo": darker olive with a simple horizon
          r = 46; g = 52; b = 34;
          if (y > (f.y0 + f.y1) * 0.62) { r = 74; g = 84; b = 56; }
          if (y > (f.y0 + f.y1) * 0.82) { r = 34; g = 38; b = 26; }
        }
      }
      setPx(x, y, r, g, b);
    } else {
      setPx(x, y, 0, 0, 0, 0);
    }
  }
}

// PNG encode
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("./app-icon.png", import.meta.url).pathname, png);
console.log("app-icon.png written", png.length, "bytes");
