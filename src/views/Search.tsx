import { useEffect, useMemo, useState } from "react";
import { api, type FileHit } from "../api";
import { Badge, Icon, useApp } from "../components";
import { shortPath, SOURCE_LABEL } from "../util";

type Hit = {
  key: string;
  group: string;
  name: string;
  meta: string;
  action: string;
  icon: React.ReactNode;
  run: () => void;
};

function matches(text: string, words: string[]) {
  const t = text.toLowerCase();
  return words.every((w) => t.includes(w));
}

export default function Search({ query, openNote }: { query: string; openNote: (id: string) => void }) {
  const ctx = useApp();
  const { items, projects, notes, platform } = ctx;
  const [files, setFiles] = useState<FileHit[]>([]);
  const [sel, setSel] = useState(0);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  useEffect(() => {
    const t = setTimeout(() => api.searchFiles(query, 30).then(setFiles), 120);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setSel(0), [query]);

  const hits: Hit[] = useMemo(() => {
    const out: Hit[] = [];
    const ranked = (name: string) => (name.toLowerCase().startsWith(words[0] ?? "") ? 0 : 1);
    const its = items.filter((i) => matches(i.name, words)).sort((a, b) => ranked(a.name) - ranked(b.name));
    for (const kind of ["app", "game"] as const) {
      for (const i of its.filter((x) => x.kind === kind).slice(0, 8)) {
        out.push({
          key: i.id,
          group: kind === "app" ? "Applications" : "Jeux",
          name: i.name,
          meta: SOURCE_LABEL[i.source],
          action: kind === "app" ? "Ouvrir" : "Jouer",
          icon: <Badge name={i.name} id={i.id} small />,
          run: () => ctx.launch(i),
        });
      }
    }
    for (const p of projects.filter((p) => matches(`${p.name} ${p.path} ${p.stack}`, words)).slice(0, 6)) {
      out.push({
        key: "p:" + p.id,
        group: "Projets",
        name: p.name,
        meta: shortPath(p.path, platform.home),
        action: "Ouvrir dans l'éditeur",
        icon: <Badge name={p.name} id={p.id} small />,
        run: () => ctx.run(`Ouverture de ${p.name}…`, api.openInEditor(p.path)),
      });
    }
    for (const n of notes.filter((n) => matches(`${n.title} ${n.body}`, words)).slice(0, 6)) {
      out.push({
        key: "n:" + n.id,
        group: "Notes",
        name: n.title,
        meta: n.body.split("\n").find((l) => l.trim()) ?? "",
        action: "Ouvrir la note",
        icon: (
          <span className="badge sm" style={{ background: "var(--soft)" }}>
            <Icon name="note" size={16} color="#0E1116" />
          </span>
        ),
        run: () => openNote(n.id),
      });
    }
    for (const f of files) {
      out.push({
        key: "f:" + f.path,
        group: "Dossiers et fichiers",
        name: f.name,
        meta: shortPath(f.path, platform.home),
        action: f.is_dir ? "Ouvrir le dossier" : "Ouvrir",
        icon: (
          <span className="badge sm" style={{ background: "var(--panel-2)" }}>
            <Icon name={f.is_dir ? "folder" : "file"} size={18} color={f.is_dir ? "var(--warn)" : "var(--soft)"} />
          </span>
        ),
        run: () => ctx.run(`Ouverture de ${f.name}…`, api.openPath(f.path)),
      });
    }
    return out;
  }, [items, projects, notes, files, query]);

  // Flèches pour naviguer, Entrée pour lancer le résultat sélectionné.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(document.activeElement as HTMLElement)?.closest(".search")) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, hits.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter" && hits[sel]) {
        e.preventDefault();
        hits[sel].run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hits, sel]);

  useEffect(() => {
    document.querySelector(".hit.sel")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  let lastGroup = "";
  return (
    <section className="section" aria-live="polite">
      <h1>Résultats pour « {query.trim()} »</h1>
      {hits.length === 0 && <p className="muted">Rien trouvé. Vérifiez l'orthographe, ou ajoutez le dossier concerné dans Réglages › Recherche.</p>}
      {hits.map((h, i) => {
        const header = h.group !== lastGroup ? <div className="group-label">{h.group}</div> : null;
        lastGroup = h.group;
        return (
          <div key={h.key} style={{ display: "contents" }}>
            {header}
            <button className={`hit ${i === sel ? "sel" : ""}`} onClick={h.run} onMouseMove={() => setSel(i)}>
              {h.icon}
              <span className="hit-text">
                <span className="ellipsis" style={{ fontWeight: 600 }}>{h.name}</span>
                <span className="small muted ellipsis">{h.meta}</span>
              </span>
              <span className="hit-action">{i === sel ? `${h.action} ↵` : h.action}</span>
            </button>
          </div>
        );
      })}
    </section>
  );
}
