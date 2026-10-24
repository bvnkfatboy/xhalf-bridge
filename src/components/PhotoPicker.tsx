import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../api";
import { PhotoGrid } from "./PhotoGrid";
import { Button, Input, Modal, useToast } from "./ui";
import { useT } from "../i18n";
import type { Photo } from "../types";

/** Modal picker over the whole library with multi-select. */
export function PhotoPicker({
  open,
  onClose,
  title = "Choose photos",
  multi = true,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  multi?: boolean;
  onConfirm: (photos: Photo[]) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      api.listPhotos({ sort: "captured", desc: true }).then(setPhotos).catch((e) => toast(String(e), "error"));
      setSelected(new Set());
    }
  }, [open, toast]);

  const filtered = useMemo(
    () => photos.filter((p) => p.originalFilename.toLowerCase().includes(query.toLowerCase())),
    [photos, query],
  );

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-4xl">
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search by filename…")} className="pl-8" />
        </div>
        <div className="max-h-96 min-h-64 overflow-y-auto rounded-lg border border-line">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">{t("No photos found.")}</p>
          ) : (
            <PhotoGrid
              photos={filtered}
              selected={selected}
              onSelect={(id, { meta }) => {
                setSelected((prev) => {
                  const next = new Set(multi ? prev : []);
                  if (multi && next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              thumbSize={130}
            />
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="tnum text-xs text-muted">{t("{count} selected", { count: selected.size })}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={selected.size === 0}
              onClick={() => onConfirm(filtered.filter((p) => selected.has(p.id)))}
            >
              {t("Add {count} photos", { count: selected.size })}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
