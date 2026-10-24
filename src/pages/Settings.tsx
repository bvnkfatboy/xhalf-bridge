import { useEffect, useState } from "react";
import { Moon, Sun, Languages } from "lucide-react";
import { api } from "../api";
import { useApp } from "../App";
import { LANGUAGES, useT } from "../i18n";
import { Button, Field, Input, Select, useToast } from "../components/ui";
import { formatBytes } from "../utils";
import type { StorageInfo } from "../types";

export function Settings() {
  const { settings, refreshSettings, tick } = useApp();
  const t = useT();
  const toast = useToast();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraft({ ...settings });
  }, [settings]);

  useEffect(() => {
    api.getStorageInfo().then(setStorage).catch(() => {});
  }, [tick]);

  const save = async (key: string, value: string) => {
    try {
      await api.setSetting(key, value);
      await refreshSettings();
      toast(t("Setting saved"), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const value = (key: string, fallback = "") => draft[key] ?? fallback;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-8 p-6">
        <h1 className="text-lg font-bold">{t("Settings")}</h1>

        {/* Language */}
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">{t("Language")}</h2>
          <div className="flex gap-2">
            {LANGUAGES.map((l) => (
              <Button
                key={l.code}
                variant={settings.language === l.code ? "primary" : "default"}
                onClick={() => save("language", l.code)}
              >
                <Languages size={14} /> {l.label}
              </Button>
            ))}
          </div>
        </section>

        {/* Appearance */}
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">{t("Appearance")}</h2>
          <div className="flex gap-2">
            <Button
              variant={settings.theme !== "light" ? "primary" : "default"}
              onClick={() => save("theme", "dark")}
            >
              <Moon size={14} /> {t("Dark (default)")}
            </Button>
            <Button variant={settings.theme === "light" ? "primary" : "default"} onClick={() => save("theme", "light")}>
              <Sun size={14} /> {t("Light")}
            </Button>
          </div>
        </section>

        {/* Storage */}
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">{t("Library storage")}</h2>
          <Field
            label={t("Library root folder")}
            hint={t("New imports go to <root>/Originals and thumbnails to <root>/Thumbnails. Existing photo records keep their current paths.")}
          >
            <div className="flex gap-2">
              <Input value={value("library_root")} onChange={(e) => setDraft({ ...draft, library_root: e.target.value })} className="font-mono text-xs" />
              <Button
                variant="default"
                onClick={async () => {
                  const { open } = await import("@tauri-apps/plugin-dialog");
                  const dir = await open({ directory: true, multiple: false });
                  if (typeof dir === "string") {
                    setDraft((d) => ({ ...d, library_root: dir }));
                    await save("library_root", dir);
                    api.getStorageInfo().then(setStorage);
                  }
                }}
              >
                {t("Browse…")}
              </Button>
            </div>
          </Field>
          <Button variant="primary" size="sm" onClick={() => save("library_root", value("library_root"))}>
            {t("Save location")}
          </Button>
          {storage && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-line pt-3 text-sm">
              <Row label={t("Originals")} value={formatBytes(storage.originalsBytes)} />
              <Row label={t("Thumbnails")} value={formatBytes(storage.thumbnailsBytes)} />
              <Row label={t("Database")} value={formatBytes(storage.databaseBytes)} />
              <Row label={t("Free space")} value={storage.freeBytes != null ? formatBytes(storage.freeBytes) : "—"} />
            </div>
          )}
        </section>

        {/* Wireless transfer */}
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">{t("Wireless transfer")}</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("Port")} hint={t("Falls back to a random free port if busy.")}>
              <Input type="number" value={value("transfer_port", "8737")} onChange={(e) => setDraft({ ...draft, transfer_port: e.target.value })} />
            </Field>
            <Field label={t("Pairing token lifetime (minutes)")}>
              <Input type="number" value={value("transfer_token_ttl_min", "15")} onChange={(e) => setDraft({ ...draft, transfer_token_ttl_min: e.target.value })} />
            </Field>
            <Field label={t("Max file size (MB)")}>
              <Input type="number" value={value("transfer_max_file_mb", "100")} onChange={(e) => setDraft({ ...draft, transfer_max_file_mb: e.target.value })} />
            </Field>
            <Field label={t("Max files per session")}>
              <Input type="number" value={value("transfer_max_files", "500")} onChange={(e) => setDraft({ ...draft, transfer_max_files: e.target.value })} />
            </Field>
          </div>
          <Field label={t("Save received photos to")} hint={t("“Library originals” keeps everything in one place; or choose any folder.")}>
            <Select value={value("transfer_destination", "originals")} onChange={(e) => save("transfer_destination", e.target.value)}>
              <option value="originals">{t("Library originals folder")}</option>
              <option value="">{t("Custom folder…")}</option>
            </Select>
          </Field>
          {draft.transfer_destination !== "originals" && (
            <div className="flex gap-2">
              <Input
                value={value("transfer_destination")}
                onChange={(e) => setDraft({ ...draft, transfer_destination: e.target.value })}
                placeholder={t("/path/to/folder or leave empty for library originals")}
                className="font-mono text-xs"
              />
              <Button
                variant="default"
                onClick={async () => {
                  const { open } = await import("@tauri-apps/plugin-dialog");
                  const dir = await open({ directory: true, multiple: false });
                  if (typeof dir === "string") {
                    setDraft((d) => ({ ...d, transfer_destination: dir }));
                    await save("transfer_destination", dir);
                  }
                }}
              >
                {t("Browse…")}
              </Button>
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              for (const k of ["transfer_port", "transfer_token_ttl_min", "transfer_max_file_mb", "transfer_max_files"]) {
                await api.setSetting(k, value(k)).catch((e) => toast(String(e), "error"));
              }
              await refreshSettings();
              toast(t("Transfer settings saved"), "success");
            }}
          >
            {t("Save transfer settings")}
          </Button>
        </section>

        {/* Import behaviour */}
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">{t("Import & duplicates")}</h2>
          <Field label={t("When importing a duplicate (same SHA-256)")} hint={t("You can always search the library to find exact duplicates later.")}>
            <Select value={value("duplicate_mode", "skip")} onChange={(e) => save("duplicate_mode", e.target.value)}>
              <option value="skip">{t("Skip the file (recommended)")}</option>
              <option value="keep">{t("Keep a copy anyway")}</option>
            </Select>
          </Field>
        </section>

        <p className="pb-4 text-xs leading-relaxed text-muted">
          {t("Your photos stay on this machine. No account, no cloud — nothing is sent anywhere unless you explicitly send files over your own local network.")}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
