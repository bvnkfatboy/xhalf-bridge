import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Copy, QrCode, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import QRCode from "qrcode";
import { api } from "../api";
import { events, type TransferReceived } from "../events";
import { useT } from "../i18n";
import { Button } from "../components/ui";
import { useToast } from "../components/ui";
import { formatDateTime } from "../utils";
import type { TransferInfo } from "../types";

export function Transfer() {
  const t = useT();
  const toast = useToast();
  const [info, setInfo] = useState<TransferInfo | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [received, setReceived] = useState<TransferReceived[]>([]);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    api.getTransferState().then(setInfo).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    pollRef.current = window.setInterval(refresh, 2000);
    const un = events.onTransferReceived((p) => {
      setReceived((list) => [p, ...list].slice(0, 50));
      refresh();
    });
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      un.then((f) => f());
    };
  }, [refresh]);

  useEffect(() => {
    if (info?.running && info.url) {
      QRCode.toDataURL(info.url, { width: 220, margin: 1, color: { dark: "#14180d", light: "#a3b18a" } })
        .then(setQr)
        .catch(() => setQr(null));
    } else {
      setQr(null);
    }
  }, [info?.running, info?.url]);

  const start = async () => {
    try {
      const res = await api.startTransfer();
      setInfo(res);
      toast(`Receiver started on port ${res.port}`, "success");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const stop = async () => {
    try {
      await api.stopTransfer();
      refresh();
      toast("Receiver stopped");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const expiresIn = info?.running ? Math.max(0, Math.round((info.expiresAt - Date.now()) / 60000)) : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{t("Wireless Transfer")}</h1>
            <p className="text-sm text-muted">{t("Receive photos from your phone over the local Wi-Fi — no app install, just a browser.")}</p>
          </div>
          {info?.running ? (
            <Button variant="danger" onClick={stop}>
              <WifiOff size={15} /> {t("Stop receiving")}
            </Button>
          ) : (
            <Button variant="primary" onClick={start}>
              <Wifi size={15} /> {t("Start receiving")}
            </Button>
          )}
        </div>

        {info?.running ? (
          <div className="grid gap-4 md:grid-cols-[auto,1fr]">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-5">
              {qr ? (
                <img src={qr} alt="Pairing QR code" className="rounded-lg" />
              ) : (
                <div className="flex h-[220px] w-[220px] items-center justify-center text-muted">
                  <QrCode size={40} />
                </div>
              )}
              <p className="max-w-56 text-center text-xs text-muted">
                {t("Scan with your phone, then choose photos saved from the Fujifilm X half app.")}
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
              <Row label={t("Address")}>
                <code className="rounded bg-bg px-2 py-1 font-mono text-xs text-accent">{info.ip}:{info.port}</code>
              </Row>
              <Row label={t("Pairing token")}>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-bg px-2 py-1 font-mono text-sm tracking-widest text-fg">{info.token}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Copy URL"
                    onClick={() => {
                      navigator.clipboard.writeText(info.url).then(() => toast(t("Upload link copied"), "success"));
                    }}
                  >
                    <Copy size={13} />
                  </Button>
                </div>
              </Row>
              <Row label={t("Token expires in")}>
                <span className="tnum text-sm">{expiresIn} min</span>
              </Row>
              <Row label={t("Received this session")}>
                <span className="tnum text-sm">
                  {t("{count} saved", { count: info.receivedCount })}{info.failedCount ? `, ${t("{count} failed", { count: info.failedCount })}` : ""} · {t("limit {files} files, {mb} MB each", { files: info.maxFiles, mb: info.maxFileMb })}
                </span>
              </Row>
              <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs leading-relaxed text-muted">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent" />
                <span>
                  {t("This service is available only on your local network while it is running. Uploads require the pairing token, accept JPEG/PNG only, and are hash-checked for duplicates. Nothing is sent to the internet.")}
                </span>
              </div>
              {received.length === 0 && Date.now() > info.expiresAt && (
                <p className="text-xs text-danger">{t("Token expired — stop and start the receiver again to get a new one.")}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-6 text-sm leading-relaxed text-muted">
            <p className="mb-2 font-medium text-fg">{t("How it works")}</p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>{t("Start the receiver — the app opens a local upload page on your Wi-Fi network.")}</li>
              <li>{t("Scan the QR code with your phone (same Wi-Fi network).")}</li>
              <li>{t("Pick photos you exported/saved from the Fujifilm X half app and send them.")}</li>
              <li>{t("Files land in your library with hash checking and automatic thumbnails.")}</li>
            </ol>
            <p className="mt-3 text-xs">
              Note: the camera connects only to the official Fujifilm app; this page receives photos you saved to the phone.
            </p>
          </div>
        )}

        {received.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold">{t("Recent transfers")}</h2>
            <ul className="space-y-1.5">
              {received.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  {r.status === "saved" ? (
                    <CheckCircle2 size={14} className="text-accent" />
                  ) : r.status === "duplicate" ? (
                    <Copy size={14} className="text-muted" />
                  ) : (
                    <CircleAlert size={14} className="text-danger" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className={r.status === "saved" ? "text-accent" : r.status === "duplicate" ? "text-muted" : "text-danger"}>
                    {r.status === "saved" ? t("saved") : r.status === "duplicate" ? t("duplicate skipped") : r.error ?? t("failed")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {info && !info.running && info.token && (
          <p className="text-xs text-muted">Last session ended at {formatDateTime(info.expiresAt)}.</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-xs uppercase tracking-wide text-muted">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}
