import type { Photo } from "../types";

export type PresetKey =
  | "classic_half"
  | "horizontal_pair"
  | "vertical_pair"
  | "four_grid"
  | "six_grid"
  | "minimal_white"
  | "black_film";

export type Aspect = "3:2" | "2:3" | "1:1";

export interface ComposerSlot {
  photoId: number | null;
  zoom: number; // 1.0 = cover fit
  offsetX: number; // -100..100 % of overflow
  offsetY: number;
}

export interface ComposerState {
  preset: PresetKey;
  slots: ComposerSlot[];
  bgColor: string;
  borderWidth: number;
  dividerWidth: number;
  aspect: Aspect;
  caption: string;
  showCaption: boolean;
  exportWidth: number;
}

export interface PresetDef {
  label: string;
  aspect: Aspect;
  slotCount: number;
  rects: [number, number, number, number][]; // x,y,w,h fractions of inner area
  bgColor: string;
  borderWidth: number;
  dividerWidth: number;
}

const HORIZONTAL_RECTS: [number, number, number, number][] = [
  [0, 0, 0.5, 1],
  [0.5, 0, 0.5, 1],
];
const VERTICAL_RECTS: [number, number, number, number][] = [
  [0, 0, 1, 0.5],
  [0, 0.5, 1, 0.5],
];
const FOUR_RECTS: [number, number, number, number][] = [
  [0, 0, 0.5, 0.5],
  [0.5, 0, 0.5, 0.5],
  [0, 0.5, 0.5, 0.5],
  [0.5, 0.5, 0.5, 0.5],
];
const SIX_RECTS: [number, number, number, number][] = [
  [0, 0, 1 / 3, 0.5],
  [1 / 3, 0, 1 / 3, 0.5],
  [2 / 3, 0, 1 / 3, 0.5],
  [0, 0.5, 1 / 3, 0.5],
  [1 / 3, 0.5, 1 / 3, 0.5],
  [2 / 3, 0.5, 1 / 3, 0.5],
];

export const PRESETS: Record<PresetKey, PresetDef> = {
  classic_half: { label: "Classic Half Frame", aspect: "3:2", slotCount: 2, rects: HORIZONTAL_RECTS, bgColor: "#141414", borderWidth: 30, dividerWidth: 8 },
  horizontal_pair: { label: "Horizontal Pair", aspect: "3:2", slotCount: 2, rects: HORIZONTAL_RECTS, bgColor: "#f5f4f0", borderWidth: 14, dividerWidth: 6 },
  vertical_pair: { label: "Vertical Pair", aspect: "2:3", slotCount: 2, rects: VERTICAL_RECTS, bgColor: "#f5f4f0", borderWidth: 14, dividerWidth: 6 },
  four_grid: { label: "Four Frame Grid", aspect: "1:1", slotCount: 4, rects: FOUR_RECTS, bgColor: "#141414", borderWidth: 16, dividerWidth: 6 },
  six_grid: { label: "Six Frame Grid", aspect: "3:2", slotCount: 6, rects: SIX_RECTS, bgColor: "#141414", borderWidth: 16, dividerWidth: 6 },
  minimal_white: { label: "Minimal White Border", aspect: "3:2", slotCount: 2, rects: HORIZONTAL_RECTS, bgColor: "#ffffff", borderWidth: 36, dividerWidth: 36 },
  black_film: { label: "Black Film Border", aspect: "3:2", slotCount: 2, rects: HORIZONTAL_RECTS, bgColor: "#000000", borderWidth: 44, dividerWidth: 10 },
};

export function defaultState(): ComposerState {
  return {
    preset: "classic_half",
    slots: [
      { photoId: null, zoom: 1, offsetX: 0, offsetY: 0 },
      { photoId: null, zoom: 1, offsetX: 0, offsetY: 0 },
    ],
    bgColor: "#141414",
    borderWidth: 30,
    dividerWidth: 8,
    aspect: "3:2",
    caption: "",
    showCaption: false,
    exportWidth: 3000,
  };
}

export function applyPreset(state: ComposerState, key: PresetKey): ComposerState {
  const def = PRESETS[key];
  const keptPhotos: (number | null)[] = state.slots.map((s) => s.photoId).filter((id): id is number => id != null);
  const slots: ComposerSlot[] = Array.from({ length: def.slotCount }, (_, i) => ({
    photoId: keptPhotos[i] ?? null,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  }));
  return { ...state, preset: key, slots, aspect: def.aspect, bgColor: def.bgColor, borderWidth: def.borderWidth, dividerWidth: def.dividerWidth };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Compute inner area and slot rectangles for a canvas of the given size. */
export function computeGeometry(state: ComposerState, canvasW: number, canvasH: number): { inner: Rect; slots: Rect[] } {
  const capH = state.showCaption ? Math.round(canvasH * 0.07) : 0;
  const inner: Rect = {
    x: state.borderWidth,
    y: state.borderWidth,
    w: canvasW - state.borderWidth * 2,
    h: canvasH - state.borderWidth * 2 - capH,
  };
  const def = PRESETS[state.preset];
  const div = state.dividerWidth;
  const slots: Rect[] = def.rects.map(([fx, fy, fw, fh]) => {
    const x = inner.x + fx * inner.w + (fx > 0 ? div / 2 : 0);
    const y = inner.y + fy * inner.h + (fy > 0 ? div / 2 : 0);
    const w = fw * inner.w - (fx > 0 && fx + fw < 1 ? div : fx > 0 || fx + fw < 1 ? div / 2 : 0);
    const h = fh * inner.h - (fy > 0 && fy + fh < 1 ? div : fy > 0 || fy + fh < 1 ? div / 2 : 0);
    return { x, y, w, h };
  });
  return { inner, slots };
}

/* ---------- image loading ---------- */

const imgCache = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imgCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (imgCache.size > 120) imgCache.clear();
      imgCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: Rect,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const s = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  const maxX = Math.max(0, (dw - rect.w) / 2);
  const maxY = Math.max(0, (dh - rect.h) / 2);
  const dx = rect.x + (rect.w - dw) / 2 + (offsetX / 100) * maxX;
  const dy = rect.y + (rect.h - dh) / 2 + (offsetY / 100) * maxY;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Render the whole composition onto a canvas. */
export async function renderComposer(
  canvas: HTMLCanvasElement,
  state: ComposerState,
  photos: Map<number, Photo>,
  opts: { full?: boolean } = {},
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, W, H);

  const { slots } = computeGeometry(state, W, H);
  for (let i = 0; i < slots.length; i++) {
    const slot = state.slots[i];
    const rect = slots[i];
    if (!slot || !slot.photoId) continue;
    const photo = photos.get(slot.photoId);
    if (!photo) continue;
    const src = opts.full ? fullSrc(photo) : thumbSrc(photo);
    try {
      const img = await loadImage(src);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      drawCover(ctx, img, rect, slot.zoom, slot.offsetX, slot.offsetY);
      ctx.restore();
    } catch {
      /* skip broken image */
    }
  }

  if (state.showCaption && state.caption.trim()) {
    const fontSize = Math.max(12, Math.round(H * 0.028));
    ctx.font = `500 ${fontSize}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = state.bgColor === "#ffffff" || state.bgColor === "#f5f4f0" ? "#3a3a35" : "#b9b7b0";
    ctx.fillText(state.caption.trim(), W / 2, H - state.borderWidth - (H * 0.07) / 2, W - state.borderWidth * 2);
  }
}

import { convertFileSrc } from "@tauri-apps/api/core";
function thumbSrc(photo: Photo): string {
  return photo.thumbnailPath ? convertFileSrc(photo.thumbnailPath) : convertFileSrc(photo.filePath);
}
function fullSrc(photo: Photo): string {
  return convertFileSrc(photo.filePath);
}
export { fullSrc };

/** Hit-test a preview point against slot rects. */
export function slotAtPoint(state: ComposerState, canvasW: number, canvasH: number, x: number, y: number): number {
  const { slots } = computeGeometry(state, canvasW, canvasH);
  for (let i = 0; i < slots.length; i++) {
    const r = slots[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}
