import type { CubeLut } from "./lut";
import { lutToBytes } from "./lut";

/* ------------------------------------------------------------------ */
/* Edit settings                                                        */
/* ------------------------------------------------------------------ */

export interface EditSettings {
  // Light
  exposure: number; // -100..100 (±2 stops)
  contrast: number; // -100..100
  highlights: number; // -100..100
  shadows: number; // -100..100
  whites: number; // -100..100
  blacks: number; // -100..100
  // Color
  temperature: number; // -100 (cool) .. 100 (warm)
  tint: number; // -100 (green) .. 100 (magenta)
  saturation: number; // -100..100
  vibrance: number; // -100..100
  // Detail
  sharpen: number; // 0..100
  clarity: number; // -100..100
  denoise: number; // 0..100 (grain / noise reduction)
  // Effects
  grainAmount: number; // 0..100
  grainSize: number; // 0.5..4 (image-pixel scale)
  vignette: number; // -100 (light) .. 100 (dark)
  fade: number; // 0..100
  // LUT
  lut: string | null;
  lutStrength: number; // 0..100
}

export function defaultEditSettings(): EditSettings {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 0,
    tint: 0,
    saturation: 0,
    vibrance: 0,
    sharpen: 0,
    clarity: 0,
    denoise: 0,
    grainAmount: 0,
    grainSize: 1.4,
    vignette: 0,
    fade: 0,
    lut: null,
    lutStrength: 100,
  };
}

export function isDefault(s: EditSettings): boolean {
  return (
    s.exposure === 0 &&
    s.contrast === 0 &&
    s.highlights === 0 &&
    s.shadows === 0 &&
    s.whites === 0 &&
    s.blacks === 0 &&
    s.temperature === 0 &&
    s.tint === 0 &&
    s.saturation === 0 &&
    s.vibrance === 0 &&
    s.sharpen === 0 &&
    s.clarity === 0 &&
    s.denoise === 0 &&
    s.grainAmount === 0 &&
    s.vignette === 0 &&
    s.fade === 0 &&
    s.lut === null
  );
}

/* ------------------------------------------------------------------ */
/* WebGL2 renderer — single-pass film pipeline                          */
/* ------------------------------------------------------------------ */

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler3D u_lut;
uniform float u_lutStrength;
uniform bool u_lutEnabled;

uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_temperature;
uniform float u_tint;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_sharpen;
uniform float u_clarity;
uniform float u_denoise;
uniform float u_grainAmount;
uniform float u_grainSize;
uniform float u_vignette;
uniform float u_fade;
uniform vec2 u_texel;   // 1 / image size
uniform vec2 u_size;    // image size in px

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 c0 = texture(u_image, v_uv).rgb;

  /* --- denoise: small bilateral filter (grain / noise reduction) --- */
  vec3 c = c0;
  if (u_denoise > 0.001) {
    float sigma = max(u_denoise, 0.001);
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        vec3 cn = texture(u_image, v_uv + vec2(float(dx), float(dy)) * u_texel * 1.2).rgb;
        float d = dot(cn - c0, cn - c0);
        float w = exp(-d * (140.0 / (sigma * sigma)) - float(dx*dx + dy*dy) * 0.18);
        sum += cn * w;
        wsum += w;
      }
    }
    c = mix(c0, sum / wsum, min(sigma * 1.1, 1.0));
  }

  /* --- clarity: local contrast on luminance (wide radius) --- */
  if (abs(u_clarity) > 0.001) {
    float l0 = luma(c);
    vec3 wide = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      vec2 o = vec2(
        (i < 4 ? float(i) - 1.5 : ((i == 4 || i == 7) ? -4.5 : 4.5)),
        (i < 4 ? (i < 2 ? -3.5 : 3.5) : float(mod(float(i), 2.0)) * 7.0 - 3.5)
      );
      wide += texture(u_image, v_uv + o * u_texel * 1.6).rgb;
    }
    wide /= 8.0;
    float detail = l0 - luma(wide);
    c += detail * u_clarity * 0.9;
  }

  /* --- sharpen: unsharp mask (tight radius) --- */
  if (u_sharpen > 0.001) {
    vec3 blur1 = (
      texture(u_image, v_uv + vec2(u_texel.x, 0.0)).rgb +
      texture(u_image, v_uv - vec2(u_texel.x, 0.0)).rgb +
      texture(u_image, v_uv + vec2(0.0, u_texel.y)).rgb +
      texture(u_image, v_uv - vec2(0.0, u_texel.y)).rgb
    ) / 4.0;
    c += (c0 - blur1) * u_sharpen * 1.1;
  }

  /* --- white balance --- */
  float t = u_temperature;
  float ti = u_tint;
  c.r += t * 0.10 - ti * 0.02;
  c.g += t * 0.02 + ti * 0.085;
  c.b -= t * 0.10 - ti * 0.02;

  /* --- exposure --- */
  c *= exp2(u_exposure * 2.0);

  /* --- tone: shadows / highlights / whites / blacks --- */
  float l = luma(clamp(c, 0.0, 1.0));
  float sm = pow(1.0 - smoothstep(0.0, 0.55, l), 1.4);
  float hm = pow(smoothstep(0.45, 1.0, l), 1.4);
  c += u_shadows * 0.55 * sm * (u_shadows > 0.0 ? (1.0 - clamp(c, 0.0, 1.0)) : clamp(c, 0.0, 1.0));
  c += u_highlights * 0.55 * hm * (u_highlights > 0.0 ? (1.0 - clamp(c, 0.0, 1.0)) : clamp(c, 0.0, 1.0));
  c += u_whites * 0.30 * smoothstep(0.45, 1.0, l);
  c += u_blacks * 0.30 * (1.0 - smoothstep(0.0, 0.55, l));

  /* --- contrast --- */
  c = clamp(c, 0.0, 1.0);
  if (u_contrast >= 0.0) {
    c = mix(c, smoothstep(vec3(0.0), vec3(1.0), c), u_contrast * 0.85);
  } else {
    c = (c - 0.5) * (1.0 + u_contrast * 0.7) + 0.5;
  }

  /* --- 3D LUT --- */
  if (u_lutEnabled && u_lutStrength > 0.001) {
    vec3 graded = texture(u_lut, clamp(c, 0.0015, 0.9985)).rgb;
    c = mix(c, graded, u_lutStrength);
  }

  /* --- saturation / vibrance --- */
  l = luma(clamp(c, 0.0, 1.0));
  c = mix(vec3(l), c, 1.0 + u_saturation);
  if (abs(u_vibrance) > 0.001) {
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float sat = clamp(mx - mn, 0.0, 1.0);
    c = mix(vec3(l), c, 1.0 + u_vibrance * (1.0 - sat));
  }

  /* --- fade (lift blacks, soften contrast) --- */
  c = mix(c, c * (1.0 - 0.22 * u_fade) + 0.10 * u_fade, u_fade > 0.0 ? 1.0 : 0.0);

  /* --- vignette --- */
  vec2 d = v_uv - 0.5;
  float dist = length(d) * 1.4142;
  float vig = 1.0 - smoothstep(0.45, 1.05, dist);
  c *= mix(vec3(1.0), vec3(vig), max(u_vignette, 0.0));
  c += (1.0 - vig) * min(u_vignette, 0.0) * -0.45;

  /* --- film grain (proportional to image pixels — preview matches export) --- */
  if (u_grainAmount > 0.001) {
    vec2 gp = floor(v_uv * u_size / max(u_grainSize, 0.4));
    float n = hash(gp) - 0.5;
    float lm = luma(clamp(c, 0.0, 1.0));
    c += n * u_grainAmount * 0.5 * (1.0 - lm * 0.55) * (0.35 + 0.65 * u_grainAmount);
  }

  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error(`createShader returned null (context lost? err=${gl.getError()})`);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  const err = gl.getError();
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`shader compile error (${type === gl.VERTEX_SHADER ? "vertex" : "fragment"}): log=${gl.getShaderInfoLog(sh)} glError=${err} lost=${gl.isContextLost()}`);
  }
  return sh;
}

const U_NAMES = [
  "u_image", "u_lut", "u_lutStrength", "u_lutEnabled",
  "u_exposure", "u_contrast", "u_highlights", "u_shadows", "u_whites", "u_blacks",
  "u_temperature", "u_tint", "u_saturation", "u_vibrance",
  "u_sharpen", "u_clarity", "u_denoise",
  "u_grainAmount", "u_grainSize", "u_vignette", "u_fade", "u_texel", "u_size",
] as const;

export class EditorRenderer {
  gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private tex: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  private lutSize = 0;
  private glCanvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D | null = null;
  imgW = 0;
  imgH = 0;
  available = true;

  constructor(public canvas: HTMLCanvasElement) {
    // Render on a detached offscreen canvas: some WKWebView builds immediately
    // lose WebGL contexts created on canvases attached to the live window.
    this.glCanvas = document.createElement("canvas");
    const gl = this.glCanvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
    if (!gl) {
      this.available = false;
      throw new Error("WebGL2 is not available in this environment");
    }
    this.gl = gl;
    if (gl.isContextLost()) {
      throw new Error("WebGL2 context is lost right after creation");
    }
    this.displayCtx = canvas.getContext("2d");
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link error: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    gl.useProgram(program);
    for (const n of U_NAMES) this.uniforms[n] = gl.getUniformLocation(program, n);

    // fullscreen quad
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.uniform1i(this.uniforms.u_image, 0);
    gl.uniform1i(this.uniforms.u_lut, 1);
  }

  /** The canvas the GL pipeline renders into (used for full-resolution export). */
  get renderCanvas(): HTMLCanvasElement {
    return this.glCanvas;
  }

  setImage(img: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    this.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.imgW = width;
    this.imgH = height;
  }

  hasImage(): boolean {
    return this.tex != null;
  }

  setLut(lut: CubeLut | null) {
    const gl = this.gl;
    if (this.lutTex) {
      gl.deleteTexture(this.lutTex);
      this.lutTex = null;
      this.lutSize = 0;
    }
    if (!lut) return;
    this.lutTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texImage3D(
      gl.TEXTURE_3D, 0, gl.RGB, lut.size, lut.size, lut.size, 0,
      gl.RGB, gl.UNSIGNED_BYTE, lutToBytes(lut),
    );
    this.lutSize = lut.size;
  }

  /** Render at the given pixel size (defaults to the display canvas size), then blit to the display canvas. */
  render(s: EditSettings, size?: { w: number; h: number }) {
    const gl = this.gl;
    if (!this.tex) return;
    const w = Math.max(1, size?.w ?? this.canvas.width);
    const h = Math.max(1, size?.h ?? this.canvas.height);
    this.glCanvas.width = w;
    this.glCanvas.height = h;

    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.uniform1i(this.uniforms.u_lutEnabled, this.lutTex != null && !!s.lut ? 1 : 0);
    const u = this.uniforms;
    gl.uniform1f(u.u_lutStrength, s.lutStrength / 100);
    gl.uniform1f(u.u_exposure, s.exposure / 100);
    gl.uniform1f(u.u_contrast, s.contrast / 100);
    gl.uniform1f(u.u_highlights, s.highlights / 100);
    gl.uniform1f(u.u_shadows, s.shadows / 100);
    gl.uniform1f(u.u_whites, s.whites / 100);
    gl.uniform1f(u.u_blacks, s.blacks / 100);
    gl.uniform1f(u.u_temperature, s.temperature / 100);
    gl.uniform1f(u.u_tint, s.tint / 100);
    gl.uniform1f(u.u_saturation, s.saturation / 100);
    gl.uniform1f(u.u_vibrance, s.vibrance / 100);
    gl.uniform1f(u.u_sharpen, s.sharpen / 100);
    gl.uniform1f(u.u_clarity, s.clarity / 100);
    gl.uniform1f(u.u_denoise, s.denoise / 100);
    gl.uniform1f(u.u_grainAmount, s.grainAmount / 100);
    gl.uniform1f(u.u_grainSize, s.grainSize);
    gl.uniform1f(u.u_vignette, s.vignette / 100);
    gl.uniform1f(u.u_fade, s.fade / 100);
    gl.uniform2f(u.u_texel, 1 / this.imgW, 1 / this.imgH);
    gl.uniform2f(u.u_size, this.imgW, this.imgH);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Blit the GL result onto the visible 2D canvas
    if (this.displayCtx) {
      this.displayCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.displayCtx.drawImage(this.glCanvas, 0, 0, w, h, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  dispose() {
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.lutTex) gl.deleteTexture(this.lutTex);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/* ------------------------------------------------------------------ */
/* Auto-enhance — histogram analysis (no AI, deterministic)             */
/* ------------------------------------------------------------------ */

export function computeAutoAdjustments(source: HTMLImageElement | ImageBitmap): Partial<EditSettings> {
  const W = 220;
  const H = Math.max(1, Math.round((source.height / source.width) * W));
  const cnv = document.createElement("canvas");
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return {};
  ctx.drawImage(source as CanvasImageSource, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const lum = new Uint32Array(256);
  let sr = 0, sg = 0, sb = 0, satSum = 0;
  const n = W * H;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    sr += r; sg += g; sb += b;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[Math.min(255, Math.round(y))]++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    satSum += mx > 0 ? (mx - mn) / mx : 0;
  }

  // Percentiles
  const pct = (p: number) => {
    const target = n * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += lum[v];
      if (acc >= target) return v / 255;
    }
    return 1;
  };
  const lo = pct(0.005);
  const hi = pct(0.995);
  const mid = pct(0.5);
  const meanR = sr / n / 255, meanG = sg / n / 255, meanB = sb / n / 255;
  const meanL = 0.2126 * meanR + 0.7152 * meanG + 0.0722 * meanB;
  const meanSat = satSum / n;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  const out: Partial<EditSettings> = {};
  // Target a pleasing mid-tone around 0.46
  out.exposure = Math.round(clamp((0.46 - mid) * 130, -55, 55));
  // Expand tonal range when flat
  const range = hi - lo;
  out.contrast = Math.round(clamp((0.82 - range) * 90, 0, 35));
  // Deepen lifted blacks / pull down blown whites
  out.blacks = Math.round(clamp((0.05 - lo) * 260, -30, 6));
  out.whites = Math.round(clamp((hi - 0.94) * 260, -6, 30));
  // Neutralize color cast (shader: +temp = warm, +tint = magenta)
  out.temperature = Math.round(clamp((meanB - meanR) * 260, -40, 40));
  out.tint = Math.round(clamp((meanG - (meanR + meanB) / 2) * 260, -30, 30));
  // Gentle vibrance boost for dull images
  out.vibrance = Math.round(clamp((0.24 - meanSat) * 160, 0, 30));
  // Slight shadow lift for dark images
  if (meanL < 0.3) out.shadows = Math.round(clamp((0.3 - meanL) * 120, 0, 25));
  // Mild clarity + sharpen as a pleasing default
  out.clarity = 8;
  out.sharpen = 12;
  return out;
}
