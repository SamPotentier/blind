import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Item } from "../api";
import { AppTile, GameCard, Icon, useApp } from "../components";
import { baseName } from "../util";

export default function Library({ kind }: { kind: "app" | "game" }) {
  const ctx = useApp();
  const { items, config, platform } = ctx;
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const list = items.filter((i) => i.kind === kind);
  const sources = Array.from(new Set(list.map((i) => i.source)));
  const shown = filter === "all" ? list : list.filter((i) => i.source === filter);

  const add = async () => {
    const mac = platform.os === "macos";
    const picked = await open({
      title: kind === "game" ? "Choisir un jeu ou un émulateur" : "Choisir une application",
      multiple: false,
      directory: false,
      defaultPath: mac ? "/Applications" : undefined,
      filters: mac ? undefined : platform.os === "windows" ? [{ name: "Programmes et raccourcis", extensions: ["exe", "lnk", "url", "bat", "cmd"] }] : undefined,
    });
    if (typeof picked !== "string") return;
    const name = baseName(picked).replace(/\.(exe|lnk|url|app|bat|cmd)$/i, "");
    const item: Item = { id: `custom:${picked}`, name, kind, source: "custom", target: picked };
    await ctx.update({
      custom_items: [...config.custom_items.filter((i) => i.id !== item.id), item],
      hidden: config.hidden.filter((h) => h !== item.id),
    });
    ctx.toast(`${name} ajouté`);
  };

  const rescan = async () => {
    setBusy(true);
    await ctx.reloadItems(true).catch((e) => ctx.toast(String(e), true));
    setBusy(false);
    ctx.toast("Détection terminée");
  };

  return (
    <section className="section" style={{ gap: 20 }}>
      <div className="section-head">
        <h1>{kind === "app" ? "Applications" : "Jeux"}</h1>
        <div className="row">
          <button className="btn" onClick={rescan} disabled={busy}>
            <Icon name="refresh" size={16} />
            {busy ? "Détection…" : "Redétecter"}
          </button>
          <button className="btn" onClick={add}>
            <Icon name="plus" size={16} />
            {kind === "app" ? "Ajouter une app" : "Ajouter un jeu"}
          </button>
        </div>
      </div>

      {sources.length > 1 && (
        <div className="row" role="group" aria-label="Filtrer par source">
          {[["all", "Tout"], ...sources.map((s) => [s, s === "system" ? "Installées" : s === "custom" ? "Ajouts perso" : s === "steam" ? "Steam" : s === "epic" ? "Epic" : "GOG"])].map(([id, label]) => (
            <button key={id} className="btn" aria-pressed={filter === id} style={filter === id ? { background: "var(--sel)", borderColor: "var(--accent)" } : undefined} onClick={() => setFilter(id)}>
              {label} <span className="muted">{id === "all" ? list.length : list.filter((i) => i.source === id).length}</span>
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          {kind === "game"
            ? "Aucun jeu détecté. Installez des jeux via Steam, Epic ou GOG, ou ajoutez-en un manuellement (n'importe quel .exe, .app ou raccourci)."
            : "Aucune application trouvée pour l'instant."}
        </div>
      ) : kind === "app" ? (
        <div className="grid apps">{shown.map((i) => <AppTile key={i.id} item={i} />)}</div>
      ) : (
        <div className="grid games">{shown.map((i) => <GameCard key={i.id} item={i} />)}</div>
      )}
      <p className="small muted">Survolez une tuile pour l'épingler dans le menu ou la masquer.</p>
    </section>
  );
}
