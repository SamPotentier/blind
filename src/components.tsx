import { createContext, useContext, type ReactNode } from "react";
import type { Config, Item, Note, Platform, ProjectInfo } from "./api";
import { colorFor, initials, SOURCE_LABEL } from "./util";

export type View = "home" | "apps" | "games" | "projects" | "notes" | "files" | "settings";

export type Ctx = {
  config: Config;
  platform: Platform;
  items: Item[];
  projects: ProjectInfo[];
  notes: Note[];
  setView: (v: View) => void;
  update: (patch: Partial<Config>) => Promise<void>;
  launch: (item: Item) => void;
  togglePin: (id: string) => void;
  hide: (item: Item) => void;
  run: (label: string, p: Promise<unknown>) => void;
  toast: (msg: string, error?: boolean) => void;
  reloadItems: (refresh?: boolean) => Promise<void>;
  reloadProjects: () => Promise<void>;
  reloadNotes: () => Promise<Note[]>;
};

export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

// ───── Icônes (traits, 24×24) ─────
const paths: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  game: (
    <>
      <rect x="2" y="7" width="20" height="11" rx="5" />
      <path d="M7 11v3M5.5 12.5h3" />
      <circle cx="16" cy="11.5" r=".8" />
      <circle cx="18" cy="13.5" r=".8" />
    </>
  ),
  code: <path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16" />,
  note: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  folder: <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
  file: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  pin: <path d="M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z" />,
  eyeOff: <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  terminal: <path d="m4 7 5 5-5 5M12 19h8" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />,
  play: <path d="M6 4l14 8-14 8z" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({ name, size = 18, color = "currentColor", width = 2 }: { name: keyof typeof paths | string; size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Badge({ name, id, small }: { name: string; id: string; small?: boolean }) {
  return (
    <span className={small ? "badge sm" : "badge"} style={{ background: colorFor(id) }}>
      {initials(name)}
    </span>
  );
}

function TileActions({ item }: { item: Item }) {
  const { config, togglePin, hide } = useApp();
  const pinned = config.pinned.includes(item.id);
  return (
    <div className="tile-actions">
      <button className="icon-btn" title={pinned ? "Désépingler" : "Épingler"} aria-label={pinned ? `Désépingler ${item.name}` : `Épingler ${item.name}`} onClick={() => togglePin(item.id)}>
        <Icon name="pin" size={15} color={pinned ? "var(--accent)" : "currentColor"} />
      </button>
      <button className="icon-btn" title="Masquer" aria-label={`Masquer ${item.name}`} onClick={() => hide(item)}>
        <Icon name="eyeOff" size={15} />
      </button>
    </div>
  );
}

export function AppTile({ item, meta = true }: { item: Item; meta?: boolean }) {
  const { launch } = useApp();
  return (
    <div className="tile-wrap">
      <button className="tile" onClick={() => launch(item)} title={item.name}>
        <Badge name={item.name} id={item.id} />
        <span className="tile-name">{item.name}</span>
        {meta && <span className="small muted">{SOURCE_LABEL[item.source]}</span>}
      </button>
      <TileActions item={item} />
    </div>
  );
}

export function GameCard({ item }: { item: Item }) {
  const { launch } = useApp();
  return (
    <div className="tile-wrap">
      <button className="game" onClick={() => launch(item)} title={item.name}>
        <span className="game-cover" style={{ background: colorFor(item.id) }}>
          {initials(item.name)}
        </span>
        <span className="game-info">
          <span className="ellipsis" style={{ fontWeight: 600 }}>{item.name}</span>
          <span className="small muted">{SOURCE_LABEL[item.source]}</span>
        </span>
      </button>
      <TileActions item={item} />
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Setting({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <b>{title}</b>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
