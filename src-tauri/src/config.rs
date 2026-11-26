use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::items::Item;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub todo: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Config {
    pub launch_at_startup: bool,
    pub fullscreen: bool,
    pub hide_desktop_icons: bool,
    pub shortcut: String,
    pub accent: String,
    /// Commande (Windows/Linux) ou nom d'app (macOS) de l'éditeur de code.
    pub editor: String,
    pub notes_dir: String,
    pub indexed_folders: Vec<String>,
    pub projects: Vec<Project>,
    pub custom_items: Vec<Item>,
    pub pinned: Vec<String>,
    pub hidden: Vec<String>,
    pub recent: Vec<String>,
    pub scan_steam: bool,
    pub scan_epic: bool,
    pub scan_gog: bool,
    pub first_run_done: bool,
}

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

pub fn default_indexed_folders() -> Vec<String> {
    let mut v: Vec<PathBuf> = vec![];
    for d in [
        dirs::document_dir(),
        dirs::download_dir(),
        dirs::desktop_dir(),
        dirs::picture_dir(),
        dirs::audio_dir(),
        dirs::video_dir(),
    ]
    .into_iter()
    .flatten()
    {
        if d.exists() && !v.contains(&d) {
            v.push(d);
        }
    }
    for name in ["dev", "Dev", "Projects", "Projets", "code", "Code", "repos", "src"] {
        let p = home().join(name);
        if p.is_dir() && !v.contains(&p) {
            v.push(p);
        }
    }
    v.into_iter().map(|p| p.to_string_lossy().into_owned()).collect()
}

impl Default for Config {
    fn default() -> Self {
        let notes = dirs::document_dir()
            .unwrap_or_else(home)
            .join("Base")
            .join("notes");
        Config {
            launch_at_startup: true,
            fullscreen: false,
            hide_desktop_icons: false,
            shortcut: "CommandOrControl+Shift+Space".into(),
            accent: "#8AA8FF".into(),
            editor: if cfg!(target_os = "macos") {
                "Visual Studio Code".into()
            } else {
                "code".into()
            },
            notes_dir: notes.to_string_lossy().into_owned(),
            indexed_folders: default_indexed_folders(),
            projects: vec![],
            custom_items: vec![],
            pinned: vec![],
            hidden: vec![],
            recent: vec![],
            scan_steam: true,
            scan_epic: true,
            scan_gog: true,
            first_run_done: false,
        }
    }
}

pub fn load(path: &Path) -> Config {
    match fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Config::default(),
    }
}

pub fn save(path: &Path, cfg: &Config) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    let data = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}
