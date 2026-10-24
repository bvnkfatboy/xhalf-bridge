import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Columns2, Download, FolderOpen, Redo2, Save, Undo2, X } from "lucide-react";
import { api } from "../api";
import { PhotoPicker } from "../components/PhotoPicker";
import { useT } from "../i18n";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "../components/ui";
import {
  PRESETS,
  applyPreset,
  computeGeometry,
  defaultState,
  renderComposer,
  slotAtPoint,
  type ComposerState,
  type PresetKey,
} from "../lib/composer";
import { cn } from "../utils";
import type { ComposerProject, Photo } from "../types";

export function Composer() {
  const t = useT();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ComposerState>(defaultState);
  const [photos, setPhotos] = useState<Map<number, Photo>>(new Map());
  const [selSlot, setSelSlot] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [history, setHistory] = useState<ComposerState[]>([]);
  const [future, setFuture] = useState<ComposerState[]>([]);
  const [projects, setProjects] = useState<ComposerProject[]>([]);
  const [showProjects, setShowProjects] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [previewW, setPreviewW] = useState(880);

  // Observe container width
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPreviewW(el.clientWidth));
    ro.observe(el);
    setPreviewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const [arW, arH] = state.aspect.split(":").map(Number);
  const canvasW = Math.max(320, previewW - 24);
  const canvasH = Math.round((canvasW * arH) / arW);

  // Draw preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasW;
    canvas.height = canvasH;
    renderComposer(canvas, state, photos).catch(() => {});
  }, [state, photos, canvasW, canvasH]);

  const commit = useCallback((next: ComposerState) => {
    setHistory((h) => [...h.slice(-49), state]);
    setFuture([]);
    setState(next);
  }, [state]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [state, ...f].slice(0, 50));
      setState(prev);
      return h.slice(0, -1);
    });
  }, [state]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setHistory((h) => [...h, state]);
      setState(f[0]);
      return f.slice(1);
    });
  }, [state]);

  // Undo/redo keyboard shortcuts
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

  const addPhotos = (picked: Photo[]) => {
    const next = new Map(photos);
    picked.forEach((p) => next.set(p.id, p));
    setPhotos(next);
    const queue = picked.map((p) => p.id).filter((id) => !state.slots.some((s) => s.photoId === id));
    let qi = 0;
    const slots = state.slots.map((s) => (!s.photoId && qi < queue.length ? { ...s, photoId: queue[qi++] } : s));
    commit({ ...state, slots });
    setShowPicker(false);
  };

  const setSlot = (i: number, patch: Partial<ComposerState["slots"][number]>, record = true) => {
    const next = { ...state, slots: state.slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) };
    if (record) commit(next);
    else setState(next);
  };

  const swapSlots = () => {
    const slots = [...state.slots];
    if (slots.length < 2) return;
    [slots[0], slots[1]] = [slots[1], slots[0]];
    commit({ ...state, slots });
  };

  const clearSlot = (i: number) => setSlot(i, { photoId: null, zoom: 1, offsetX: 0, offsetY: 0 });

  const emptyCount = state.slots.filter((s) => !s.photoId).length;

  const doExport = async (format: "jpeg" | "png") => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        defaultPath: `half-frame-${Date.now()}.${format === "jpeg" ? "jpg" : "png"}`,
        filters: [{ name: format.toUpperCase(), extensions: [format === "jpeg" ? "jpg" : "png"] }],
      });
      if (!dest) return;
      const off = document.createElement("canvas");
      const w = state.exportWidth;
      off.width = w;
      off.height = Math.round((w * arH) / arW);
      await renderComposer(off, state, photos, { full: true });
      const dataUrl = off.toDataURL(format === "jpeg" ? "image/jpeg" : "image/png", 0.92);
      await api.saveCanvasExport(dataUrl, dest);
      toast(t("Exported successfully"), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const loadProjects = () => {
    api.listComposerProjects().then(setProjects).then(() => setShowProjects(true)).catch((e) => toast(String(e), "error"));
  };

  const openProject = async (p: ComposerProject) => {
    try {
      const proj = p.project as Partial<ComposerState> & { photoIds?: number[] };
      const next: ComposerState = { ...defaultState(), ...proj } as ComposerState;
      setState(next);
      setCurrentProjectId(p.id);
      setSaveName(p.name);
      setShowProjects(false);
      // hydrate photo map
      const ids = (proj.slots ?? []).map((s) => s.photoId).filter((id): id is number => id != null);
      const missing = ids.filter((id) => !photos.has(id));
      for (const id of missing) {
        try {
          const photo = await api.getPhoto(id);
          setPhotos((m) => new Map(m).set(id, photo));
        } catch {
          /* photo removed */
        }
      }
      toast(t("Project {name} loaded", { name: p.name }), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const doSave = async () => {
    if (!saveName.trim()) return;
    try {
      const id = await api.saveComposerProject(currentProjectId, saveName.trim(), state, canvasW, canvasH);
      setCurrentProjectId(id);
      setShowSave(false);
      toast(t("Project saved"), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const def = PRESETS[state.preset];
  const selectedSlot = state.slots[selSlot];
  const selPhoto = selectedSlot?.photoId ? photos.get(selectedSlot.photoId) : undefined;

  const previewCanvas = (
    <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
      <canvas
        ref={canvasRef}
        style={{ width: canvasW, height: canvasH }}
        className="cursor-pointer rounded-lg shadow-2xl"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * canvasW;
          const y = ((e.clientY - rect.top) / rect.height) * canvasH;
          const idx = slotAtPoint(state, canvasW, canvasH, x, y);
          if (idx >= 0) setSelSlot(idx);
        }}
      />
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Left: presets & photos */}
      <aside className="w-56 shrink-0 space-y-4 overflow-y-auto border-r border-line bg-surface p-4">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("Presets")}</h3>
          <div className="space-y-1">
            {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
              <button
                key={key}
                onClick={() => commit(applyPreset(state, key))}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors",
                  state.preset === key ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-fg",
                )}
              >
                {PRESETS[key].label}
                <span className="float-right opacity-60">{PRESETS[key].slotCount}f</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Button variant="primary" className="w-full" onClick={() => setShowPicker(true)}>
            <Columns2 size={14} /> {t("Add photos")}
          </Button>
          {emptyCount > 0 && <p className="text-center text-[11px] text-muted">{t("{count} empty frame(s)", { count: emptyCount })}</p>}
        </div>
        <div className="space-y-2 border-t border-line pt-4">
          <Button variant="default" className="w-full" onClick={loadProjects}>
            <FolderOpen size={14} /> {t("Open project")}
          </Button>
          <Button
            variant="default"
            className="w-full"
            onClick={() => {
              setSaveName(currentProjectId ? saveName : `Composition ${new Date().toLocaleDateString()}`);
              setShowSave(true);
            }}
          >
            <Save size={14} /> {t("Save project")}
          </Button>
          <Button variant="primary" className="w-full" onClick={() => doExport("jpeg")}>
            <Download size={14} /> {t("Export JPEG")}
          </Button>
          <Button variant="default" className="w-full" onClick={() => doExport("png")}>
            <Download size={14} /> {t("Export PNG")}
          </Button>
        </div>
      </aside>

      {/* Center: canvas */}
      <div className="flex min-w-0 flex-1 flex-col bg-bg">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <Button variant="ghost" size="icon" onClick={undo} disabled={!history.length} title="Undo (⌘Z)">
            <Undo2 size={15} />
          </Button>
          <Button variant="ghost" size="icon" onClick={redo} disabled={!future.length} title={t("Redo (⌘⇧Z)")}>
            <Redo2 size={15} />
          </Button>
          <div className="flex-1" />
          {saveName && <span className="truncate text-xs text-muted">{saveName}</span>}
        </div>
        {previewCanvas}
      </div>

      {/* Right: controls */}
      <aside className="w-64 shrink-0 space-y-5 overflow-y-auto border-l border-line bg-surface p-4">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("Frame {count} of {total}", { count: selSlot + 1, total: state.slots.length })}
          </h3>
          {selPhoto ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <img
                  src={selPhoto.thumbnailPath ? selPhoto.thumbnailPath : undefined}
                  alt=""
                  className="h-12 w-12 rounded border border-line object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{selPhoto.originalFilename}</span>
                <Button variant="ghost" size="icon" onClick={() => clearSlot(selSlot)} title={t("Remove from frame")}>
                  <X size={14} />
                </Button>
              </div>
              <Field label={`${t("Zoom")} — ${Math.round((selectedSlot?.zoom ?? 1) * 100)}%`}>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.02}
                  value={selectedSlot?.zoom ?? 1}
                  onChange={(e) => setSlot(selSlot, { zoom: Number(e.target.value) }, false)}
                  onMouseUp={() => commit(state)}
                  onTouchEnd={() => commit(state)}
                  className="w-full accent-[var(--accent)]"
                />
              </Field>
              <Field label={`${t("Position X")} — ${selectedSlot?.offsetX ?? 0}`}>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={selectedSlot?.offsetX ?? 0}
                  onChange={(e) => setSlot(selSlot, { offsetX: Number(e.target.value) }, false)}
                  onMouseUp={() => commit(state)}
                  onTouchEnd={() => commit(state)}
                  className="w-full accent-[var(--accent)]"
                />
              </Field>
              <Field label={`${t("Position Y")} — ${selectedSlot?.offsetY ?? 0}`}>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={selectedSlot?.offsetY ?? 0}
                  onChange={(e) => setSlot(selSlot, { offsetY: Number(e.target.value) }, false)}
                  onMouseUp={() => commit(state)}
                  onTouchEnd={() => commit(state)}
                  className="w-full accent-[var(--accent)]"
                />
              </Field>
              <Button variant="default" size="sm" className="w-full" onClick={swapSlots}>
                <ArrowLeftRight size={13} /> {t("Swap frames 1 ↔ 2")}
              </Button>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              {t("Click a frame on the canvas to select it, then add photos to fill the layout.")}
            </p>
          )}
        </div>

        <div className="space-y-4 border-t border-line pt-4">
          <Field label={`${t("Border width")} — ${state.borderWidth}px`}>
            <input
              type="range"
              min={0}
              max={80}
              value={state.borderWidth}
              onChange={(e) => setState({ ...state, borderWidth: Number(e.target.value) })}
              onMouseUp={() => commit(state)}
              className="w-full accent-[var(--accent)]"
            />
          </Field>
          <Field label={`${t("Divider width")} — ${state.dividerWidth}px`}>
            <input
              type="range"
              min={0}
              max={40}
              value={state.dividerWidth}
              onChange={(e) => setState({ ...state, dividerWidth: Number(e.target.value) })}
              onMouseUp={() => commit(state)}
              className="w-full accent-[var(--accent)]"
            />
          </Field>
          <Field label={t("Background")}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={state.bgColor}
                onChange={(e) => commit({ ...state, bgColor: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded border border-line bg-surface"
              />
              {["#141414", "#000000", "#f5f4f0", "#ffffff", "#a3b18a"].map((c) => (
                <button
                  key={c}
                  onClick={() => commit({ ...state, bgColor: c })}
                  style={{ background: c }}
                  className={cn("h-6 w-6 rounded border", state.bgColor === c ? "border-accent ring-1 ring-accent" : "border-line")}
                  title={c}
                />
              ))}
            </div>
          </Field>
          <Field label={t("Aspect ratio")}>
            <Select value={state.aspect} onChange={(e) => commit({ ...state, aspect: e.target.value as ComposerState["aspect"] })}>
              <option value="3:2">{t("3:2 landscape")}</option>
              <option value="2:3">{t("2:3 portrait")}</option>
              <option value="1:1">{t("1:1 square")}</option>
            </Select>
          </Field>
          <Field label={t("Export width")}>
            <Select value={String(state.exportWidth)} onChange={(e) => setState({ ...state, exportWidth: Number(e.target.value) })}>
              {[1500, 2000, 3000, 4000].map((n) => (
                <option key={n} value={n}>
                  {n} px
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Caption / date (optional)")}>
            <div className="space-y-2">
              <Input
                value={state.caption}
                onChange={(e) => setState({ ...state, caption: e.target.value })}
                placeholder={t("Bangkok, Oct 2026")}
                onFocus={() => commit(state)}
              />
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={state.showCaption}
                  onChange={(e) => commit({ ...state, showCaption: e.target.checked })}
                  className="accent-[var(--accent)]"
                />
                {t("Show caption on export")}
              </label>
            </div>
          </Field>
        </div>
      </aside>

      <PhotoPicker open={showPicker} onClose={() => setShowPicker(false)} title={t("Add photos to frames")} onConfirm={addPhotos} />

      <Modal open={showSave} onClose={() => setShowSave(false)} title={t("Save composer project")}>
        <div className="space-y-4">
          <Field label={t("Project name")}>
            <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSave(false)}>
              {t("Cancel")}
            </Button>
            <Button variant="primary" onClick={doSave} disabled={!saveName.trim()}>
              {t("Save")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showProjects} onClose={() => setShowProjects(false)} title={t("Open composer project")} width="max-w-lg">
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {projects.length === 0 && <p className="text-sm text-muted">{t("No saved projects yet.")}</p>}
          {projects.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => openProject(p)}>
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted">{new Date(p.updatedAt).toLocaleString()}</div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  await api.deleteComposerProject(p.id).catch(() => {});
                  api.listComposerProjects().then(setProjects);
                }}
                title={t("Delete project")}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
