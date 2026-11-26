//! Index en mémoire des dossiers et fichiers, pour une recherche instantanée.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use walkdir::WalkDir;

const MAX_ENTRIES: usize = 500_000;
const MAX_DEPTH: usize = 8;

/// Dossiers ignorés : caches, dépendances, dossiers système.
const SKIP: &[&str] = &[
    "node_modules", "target", "__pycache__", "venv", ".venv", "AppData", "Library",
    "$Recycle.Bin", "System Volume Information", "Caches", "cache", "obj", "bin\\Debug",
];

struct Entry {
    name: String,
    lower: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize, Clone)]
pub struct FileHit {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct IndexStatus {
    pub count: usize,
    pub indexing: bool,
}

#[derive(Default)]
pub struct FileIndex {
    entries: RwLock<Vec<Entry>>,
    indexing: AtomicBool,
    generation: AtomicU64,
}

impl FileIndex {
    pub fn status(&self) -> IndexStatus {
        IndexStatus {
            count: self.entries.read().map(|e| e.len()).unwrap_or(0),
            indexing: self.indexing.load(Ordering::SeqCst),
        }
    }

    /// Relance l'indexation en arrière-plan. Une indexation en cours est abandonnée.
    pub fn rebuild(self: &Arc<Self>, roots: Vec<String>) {
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.indexing.store(true, Ordering::SeqCst);
        let me = Arc::clone(self);
        std::thread::spawn(move || {
            let mut out: Vec<Entry> = Vec::new();
            'roots: for root in roots {
                let walker = WalkDir::new(&root)
                    .max_depth(MAX_DEPTH)
                    .into_iter()
                    .filter_entry(|e| {
                        let n = e.file_name().to_string_lossy();
                        e.depth() == 0 || !(n.starts_with('.') || SKIP.contains(&n.as_ref()))
                    });
                for e in walker.flatten() {
                    if e.depth() == 0 {
                        continue;
                    }
                    if out.len() % 4096 == 0 && me.generation.load(Ordering::SeqCst) != gen {
                        return; // une indexation plus récente a pris le relais
                    }
                    let name = e.file_name().to_string_lossy().into_owned();
                    out.push(Entry {
                        lower: name.to_lowercase(),
                        name,
                        path: e.path().to_string_lossy().into_owned(),
                        is_dir: e.file_type().is_dir(),
                    });
                    if out.len() >= MAX_ENTRIES {
                        break 'roots;
                    }
                }
            }
            if me.generation.load(Ordering::SeqCst) == gen {
                if let Ok(mut w) = me.entries.write() {
                    *w = out;
                }
                me.indexing.store(false, Ordering::SeqCst);
            }
        });
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<FileHit> {
        let words: Vec<String> = query
            .to_lowercase()
            .split_whitespace()
            .map(String::from)
            .collect();
        if words.is_empty() {
            return vec![];
        }
        let Ok(entries) = self.entries.read() else { return vec![] };
        let first = &words[0];
        let mut hits: Vec<(u8, &Entry)> = entries
            .iter()
            .filter(|e| words.iter().all(|w| e.lower.contains(w.as_str())))
            .map(|e| {
                let mut score = if e.lower == *first {
                    0
                } else if e.lower.starts_with(first.as_str()) {
                    1
                } else {
                    2
                };
                if !e.is_dir {
                    score += 1;
                }
                (score, e)
            })
            .collect();
        hits.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.path.len().cmp(&b.1.path.len())));
        hits.into_iter()
            .take(limit)
            .map(|(_, e)| FileHit { name: e.name.clone(), path: e.path.clone(), is_dir: e.is_dir })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn indexes_and_ranks() {
        let tmp = std::env::temp_dir().join(format!("base-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("Factures/2026")).unwrap();
        fs::create_dir_all(tmp.join("node_modules/factures")).unwrap();
        fs::write(tmp.join("Factures/2026/facture-edf.pdf"), b"x").unwrap();
        fs::write(tmp.join("vieille facture.txt"), b"x").unwrap();

        let idx = Arc::new(FileIndex::default());
        idx.rebuild(vec![tmp.to_string_lossy().into_owned()]);
        for _ in 0..200 {
            if !idx.status().indexing {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let hits = idx.search("factur", 10);
        assert_eq!(hits[0].name, "Factures"); // dossier, préfixe → en premier
        assert!(hits.iter().all(|h| !h.path.contains("node_modules")));
        assert_eq!(idx.search("facture edf", 10).len(), 1);
        let _ = fs::remove_dir_all(&tmp);
    }
}
