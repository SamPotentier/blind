// Pas de console noire derrière l'app sous Windows en release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    base_lib::run()
}
