import { describe, expect, it } from "vitest";
import { formatBytes, photoDate } from "../src/utils";
import { defaultSheetOptions, sheetDimensions } from "../src/lib/contactsheet";
import type { Photo } from "../src/types";

const photo = (over: Partial<Photo>): Photo => ({
  id: 1,
  filePath: "/x/a.jpg",
  originalFilename: "a.jpg",
  fileHash: "h",
  fileSize: 1000,
  mimeType: "image/jpeg",
  width: 100,
  height: 100,
  capturedAt: null,
  dateSource: "imported",
  importedAt: 1700000000000,
  cameraModel: null,
  metadata: {},
  isFavorite: false,
  userNote: "",
  thumbnailPath: "/t/a.jpg",
  source: "import",
  ...over,
});

describe("formatBytes", () => {
  it("formats human readable sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536 * 1024)).toBe("1.5 MB");
    expect(formatBytes(null)).toBe("—");
  });
});

describe("photoDate", () => {
  it("falls back to import date when no capture date", () => {
    const p = photo({ capturedAt: null, importedAt: 42 });
    expect(photoDate(p)).toBe(42);
    expect(photoDate({ ...p, capturedAt: 7 })).toBe(7);
  });
});

describe("sheetDimensions", () => {
  it("grows rows with photo count and keeps width from columns", () => {
    const o = defaultSheetOptions(); // columns 5, cell 240, margin 40, gap 16
    const width = 40 * 2 + 5 * (240 + 4) + 4 * 16; // border 2*2 per cell
    expect(sheetDimensions(Array.from({ length: 10 }, (_, i) => photo({ id: i })), o).width).toBe(width);
    const one = sheetDimensions([photo({})], o);
    const many = sheetDimensions(Array.from({ length: 6 }, (_, i) => photo({ id: i })), o);
    expect(one.height).toBeLessThan(many.height);
  });

  it("labels add height when enabled", () => {
    const o = { ...defaultSheetOptions(), showFilename: false, showFrameNumbers: false, showDate: false };
    const photos = [photo({})];
    const withoutLabels = sheetDimensions(photos, o);
    const withLabels = sheetDimensions(photos, { ...o, showFilename: true });
    expect(withLabels.height).toBeGreaterThan(withoutLabels.height);
  });
});
