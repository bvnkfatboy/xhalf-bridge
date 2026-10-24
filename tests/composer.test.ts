import { describe, expect, it } from "vitest";
import { PRESETS, applyPreset, computeGeometry, defaultState, slotAtPoint } from "../src/lib/composer";

describe("composer presets", () => {
  it("has 7 presets with matching slot counts and rects", () => {
    for (const [key, def] of Object.entries(PRESETS)) {
      expect(def.rects.length, key).toBe(def.slotCount);
      for (const [x, y, w, h] of def.rects) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(1.0001);
        expect(y + h).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("applyPreset keeps existing photos and resizes slot list", () => {
    let state = defaultState();
    state.slots[0].photoId = 11;
    state.slots[1].photoId = 22;
    state = applyPreset(state, "four_grid");
    expect(state.slots.length).toBe(4);
    expect(state.slots.map((s) => s.photoId)).toEqual([11, 22, null, null]);
    expect(state.aspect).toBe("1:1");
  });
});

describe("computeGeometry", () => {
  it("slots stay inside the canvas and respect dividers", () => {
    const state = defaultState(); // classic_half 3:2, border 30, divider 8
    const W = 1200;
    const H = 800;
    const { slots } = computeGeometry(state, W, H);
    expect(slots.length).toBe(2);
    for (const r of slots) {
      expect(r.x).toBeGreaterThanOrEqual(state.borderWidth);
      expect(r.y).toBeGreaterThanOrEqual(state.borderWidth);
      expect(r.x + r.w).toBeLessThanOrEqual(W - state.borderWidth + 0.001);
      expect(r.y + r.h).toBeLessThanOrEqual(H - state.borderWidth + 0.001);
    }
    const gap = slots[1].x - (slots[0].x + slots[0].w);
    expect(Math.abs(gap - state.dividerWidth)).toBeLessThan(0.01);
  });

  it("caption shrinks the photo area", () => {
    const base = defaultState();
    const withCaption = { ...base, showCaption: true, caption: "test" };
    const W = 1000;
    const H = 700;
    const a = computeGeometry(base, W, H);
    const b = computeGeometry(withCaption, W, H);
    expect(b.inner.h).toBeLessThan(a.inner.h);
  });
});

describe("slotAtPoint", () => {
  it("returns the correct slot index", () => {
    const state = defaultState();
    const W = 1200;
    const H = 800;
    expect(slotAtPoint(state, W, H, 100, 400)).toBe(0);
    expect(slotAtPoint(state, W, H, W - 100, 400)).toBe(1);
    expect(slotAtPoint(state, W, H, state.borderWidth - 5, state.borderWidth - 5)).toBe(-1);
  });
});
