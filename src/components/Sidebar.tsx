import {
  LayoutDashboard,
  Images,
  FolderOpen,
  Film,
  Wifi,
  Columns2,
  Wand2,
  Grid3x3,
  Heart,
  HardDriveDownload,
  Settings,
} from "lucide-react";
import { cn } from "../utils";
import { useT } from "../i18n";
import type { ViewKey } from "../App";

const items: { key: ViewKey; label: string; icon: React.ComponentType<{ size?: number | string }> }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "library", label: "Library", icon: Images },
  { key: "albums", label: "Albums", icon: FolderOpen },
  { key: "rolls", label: "Film Rolls", icon: Film },
  { key: "transfer", label: "Wireless", icon: Wifi },
  { key: "composer", label: "Composer", icon: Columns2 },
  { key: "editor", label: "Editor", icon: Wand2 },
  { key: "sheets", label: "Contact Sheets", icon: Grid3x3 },
  { key: "favorites", label: "Favorites", icon: Heart },
  { key: "backup", label: "Backup", icon: HardDriveDownload },
  { key: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ view, onNavigate }: { view: ViewKey; onNavigate: (v: ViewKey) => void }) {
  const t = useT();
  const activeBase: ViewKey = view === "album" ? "albums" : view === "roll" ? "rolls" : view;
  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-mono text-sm font-extrabold text-accent-ink">
          X½
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">Xhalf Bridge</div>
          <div className="text-[10px] uppercase tracking-widest text-muted">Film Studio</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {items.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              activeBase === key ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface2 hover:text-fg",
            )}
          >
            <Icon size={17} />
            {t(label)}
          </button>
        ))}
      </nav>
      <div className="border-t border-line px-4 py-3 text-[10px] leading-relaxed text-muted">
        Made for the Fujifilm X half
      </div>
    </aside>
  );
}
