import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "../utils";
import { useT } from "../i18n";

/* ---------- Buttons ---------- */

export function Button({
  children,
  variant = "default",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "default" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "icon";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" && "h-7 px-2.5 text-xs",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "icon" && "h-8 w-8",
        variant === "primary" && "bg-accent text-accent-ink hover:bg-accent-strong",
        variant === "default" && "bg-surface2 text-fg border border-line hover:border-muted",
        variant === "outline" && "border border-line text-fg hover:bg-surface2",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-surface2",
        variant === "danger" && "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------- Inputs ---------- */

const inputCls =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted/60 focus:outline-none focus:border-accent/60";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, "h-auto py-2 min-h-16 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputCls, "pr-8 appearance-none cursor-pointer", className)} {...props} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("w-full rounded-2xl border border-line bg-surface shadow-2xl", width)}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Confirm ---------- */

export function Confirm({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <Modal open={open} onClose={onCancel} title={title} width="max-w-sm">
      <div className="mb-5 flex gap-3 text-sm text-muted">
        {danger && <AlertTriangle size={20} className="shrink-0 text-danger" />}
        <div className="leading-relaxed">{message}</div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={() => {
            onConfirm();
            onCancel();
          }}
        >
          {confirmLabel ?? t("Confirm")}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------- States ---------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
      {icon && <div className="text-muted/60">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={cn("animate-spin", className)} />;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-200"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted", className)}>
      {children}
    </span>
  );
}

/* ---------- Toasts ---------- */

export interface ToastMsg {
  id: number;
  msg: string;
  type: "info" | "success" | "error";
}

export const ToastContext = createContext<(msg: string, type?: ToastMsg["type"]) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastList({ toasts, onDismiss }: { toasts: ToastMsg[]; onDismiss: (id: number) => void }) {
  const timers = useRef<Map<number, number>>(new Map());
  useEffect(() => {
    for (const t of toasts) {
      if (!timers.current.has(t.id)) {
        const handle = window.setTimeout(() => {
          onDismiss(t.id);
          timers.current.delete(t.id);
        }, t.type === "error" ? 6000 : 3500);
        timers.current.set(t.id, handle);
      }
    }
  }, [toasts, onDismiss]);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur",
            t.type === "error" && "border-danger/40 bg-danger/10 text-fg",
            t.type === "success" && "border-accent/40 bg-accent/10 text-fg",
            t.type === "info" && "border-line bg-surface text-fg",
          )}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
