/** Parser for .cube 3D LUT files (Adobe Cube LUT format). */

export interface CubeLut {
  title: string;
  size: number;
  /** RGB triples, red fastest — length = size^3 * 3, values 0..1 */
  data: Float32Array;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
}

export function parseCube(text: string): CubeLut {
  let title = "";
  let size = 0;
  let min: [number, number, number] = [0, 0, 0];
  let max: [number, number, number] = [1, 1, 1];
  const values: number[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith("TITLE")) {
      title = line.slice(5).trim().replace(/^"|"$/g, "");
      continue;
    }
    if (upper.startsWith("LUT_1D_SIZE")) {
      throw new Error("1D LUTs are not supported — use a 3D .cube LUT");
    }
    if (upper.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1], 10);
      if (!Number.isFinite(size) || size < 2 || size > 256) throw new Error(`invalid LUT_3D_SIZE: ${size}`);
      continue;
    }
    if (upper.startsWith("DOMAIN_MIN")) {
      min = line.split(/\s+/).slice(1).map(Number) as [number, number, number];
      continue;
    }
    if (upper.startsWith("DOMAIN_MAX")) {
      max = line.split(/\s+/).slice(1).map(Number) as [number, number, number];
      continue;
    }
    if (upper.startsWith("LUT_") || upper.startsWith("TABLE") || upper.startsWith("DESCRIPTION") || upper.startsWith("CREATED")) {
      continue;
    }
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      values.push(parts[0], parts[1], parts[2]);
    }
  }

  if (!size) throw new Error("missing LUT_3D_SIZE");
  const expected = size * size * size * 3;
  if (values.length !== expected) {
    throw new Error(`LUT data incomplete: expected ${expected} values, got ${values.length}`);
  }
  return { title, size, data: new Float32Array(values), domainMin: min, domainMax: max };
}

/** Load a bundled LUT from /luts/<path>.cube relative to the app origin. */
export async function loadBundledLut(path: string): Promise<CubeLut> {
  const res = await fetch(`/luts/${path}.cube`);
  if (!res.ok) throw new Error(`LUT not found: ${path}`);
  return parseCube(await res.text());
}

/** Turn parsed LUT data into an 8-bit RGB buffer for WebGL upload. */
export function lutToBytes(lut: CubeLut): Uint8Array {
  const n = lut.size * lut.size * lut.size;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n * 3; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round((lut.data[i] - lut.domainMin[i % 3]) / (lut.domainMax[i % 3] - lut.domainMin[i % 3]) * 255)));
  }
  return out;
}
