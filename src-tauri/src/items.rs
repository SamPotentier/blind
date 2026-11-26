//! Découverte des applications installées et des jeux (Steam, Epic, GOG).

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::config::Config;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Item {
    pub id: String,
    pub name: String,
    /// "app" ou "game"
    pub kind: String,
    /// "system", "steam", "epic", "gog" ou "custom"
    pub source: String,
    /// Chemin, URL ou commande utilisée pour lancer l'élément.
    pub target: String,
}

impl Item {
    fn new(kind: &str, source: &str, key: &str, name: &str, target: String) -> Self {
        Item {
            id: format!("{source}:{key}"),
            name: name.trim().to_string(),
            kind: kind.into(),
            source: source.into(),
            target,
        }
    }
}

/// Mots qui signalent un raccourci « parasite » du menu Démarrer.
const NOISE: &[&str] = &[
    "uninstall", "désinstall", "desinstall", "readme", "read me", "lisez", "help", "aide ",
    "documentation", "manual", "manuel", "website", "site web", "release notes", "license",
    "licence", "changelog", "support", "faq",
];

fn is_noise(name: &str) -> bool {
    let l = name.to_lowercase();
    NOISE.iter().any(|n| l.contains(n))
}

pub fn scan_all(cfg: &Config) -> Vec<Item> {
    let mut games = vec![];
    if cfg.scan_steam {
        games.extend(scan_steam());
    }
    if cfg.scan_epic {
        games.extend(scan_epic());
    }
    if cfg.scan_gog {
        games.extend(scan_gog());
    }
    let game_names: HashSet<String> = games.iter().map(|g| g.name.to_lowercase()).collect();

    let mut seen = HashSet::new();
    let mut out = vec![];
    for it in scan_system_apps() {
        let l = it.name.to_lowercase();
        // Steam/Epic créent aussi des raccourcis de jeux : on garde la version « jeu ».
        if game_names.contains(&l) || is_noise(&it.name) || !seen.insert(l) {
            continue;
        }
        out.push(it);
    }
    let mut seen_games = HashSet::new();
    for g in games {
        if seen_games.insert(g.name.to_lowercase()) {
            out.push(g);
        }
    }
    out.extend(cfg.custom_items.iter().cloned());
    out.retain(|i| !cfg.hidden.contains(&i.id));
    out.sort_by_key(|i| i.name.to_lowercase());
    out
}

// ───────────────────────── Applications système ─────────────────────────

#[cfg(target_os = "windows")]
fn scan_system_apps() -> Vec<Item> {
    let mut roots = vec![];
    if let Ok(pd) = std::env::var("ProgramData") {
        roots.push(PathBuf::from(pd).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Ok(ad) = std::env::var("APPDATA") {
        roots.push(PathBuf::from(ad).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    let mut out = vec![];
    for root in roots {
        for e in walkdir::WalkDir::new(&root).max_depth(4).into_iter().flatten() {
            let p = e.path();
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            if ext != "lnk" && ext != "url" {
                continue;
            }
            let Some(name) = p.file_stem().and_then(|s| s.to_str()) else { continue };
            let target = p.to_string_lossy().into_owned();
            out.push(Item::new("app", "system", &target, name, target.clone()));
        }
    }
    out
}

#[cfg(target_os = "macos")]
fn scan_system_apps() -> Vec<Item> {
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
    ];
    if let Some(h) = dirs::home_dir() {
        roots.push(h.join("Applications"));
    }
    let mut out = vec![];
    for root in roots {
        // Profondeur 2 : /Applications/X.app et /Applications/Dossier/Y.app (ex. Utilitaires).
        for e in walkdir::WalkDir::new(&root).max_depth(2).into_iter().flatten() {
            let p = e.path();
            if p.extension().map(|x| x == "app").unwrap_or(false) {
                let Some(name) = p.file_stem().and_then(|s| s.to_str()) else { continue };
                let target = p.to_string_lossy().into_owned();
                out.push(Item::new("app", "system", &target, name, target.clone()));
            }
        }
    }
    out
}

#[cfg(all(unix, not(target_os = "macos")))]
fn scan_system_apps() -> Vec<Item> {
    let mut roots = vec![PathBuf::from("/usr/share/applications")];
    if let Some(d) = dirs::data_dir() {
        roots.push(d.join("applications"));
    }
    let mut out = vec![];
    for root in roots {
        let Ok(rd) = fs::read_dir(&root) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().map(|x| x != "desktop").unwrap_or(true) {
                continue;
            }
            let Ok(text) = fs::read_to_string(&p) else { continue };
            let mut name = None;
            let mut hidden = false;
            let mut in_entry = false;
            for line in text.lines() {
                let line = line.trim();
                if line.starts_with('[') {
                    in_entry = line == "[Desktop Entry]";
                    continue;
                }
                if !in_entry {
                    continue;
                }
                if let Some(v) = line.strip_prefix("Name=") {
                    name.get_or_insert(v.to_string());
                }
                if line == "NoDisplay=true" || line == "Hidden=true" {
                    hidden = true;
                }
            }
            if let (Some(n), false) = (name, hidden) {
                let target = p.to_string_lossy().into_owned();
                out.push(Item::new("app", "system", &target, &n, target.clone()));
            }
        }
    }
    out
}

// ───────────────────────── Steam ─────────────────────────

/// Extrait les paires "clé" "valeur" d'une ligne au format VDF/ACF de Valve.
fn vdf_pair(line: &str) -> Option<(String, String)> {
    let mut parts = vec![];
    let mut cur = String::new();
    let mut in_q = false;
    let mut esc = false;
    for c in line.chars() {
        if in_q {
            if esc {
                cur.push(c);
                esc = false;
            } else if c == '\\' {
                esc = true;
            } else if c == '"' {
                in_q = false;
                parts.push(std::mem::take(&mut cur));
            } else {
                cur.push(c);
            }
        } else if c == '"' {
            in_q = true;
        }
    }
    if parts.len() == 2 {
        Some((parts[0].to_lowercase(), parts[1].clone()))
    } else {
        None
    }
}

fn steam_roots() -> Vec<PathBuf> {
    let mut v = vec![];
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        if let Ok(k) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Software\Valve\Steam") {
            if let Ok(p) = k.get_value::<String, _>("SteamPath") {
                v.push(PathBuf::from(p));
            }
        }
        v.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
    }
    #[cfg(target_os = "macos")]
    if let Some(h) = dirs::home_dir() {
        v.push(h.join("Library/Application Support/Steam"));
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    if let Some(h) = dirs::home_dir() {
        v.push(h.join(".local/share/Steam"));
        v.push(h.join(".steam/steam"));
    }
    v
}

pub fn scan_steam() -> Vec<Item> {
    let mut libs: Vec<PathBuf> = vec![];
    for root in steam_roots() {
        let lf = root.join("steamapps").join("libraryfolders.vdf");
        if !lf.exists() {
            continue;
        }
        libs.push(root.clone());
        if let Ok(text) = fs::read_to_string(&lf) {
            for line in text.lines() {
                if let Some((k, v)) = vdf_pair(line) {
                    if k == "path" {
                        libs.push(PathBuf::from(v));
                    }
                }
            }
        }
        break;
    }
    let mut seen = HashSet::new();
    let mut out = vec![];
    for lib in libs {
        let Ok(rd) = fs::read_dir(lib.join("steamapps")) else { continue };
        for e in rd.flatten() {
            let fname = e.file_name().to_string_lossy().into_owned();
            if !(fname.starts_with("appmanifest_") && fname.ends_with(".acf")) {
                continue;
            }
            let Ok(text) = fs::read_to_string(e.path()) else { continue };
            let (mut appid, mut name) = (None, None);
            for line in text.lines() {
                if let Some((k, v)) = vdf_pair(line) {
                    match k.as_str() {
                        "appid" if appid.is_none() => appid = Some(v),
                        "name" if name.is_none() => name = Some(v),
                        _ => {}
                    }
                }
            }
            let (Some(id), Some(n)) = (appid, name) else { continue };
            let l = n.to_lowercase();
            if id == "228980"
                || l.contains("steamworks")
                || l.contains("proton")
                || l.contains("steam linux runtime")
                || l.contains("redistributable")
            {
                continue;
            }
            if seen.insert(id.clone()) {
                out.push(Item::new("game", "steam", &id, &n, format!("steam://rungameid/{id}")));
            }
        }
    }
    out
}

// ───────────────────────── Epic Games ─────────────────────────

fn epic_manifest_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let pd = std::env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".into());
        return Some(PathBuf::from(pd).join(r"Epic\EpicGamesLauncher\Data\Manifests"));
    }
    #[cfg(target_os = "macos")]
    {
        return dirs::home_dir()
            .map(|h| h.join("Library/Application Support/Epic/EpicGamesLauncher/Data/Manifests"));
    }
    #[allow(unreachable_code)]
    None
}

pub fn scan_epic() -> Vec<Item> {
    let Some(dir) = epic_manifest_dir() else { return vec![] };
    let Ok(rd) = fs::read_dir(dir) else { return vec![] };
    let mut out = vec![];
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().map(|x| x != "item").unwrap_or(true) {
            continue;
        }
        let Ok(text) = fs::read_to_string(&p) else { continue };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else { continue };
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        if v.get("bIsIncompleteInstall").and_then(|x| x.as_bool()) == Some(true) {
            continue;
        }
        let (name, app, ns, cat) = (s("DisplayName"), s("AppName"), s("CatalogNamespace"), s("CatalogItemId"));
        if name.is_empty() || app.is_empty() {
            continue;
        }
        // Les manifestes de type « plugin » (ex. moteur Unreal) ne sont pas des jeux.
        let cats = v.get("AppCategories").map(|c| c.to_string().to_lowercase()).unwrap_or_default();
        if !cats.is_empty() && !cats.contains("games") {
            continue;
        }
        let url = format!(
            "com.epicgames.launcher://apps/{ns}%3A{cat}%3A{app}?action=launch&silent=true"
        );
        out.push(Item::new("game", "epic", &app, &name, url));
    }
    out
}

// ───────────────────────── GOG ─────────────────────────

#[cfg(target_os = "windows")]
pub fn scan_gog() -> Vec<Item> {
    use winreg::enums::*;
    use winreg::RegKey;
    let mut out = vec![];
    let Ok(games) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(r"SOFTWARE\WOW6432Node\GOG.com\Games")
    else {
        return out;
    };
    for key in games.enum_keys().flatten() {
        let Ok(k) = games.open_subkey(&key) else { continue };
        let name: String = k.get_value("gameName").unwrap_or_default();
        let exe: String = k.get_value("exe").unwrap_or_default();
        if name.is_empty() || exe.is_empty() || !Path::new(&exe).exists() {
            continue;
        }
        out.push(Item::new("game", "gog", &key, &name, exe));
    }
    out
}

#[cfg(not(target_os = "windows"))]
pub fn scan_gog() -> Vec<Item> {
    // Sous macOS, les jeux GOG sont des .app classiques : ils apparaissent dans les applications.
    let _ = Path::new("");
    vec![]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vdf_pairs() {
        assert_eq!(
            vdf_pair("\t\t\"path\"\t\t\"D:\\\\SteamLibrary\""),
            Some(("path".into(), "D:\\SteamLibrary".into()))
        );
        assert_eq!(vdf_pair("\t\"apps\""), None);
        assert_eq!(vdf_pair("{"), None);
    }

    #[test]
    fn filters_noise() {
        assert!(is_noise("Uninstall Foo"));
        assert!(is_noise("Désinstaller Bar"));
        assert!(!is_noise("Firefox"));
    }
}
