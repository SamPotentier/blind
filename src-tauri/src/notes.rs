//! Notes stockées en fichiers Markdown, un fichier par note.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize, Clone, Debug)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: String,
    pub modified: u64,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn file_for(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("identifiant de note invalide".into());
    }
    Ok(dir.join(format!("{id}.md")))
}

fn parse(id: &str, text: &str, modified: u64) -> Note {
    let text = text.replace("\r\n", "\n");
    let (title, body) = match text.split_once('\n') {
        Some((first, rest)) if first.starts_with("# ") => {
            (first[2..].trim().to_string(), rest.trim_start_matches('\n').to_string())
        }
        None if text.starts_with("# ") => (text[2..].trim().to_string(), String::new()),
        _ => (id.to_string(), text.clone()),
    };
    Note { id: id.into(), title, body, modified }
}

fn mtime(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn list(dir: &Path) -> Vec<Note> {
    let Ok(rd) = fs::read_dir(dir) else { return vec![] };
    let mut notes: Vec<Note> = rd
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.extension().map(|x| x != "md").unwrap_or(true) {
                return None;
            }
            let id = p.file_stem()?.to_str()?.to_string();
            if !valid_id(&id) {
                return None;
            }
            let text = fs::read_to_string(&p).ok()?;
            Some(parse(&id, &text, mtime(&p)))
        })
        .collect();
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    notes
}

pub fn save(dir: &Path, id: &str, title: &str, body: &str) -> Result<Note, String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let p = file_for(dir, id)?;
    let title = title.replace('\n', " ");
    let content = format!("# {}\n\n{}", title.trim(), body);
    fs::write(&p, &content).map_err(|e| e.to_string())?;
    Ok(parse(id, &content, mtime(&p)))
}

pub fn create(dir: &Path) -> Result<Note, String> {
    let id = format!("note-{}", chrono::Local::now().format("%Y%m%d-%H%M%S-%3f"));
    save(dir, &id, "Nouvelle note", "")
}

pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    let p = file_for(dir, id)?;
    fs::remove_file(p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let dir = std::env::temp_dir().join(format!("base-notes-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let n = create(&dir).unwrap();
        save(&dir, &n.id, "Idées", "- un\n- deux").unwrap();
        let all = list(&dir);
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].title, "Idées");
        assert_eq!(all[0].body, "- un\n- deux");
        assert!(save(&dir, "../evil", "x", "y").is_err());
        delete(&dir, &n.id).unwrap();
        assert!(list(&dir).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
