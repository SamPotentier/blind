import { useEffect, useState } from "react";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { Icon, Setting, Switch, useApp } from "../components";
import { shortPath, prettyShortcut, shortcutFromEvent, SOURCE_LABEL } from "../util";
import { useIndexStatus } from "./Folders";

const ACCENTS: [string, string][] = [
  ["Bleu", "#8AA8FF"],
  ["Orange", "#F2A65A"],
  ["Vert", "#6FD39B"],
  ["Violet", "#C7A6FF"],
  ["Corail", "#FF9B8A"],
  ["Turquoise", "#7FD1D8"],
];

function ShortcutRecorder() {
  const ctx = useApp();
  const { config, platform } = ctx;
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRecording(false);
      const acc = shortcutFromEvent(e);
      if (acc) {
        setRecording(false);
        ctx.update({ shortcut: acc });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, ctx]);
  return (
    <button className="btn" onClick={() => setRecording(true)} aria-live="polite" style={recording ? { borderColor: "var(--accent)" } : undefined}>
      {recording ? "Appuyez sur la combinaison…" : prettyShortcut(config.shortcut, platform.os)}
    </button>
  );
}

function VersionCard() {
  const ctx = useApp();
  const { version, available, progress, check, install } = ctx.updater;
  const [checking, setChecking] = useState(false);
  if (!version) return null;
  const onCheck = async () => {
    setChecking(true);
    try {
      const found = await check();
      ctx.toast(found ? `Version ${found.version} disponible` : "Base est à jour");
    } catch (e) {
      ctx.toast(String(e), true);
    }
    setChecking(false);
  };
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2>Version</h2>
      <Setting
        title={`Base ${version.version}`}
        hint={
          !version.updates_enabled
            ? "Mises à jour automatiques désactivées : version compilée localement."
            : available
              ? `La version ${available.version} est prête à être installée.`
              : "Les mises à jour sont vérifiées au démarrage puis toutes les 6 heures."
        }
      >
        {available ? (
          <button className="btn primary" disabled={progress !== null} onClick={install}>
            {progress !== null ? "Installation…" : "Mettre à jour"}
          </button>
        ) : (
          <button className="btn" disabled={!version.updates_enabled || checking} onClick={onCheck}>
            <Icon name="refresh" size={16} />
            {checking ? "Vérification…" : "Vérifier"}
          </button>
        )}
      </Setting>
      {available?.notes && <p className="small muted" style={{ margin: 0, whiteSpace: "pre-line" }}>{available.notes}</p>}
    </div>
  );
}

export default function Settings() {
  const ctx = useApp();
  const { config, platform, items } = ctx;
  const mac = platform.os === "macos";
  const status = useIndexStatus();
  const hiddenItems = config.hidden.map((id) => items.find((i) => i.id === id) ?? { id, name: id.replace(/^[a-z]+:/, ""), source: id.split(":")[0] });

  const toggleDesktopIcons = async (hide: boolean) => {
    const msg = mac
      ? "Le Finder va redémarrer pour appliquer le changement (quelques secondes)."
      : "L'Explorateur Windows va redémarrer pour appliquer le changement : la barre des tâches disparaît quelques secondes.";
    if (!(await ask(msg, { title: hide ? "Masquer les icônes du bureau" : "Réafficher les icônes du bureau" }))) return;
    try {
      await api.setDesktopIconsHidden(hide);
      // Synchronise l'état local (déjà enregistré côté Rust).
      await ctx.update({ hide_desktop_icons: hide });
      ctx.toast(hide ? "Icônes du bureau masquées" : "Icônes du bureau réaffichées");
    } catch (e) {
      ctx.toast(String(e), true);
    }
  };

  const addFolder = async () => {
    const picked = await open({ title: "Ajouter un dossier à la recherche", directory: true });
    if (typeof picked === "string" && !config.indexed_folders.includes(picked)) ctx.update({ indexed_folders: [...config.indexed_folders, picked] });
  };

  const pickNotesDir = async () => {
    const picked = await open({ title: "Dossier des notes", directory: true, defaultPath: config.notes_dir });
    if (typeof picked === "string") {
      await ctx.update({ notes_dir: picked });
      ctx.reloadNotes();
    }
  };

  return (
    <section className="section" style={{ gap: 20 }}>
      <h1>Réglages</h1>
      <div className="settings">
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Démarrage et bureau</h2>
          <Setting title="Lancer au démarrage" hint={platform.os === "windows" ? "Base s'ouvre au démarrage de Windows" : "Base s'ouvre à l'ouverture de session"}>
            <Switch label="Lancer au démarrage" on={config.launch_at_startup} onChange={(v) => ctx.update({ launch_at_startup: v })} />
          </Setting>
          <Setting title="Plein écran" hint={mac ? "Base occupe tout l'écran, dans son propre espace" : "Base recouvre aussi la barre des tâches"}>
            <Switch label="Plein écran" on={config.fullscreen} onChange={(v) => ctx.update({ fullscreen: v })} />
          </Setting>
          {platform.os !== "linux" && (
            <Setting title="Masquer les icônes du bureau" hint={mac ? "Le bureau du Finder n'affiche plus rien" : "Le bureau Windows n'affiche plus d'icônes"}>
              <Switch label="Masquer les icônes du bureau" on={config.hide_desktop_icons} onChange={toggleDesktopIcons} />
            </Setting>
          )}
          <Setting title="Raccourci global" hint="Affiche ou cache Base depuis n'importe quelle fenêtre. Fermer la fenêtre la cache seulement : quittez depuis l'icône près de l'horloge.">
            <ShortcutRecorder />
          </Setting>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Jeux</h2>
          <Setting title="Steam" hint="Bibliothèques Steam détectées automatiquement">
            <Switch label="Steam" on={config.scan_steam} onChange={(v) => ctx.update({ scan_steam: v })} />
          </Setting>
          <Setting title="Epic Games" hint="Jeux installés via le launcher Epic">
            <Switch label="Epic Games" on={config.scan_epic} onChange={(v) => ctx.update({ scan_epic: v })} />
          </Setting>
          {platform.os === "windows" && (
            <Setting title="GOG Galaxy" hint="Jeux GOG installés">
              <Switch label="GOG Galaxy" on={config.scan_gog} onChange={(v) => ctx.update({ scan_gog: v })} />
            </Setting>
          )}
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            {items.filter((i) => i.kind === "game").length} jeux · {items.filter((i) => i.kind === "app").length} applications
          </p>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2>Recherche de dossiers</h2>
          <div className="small muted">
            Noms des fichiers et dossiers indexés (pas leur contenu).{" "}
            {status && (status.indexing ? "Indexation en cours…" : `${status.count.toLocaleString("fr-FR")} éléments.`)}
          </div>
          {config.indexed_folders.map((f) => (
            <div key={f} className="folder-row">
              <Icon name="folder" size={18} color="var(--warn)" />
              <span className="mono ellipsis" title={f}>{shortPath(f, platform.home)}</span>
              <button className="icon-btn" aria-label={`Retirer ${f}`} title="Retirer" onClick={() => ctx.update({ indexed_folders: config.indexed_folders.filter((x) => x !== f) })}>
                <Icon name="x" size={15} />
              </button>
            </div>
          ))}
          <div className="row">
            <button className="btn dashed" style={{ flex: 1 }} onClick={addFolder}>
              <Icon name="plus" size={16} />
              Ajouter un dossier
            </button>
            <button className="btn" onClick={() => api.reindex().then(() => ctx.toast("Réindexation lancée"))}>
              <Icon name="refresh" size={16} />
              Réindexer
            </button>
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2>Projets, notes et apparence</h2>
          <div>
            <label htmlFor="editor" style={{ fontWeight: 500 }}>Éditeur de code</label>
            <div className="small muted" style={{ margin: "2px 0 8px" }}>
              {mac ? "Nom de l'application (ex. Visual Studio Code, Cursor, Zed)" : "Commande (ex. code, cursor, idea64, notepad++)"}
            </div>
            <input id="editor" className="text-input" defaultValue={config.editor} onBlur={(e) => e.target.value.trim() && ctx.update({ editor: e.target.value.trim() })} />
          </div>
          <div>
            <div style={{ fontWeight: 500 }}>Dossier des notes</div>
            <div className="row" style={{ marginTop: 8, flexWrap: "nowrap" }}>
              <div className="path" style={{ flex: 1 }}>{shortPath(config.notes_dir, platform.home)}</div>
              <button className="btn" onClick={pickNotesDir}>Changer</button>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Couleur d'accent</div>
            <div className="row">
              {ACCENTS.map(([name, hex]) => (
                <button key={hex} className="swatch" aria-label={name} title={name} aria-pressed={config.accent === hex} style={{ background: hex }} onClick={() => ctx.update({ accent: hex })} />
              ))}
            </div>
          </div>
        </div>

        <VersionCard />

        {hiddenItems.length > 0 && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2>Éléments masqués</h2>
            {hiddenItems.map((i) => (
              <div key={i.id} className="folder-row">
                <span style={{ flex: 1 }} className="ellipsis">
                  {i.name} <span className="small muted">· {SOURCE_LABEL[i.source] ?? i.source}</span>
                </span>
                <button className="btn" onClick={() => ctx.update({ hidden: config.hidden.filter((h) => h !== i.id) })}>Réafficher</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
