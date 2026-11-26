import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type UpdateInfo, type VersionInfo } from "./api";
import { Icon } from "./components";

export type UpdateState = {
  version: VersionInfo | null;
  available: UpdateInfo | null;
  /** null : pas en cours ; 0–100 : pourcentage ; -1 : taille inconnue */
  progress: number | null;
  install: () => Promise<void>;
  check: () => Promise<UpdateInfo | null>;
};

export function useUpdater(onError: (msg: string) => void): UpdateState {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [available, setAvailable] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    api.versionInfo().then((v) => {
      setVersion(v);
      if (v.pending) setAvailable(v.pending);
    });
    const a = listen<UpdateInfo>("base://update-available", (e) => setAvailable(e.payload));
    const b = listen<{ downloaded: number; total: number | null }>("base://update-progress", (e) => {
      const { downloaded, total } = e.payload;
      setProgress(total ? Math.min(100, Math.round((downloaded / total) * 100)) : -1);
    });
    return () => {
      a.then((f) => f());
      b.then((f) => f());
    };
  }, []);

  return {
    version,
    available,
    progress,
    install: async () => {
      setProgress(0);
      try {
        await api.installUpdate(); // l'app redémarre d'elle-même à la fin
      } catch (e) {
        setProgress(null);
        onError(String(e));
      }
    },
    check: async () => {
      const found = await api.checkUpdate();
      setAvailable(found);
      return found;
    },
  };
}

/** Carte affichée en bas du menu quand une nouvelle version est disponible. */
export function UpdateCard({ state }: { state: UpdateState }) {
  const { available, progress } = state;
  if (!available) return null;
  const busy = progress !== null;
  return (
    <div className="side-status" style={{ borderColor: "var(--accent)" }}>
      <b>
        <span className="dot" style={{ background: "var(--accent)" }} />
        Version {available.version} disponible
      </b>
      {busy ? (
        <>
          <div className="progress" role="progressbar" aria-label="Téléchargement de la mise à jour" aria-valuenow={progress >= 0 ? progress : undefined}>
            <div style={{ width: progress >= 0 ? `${progress}%` : "100%", opacity: progress >= 0 ? 1 : 0.5 }} />
          </div>
          <span>{progress >= 100 ? "Installation, Base va redémarrer…" : "Téléchargement…"}</span>
        </>
      ) : (
        <button className="btn primary" style={{ marginTop: 6, justifyContent: "center" }} onClick={state.install}>
          <Icon name="refresh" size={16} />
          Mettre à jour
        </button>
      )}
    </div>
  );
}
