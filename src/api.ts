import { invoke } from "@tauri-apps/api/core";

export type Item = {
  id: string;
  name: string;
  kind: "app" | "game";
  source: "system" | "steam" | "epic" | "gog" | "custom";
  target: string;
};

export type Project = { id: string; name: string; path: string; todo: string };
export type ProjectInfo = Project & { stack: string; modified: number; exists: boolean };

export type Config = {
  launch_at_startup: boolean;
  fullscreen: boolean;
  hide_desktop_icons: boolean;
  shortcut: string;
  accent: string;
  editor: string;
  notes_dir: string;
  indexed_folders: string[];
  projects: Project[];
  custom_items: Item[];
  pinned: string[];
  hidden: string[];
  recent: string[];
  scan_steam: boolean;
  scan_epic: boolean;
  scan_gog: boolean;
  first_run_done: boolean;
};

export type Note = { id: string; title: string; body: string; modified: number };
export type FileHit = { name: string; path: string; is_dir: boolean };
export type Platform = { os: "windows" | "macos" | "linux" | string; home: string; sep: string };
export type IndexStatus = { count: number; indexing: boolean };

export const api = {
  platform: () => invoke<Platform>("platform"),
  getConfig: () => invoke<Config>("get_config"),
  saveConfig: (cfg: Config) => invoke<Config>("save_config", { cfg }),
  getItems: (refresh = false) => invoke<Item[]>("get_items", { refresh }),
  launch: (id: string) => invoke<Config>("launch", { id }),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  openInEditor: (path: string) => invoke<void>("open_in_editor", { path }),
  openTerminal: (path: string) => invoke<void>("open_terminal", { path }),
  searchFiles: (query: string, limit = 40) => invoke<FileHit[]>("search_files", { query, limit }),
  indexStatus: () => invoke<IndexStatus>("index_status"),
  reindex: () => invoke<void>("reindex"),
  listNotes: () => invoke<Note[]>("list_notes"),
  createNote: () => invoke<Note>("create_note"),
  saveNote: (id: string, title: string, body: string) => invoke<Note>("save_note", { id, title, body }),
  deleteNote: (id: string) => invoke<void>("delete_note", { id }),
  projectInfos: () => invoke<ProjectInfo[]>("project_infos"),
  setDesktopIconsHidden: (hidden: boolean) => invoke<Config>("set_desktop_icons_hidden", { hidden }),
  hideWindow: () => invoke<void>("hide_window"),
};
