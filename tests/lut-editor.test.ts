import { describe, expect, it } from "vitest";
import { lutToBytes, parseCube } from "../src/lib/lut";
import { LANGUAGES, translate } from "../src/i18n";
import { FILM_PRESETS, LUT_CATALOG } from "../src/lib/filmPresets";
import { defaultEditSettings } from "../src/lib/webgl-editor";

const SAMPLE = `# Created by: G'MIC
TITLE "test_lut"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;

describe("parseCube", () => {
  it("parses a valid 2-point LUT with red-fastest order", () => {
    const lut = parseCube(SAMPLE);
    expect(lut.size).toBe(2);
    expect(lut.title).toBe("test_lut");
    expect(lut.data.length).toBe(2 * 2 * 2 * 3);
    // first entry = (0,0,0)
    expect(lut.data[0]).toBe(0);
    expect(lut.data[1]).toBe(0);
    expect(lut.data[2]).toBe(0);
    // second entry = (1,0,0) — red varies fastest
    expect(lut.data[3]).toBe(1);
    expect(lut.data[4]).toBe(0);
    expect(lut.data[5]).toBe(0);
  });

  it("rejects 1D LUTs and incomplete data", () => {
    expect(() => parseCube("LUT_1D_SIZE 4\n0 0 0")).toThrow(/1D/);
    expect(() => parseCube("LUT_3D_SIZE 2\n0 0 0\n1 1 1")).toThrow(/incomplete/);
    expect(() => parseCube("TITLE nope")).toThrow(/LUT_3D_SIZE/);
  });

  it("converts data to 8-bit bytes", () => {
    const bytes = lutToBytes(parseCube(SAMPLE));
    expect(bytes.length).toBe(2 * 2 * 2 * 3);
    expect(bytes[3]).toBe(255); // red channel of entry (1,0,0)
  });
});

describe("i18n", () => {
  it("falls back to the English key when translation is missing", () => {
    expect(translate("en", "Import photos")).toBe("Import photos");
    expect(translate("th", "Totally missing key")).toBe("Totally missing key");
  });

  it("translates Thai strings and interpolates params", () => {
    expect(translate("th", "Import photos")).toBe("นำเข้าภาพ");
    expect(translate("th", "Imported {count} photos", { count: 5 })).toBe("นำเข้า 5 ภาพ");
    expect(translate("en", "Imported {count} photos", { count: 5 })).toBe("Imported 5 photos");
  });

  it("declares languages with labels", () => {
    expect(LANGUAGES.map((l) => l.code)).toContain("th");
    expect(LANGUAGES.map((l) => l.code)).toContain("en");
  });
});

describe("film presets & LUT catalog", () => {
  it("every preset LUT exists in the bundled catalog", () => {
    const keys = new Set(LUT_CATALOG.map((l) => l.key));
    for (const p of FILM_PRESETS) {
      if (p.lut) expect(keys.has(p.lut), `missing LUT ${p.lut}`).toBe(true);
    }
  });

  it("preset adjustments stay within slider ranges", () => {
    const range = (v: number | undefined) => v === undefined || (v >= -100 && v <= 100);
    for (const p of FILM_PRESETS) {
      for (const [k, v] of Object.entries(p.settings)) {
        expect(range(v as number), `${p.id}.${k} = ${v}`).toBe(true);
      }
    }
    expect(defaultEditSettings().lut).toBeNull();
  });
});
