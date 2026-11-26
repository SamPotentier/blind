import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { AppTile, GameCard, useApp } from "../components";
import { colorFor, greeting, shortPath, timeAgo } from "../util";

const QUICK_ID = "note-rapide";

export default function Home() {
  const ctx = useApp();
  const { items, config, projects, notes, platform } = ctx;

  const byId = new Map(items.map((i) => [i.id, i]));
  const recent = config.recent.map((id) => byId.get(id)).filter(Boolean) as typeof items;
  const pick = (kind: "app" | "game", n: number) => {
    const fromRecent = recent.filter((i) => i.kind === kind);
    const fromPinned = config.pinned.map((id) => byId.get(id)).filter((i) => i && i.kind === kind) as typeof items;
    const rest = items.filter((i) => i.kind === kind);
    const seen = new Set<string>();
    return [...fromRecent, ...fromPinned, ...rest].filter((i) => !seen.has(i.id) && seen.add(i.id)).slice(0, n);
  };
  const apps = pick("app", 8);
  const games = pick("game", 5);
  const topProjects = [...projects].sort((a, b) => b.modified - a.modified).slice(0, 3);

  // Note rapide : un fichier Markdown dédié, enregistré automatiquement.
  const [quick, setQuick] = useState<string | null>(null);
  const timer = useRef<number>(undefined);
  useEffect(() => {
    if (quick === null) setQuick(notes.find((n) => n.id === QUICK_ID)?.body ?? "");
  }, [notes]);
  const onQuick = (v: string) => {
    setQuick(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.saveNote(QUICK_ID, "Note rapide", v).then(() => ctx.reloadNotes(), (e) => ctx.toast(String(e), true));
    }, 500);
  };

  return (
    <>
      <div>
        <h1 className="hero">{greeting(new Date())}</h1>
        <p className="lead">Tout ce que vous utilisez, au même endroit.</p>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>{recent.some((i) => i.kind === "app") ? "Récemment utilisées" : "Applications"}</h2>
          <button className="link" onClick={() => ctx.setView("apps")}>Toutes les apps ({items.filter((i) => i.kind === "app").length})</button>
        </div>
        {apps.length ? (
          <div className="grid apps">{apps.map((i) => <AppTile key={i.id} item={i} meta={false} />)}</div>
        ) : (
          <div className="empty">Recherche des applications installées…</div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{recent.some((i) => i.kind === "game") ? "Reprendre une partie" : "Jeux"}</h2>
          <button className="link" onClick={() => ctx.setView("games")}>Bibliothèque</button>
        </div>
        {games.length ? (
          <div className="grid games">{games.map((i) => <GameCard key={i.id} item={i} />)}</div>
        ) : (
          <div className="empty">
            Aucun jeu détecté. Base trouve automatiquement les jeux Steam, Epic et GOG installés,
            <br />
            et vous pouvez ajouter n'importe quel jeu ou émulateur depuis l'onglet Jeux.
          </div>
        )}
      </section>

      <div className="row" style={{ alignItems: "stretch", gap: 20 }}>
        <section className="section" style={{ flex: "2 1 420px", minWidth: 0 }}>
          <div className="section-head">
            <h2>Projets en cours</h2>
            <button className="link" onClick={() => ctx.setView("projects")}>Tous les projets</button>
          </div>
          {topProjects.length === 0 && (
            <div className="empty">
              Ajoutez vos dossiers de projets perso pour les ouvrir en un clic.
              <br />
              <button className="link" onClick={() => ctx.setView("projects")}>Ajouter un projet</button>
            </div>
          )}
          {topProjects.map((p) => (
            <div key={p.id} className="proj-row">
              <span className="proj-bar" style={{ background: colorFor(p.id) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="small muted mono ellipsis">{shortPath(p.path, platform.home)}</div>
              </div>
              <span className="small muted">{timeAgo(p.modified)}</span>
              <button className="btn primary" onClick={() => ctx.run(`Ouverture de ${p.name}…`, api.openInEditor(p.path))}>
                Ouvrir
              </button>
            </div>
          ))}
        </section>
        <section className="section" style={{ flex: "1 1 280px", minWidth: 0 }}>
          <h2>
            <label htmlFor="quick">Note rapide</label>
          </h2>
          <textarea id="quick" className="quick" value={quick ?? ""} onChange={(e) => onQuick(e.target.value)} placeholder="Une idée, une todo, un lien…" />
          <div className="small muted">Enregistrée automatiquement dans Notes</div>
        </section>
      </div>
    </>
  );
}
