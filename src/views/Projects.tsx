import { useEffect, useState } from "react";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { api, type ProjectInfo } from "../api";
import { Badge, Icon, useApp } from "../components";
import { baseName, shortPath, timeAgo } from "../util";

function Todo({ project }: { project: ProjectInfo }) {
  const ctx = useApp();
  const [value, setValue] = useState(project.todo);
  useEffect(() => setValue(project.todo), [project.todo]);
  const save = () => {
    if (value === project.todo) return;
    ctx.update({ projects: ctx.config.projects.map((p) => (p.id === project.id ? { ...p, todo: value } : p)) });
  };
  return (
    <>
      <label htmlFor={`todo-${project.id}`} className="sr-only">Prochaine étape pour {project.name}</label>
      <textarea id={`todo-${project.id}`} className="todo" value={value} placeholder="Prochaine étape…" onChange={(e) => setValue(e.target.value)} onBlur={save} />
    </>
  );
}

export default function Projects() {
  const ctx = useApp();
  const { projects, config, platform } = ctx;

  useEffect(() => {
    ctx.reloadProjects();
  }, []);

  const add = async () => {
    const picked = await open({ title: "Choisir le dossier du projet", directory: true, multiple: false });
    if (typeof picked !== "string") return;
    if (config.projects.some((p) => p.path === picked)) {
      ctx.toast("Ce projet est déjà dans la liste");
      return;
    }
    const id = Date.now().toString(36);
    await ctx.update({ projects: [...config.projects, { id, name: baseName(picked), path: picked, todo: "" }] });
    ctx.toast(`${baseName(picked)} ajouté`);
  };

  const remove = async (p: ProjectInfo) => {
    const ok = await ask(`Retirer « ${p.name} » de Base ? Le dossier n'est pas supprimé.`, { title: "Retirer le projet", kind: "warning" });
    if (ok)
      ctx.update({
        projects: config.projects.filter((x) => x.id !== p.id),
        pinned: config.pinned.filter((x) => x !== `project:${p.id}`),
      });
  };

  const rename = (p: ProjectInfo, name: string) => {
    const n = name.trim();
    if (n && n !== p.name) ctx.update({ projects: config.projects.map((x) => (x.id === p.id ? { ...x, name: n } : x)) });
  };

  const sorted = [...projects].sort((a, b) => b.modified - a.modified);

  return (
    <section className="section" style={{ gap: 20 }}>
      <div className="section-head">
        <h1>Projets perso</h1>
        <button className="btn" onClick={add}>
          <Icon name="plus" size={16} />
          Ajouter un dossier projet
        </button>
      </div>
      {sorted.length === 0 && (
        <div className="empty">
          Choisissez le dossier d'un projet (code, jeu, site, impression 3D…) :
          <br />
          Base l'ouvre dans votre éditeur, votre explorateur ou un terminal en un clic.
          <br />
          <button className="btn primary" style={{ marginTop: 14 }} onClick={add}>Ajouter un projet</button>
        </div>
      )}
      <div className="grid wide">
        {sorted.map((p) => {
          const pinned = config.pinned.includes(`project:${p.id}`);
          return (
            <div key={p.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, opacity: p.exists ? 1 : 0.6 }}>
              <div className="row" style={{ flexWrap: "nowrap", gap: 12 }}>
                <Badge name={p.name} id={p.id} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label className="sr-only" htmlFor={`name-${p.id}`}>Nom du projet</label>
                  <input
                    id={`name-${p.id}`}
                    defaultValue={p.name}
                    onBlur={(e) => rename(p, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    style={{ width: "100%", background: "transparent", border: 0, color: "var(--text)", fontWeight: 600, fontSize: 15, padding: 0 }}
                  />
                  <div className="small muted">
                    {p.exists ? [p.stack, timeAgo(p.modified)].filter(Boolean).join(" · ") : "Dossier introuvable"}
                  </div>
                </div>
                <button className="icon-btn" aria-label={pinned ? "Désépingler" : "Épingler"} title={pinned ? "Désépingler" : "Épingler"} onClick={() => ctx.togglePin(`project:${p.id}`)}>
                  <Icon name="pin" size={15} color={pinned ? "var(--accent)" : "currentColor"} />
                </button>
                <button className="icon-btn" aria-label={`Retirer ${p.name}`} title="Retirer" onClick={() => remove(p)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
              <div className="path" title={p.path}>{shortPath(p.path, platform.home)}</div>
              <Todo project={p} />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary" disabled={!p.exists} onClick={() => ctx.run(`Ouverture de ${p.name} dans l'éditeur…`, api.openInEditor(p.path))}>
                  <Icon name="code" size={16} />
                  Éditeur
                </button>
                <button className="btn" disabled={!p.exists} onClick={() => ctx.run("Ouverture du dossier…", api.openPath(p.path))}>
                  <Icon name="folder" size={16} />
                  Dossier
                </button>
                <button className="btn" disabled={!p.exists} onClick={() => ctx.run("Ouverture du terminal…", api.openTerminal(p.path))}>
                  <Icon name="terminal" size={16} />
                  Terminal
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
