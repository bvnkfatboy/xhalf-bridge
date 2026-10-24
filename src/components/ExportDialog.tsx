import { useState } from "react";
import { Button, Field, Modal, Select, useToast } from "./ui";
import { api } from "../api";
import { useT } from "../i18n";
import type { Photo } from "../types";

/** Folder + format picker then export the given photos. */
export function ExportDialog({
  open,
  onClose,
  photos,
  title,
}: {
  open: boolean;
  onClose: () => void;
  photos: Photo[];
  title?: string;
}) {
  const t = useT();
  const toast = useToast();
  const [format, setFormat] = useState("original");
  const [quality, setQuality] = useState(90);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    try {
      const { open: pickFolder } = await import("@tauri-apps/plugin-dialog");
      const dir = await pickFolder({ directory: true, multiple: false });
      if (typeof dir !== "string") return;
      setBusy(true);
      const ids = photos.map((p) => p.id);
      const result = await api.exportPhotos(ids, dir, format, quality);
      if (result.cancelled) toast(t("Export cancelled"));
      else
        toast(
          t("Exported {count} photos", { count: String(result.exported) }) +
            (result.failed ? `, ${t("{count} failed", { count: String(result.failed) })}` : ""),
          result.failed ? "error" : "success",
        );
      onClose();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title ?? t("Export photos")}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {t("{count} photos will be copied to the folder you choose. Originals stay untouched.", { count: photos.length })}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Format")}>
            <Select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="original">{t("Original format")}</option>
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
            </Select>
          </Field>
          <Field label={`${t("JPEG quality")} — ${quality}`}>
            <input
              type="range"
              min={50}
              max={100}
              value={quality}
              disabled={format !== "jpeg"}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="mt-3 w-full accent-[var(--accent)] disabled:opacity-40"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button variant="primary" onClick={run} disabled={busy || !photos.length}>
            {t("Choose folder & export")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
