import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, type IndexStatus } from "../api";
import { Icon, useApp } from "../components";
import { baseName, shortPath } from "../util";

export function useIndexStatus() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () => api.indexStatus().then((s) => alive && setStatus(s));
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return status;
}

export default function Folders() {
  const ctx = useApp();
  const { config, platform } = ctx;
  const status = useIndexStatus();

  const add = async () => {
    const picked = await open({ title: "Ajouter un dossier", directory: true, multiple: false });
    if (typeof picked !== "string" || config.indexed_folders.includes(picked)) return;
    await ctx.update({ indexed_folders: [...config.indexed_folders, picked] });
    ctx.toast(`${baseName(picked)} ajouté à la recherche`);
  };

  return (
    <section className="section" style={{ gap: 20 }}>
      <div className="section-head">
        <h1>Dossiers</h1>
        <button className="btn" onClick={add}>
          <Icon name="plus" size={16} />
          Ajouter un dossier
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Tapez dans la barre du haut pour retrouver n'importe quel fichier ou dossier ci-dessous.{" "}
        {status && (status.indexing ? "Indexation en cours…" : `${status.count.toLocaleString("fr-FR")} éléments indexés.`)}
      </p>
      <div className="grid folders">
        {config.indexed_folders.map((f) => (
          <button key={f} className="hit" onClick={() => ctx.run(`Ouverture de ${baseName(f)}…`, api.openPath(f))} title={f}>
            <Icon name="folder" size={28} color="var(--warn)" width={1.8} />
            <span className="hit-text">
              <span style={{ fontWeight: 600 }} className="ellipsis">{baseName(f)}</span>
              <span className="small muted mono ellipsis">{shortPath(f, platform.home)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
