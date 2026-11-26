import { useEffect, useRef, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { api, type Note } from "../api";
import { Icon, useApp } from "../components";
import { shortPath, timeAgo } from "../util";

export default function Notes({ initialId }: { initialId: string | null }) {
  const ctx = useApp();
  const { notes, config, platform } = ctx;
  const [currentId, setCurrentId] = useState<string | null>(initialId);
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const timer = useRef<number>(undefined);
  const pending = useRef<{ id: string; title: string; body: string } | null>(null);

  const current: Note | undefined = notes.find((n) => n.id === currentId) ?? notes[0];

  useEffect(() => {
    if (initialId) setCurrentId(initialId);
  }, [initialId]);
  useEffect(() => {
    setDraft(current ? { title: current.title, body: current.body } : null);
  }, [current?.id]);

  const flush = () => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) return api.saveNote(p.id, p.title, p.body).then(() => ctx.reloadNotes(), (e) => ctx.toast(String(e), true));
    return Promise.resolve();
  };
  // Enregistre en quittant la vue.
  useEffect(() => () => void flush(), []);

  const edit = (patch: Partial<{ title: string; body: string }>) => {
    if (!current || !draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    pending.current = { id: current.id, ...next };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 500);
  };

  const select = async (id: string) => {
    await flush();
    setCurrentId(id);
  };

  const create = async () => {
    await flush();
    const n = await api.createNote();
    await ctx.reloadNotes();
    setCurrentId(n.id);
  };

  const remove = async () => {
    if (!current) return;
    const ok = await ask(`Supprimer la note « ${current.title} » ?`, { title: "Supprimer", kind: "warning" });
    if (!ok) return;
    pending.current = null;
    await api.deleteNote(current.id);
    const left = await ctx.reloadNotes();
    setCurrentId(left[0]?.id ?? null);
  };

  return (
    <section className="section" style={{ gap: 20 }}>
      <div className="section-head">
        <h1>Notes</h1>
        <button className="btn" onClick={() => ctx.run("Ouverture du dossier des notes…", api.openPath(config.notes_dir))}>
          <Icon name="folder" size={16} />
          Ouvrir le dossier
        </button>
      </div>
      <div className="notes">
        <div className="notes-list">
          <button className="btn dashed" onClick={create}>
            <Icon name="plus" size={16} />
            Nouvelle note
          </button>
          {notes.map((n) => (
            <button key={n.id} className={`note-btn ${current?.id === n.id ? "active" : ""}`} onClick={() => select(n.id)}>
              <span className="ellipsis" style={{ fontWeight: 600, maxWidth: "100%" }}>{n.title || "Sans titre"}</span>
              <span className="small muted ellipsis" style={{ maxWidth: "100%" }}>
                {timeAgo(n.modified)} · {n.body.split("\n").find((l) => l.trim()) || "Vide"}
              </span>
            </button>
          ))}
        </div>
        {current && draft ? (
          <div className="editor">
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <label htmlFor="note-title" className="sr-only">Titre</label>
              <input id="note-title" className="editor-title" style={{ flex: 1, minWidth: 0 }} value={draft.title} onChange={(e) => edit({ title: e.target.value })} />
              <button className="icon-btn" aria-label="Supprimer la note" title="Supprimer" onClick={remove}>
                <Icon name="trash" size={16} />
              </button>
            </div>
            <div className="small muted">Markdown · {shortPath(config.notes_dir, platform.home)}</div>
            <label htmlFor="note-body" className="sr-only">Contenu</label>
            <textarea id="note-body" className="editor-body" value={draft.body} onChange={(e) => edit({ body: e.target.value })} placeholder="Écrivez…" />
          </div>
        ) : (
          <div className="editor empty" style={{ justifyContent: "center" }}>
            Aucune note pour l'instant.
            <br />
            Elles sont enregistrées en fichiers Markdown, faciles à synchroniser avec votre cloud.
          </div>
        )}
      </div>
    </section>
  );
}
