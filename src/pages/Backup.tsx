import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FolderOpen, HardDriveDownload, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../api";
import { Button, EmptyState, useToast } from "../components/ui";
import { useT } from "../i18n";
import { formatBytes, formatDateTime } from "../utils";
import type { BackupJob } from "../types";

export function Backup() {
  const t = useT();
  const toast = useToast();
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api.getBackupHistory().then(setJobs).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  const runBackup = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: "Choose backup destination" });
      if (typeof dir !== "string") return;
      setBusy(true);
      const job = await api.runBackup(dir);
      toast(
        t("Backup completed — {count} photos, {size}", { count: job.filesProcessed, size: formatBytes(job.totalBytes) }),
        "success",
      );
      refresh();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (job: BackupJob) => {
    try {
      setVerifying(job.id);
      const problems = await api.verifyBackup(job.destinationPath);
      if (problems.length === 0) toast(t("Backup verified — all file hashes match"), "success");
      else toast(t("{count} file(s) failed verification", { count: problems.length }), "error");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{t("Backup")}</h1>
            <p className="text-sm text-muted">
              {t("Copy every photo (hash-verified) plus a snapshot of the database to an external drive or any folder. Originals are never moved or deleted.")}
            </p>
          </div>
          <Button variant="primary" onClick={runBackup} disabled={busy}>
            <HardDriveDownload size={15} /> {busy ? t("Backing up…") : t("Back up now")}
          </Button>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-4 text-xs leading-relaxed text-muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" />
          <span>
            {t("Each backup contains photos/ (every library photo, path preserved, SHA-256 verified after copy), database/xhalf.db (album, roll and project data) and a manifest.json. Free space is checked before starting.")}
          </span>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("Backup history")}</h2>
          {jobs.length === 0 ? (
            <EmptyState
              icon={<HardDriveDownload size={40} strokeWidth={1.2} />}
              title={t("No backups yet")}
              description={t("Create your first backup to an external SSD or any folder on this machine.")}
              action={
                <Button variant="primary" onClick={runBackup} disabled={busy}>
                  <FolderOpen size={15} /> {t("Choose destination")}
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <div key={j.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium" title={j.destinationPath}>
                        {j.destinationPath}
                      </div>
                      <div className="tnum text-xs text-muted">
                        {formatDateTime(j.startedAt)} · {j.filesProcessed} photos · {formatBytes(j.totalBytes)}
                        {j.filesFailed ? ` · ${j.filesFailed} failed` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          j.status === "completed"
                            ? "rounded-md bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent"
                            : j.status === "failed"
                              ? "rounded-md bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger"
                              : "rounded-md bg-surface2 px-2 py-0.5 text-xs text-muted"
                        }
                      >
                        {j.status}
                      </span>
                      {j.status === "completed" && (
                        <Button variant="ghost" size="sm" onClick={() => verify(j)} disabled={verifying === j.id}>
                          <CheckCircle2 size={13} /> {verifying === j.id ? t("Verifying…") : t("Verify")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="flex items-center gap-2 text-xs text-muted">
          <Trash2 size={12} /> {t("Backups are additive — Xhalf Bridge never deletes anything from your backup destination.")}
        </p>
      </div>
    </div>
  );
}
