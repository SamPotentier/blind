import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type Config, type Item, type Note, type Platform, type ProjectInfo } from "./api";
import { AppCtx, Icon, type Ctx, type View } from "./components";
import { colorFor, prettyShortcut } from "./util";
import { UpdateCard, useUpdater } from "./update";
import Search from "./views/Search";
import Home from "./views/Home";
import Library from "./views/Library";
import Projects from "./views/Projects";
import Notes from "./views/Notes";
import Folders from "./views/Folders";
import Settings from "./views/Settings";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "home", label: "Accueil", icon: "home" },
  { id: "apps", label: "Applications", icon: "grid" },
  { id: "games", label: "Jeux", icon: "game" },
  { id: "projects", label: "Projets perso", icon: "code" },
  { id: "notes", label: "Notes", icon: "note" },
  { id: "files", label: "Dossiers", icon: "folder" },
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [platform, setPlatform] = useState<Platform>({ os: "", home: "", sep: "/" });
  const [items, setItems] = useState<Item[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [view, setViewState] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>(undefined);
  const now = useClock();

  const showToast = useCallback((msg: string, error = false) => {
    window.clearTimeout(toastTimer.current);
    setToast({ msg, error });
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 4500 : 2200);
  }, []);

  const updater = useUpdater((msg) => showToast(msg, true));

  const reloadItems = useCallback(async (refresh = false) => setItems(await api.getItems(refresh)), []);
  const reloadProjects = useCallback(async () => setProjects(await api.projectInfos()), []);
  const reloadNotes = useCallback(async () => {
    const n = await api.listNotes();
    setNotes(n);
    return n;
  }, []);

  useEffect(() => {
    api.platform().then(setPlatform);
    api.getConfig().then(setConfig);
    reloadItems().catch((e) => showToast(String(e), true));
    reloadProjects();
    reloadNotes();
    const un = listen("base://focus-search", () => {
      searchRef.current?.focus();
      searchRef.current?.select();
      reloadProjects();
    });
    return () => {
      un.then((f) => f());
    };
  }, [reloadItems, reloadProjects, reloadNotes, showToast]);

  useEffect(() => {
    if (config) document.documentElement.style.setProperty("--accent", config.accent);
  }, [config?.accent]);

  // Raccourcis clavier internes : Ctrl/⌘+K ou / pour chercher, Échap pour effacer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea");
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const update = useCallback(
    async (patch: Partial<Config>) => {
      if (!config) return;
      try {
        setConfig(await api.saveConfig({ ...config, ...patch }));
        if ("projects" in patch) await reloadProjects();
        if ("custom_items" in patch || "hidden" in patch || "scan_steam" in patch || "scan_epic" in patch || "scan_gog" in patch)
          await reloadItems();
      } catch (e) {
        showToast(String(e), true);
      }
    },
    [config, reloadItems, reloadProjects, showToast],
  );

  const ctx: Ctx | null = useMemo(() => {
    if (!config) return null;
    return {
      config,
      platform,
      items,
      projects,
      notes,
      setView: (v) => {
        setViewState(v);
        setQuery("");
      },
      update,
      launch: (item) => {
        showToast(`${item.kind === "game" ? "Lancement de" : "Ouverture de"} ${item.name}…`);
        api.launch(item.id).then(setConfig, (e) => showToast(String(e), true));
      },
      togglePin: (id) =>
        update({ pinned: config.pinned.includes(id) ? config.pinned.filter((p) => p !== id) : [...config.pinned, id] }),
      hide: (item) => {
        update({ hidden: [...config.hidden, item.id], pinned: config.pinned.filter((p) => p !== item.id) });
        showToast(`${item.name} masqué — réaffichable dans Réglages`);
      },
      run: (label, p) => {
        showToast(label);
        p.catch((e) => showToast(String(e), true));
      },
      toast: showToast,
      reloadItems,
      reloadProjects,
      reloadNotes,
      updater,
    };
  }, [config, platform, items, projects, notes, update, showToast, reloadItems, reloadProjects, reloadNotes, updater]);

  if (!ctx || !config) return <div className="app" />;

  const pinnedEntries = config.pinned
    .map((id) => {
      const it = items.find((i) => i.id === id);
      if (it) return { id, name: it.name, color: colorFor(id), open: () => ctx.launch(it) };
      const pr = projects.find((p) => `project:${p.id}` === id);
      if (pr) return { id, name: pr.name, color: colorFor(pr.id), open: () => ctx.run(`Ouverture de ${pr.name}…`, api.openInEditor(pr.path)) };
      return null;
    })
    .filter(Boolean) as { id: string; name: string; color: string; open: () => void }[];

  const searching = query.trim().length > 0;
  const osName = platform.os === "macos" ? "macOS" : platform.os === "windows" ? "Windows" : "Linux";

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <Icon name="grid" color="#0E1116" width={2.4} />
            </div>
            <span className="brand-name">Base</span>
          </div>
          <label className="search">
            <Icon name="search" color="var(--muted)" />
            <span className="sr-only">Rechercher</span>
            <input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une app, un jeu, un projet, un dossier, une note…"
              spellCheck={false}
            />
            <span className="kbd">{prettyShortcut(config.shortcut, platform.os)}</span>
          </label>
          <div className="clock">
            <div className="clock-time">{now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
            <div className="clock-date">{now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
        </header>

        <div className="body">
          <nav className="sidebar" aria-label="Sections">
            {NAV.map((n) => (
              <button key={n.id} className={`nav-btn ${view === n.id && !searching ? "active" : ""}`} onClick={() => ctx.setView(n.id)}>
                <Icon name={n.icon} />
                {n.label}
              </button>
            ))}
            {pinnedEntries.length > 0 && <div className="nav-label">Épinglés</div>}
            {pinnedEntries.map((p) => (
              <button key={p.id} className="nav-btn nav-pin" onClick={p.open} title={p.name}>
                <span className="dot" style={{ background: p.color }} />
                <span>{p.name}</span>
              </button>
            ))}
            <div style={{ marginTop: "auto", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <button className={`nav-btn ${view === "settings" && !searching ? "active" : ""}`} onClick={() => ctx.setView("settings")}>
                <Icon name="settings" />
                Réglages
              </button>
              <UpdateCard state={updater} />
              <div className="side-status">
                <b>
                  <span className="dot" style={{ background: config.launch_at_startup ? "var(--ok)" : "var(--line-2)" }} />
                  {config.launch_at_startup ? "Lancé au démarrage" : "Démarrage manuel"}
                </b>
                <span>
                  {osName} · {prettyShortcut(config.shortcut, platform.os)} pour afficher
                </span>
              </div>
            </div>
          </nav>

          <main className="main">
            {searching ? (
              <Search
                query={query}
                openNote={(id) => {
                  setOpenNoteId(id);
                  ctx.setView("notes");
                }}
              />
            ) : view === "home" ? (
              <Home />
            ) : view === "apps" ? (
              <Library kind="app" />
            ) : view === "games" ? (
              <Library kind="game" />
            ) : view === "projects" ? (
              <Projects />
            ) : view === "notes" ? (
              <Notes initialId={openNoteId} />
            ) : view === "files" ? (
              <Folders />
            ) : (
              <Settings />
            )}
          </main>
        </div>

        {toast && (
          <div className={`toast ${toast.error ? "error" : ""}`} role="status">
            <Icon name={toast.error ? "x" : "play"} size={16} width={2.4} />
            {toast.msg}
          </div>
        )}
      </div>
    </AppCtx.Provider>
  );
}
