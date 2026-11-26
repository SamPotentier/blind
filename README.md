# Base

Un lanceur qui remplace le bureau, pour Windows et macOS. Il s'ouvre au démarrage et regroupe :

- **Applications** : détectées automatiquement (menu Démarrer sous Windows, dossier Applications sous macOS).
- **Jeux** : Steam, Epic Games et GOG détectés automatiquement, plus n'importe quel jeu ou émulateur ajouté à la main.
- **Projets perso** : un dossier par projet, ouvert en un clic dans l'éditeur, l'explorateur ou un terminal, avec une note « prochaine étape ».
- **Notes** : de simples fichiers Markdown (par défaut dans `Documents/Base/notes`), faciles à synchroniser avec un cloud.
- **Recherche** : une seule barre pour les apps, les jeux, les projets, les notes, et les fichiers et dossiers des emplacements indexés.

## Utilisation

| Action | Raccourci |
| --- | --- |
| Afficher ou cacher Base depuis n'importe où | `Ctrl + Maj + Espace` (Windows) / `⌘ ⇧ Espace` (macOS), modifiable dans Réglages |
| Chercher | Tapez directement, ou `Ctrl/⌘ + K` |
| Naviguer dans les résultats | `↑` `↓` puis `Entrée` |
| Effacer la recherche | `Échap` |

- Fermer la fenêtre la **cache** seulement : Base reste disponible avec le raccourci et l'icône près de l'horloge (clic droit › Quitter pour la fermer vraiment).
- Survolez une app ou un jeu pour l'**épingler** dans le menu de gauche ou le **masquer** (réaffichable dans Réglages).
- Réglages › **Masquer les icônes du bureau** : le bureau du système n'affiche plus rien. Le changement est réversible et redémarre l'Explorateur (Windows) ou le Finder (macOS) quelques secondes.

## Installation

Les installateurs sont produits par GitHub Actions (`.github/workflows/build.yml`) :

- à chaque push sur `main` : onglet **Actions** › dernier run › **Artifacts** (`base-Windows`, `base-macOS`) ;
- en poussant un tag, par exemple `git tag v0.1.0 && git push --tags` : un brouillon de **Release** est créé avec les fichiers.

L'app n'est pas signée par un certificat payant. Au premier lancement :

- **Windows** : si SmartScreen affiche « Windows a protégé votre ordinateur », cliquez sur *Informations complémentaires* › *Exécuter quand même*.
- **macOS** : glissez Base dans Applications, puis faites clic droit › *Ouvrir* › *Ouvrir*. Si macOS dit que l'app est « endommagée », lancez une fois dans le Terminal :
  ```bash
  xattr -cr /Applications/Base.app
  ```

## Développement

Il faut [Node.js](https://nodejs.org) 20+ et [Rust](https://rustup.rs), plus les [prérequis Tauri](https://tauri.app/start/prerequisites/) de votre système.

```bash
npm install
npm run tauri dev      # lance l'app en mode développement
npm run tauri build    # produit l'installateur pour le système courant
cargo test --manifest-path src-tauri/Cargo.toml
```

Organisation :

- `src/` : l'interface (React + TypeScript). `App.tsx` gère la structure, `views/` contient un fichier par écran.
- `src-tauri/src/` : le cœur en Rust.
  - `items.rs` : détection des apps et des jeux.
  - `files.rs` : index de recherche des fichiers.
  - `notes.rs` : notes Markdown.
  - `system.rs` : lancement des apps, ouverture des dossiers, éditeur, terminal, icônes du bureau.
  - `lib.rs` : fenêtre, icône de la zone de notification, raccourci global, lancement au démarrage.
- Réglages enregistrés dans `config.json` du dossier de configuration de l'app (`%APPDATA%\app.base.launcher` sous Windows, `~/Library/Application Support/app.base.launcher` sous macOS).
