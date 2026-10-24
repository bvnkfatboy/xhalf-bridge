import { useEffect, useState } from "react";
import { Film, Pencil, Trash2 } from "lucide-react";
import { api } from "../api";
import { useApp } from "../App";
import { Button, Confirm, EmptyState, Field, Input, Modal, ProgressBar, Select, Textarea, useToast } from "../components/ui";
import { useT } from "../i18n";
import { formatDate } from "../utils";
import type { FilmRoll } from "../types";

export function FilmRolls() {
  const { tick, navigate } = useApp();
  const t = useT();
  const toast = useToast();
  const [rolls, setRolls] = useState<FilmRoll[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<FilmRoll | null>(null);
  const [deleting, setDeleting] = useState<FilmRoll | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState(36);

  useEffect(() => {
    api.listFilmRolls().then(setRolls).catch((e) => toast(String(e), "error"));
  }, [tick, toast]);

  const reset = () => {
    setShowCreate(false);
    setEditing(null);
    setName("");
    setDescription("");
    setTarget(36);
  };

  const save = async () => {
    if (!name.trim()) return;
    try {
      if (editing) {
        await api.updateFilmRoll(editing.id, { name: name.trim(), description: description.trim(), targetFrames: target });
        toast(t("Film roll updated"), "success");
      } else {
        const r = await api.createFilmRoll(name.trim(), description.trim(), target);
        toast(t("Film roll {name} created", { name: r.name }), "success");
      }
      reset();
      api.listFilmRolls().then(setRolls);
    } catch (e) {
      toast(String(e), "error");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-lg font-bold">{t("Film Rolls")}</h1>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <span className="text-base leading-none">+</span> {t("New film roll")}
          </Button>
        </div>

        {rolls === null ? null : rolls.length === 0 ? (
          <EmptyState
            icon={<Film size={44} strokeWidth={1.2} />}
            title={t("No film rolls yet")}
            description={t("A film roll is a digital roll: pick a target frame count (24, 36, 72…) and add photos to fill it. Export any roll as a contact sheet when it's done.")}
            action={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                {t("Start your first roll")}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rolls.map((r) => {
              const pct = r.targetFrames > 0 ? Math.min(100, (r.photoCount / r.targetFrames) * 100) : 0;
              return (
                <div key={r.id} className="group overflow-hidden rounded-xl border border-line bg-surface">
                  <button className="block w-full text-left" onClick={() => navigate("roll", r.id)}>
                    <div className="flex aspect-[4/3] w-full items-center justify-center bg-surface2">
                      {r.coverThumb ? (
                        <img src={r.coverThumb} alt={r.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <Film size={30} strokeWidth={1.2} className="text-muted/50" />
                      )}
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-semibold">{r.name}</span>
                        <span className="tnum text-xs text-muted">
                          {r.photoCount}/{r.targetFrames} {t("frames")}
                        </span>
                      </div>
                      <ProgressBar value={pct} />
                      <div className="text-xs text-muted">{formatDate(r.createdAt)}</div>
                    </div>
                  </button>
                  <div className="flex justify-end border-t border-line px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setName(r.name); setDescription(r.description); setTarget(r.targetFrames); }} title={t("Edit")}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(r)} title={t("Delete roll")}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={showCreate || editing != null} onClose={reset} title={editing ? t("Edit film roll") : t("New film roll")}>
        <div className="space-y-4">
          <Field label={t("Name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Summer Walk 2026")} autoFocus />
          </Field>
          <Field label={t("Target frames")} hint={t("Just a goal for the digital roll — it never limits how many photos you can store.")}>
            <Select value={String(target)} onChange={(e) => setTarget(Number(e.target.value))}>
              {[24, 36, 72].map((n) => (
                <option key={n} value={n}>
                  {n} {t("frames")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Notes (optional)")}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Camera, film simulation, location…")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>
              {t("Cancel")}
            </Button>
            <Button variant="primary" onClick={save} disabled={!name.trim()}>
              {editing ? t("Save changes") : t("Create roll")}
            </Button>
          </div>
        </div>
      </Modal>

      <Confirm
        open={deleting != null}
        title={t("Delete film roll")}
        message={t("Delete film roll {name}? Photos are NOT deleted — only the roll is removed.", { name: deleting?.name ?? "" })}
        confirmLabel={t("Delete roll")}
        danger
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.deleteFilmRoll(deleting.id);
            toast(t("Film roll deleted"), "success");
            setDeleting(null);
            api.listFilmRolls().then(setRolls);
          } catch (e) {
            toast(String(e), "error");
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
