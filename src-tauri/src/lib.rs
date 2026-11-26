mod config;
mod files;
mod items;
mod notes;
mod system;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use config::{Config, Project};
use items::Item;

struct AppState {
    config: Mutex<Config>,
    config_path: PathBuf,
    items: Mutex<Vec<Item>>,
    index: Arc<files::FileIndex>,
}

impl AppState {
    fn cfg(&self) -> Config {
        self.config.lock().unwrap().clone()
    }
    fn persist(&self, cfg: Config) -> Result<Config, String> {
        config::save(&self.config_path, &cfg)?;
        *self.config.lock().unwrap() = cfg.clone();
        Ok(cfg)
    }
}

// ───────────────────────── Fenêtre ─────────────────────────

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.emit("base://focus-search", ());
    }
}

fn toggle_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let visible = w.is_visible().unwrap_or(false);
        let focused = w.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

fn apply_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if shortcut.trim().is_empty() {
        return Ok(());
    }
    gs.register(shortcut)
        .map_err(|e| format!("Raccourci « {shortcut} » indisponible : {e}"))
}

fn apply_autostart(app: &AppHandle, on: bool) -> Result<(), String> {
    let al = app.autolaunch();
    let res = if on { al.enable() } else { al.disable() };
    res.map_err(|e| e.to_string())
}

// ───────────────────────── Commandes ─────────────────────────

#[derive(Serialize)]
struct Platform {
    os: &'static str,
    home: String,
    sep: char,
}

#[tauri::command]
fn platform() -> Platform {
    Platform {
        os: std::env::consts::OS,
        home: dirs::home_dir().map(|h| h.to_string_lossy().into_owned()).unwrap_or_default(),
        sep: std::path::MAIN_SEPARATOR,
    }
}

#[tauri::command]
fn get_config(state: State<AppState>) -> Config {
    state.cfg()
}

#[tauri::command]
async fn save_config(app: AppHandle, state: State<'_, AppState>, cfg: Config) -> Result<Config, String> {
    let old = state.cfg();
    if old.launch_at_startup != cfg.launch_at_startup {
        apply_autostart(&app, cfg.launch_at_startup)?;
    }
    if old.shortcut != cfg.shortcut {
        if let Err(e) = apply_shortcut(&app, &cfg.shortcut) {
            let _ = apply_shortcut(&app, &old.shortcut);
            return Err(e);
        }
    }
    if old.fullscreen != cfg.fullscreen {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.set_fullscreen(cfg.fullscreen);
        }
    }
    let reindex = old.indexed_folders != cfg.indexed_folders;
    let rescan = old.scan_steam != cfg.scan_steam
        || old.scan_epic != cfg.scan_epic
        || old.scan_gog != cfg.scan_gog
        || old.custom_items != cfg.custom_items
        || old.hidden != cfg.hidden;
    let saved = state.persist(cfg)?;
    if reindex {
        state.index.rebuild(saved.indexed_folders.clone());
    }
    if rescan {
        let list = scan(&saved).await;
        *state.items.lock().unwrap() = list;
    }
    Ok(saved)
}

async fn scan(cfg: &Config) -> Vec<Item> {
    let cfg = cfg.clone();
    tauri::async_runtime::spawn_blocking(move || items::scan_all(&cfg))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn get_items(state: State<'_, AppState>, refresh: bool) -> Result<Vec<Item>, String> {
    let cached = state.items.lock().unwrap().clone();
    if !refresh && !cached.is_empty() {
        return Ok(cached);
    }
    let list = scan(&state.cfg()).await;
    *state.items.lock().unwrap() = list.clone();
    Ok(list)
}

#[tauri::command]
fn launch(state: State<AppState>, id: String) -> Result<Config, String> {
    let item = state
        .items
        .lock()
        .unwrap()
        .iter()
        .find(|i| i.id == id)
        .cloned()
        .ok_or("Élément introuvable — relancez une détection")?;
    system::launch(&item)?;
    let mut cfg = state.cfg();
    cfg.recent.retain(|r| r != &id);
    cfg.recent.insert(0, id);
    cfg.recent.truncate(24);
    state.persist(cfg)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    system::open_path(&path)
}

#[tauri::command]
fn open_in_editor(state: State<AppState>, path: String) -> Result<(), String> {
    system::open_in_editor(&path, &state.cfg().editor)
}

#[tauri::command]
fn open_terminal(path: String) -> Result<(), String> {
    system::open_terminal(&path)
}

#[tauri::command]
fn search_files(state: State<AppState>, query: String, limit: Option<usize>) -> Vec<files::FileHit> {
    state.index.search(&query, limit.unwrap_or(40))
}

#[tauri::command]
fn index_status(state: State<AppState>) -> files::IndexStatus {
    state.index.status()
}

#[tauri::command]
fn reindex(state: State<AppState>) {
    state.index.rebuild(state.cfg().indexed_folders);
}

fn notes_dir(state: &AppState) -> PathBuf {
    PathBuf::from(state.cfg().notes_dir)
}

#[tauri::command]
fn list_notes(state: State<AppState>) -> Vec<notes::Note> {
    notes::list(&notes_dir(&state))
}

#[tauri::command]
fn create_note(state: State<AppState>) -> Result<notes::Note, String> {
    notes::create(&notes_dir(&state))
}

#[tauri::command]
fn save_note(state: State<AppState>, id: String, title: String, body: String) -> Result<notes::Note, String> {
    notes::save(&notes_dir(&state), &id, &title, &body)
}

#[tauri::command]
fn delete_note(state: State<AppState>, id: String) -> Result<(), String> {
    notes::delete(&notes_dir(&state), &id)
}

#[derive(Serialize)]
struct ProjectInfo {
    #[serde(flatten)]
    project: Project,
    stack: String,
    modified: u64,
    exists: bool,
}

#[tauri::command]
fn project_infos(state: State<AppState>) -> Vec<ProjectInfo> {
    state
        .cfg()
        .projects
        .into_iter()
        .map(|p| {
            let path = PathBuf::from(&p.path);
            ProjectInfo {
                stack: system::detect_stack(&path),
                modified: system::last_modified(&path),
                exists: path.is_dir(),
                project: p,
            }
        })
        .collect()
}

#[tauri::command]
async fn set_desktop_icons_hidden(state: State<'_, AppState>, hidden: bool) -> Result<Config, String> {
    tauri::async_runtime::spawn_blocking(move || system::set_desktop_icons_hidden(hidden))
        .await
        .map_err(|e| e.to_string())??;
    let mut cfg = state.cfg();
    cfg.hide_desktop_icons = hidden;
    state.persist(cfg)
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

// ───────────────────────── Démarrage ─────────────────────────

pub fn run() {
    tauri::Builder::default()
        // Doit être le premier plugin : une 2e instance réaffiche la première.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            let config_path = dir.join("config.json");
            let mut cfg = config::load(&config_path);
            let handle = app.handle().clone();

            if !cfg.first_run_done {
                cfg.first_run_done = true;
                let _ = apply_autostart(&handle, cfg.launch_at_startup);
                let _ = config::save(&config_path, &cfg);
            }
            if let Err(e) = apply_shortcut(&handle, &cfg.shortcut) {
                eprintln!("{e}");
            }

            let index = Arc::new(files::FileIndex::default());
            index.rebuild(cfg.indexed_folders.clone());

            if let Some(w) = app.get_webview_window("main") {
                if cfg.fullscreen {
                    let _ = w.set_fullscreen(true);
                }
                // Fermer la fenêtre la cache : Base reste disponible via le raccourci et l'icône.
                let w2 = w.clone();
                w.on_window_event(move |ev| {
                    if let WindowEvent::CloseRequested { api, .. } = ev {
                        api.prevent_close();
                        let _ = w2.hide();
                    }
                });
            }

            app.manage(AppState {
                config: Mutex::new(cfg),
                config_path,
                items: Mutex::new(vec![]),
                index,
            });

            // L'icône près de l'horloge est un confort : son échec ne doit pas empêcher le démarrage.
            let tray_result = (|| -> tauri::Result<()> {
                let show = MenuItem::with_id(app, "show", "Afficher Base", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;
                let mut tray = TrayIconBuilder::with_id("base")
                    .tooltip("Base")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, ev| match ev.id.as_ref() {
                        "show" => show_main(app),
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, ev| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = ev
                        {
                            show_main(tray.app_handle());
                        }
                    });
                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }
                tray.build(app)?;
                Ok(())
            })();
            if let Err(e) = tray_result {
                eprintln!("Icône de notification indisponible : {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            platform,
            get_config,
            save_config,
            get_items,
            launch,
            open_path,
            open_in_editor,
            open_terminal,
            search_files,
            index_status,
            reindex,
            list_notes,
            create_note,
            save_note,
            delete_note,
            project_infos,
            set_desktop_icons_hidden,
            hide_window,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Base");
}
