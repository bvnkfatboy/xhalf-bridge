import type { EditSettings } from "./webgl-editor";

/** Bundled G'MIC film LUTs (from YahiaAngelo/Film-Luts, MIT). Keys are /luts/<key>.cube */
export const LUT_CATALOG: { key: string; name: string; category: string }[] = [
  // Color negative — classics
  { key: "negative_color/kodak_ektar_100", name: "Kodak Ektar 100", category: "colorNegative" },
  { key: "negative_color/agfa_vista_200", name: "Agfa Vista 200", category: "colorNegative" },
  { key: "negative_color/fuji_superia_200", name: "Fuji Superia 200", category: "colorNegative" },
  { key: "negative_color/fuji_superia_reala_100", name: "Fuji Reala 100", category: "colorNegative" },
  { key: "negative_color/fuji_superia_x-tra_800", name: "Fuji Superia X-Tra 800", category: "colorNegative" },
  { key: "negative_color/kodak_portra_160_vc", name: "Portra 160 VC", category: "colorNegative" },
  { key: "negative_color/kodak_portra_160_nc", name: "Portra 160 NC", category: "colorNegative" },
  { key: "negative_color/lomography_redscale_100", name: "Lomography Redscale", category: "colorNegative" },
  // Modern negatives
  { key: "negative_new/kodak_portra_160", name: "Kodak Portra 160", category: "modernNegative" },
  { key: "negative_new/kodak_portra_400", name: "Kodak Portra 400", category: "modernNegative" },
  { key: "negative_new/kodak_portra_800", name: "Kodak Portra 800", category: "modernNegative" },
  { key: "negative_new/fuji_400h", name: "Fuji Pro 400H", category: "modernNegative" },
  { key: "negative_new/fuji_800z", name: "Fuji 800Z", category: "modernNegative" },
  { key: "negative_new/fuji_160c", name: "Fuji 160C", category: "modernNegative" },
  // Slide film
  { key: "colorslide/kodak_kodachrome_64", name: "Kodachrome 64", category: "slideFilm" },
  { key: "colorslide/fuji_velvia_50", name: "Fuji Velvia 50", category: "slideFilm" },
  { key: "colorslide/fuji_provia_100f", name: "Fuji Provia 100F", category: "slideFilm" },
  { key: "colorslide/fuji_astia_100f", name: "Fuji Astia 100F", category: "slideFilm" },
  { key: "colorslide/kodak_e-100_gx_ektachrome_100", name: "Ektachrome E-100GX", category: "slideFilm" },
  { key: "colorslide/fuji_superia_200_xpro", name: "Superia 200 X-Pro", category: "slideFilm" },
  { key: "colorslide/polaroid_669", name: "Polaroid 669", category: "slideFilm" },
  // Black & white
  { key: "bw/kodak_tri-x_400", name: "Kodak Tri-X 400", category: "bw" },
  { key: "bw/ilford_hp_5_plus_400", name: "Ilford HP5 Plus 400", category: "bw" },
  { key: "bw/ilford_delta_3200", name: "Ilford Delta 3200", category: "bw" },
  { key: "bw/fuji_neopan_acros_100", name: "Fuji Neopan Acros 100", category: "bw" },
  { key: "bw/ilford_pan_f_plus_50", name: "Ilford Pan F Plus 50", category: "bw" },
  { key: "bw/kodak_t-max_400", name: "Kodak T-Max 400", category: "bw" },
  { key: "bw/rollei_ir_400", name: "Rollei Infrared 400", category: "bw" },
  // Instant
  { key: "instant_consumer/polaroid_px-680", name: "Polaroid PX-680", category: "instant" },
  { key: "instant_consumer/polaroid_time_zero_expired", name: "Time-Zero Expired", category: "instant" },
  { key: "instant_consumer/polaroid_px-100uv+_warm", name: "PX-100 UV+ Warm", category: "instant" },
  // Fuji X-Trans simulations
  { key: "fujixtransiii/fuji_xtrans_iii_classic_chrome", name: "Classic Chrome", category: "xtrans" },
  { key: "fujixtransiii/fuji_xtrans_iii_velvia", name: "X-Trans Velvia", category: "xtrans" },
  { key: "fujixtransiii/fuji_xtrans_iii_astia", name: "X-Trans Astia", category: "xtrans" },
  { key: "fujixtransiii/fuji_xtrans_iii_pro_neg_std", name: "X-Trans Pro Neg", category: "xtrans" },
  { key: "fujixtransiii/fuji_xtrans_iii_acros", name: "X-Trans Acros", category: "xtrans" },
  { key: "fujixtransiii/fuji_xtrans_iii_mono+ye", name: "X-Trans Mono +Ye", category: "xtrans" },
  { key: "fujixtransiii/fuji_xtrans_iii_sepia", name: "X-Trans Sepia", category: "xtrans" },
  // Cinema print
  { key: "print/kodak_2383_constlclip", name: "Kodak 2383 (Cinema)", category: "cinema" },
  { key: "print/fuji_3513_constlclip", name: "Fuji 3513 (Cinema)", category: "cinema" },
];

export const LUT_CATEGORIES = ["colorNegative", "modernNegative", "slideFilm", "bw", "instant", "xtrans", "cinema"] as const;

export interface FilmPreset {
  id: string;
  name: string;
  category: "film" | "bw" | "instant" | "cinema" | "xtrans";
  lut: string | null;
  settings: Partial<EditSettings>;
}

export const FILM_PRESETS: FilmPreset[] = [
  {
    id: "portra400", name: "Portra 400 Warm", category: "film", lut: "negative_new/kodak_portra_400",
    settings: { exposure: 4, temperature: 8, fade: 12, shadows: 8, grainAmount: 14, grainSize: 1.6 },
  },
  {
    id: "portra800", name: "Portra 800 Night", category: "film", lut: "negative_new/kodak_portra_800",
    settings: { exposure: -6, contrast: 12, shadows: 10, grainAmount: 28, grainSize: 1.8 },
  },
  {
    id: "ektar", name: "Ektar Punch", category: "film", lut: "negative_color/kodak_ektar_100",
    settings: { contrast: 14, vibrance: 18, clarity: 12, sharpen: 16 },
  },
  {
    id: "fuji400h", name: "Fuji 400H Pastel", category: "film", lut: "negative_new/fuji_400h",
    settings: { temperature: -8, fade: 16, highlights: -12, whites: -8, grainAmount: 12 },
  },
  {
    id: "superia-street", name: "Superia Street", category: "film", lut: "negative_color/fuji_superia_x-tra_800",
    settings: { contrast: 14, shadows: 8, clarity: 14, grainAmount: 26, grainSize: 1.8 },
  },
  {
    id: "kodachrome", name: "Kodachrome 64", category: "film", lut: "colorslide/kodak_kodachrome_64",
    settings: { contrast: 18, vibrance: 12, blacks: -10 },
  },
  {
    id: "velvia", name: "Velvia Landscape", category: "film", lut: "colorslide/fuji_velvia_50",
    settings: { vibrance: 22, contrast: 14, clarity: 16 },
  },
  {
    id: "provia", name: "Provia Crisp", category: "film", lut: "colorslide/fuji_provia_100f",
    settings: { contrast: 8, sharpen: 22, clarity: 10 },
  },
  {
    id: "ektachrome", name: "Ektachrome Retro", category: "film", lut: "colorslide/kodak_e-100_gx_ektachrome_100",
    settings: { temperature: 6, fade: 8, vibrance: 8 },
  },
  {
    id: "xpro", name: "Cross Process", category: "film", lut: "colorslide/fuji_superia_200_xpro",
    settings: { contrast: 20, tint: 10, blacks: -12, vibrance: 14 },
  },
  {
    id: "reala", name: "Reala Calm", category: "film", lut: "negative_color/fuji_superia_reala_100",
    settings: { temperature: -4, shadows: 6, fade: 8, grainAmount: 10 },
  },
  {
    id: "trix", name: "Tri-X 400", category: "bw", lut: "bw/kodak_tri-x_400",
    settings: { contrast: 16, blacks: -8, grainAmount: 34, grainSize: 1.8, clarity: 12 },
  },
  {
    id: "hp5", name: "HP5 Document", category: "bw", lut: "bw/ilford_hp_5_plus_400",
    settings: { contrast: 10, clarity: 18, grainAmount: 30, grainSize: 2.0 },
  },
  {
    id: "delta3200", name: "Delta 3200 Night", category: "bw", lut: "bw/ilford_delta_3200",
    settings: { exposure: -4, contrast: 12, grainAmount: 58, grainSize: 2.6 },
  },
  {
    id: "acros", name: "Acros Fine Grain", category: "bw", lut: "bw/fuji_neopan_acros_100",
    settings: { contrast: 10, sharpen: 20, blacks: -6, grainAmount: 10, grainSize: 1.2 },
  },
  {
    id: "panf", name: "Pan F Plus Smooth", category: "bw", lut: "bw/ilford_pan_f_plus_50",
    settings: { contrast: 8, denoise: 20, sharpen: 14, grainAmount: 4 },
  },
  {
    id: "px680", name: "Polaroid 680", category: "instant", lut: "instant_consumer/polaroid_px-680",
    settings: { fade: 20, temperature: 6, vignette: 30, grainAmount: 16, whites: -6 },
  },
  {
    id: "timezero", name: "Time-Zero Expired", category: "instant", lut: "instant_consumer/polaroid_time_zero_expired",
    settings: { fade: 32, contrast: -8, temperature: 10, vignette: 36, grainAmount: 20 },
  },
  {
    id: "classic-chrome", name: "Classic Chrome", category: "xtrans", lut: "fujixtransiii/fuji_xtrans_iii_classic_chrome",
    settings: { contrast: 8, blacks: -6, sharpen: 12 },
  },
  {
    id: "xtrans-sepia", name: "X-Trans Sepia", category: "xtrans", lut: "fujixtransiii/fuji_xtrans_iii_sepia",
    settings: { fade: 14, grainAmount: 18, vignette: 18 },
  },
  {
    id: "cinema2383", name: "Cinema 2383", category: "cinema", lut: "print/kodak_2383_constlclip",
    settings: { contrast: 10, blacks: -8, shadows: 6, fade: 6 },
  },
  {
    id: "redscale", name: "Redscale", category: "film", lut: "negative_color/lomography_redscale_100",
    settings: { contrast: 12, vignette: 24, grainAmount: 22 },
  },
];
