import { useEffect, useState } from "react";
import { ArrowLeft, Film, Grid3x3, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { api } from "../api";
import { useApp } from "../App";
import { useT } from "../i18n";
import { PhotoGrid } from "../components/PhotoGrid";
import { Lightbox } from "../components/Lightbox";
import { PhotoPicker } from "../components/PhotoPicker";
import { Button, EmptyState, Field, Input, Modal, ProgressBar, Select, Spinner, Textarea, useToast } from "../components/ui";
import type { FilmRoll, Photo, RollPhoto } from "../types";

export function RollDetail({ rollId, thumbSize }: { rollId: number; thumbSize: number }) {
  const { navigate, tick } = useApp();
  const t = useT();
  const toast = useToast();
  const [roll, setRoll] = useState<FilmRoll | null>(null);
  const [photos, setPhotos] = useState<RollPhoto[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState(36);

  useEffect(() => {
    api.listFilmRolls().then((all) => {
      const r = all.find((x) => x.id === rollId);
      if (r) {
        setRoll(r);
        setName(r.name);
        setDescription(r.description);
        setTarget(r.targetFrames);
      } else navigate("rolls");
    });
  }, [rollId, tick, navigate]);

  useEffect(() => {
    api.getFilmRollPhotos(rollId).then(setPhotos).catch((e) => toast(String(e), "error"));
  }, [rollId, tick, toast]);

  const flat = photos?.map((rp) => rp.photo) ?? [];
  const frameOf = (p: Photo) => photos?.find((rp) => rp.photo.id === p.id)?.frameNumber ?? null;
  const pct = roll && roll.targetFrames > 0 ? Math.min(100, ((photos?.length ?? 0) / roll.targetFrames) * 100) : 0;

  const onSelect = (id: number, e: { meta: boolean; shift: boolean; index: number }) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.meta) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const addPhotos = async (picked: Photo[]) => {
    try {
      await api.addFilmRollPhotos(rollId, picked.map((p) => p.id));
      if (!roll?.coverPhotoId && picked[0]) await api.updateFilmRoll(rollId, { coverPhotoId: picked[0].id });
      toast(t("Added {count} frames", { count: String(picked.length) }), "success");
      setShowPicker(false);
      setPhotos(await api.getFilmRollPhotos(rollId));
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const removeSelected = async () => {
    try {
      await api.removeFilmRollPhotos(rollId, [...selected]);
      toast(t("Removed {count} frames", { count: String(selected.size) }), "success");
      setSelected(new Set());
      setPhotos(await api.getFilmRollPhotos(rollId));
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const reorder = async (draggedIds: number[], targetId: number) => {
    if (!photos) return;
    const ids = photos.map((rp) => rp.photo.id).filter((id) => !draggedIds.includes(id));
    const idx = ids.indexOf(targetId);
    ids.splice(idx < 0 ? ids.length : idx, 0, ...draggedIds);
    setPhotos(photos.map((rp, i) => ({ ...rp, photo: { ...rp.photo, id: ids[i] }, frameNumber: i + 1, sortOrder: i })));
    try {
      await api.reorderFilmRollPhotos(rollId, ids);
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const saveEdit = async () => {
    try {
      await api.updateFilmRoll(rollId, { name: name.trim(), description: description.trim(), targetFrames: target });
      toast(t("Film roll updated"), "success");
      setEditing(false);
      const all = await api.listFilmRolls();
      setRoll(all.find((x) => x.id === rollId) ?? null);
    } catch (e) {
      toast(String(e), "error");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("rolls")}>
            <ArrowLeft size={17} />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold">{roll?.name ?? "…"}</h1>
            <p className="tnum truncate text-xs text-muted">
              {t("Frame {count} of target {target}", { count: photos?.length ?? 0, target: roll?.targetFrames ?? "…" })}
              {roll?.description ? ` · ${roll.description}` : ""}
            </p>
          </div>
          <Button variant="default" size="sm" onClick={() => navigate("sheets", rollId)}>
            <Grid3x3 size={14} /> {t("Contact sheet")}
          </Button>
          <Button variant="default" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} /> {t("Edit")}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowPicker(true)}>
            <ImagePlus size={14} /> {t("Add frames")}
          </Button>
        </div>
        <ProgressBar value={pct} className="mx-1" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {photos === null ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="text-muted" />
          </div>
        ) : photos.length === 0 ? (
          <EmptyState
            icon={<Film size={40} strokeWidth={1.2} />}
            title={t("This roll has no frames yet")}
            description={t("Add photos from the library — each one gets the next frame number, like advancing the film.")}
            action={
              <Button variant="primary" onClick={() => setShowPicker(true)}>
                <ImagePlus size={15} /> {t("Add frames")}
              </Button>
            }
          />
        ) : (
          <PhotoGrid
            photos={flat}
            selected={selected}
            onSelect={onSelect}
            onOpen={(p, i) => setLightbox(i)}
            thumbSize={thumbSize}
            draggable
            overlayLabel={(p) => {
              const f = frameOf(p);
              return f != null ? `#${f}` : null;
            }}
            onReorderDrop={reorder}
          />
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-t border-line bg-surface px-4 py-2.5">
          <span className="tnum text-sm font-medium">{t("{count} selected", { count: selected.size })}</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={removeSelected}>
            <Trash2 size={14} /> {t("Remove frames")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {t("Clear")}
          </Button>
        </div>
      )}

      {lightbox != null && photos && flat[lightbox] && (
        <Lightbox
          photos={flat}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          onToggleFavorite={async (p) => {
            await api.updatePhoto(p.id, !p.isFavorite);
            setPhotos(await api.getFilmRollPhotos(rollId));
          }}
          onNote={async (p, note) => {
            await api.updatePhoto(p.id, undefined, note);
          }}
        />
      )}

      <PhotoPicker open={showPicker} onClose={() => setShowPicker(false)} title={t("Add frames to {name}", { name: roll?.name ?? "roll" })} onConfirm={addPhotos} />

      <Modal open={editing} onClose={() => setEditing(false)} title={t("Edit film roll")}>
        <div className="space-y-4">
          <Field label={t("Name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("Target frames")}>
            <Select value={String(target)} onChange={(e) => setTarget(Number(e.target.value))}>
              {[24, 36, 72].map((n) => (
                <option key={n} value={n}>
                  {n} {t("frames")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Notes")}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t("Cancel")}
            </Button>
            <Button variant="primary" onClick={saveEdit}>
              {t("Save")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
