//! Mises à jour automatiques depuis les Releases GitHub.
//!
//! La CI publie, à chaque tag `v*`, des installateurs signés et un fichier `latest.json`.
//! L'app le consulte au démarrage puis toutes les 6 h, et prévient l'interface
//! (événement `base://update-available`). Un clic télécharge, installe et relance.

use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Dépôt GitHub (« propriétaire/dépôt ») fixé à la compilation par la CI.
/// Absent pour une compilation locale : les mises à jour sont alors désactivées.
const REPO: Option<&str> = option_env!("BASE_UPDATE_REPO");

const FIRST_CHECK: Duration = Duration::from_secs(15);
const EVERY: Duration = Duration::from_secs(6 * 3600);

#[derive(Default)]
pub struct Pending(Mutex<Option<(Update, UpdateInfo)>>);

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    pub version: String,
    pub current: String,
    pub notes: Option<String>,
}

#[derive(Serialize, Clone)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

fn repo() -> Option<&'static str> {
    REPO.filter(|r| r.contains('/'))
}

fn endpoint() -> Option<String> {
    // En compilation de test uniquement : permet de simuler un serveur de mises à jour.
    #[cfg(debug_assertions)]
    if let Ok(url) = std::env::var("BASE_UPDATE_ENDPOINT") {
        return Some(url);
    }
    repo().map(|r| format!("https://github.com/{r}/releases/latest/download/latest.json"))
}

async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
    let url: tauri::Url = endpoint()
        .ok_or("Mises à jour désactivées : cette version a été compilée localement")?
        .parse()
        .map_err(|e| format!("{e}"))?;
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    let found = updater
        .check()
        .await
        .map_err(|e| format!("Vérification impossible : {e}"))?;
    let info = found.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone(),
    });
    *app.state::<Pending>().0.lock().unwrap() = found.zip(info.clone());
    if let Some(i) = &info {
        let _ = app.emit("base://update-available", i);
    }
    Ok(info)
}

/// Vérifie en arrière-plan au démarrage, puis régulièrement.
pub fn start_background_checks(app: AppHandle) {
    if endpoint().is_none() {
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            if let Err(e) = tauri::async_runtime::block_on(check(&app)) {
                eprintln!("{e}");
            }
            std::thread::sleep(EVERY);
        }
    });
}

#[derive(Serialize)]
pub struct VersionInfo {
    version: String,
    updates_enabled: bool,
    pending: Option<UpdateInfo>,
}

#[tauri::command]
pub fn version_info(app: AppHandle) -> VersionInfo {
    VersionInfo {
        version: app.package_info().version.to_string(),
        updates_enabled: endpoint().is_some(),
        pending: app.state::<Pending>().0.lock().unwrap().as_ref().map(|(_, i)| i.clone()),
    }
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    check(&app).await
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let (update, _) = app
        .state::<Pending>()
        .0
        .lock()
        .unwrap()
        .clone() // gardée en mémoire : en cas d'échec, on peut réessayer
        .ok_or("Aucune mise à jour en attente")?;
    let emitter = app.clone();
    let mut downloaded: u64 = 0;
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = emitter.emit("base://update-progress", Progress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| format!("Mise à jour échouée : {e}"))?;
    app.restart();
}
