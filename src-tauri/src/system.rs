//! Actions système : lancer, ouvrir un dossier, un éditeur, un terminal, masquer les icônes du bureau.

use std::path::Path;
use std::process::Command;

use crate::items::Item;

#[cfg(target_os = "windows")]
fn hidden(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW)
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
fn hidden(cmd: &mut Command) -> &mut Command {
    cmd
}

fn spawn(cmd: &mut Command) -> Result<(), String> {
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

pub fn open_path(target: &str) -> Result<(), String> {
    open::that_detached(target).map_err(|e| format!("Impossible d'ouvrir {target} : {e}"))
}

/// Lance un exécutable dans son propre dossier (beaucoup de jeux en ont besoin).
fn run_exe(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    let mut cmd = Command::new(p);
    if let Some(dir) = p.parent() {
        cmd.current_dir(dir);
    }
    spawn(&mut cmd)
}

pub fn launch(item: &Item) -> Result<(), String> {
    let t = item.target.as_str();
    let is_exe = t.to_lowercase().ends_with(".exe");
    match item.source.as_str() {
        "gog" => run_exe(t),
        "custom" if is_exe => run_exe(t),
        #[cfg(all(unix, not(target_os = "macos")))]
        "system" if t.ends_with(".desktop") => {
            let stem = Path::new(t).file_stem().and_then(|s| s.to_str()).unwrap_or_default();
            spawn(Command::new("gtk-launch").arg(stem))
        }
        _ => open_path(t),
    }
}

pub fn open_in_editor(path: &str, editor: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // `code` n'est souvent pas dans le PATH des apps graphiques : on passe par `open -a`.
        return spawn(Command::new("open").args(["-a", editor, path]));
    }
    #[cfg(target_os = "windows")]
    {
        // `code` est un script .cmd : il faut passer par cmd.exe.
        return spawn(hidden(Command::new("cmd").args(["/C", editor, path])));
    }
    #[allow(unreachable_code)]
    spawn(Command::new(editor).arg(path))
}

pub fn open_terminal(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return spawn(Command::new("open").args(["-a", "Terminal", path]));
    }
    #[cfg(target_os = "windows")]
    {
        // Windows Terminal s'il est installé, sinon l'invite de commandes classique.
        if Command::new("wt").args(["-d", path]).spawn().is_ok() {
            return Ok(());
        }
        return spawn(
            Command::new("cmd").args(["/C", "start", "", "cmd", "/K", "cd", "/d", path]),
        );
    }
    #[allow(unreachable_code)]
    {
        for (bin, flag) in [
            ("x-terminal-emulator", "--working-directory"),
            ("gnome-terminal", "--working-directory"),
            ("konsole", "--workdir"),
        ] {
            if Command::new(bin).arg(flag).arg(path).spawn().is_ok() {
                return Ok(());
            }
        }
        Err("Aucun terminal trouvé".into())
    }
}

/// Affiche ou masque les icônes du bureau du système.
pub fn set_desktop_icons_hidden(hide: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
            .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced")
            .map_err(|e| e.to_string())?;
        key.set_value("HideIcons", &(hide as u32)).map_err(|e| e.to_string())?;
        // L'Explorateur doit redémarrer pour appliquer le changement (la barre des tâches clignote).
        let _ = hidden(Command::new("taskkill").args(["/f", "/im", "explorer.exe"])).status();
        return spawn(&mut Command::new("explorer.exe"));
    }
    #[cfg(target_os = "macos")]
    {
        let v = if hide { "false" } else { "true" };
        Command::new("defaults")
            .args(["write", "com.apple.finder", "CreateDesktop", "-bool", v])
            .status()
            .map_err(|e| e.to_string())?;
        return spawn(Command::new("killall").arg("Finder"));
    }
    #[allow(unreachable_code)]
    {
        let _ = hide;
        Err("Non pris en charge sur ce système".into())
    }
}

/// Devine la techno principale d'un dossier projet.
pub fn detect_stack(path: &Path) -> String {
    let has = |f: &str| path.join(f).exists();
    let any_ext = |ext: &str| {
        std::fs::read_dir(path)
            .map(|rd| {
                rd.flatten()
                    .any(|e| e.path().extension().map(|x| x == ext).unwrap_or(false))
            })
            .unwrap_or(false)
    };
    if has("project.godot") {
        "Godot"
    } else if has("Cargo.toml") {
        "Rust"
    } else if has("package.json") {
        if has("next.config.js") || has("next.config.mjs") || has("next.config.ts") {
            "Next.js"
        } else if has("tsconfig.json") {
            "TypeScript"
        } else {
            "JavaScript"
        }
    } else if has("pyproject.toml") || has("requirements.txt") || any_ext("py") {
        "Python"
    } else if has("go.mod") {
        "Go"
    } else if any_ext("sln") || any_ext("csproj") {
        "C#"
    } else if has("pom.xml") || has("build.gradle") || has("build.gradle.kts") {
        "Java"
    } else if has("ProjectSettings") && has("Assets") {
        "Unity"
    } else if any_ext("uproject") {
        "Unreal"
    } else if has("CMakeLists.txt") {
        "C/C++"
    } else if has("configuration.yaml") {
        "Home Assistant"
    } else if has("index.html") {
        "Web"
    } else {
        ""
    }
    .into()
}

/// Date de dernière modification d'un projet : le plus récent des éléments de premier niveau.
pub fn last_modified(path: &Path) -> u64 {
    use std::time::UNIX_EPOCH;
    let ms = |m: std::fs::Metadata| {
        m.modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    };
    let mut best = std::fs::metadata(path).map(ms).unwrap_or(0);
    if let Ok(rd) = std::fs::read_dir(path) {
        for e in rd.flatten() {
            let n = e.file_name();
            let n = n.to_string_lossy();
            if n == "node_modules" || n == "target" || n == ".git" {
                continue;
            }
            if let Ok(m) = e.metadata() {
                best = best.max(ms(m));
            }
        }
    }
    best
}
