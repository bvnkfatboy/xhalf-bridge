import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, Download, ImagePlus, Minus, Plus, Redo2, Save, Sparkles, Undo2, Wand2, X,
} from "lucide-react";
import { api } from "../api";
import { useApp } from "../App";
import { PhotoPicker } from "../components/PhotoPicker";
import { Button, Field, Input, Modal, useToast } from "../components/ui";
import { fullUrl } from "../components/PhotoGrid";
import { LUT_CATALOG, LUT_CATEGORIES, FILM_PRESETS, type FilmPreset } from "../lib/filmPresets";
import { loadBundledLut, parseCube, type CubeLut } from "../lib/lut";
import {
  EditorRenderer, computeAutoAdjustments, defaultEditSettings, isDefault,
  type EditSettings,
} from "../lib/webgl-editor";
import { useT } from "../i18n";
import { cn } from "../utils";
import type { EditorPreset, Photo } from "../types";

export function Editor({ photoId }: { photoId: number | null }) {
  const t = useT();
  const { navigate, tick, importPaths } = useApp();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<EditorRenderer | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const lutCache = useRef<Map<string, CubeLut>>(new Map());
  const saveTimer = useRef<number | null>(null);

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  /* ---------- zoom & pan (trackpad pinch / ctrl+wheel / drag) ---------- */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const gestureRef = useRef<{ startZoom: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const clampPanFor = useCallback((z: number, p: { x: number; y: number }) => {
    const el = canvasRef.current;
    if (!el) return p;
    const maxX = Math.max(0, ((z - 1) * el.clientWidth) / 2);
    const maxY = Math.max(0, ((z - 1) * el.clientHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  }, []);

  const applyZoom = useCallback(
    (z: number, p: { x: number; y: number }) => {
      const zz = Math.min(8, Math.max(1, z));
      const pp = clampPanFor(zz, p);
      zoomRef.current = zz;
      panRef.current = pp;
      setZoom(zz);
      setPan(pp);
    },
    [clampPanFor],
  );

  /** Zoom keeping the image point under the cursor anchored. */
  const zoomAt = useCallback(
    (clientX: number, clientY: number, z: number) => {
      const el = canvasRef.current;
      if (!el) return;
      // getBoundingClientRect reflects the transform; recover the layout center
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 - panRef.current.x;
      const cy = rect.top + rect.height / 2 - panRef.current.y;
      const z0 = zoomRef.current;
      const z1 = Math.min(8, Math.max(1, z));
      const p0 = panRef.current;
      const dx = clientX - cx;
      const dy = clientY - cy;
      applyZoom(z1, {
        x: dx * (1 - z1 / z0) + p0.x * (z1 / z0),
        y: dy * (1 - z1 / z0) + p0.y * (z1 / z0),
      });
    },
    [applyZoom],
  );

  // Native gesture listeners: trackpad pinch (WebKit gesture events) + ctrl+wheel
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !ready) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, zoomRef.current * Math.exp(-e.deltaY * 0.01));
      } else if (zoomRef.current > 1) {
        applyZoom(zoomRef.current, { x: panRef.current.x - e.deltaX, y: panRef.current.y - e.deltaY });
      }
    };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      const ge = e as WheelEvent & { scale?: number; clientX: number; clientY: number };
      gestureRef.current = { startZoom: zoomRef.current, x: ge.clientX, y: ge.clientY };
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = gestureRef.current;
      const ge = e as WheelEvent & { scale?: number };
      if (!g) return;
      zoomAt(g.x, g.y, g.startZoom * (ge.scale || 1));
    };
    const onGestureEnd = () => {
      gestureRef.current = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart as EventListener, { passive: false });
    el.addEventListener("gesturechange", onGestureChange as EventListener, { passive: false });
    el.addEventListener("gestureend", onGestureEnd as EventListener);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart as EventListener);
      el.removeEventListener("gesturechange", onGestureChange as EventListener);
      el.removeEventListener("gestureend", onGestureEnd as EventListener);
    };
  }, [ready, zoomAt, applyZoom]);

  // Reset view when switching photos
  useEffect(() => {
    setImgSize(null);
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photoId]);
  const [settings, setSettings] = useState<EditSettings>(defaultEditSettings);
  const [history, setHistory] = useState<EditSettings[]>([]);
  const [future, setFuture] = useState<EditSettings[]>([]);
  const [lutData, setLutData] = useState<CubeLut | null>(null);
  const [lutLoading, setLutLoading] = useState(false);
  const [compare, setCompare] = useState(false);
  const [userPresets, setUserPresets] = useState<EditorPreset[]>([]);
  const [customLuts, setCustomLuts] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [lutTab, setLutTab] = useState<"presets" | "luts">("presets");
  const [lutCategory, setLutCategory] = useState<string>("colorNegative");

  /* ---------- init renderer & image ---------- */
  useEffect(() => {
    if (!photoId) return;
    let disposed = false;
    setReady(false);
    let img: HTMLImageElement | null = null;
    (async () => {
      try {
        const p = await api.getPhoto(photoId);
        if (disposed) return;
        setPhoto(p);
        img = new Image();
        img.onload = async () => {
          if (disposed || !canvasRef.current) return;
          try {
            const renderer = new EditorRenderer(canvasRef.current);
            // Downscale if the image exceeds GPU texture limits
            const maxTex = renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE) as number;
            let src: CanvasImageSource = img!;
            let w = img!.naturalWidth, h = img!.naturalHeight;
            if (Math.max(w, h) > maxTex) {
              const k = maxTex / Math.max(w, h);
              w = Math.round(w * k);
              h = Math.round(h * k);
              const off = document.createElement("canvas");
              off.width = w;
              off.height = h;
              off.getContext("2d")!.drawImage(img!, 0, 0, w, h);
              src = off;
            }
            renderer.setImage(src, w, h);
            rendererRef.current = renderer;
            imgRef.current = img!;
            // Use the decoded (EXIF-oriented) dimensions — the DB stores raw pixels
            setImgSize({ w: renderer.imgW, h: renderer.imgH });
            setReady(true);
          } catch (e) {
            setWebglError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
            console.error(e);
          }
        };
        img.onerror = () => toast(t("Failed to load image"), "error");
        // Asset protocol is cross-origin — without CORS the image would taint
        // the canvas and WebGL's texImage2D would throw SecurityError.
        img.crossOrigin = "anonymous";
        img.src = fullUrl(p);
      } catch (e) {
        toast(String(e), "error");
      }
    })();
    return () => {
      disposed = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);

  // Restore saved non-destructive edit
  useEffect(() => {
    if (!photoId || !ready) return;
    api.getPhotoEdit(photoId).then((saved) => {
      if (saved && Object.keys(saved).length > 0) {
        setSettings({ ...defaultEditSettings(), ...(saved as Partial<EditSettings>) });
      }
    }).catch(() => {});
    api.listEditorPresets().then(setUserPresets).catch(() => {});
    api.listCustomLuts().then(setCustomLuts).catch(() => {});
  }, [photoId, ready]);

  // Load LUT when selected
  useEffect(() => {
    let cancelled = false;
    if (!settings.lut) {
      setLutData(null);
      rendererRef.current?.setLut(null);
      return;
    }
    const cached = lutCache.current.get(settings.lut);
    if (cached) {
      setLutData(cached);
      return;
    }
    setLutLoading(true);
    (async () => {
      try {
        let lut: CubeLut;
        if (settings.lut!.startsWith("custom/")) {
          const text = await api.readCustomLut(settings.lut!.slice(7));
          lut = parseCube(text);
        } else {
          lut = await loadBundledLut(settings.lut!);
        }
        if (cancelled) return;
        lutCache.current.set(settings.lut!, lut);
        rendererRef.current?.setLut(lut);
        setLutData(lut);
      } catch (e) {
        toast(String(e), "error");
        setSettings((s) => ({ ...s, lut: null }));
      } finally {
        if (!cancelled) setLutLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.lut]);

  // Observe container size for preview fitting (both axes)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setWrapSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [photoId]);

  // Fit the preview inside the container while preserving the image's true aspect ratio
  const display = useMemo(() => {
    if (!imgSize || !wrapSize.w || !wrapSize.h) return null;
    const availW = Math.max(200, wrapSize.w - 24);
    const availH = Math.max(200, wrapSize.h - 24);
    const scale = Math.min(availW / imgSize.w, availH / imgSize.h);
    return { w: Math.round(imgSize.w * scale), h: Math.round(imgSize.h * scale) };
  }, [imgSize, wrapSize]);

  // Render preview
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !renderer.hasImage() || !display) return;
    const canvas = renderer.canvas;
    canvas.width = display.w;
    canvas.height = display.h;
    renderer.render(compare ? defaultEditSettings() : settings);
  }, [settings, compare, display, ready, lutData]);

  // Debounced non-destructive save
  useEffect(() => {
    if (!photoId || !ready) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api.savePhotoEdit(photoId, settings).catch(() => {});
    }, 600);
  }, [settings, photoId, ready]);

  const commit = useCallback(
    (next: EditSettings) => {
      setHistory((h) => [...h.slice(-49), settings]);
      setFuture([]);
      setSettings(next);
    },
    [settings],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setFuture((f) => [settings, ...f].slice(0, 50));
      setSettings(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, [settings]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setHistory((h) => [...h, settings]);
      setSettings(f[0]);
      return f.slice(1);
    });
  }, [settings]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z")) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo, redo]);

  const set = (patch: Partial<EditSettings>, record = true) => {
    const next = { ...settings, ...patch };
    if (record) commit(next);
    else setSettings(next);
  };

  const applyAuto = () => {
    if (!imgRef.current) return;
    const auto = computeAutoAdjustments(imgRef.current);
    commit({ ...settings, ...auto });
    toast(t("Auto enhance applied"), "success");
  };

  const resetAll = () => {
    commit(defaultEditSettings());
    if (photoId) api.clearPhotoEdit(photoId).catch(() => {});
  };

  const applyPreset = (p: FilmPreset) => {
    commit({ ...defaultEditSettings(), ...p.settings, lut: p.lut, lutStrength: 100 });
  };

  /* ---------- render at full resolution & save ---------- */
  const renderFull = async (maxDim: number): Promise<string> => {
    const renderer = rendererRef.current;
    if (!renderer) throw new Error("not ready");
    const k = Math.min(1, maxDim / Math.max(renderer.imgW, renderer.imgH));
    const w = Math.max(1, Math.round(renderer.imgW * k));
    const h = Math.max(1, Math.round(renderer.imgH * k));
    renderer.render(settings, { w, h });
    const dataUrl = renderer.renderCanvas.toDataURL("image/jpeg", 0.93);
    renderer.render(settings);
    return dataUrl;
  };

  const saveToLibrary = async () => {
    if (!photo) return;
    try {
      setBusy(true);
      const dataUrl = await renderFull(8192);
      const created = await api.addRenderedPhoto(dataUrl, photo.id);
      toast(t("Saved edited copy to library"), "success");
      navigate("editor", created.id);
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const exportFile = async () => {
    try {
      setBusy(true);
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        defaultPath: `${photo?.originalFilename?.replace(/\.[^.]+$/, "") ?? "edit"}-edited.jpg`,
        filters: [{ name: "JPEG", extensions: ["jpg"] }],
      });
      if (!dest) return;
      const renderer = rendererRef.current;
      if (!renderer) return;
      renderer.render(settings, { w: renderer.imgW, h: renderer.imgH });
      const dataUrl = renderer.renderCanvas.toDataURL("image/jpeg", 0.93);
      renderer.render(settings);
      await api.saveCanvasExport(dataUrl, dest);
      toast(t("Exported successfully"), "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const savePreset = async () => {
    if (!presetName.trim()) return;
    try {
      await api.saveEditorPreset(presetName.trim(), settings);
      setUserPresets(await api.listEditorPresets());
      setShowSavePreset(false);
      setPresetName("");
      toast(t("Preset saved"), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const importLutFile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const sel = await open({
        multiple: false,
        filters: [{ name: "Cube LUT", extensions: ["cube"] }],
      });
      if (typeof sel !== "string") return;
      const name = await api.importLut(sel);
      setCustomLuts(await api.listCustomLuts());
      toast(t("LUT imported: {name}", { name }), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const userPresetApply = async (p: EditorPreset) => {
    commit({ ...defaultEditSettings(), ...(p.settings as Partial<EditSettings>) });
  };

  // Preview aspect follows the decoded image (EXIF-oriented), not the raw DB record
  const aspect = imgSize ? imgSize.h / Math.max(1, imgSize.w) : photo ? photo.height / Math.max(1, photo.width) : 0.66;

  const oneToOne = () => {
    const el = canvasRef.current;
    const r = rendererRef.current;
    if (!el || !r) return;
    const z = Math.min(8, Math.max(1, r.imgW / Math.max(1, el.clientWidth)));
    applyZoom(z, { x: 0, y: 0 });
  };

  if (!photoId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted">
        <Wand2 size={44} strokeWidth={1.2} />
        <p className="text-sm">{t("Pick a photo to start editing")}</p>
        <Button variant="primary" onClick={() => setShowPicker(true)}>
          <ImagePlus size={15} /> {t("Choose photo")}
        </Button>
        <PhotoPicker
          open={showPicker}
          onClose={() => setShowPicker(false)}
          title={t("Choose a photo to edit")}
          multi={false}
          onConfirm={(picked) => {
            if (picked[0]) navigate("editor", picked[0].id);
            setShowPicker(false);
          }}
        />
      </div>
    );
  }

  const previewCanvas = (
    <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-bg p-3">
      {webglError ? (
        <div className="max-w-md space-y-2 text-center">
          <p className="text-sm text-muted">{t("WebGL2 is not available — the editor needs GPU acceleration.")}</p>
          <p className="font-mono text-xs text-danger">{webglError}</p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          style={{
            width: display?.w ?? 320,
            height: display?.h ?? 320,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            willChange: "transform",
            touchAction: "none",
            cursor: zoom > 1 ? "grab" : "default",
          }}
          className="rounded-lg shadow-2xl"
          onDoubleClick={() => applyZoom(1, { x: 0, y: 0 })}
          onPointerDown={(e) => {
            if (zoom > 1) {
              dragRef.current = { x: e.clientX, y: e.clientY };
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            applyZoom(zoomRef.current, { x: panRef.current.x + (e.clientX - d.x), y: panRef.current.y + (e.clientY - d.y) });
            dragRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => (dragRef.current = null)}
          onPointerCancel={() => (dragRef.current = null)}
        />
      )}
      {!ready && !webglError && <p className="absolute text-sm text-muted">{t("Loading photo…")}</p>}
      {ready && !webglError && (
        <div className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-lg border border-line bg-surface/90 px-1 py-0.5 shadow-lg backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            title={t("Zoom out")}
            onClick={() => {
              const el = canvasRef.current;
              if (el) zoomAt(el.getBoundingClientRect().left + el.clientWidth / 2, el.getBoundingClientRect().top + el.clientHeight / 2, zoomRef.current / 1.25);
            }}
          >
            <Minus size={13} />
          </Button>
          <span className="tnum w-12 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            title={t("Zoom in")}
            onClick={() => {
              const el = canvasRef.current;
              if (el) zoomAt(el.getBoundingClientRect().left + el.clientWidth / 2, el.getBoundingClientRect().top + el.clientHeight / 2, zoomRef.current * 1.25);
            }}
          >
            <Plus size={13} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => applyZoom(1, { x: 0, y: 0 })} title={t("Fit the whole image")}>
            {t("Fit")}
          </Button>
          <Button variant="ghost" size="sm" onClick={oneToOne} title={t("Actual pixels (1:1)")}>
            1:1
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("library")} title={t("Back to library")}>
          <ChevronLeft size={17} />
        </Button>
        <span className="min-w-0 max-w-56 truncate text-sm font-medium">{photo?.originalFilename}</span>
        {lutLoading && <span className="text-xs text-muted">{t("Loading LUT…")}</span>}
        <div className="flex-1" />
        <Button variant="primary" size="sm" onClick={applyAuto} title={t("Analyze the photo and apply balanced corrections")}>
          <Sparkles size={14} /> {t("Auto")}
        </Button>
        <Button variant="ghost" size="icon" onClick={undo} disabled={!history.length} title="Undo (⌘Z)">
          <Undo2 size={15} />
        </Button>
        <Button variant="ghost" size="icon" onClick={redo} disabled={!future.length} title="Redo (⌘⇧Z)">
          <Redo2 size={15} />
        </Button>
        <Button
          variant={compare ? "primary" : "default"}
          size="sm"
          onPointerDown={() => setCompare(true)}
          onPointerUp={() => setCompare(false)}
          onPointerLeave={() => setCompare(false)}
          title={t("Hold to compare with the original")}
        >
          {t("Compare")}
        </Button>
        <Button variant="ghost" size="sm" onClick={resetAll} disabled={isDefault(settings)}>
          {t("Reset")}
        </Button>
        <Button variant="default" size="sm" onClick={() => setShowPicker(true)}>
          <ImagePlus size={14} /> {t("Change photo")}
        </Button>
        <Button variant="default" size="sm" onClick={exportFile} disabled={busy || !ready}>
          <Download size={14} /> {t("Export")}
        </Button>
        <Button variant="primary" size="sm" onClick={saveToLibrary} disabled={busy || !ready}>
          <Save size={14} /> {t("Save copy to library")}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: presets & LUTs */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
          <div className="flex border-b border-line">
            {(["presets", "luts"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLutTab(tab)}
                className={cn(
                  "flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                  lutTab === tab ? "border-b-2 border-accent text-accent" : "text-muted hover:text-fg",
                )}
              >
                {tab === "presets" ? t("Presets") : t("LUTs")}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {lutTab === "presets" ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t("My presets")}</h4>
                    <button onClick={() => setShowSavePreset(true)} className="text-[11px] text-accent hover:underline">
                      + {t("Save current")}
                    </button>
                  </div>
                  {userPresets.length === 0 && <p className="text-xs text-muted">{t("No custom presets yet")}</p>}
                  {userPresets.map((p) => (
                    <div key={p.id} className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface2">
                      <button className="min-w-0 flex-1 truncate text-left text-xs" onClick={() => userPresetApply(p)}>
                        {p.name}
                      </button>
                      <button
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={async () => {
                          await api.deleteEditorPreset(p.id).catch(() => {});
                          setUserPresets(await api.listEditorPresets());
                        }}
                      >
                        <X size={12} className="text-muted hover:text-danger" />
                      </button>
                    </div>
                  ))}
                </div>
                {FILM_PRESETS.map((p) => (
                  <PresetRow key={p.id} preset={p} onApply={applyPreset} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <Button variant="default" size="sm" className="w-full" onClick={importLutFile}>
                  <ImagePlus size={13} /> {t("Import .cube LUT")}
                </Button>
                <Field label={t("LUT strength")}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.lutStrength}
                    disabled={!settings.lut}
                    onChange={(e) => set({ lutStrength: Number(e.target.value) }, false)}
                    onMouseUp={() => commit(settings)}
                    className="w-full accent-[var(--accent)] disabled:opacity-40"
                  />
                </Field>
                <div>
                  <select
                    value={lutCategory}
                    onChange={(e) => setLutCategory(e.target.value)}
                    className="mb-2 h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs"
                  >
                    {LUT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`lutcat.${c}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => set({ lut: null })}
                    className={cn(
                      "mb-1 w-full rounded-lg border px-2.5 py-1.5 text-left text-xs",
                      !settings.lut ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-fg",
                    )}
                  >
                    {t("None (adjustments only)")}
                  </button>
                  {LUT_CATALOG.filter((l) => l.category === lutCategory).map((l) => (
                    <button
                      key={l.key}
                      onClick={() => set({ lut: l.key })}
                      className={cn(
                        "mb-1 w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                        settings.lut === l.key ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-fg",
                      )}
                    >
                      {l.name}
                    </button>
                  ))}
                  {customLuts.length > 0 && lutCategory === "custom" && (
                    <>
                      {customLuts.map((name) => (
                        <div key={name} className="group flex items-center justify-between rounded-lg border border-line px-2.5 py-1.5">
                          <button className="min-w-0 flex-1 truncate text-left text-xs" onClick={() => set({ lut: `custom/${name}` })}>
                            {name}
                          </button>
                          <button
                            onClick={async () => {
                              await api.deleteLut(name).catch(() => {});
                              setCustomLuts(await api.listCustomLuts());
                            }}
                          >
                            <X size={12} className="text-muted hover:text-danger" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  {customLuts.length > 0 && lutCategory !== "custom" && (
                    <button
                      onClick={() => setLutCategory("custom")}
                      className="mt-2 w-full rounded-lg border border-dashed border-line px-2.5 py-1.5 text-left text-xs text-muted hover:text-fg"
                    >
                      {t("My LUTs ({count})", { count: customLuts.length })}
                    </button>
                  )}
                  <p className="mt-3 text-[10px] leading-relaxed text-muted">
                    {t("Bundled film LUTs by G'MIC collection (YahiaAngelo/Film-Luts, MIT license).")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center: canvas */}
        {previewCanvas}

        {/* Right: adjustments */}
        <aside className="w-64 shrink-0 space-y-5 overflow-y-auto border-l border-line bg-surface p-4">
          <AdjustSection title={t("Light")}>
            <SliderRow label={t("Exposure")} value={settings.exposure} onChange={(v) => set({ exposure: v }, false)} onCommit={() => commit(settings)} />
            <SliderRow label={t("Contrast")} value={settings.contrast} onChange={(v) => set({ contrast: v }, false)} onCommit={() => commit(settings)} />
            <SliderRow label={t("Highlights")} value={settings.highlights} onChange={(v) => set({ highlights: v }, false)} onCommit={() => commit(settings)} />
            <SliderRow label={t("Shadows")} value={settings.shadows} onChange={(v) => set({ shadows: v }, false)} onCommit={() => commit(settings)} />
            <SliderRow label={t("Whites")} value={settings.whites} onChange={(v) => set({ whites: v }, false)} onCommit={() => commit(settings)} />
            <SliderRow label={t("Blacks")} value={settings.blacks} onChange={(v) => set({ blacks: v }, false)} onCommit={() => commit(settings)} />
          </AdjustSection>

          <AdjustSection title={t("Color")}>
            <SliderRow label={t("Temperature")} value={settings.temperature} onChange={(v) => set({ temperature: v }, false)} onCommit={() => commit(settings)} left={t("Cool")} right={t("Warm")} />
            <SliderRow label={t("Tint")} value={settings.tint} onChange={(v) => set({ tint: v }, false)} onCommit={() => commit(settings)} left={t("Green")} right={t("Magenta")} />
            <SliderRow label={t("Saturation")} value={settings.saturation} onChange={(v) => set({ saturation: v }, false)} onCommit={() => commit(settings)} />
            <SliderRow label={t("Vibrance")} value={settings.vibrance} onChange={(v) => set({ vibrance: v }, false)} onCommit={() => commit(settings)} />
          </AdjustSection>

          <AdjustSection title={t("Detail")}>
            <SliderRow label={t("Sharpen")} value={settings.sharpen} min={0} onChange={(v) => set({ sharpen: v }, false)} onCommit={() => commit(settings)} />
            <SliderRow label={t("Clarity")} value={settings.clarity} onChange={(v) => set({ clarity: v }, false)} onCommit={() => commit(settings)} />
            <SliderRow label={t("Noise reduction (grain out)")} value={settings.denoise} min={0} onChange={(v) => set({ denoise: v }, false)} onCommit={() => commit(settings)} />
          </AdjustSection>

          <AdjustSection title={t("Film effects")}>
            <SliderRow label={t("Grain amount")} value={settings.grainAmount} min={0} onChange={(v) => set({ grainAmount: v }, false)} onCommit={() => commit(settings)} />
            <SliderRow
              label={t("Grain size")}
              value={settings.grainSize}
              min={0.6}
              max={4}
              step={0.1}
              format={(v) => `${v.toFixed(1)}px`}
              onChange={(v) => set({ grainSize: v }, false)}
              onCommit={() => commit(settings)}
            />
            <SliderRow label={t("Vignette")} value={settings.vignette} onChange={(v) => set({ vignette: v }, false)} onCommit={() => commit(settings)} left={t("Light")} right={t("Dark")} />
            <SliderRow label={t("Fade")} value={settings.fade} min={0} onChange={(v) => set({ fade: v }, false)} onCommit={() => commit(settings)} />
          </AdjustSection>
        </aside>
      </div>

      <PhotoPicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        title={t("Choose a photo to edit")}
        multi={false}
        onConfirm={(picked) => {
          if (picked[0]) navigate("editor", picked[0].id);
          setShowPicker(false);
        }}
      />

      <Modal open={showSavePreset} onClose={() => setShowSavePreset(false)} title={t("Save preset")}>
        <div className="space-y-4">
          <Field label={t("Preset name")}>
            <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSavePreset(false)}>
              {t("Cancel")}
            </Button>
            <Button variant="primary" onClick={savePreset} disabled={!presetName.trim()}>
              {t("Save")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AdjustSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function SliderRow({
  label,
  value,
  min = -100,
  max = 100,
  step = 1,
  left,
  right,
  format,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  left?: string;
  right?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  const t = useT();
  const neutral = min === 0 ? 0 : 0;
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-xs">
        <span className="text-fg">{label}</span>
        <button
          onDoubleClick={() => {
            onChange(neutral);
            onCommit();
          }}
          title={t("Double-click to reset")}
          className="tnum text-muted hover:text-accent"
        >
          {format ? format(value) : value}
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="w-full accent-[var(--accent)]"
      />
      {(left || right) && (
        <div className="flex justify-between text-[10px] text-muted/70">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  );
}

function PresetRow({ preset, onApply }: { preset: FilmPreset; onApply: (p: FilmPreset) => void }) {
  const t = useT();
  return (
    <div>
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{t(`presetcat.${preset.category}`)}</h4>
      <button
        onClick={() => onApply(preset)}
        className="mb-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:border-accent/60 hover:text-fg"
      >
        {preset.name}
      </button>
    </div>
  );
}
