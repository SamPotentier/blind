#!/usr/bin/env node
// Publie une nouvelle version de Base.
//
//   npm run release            → 0.1.0 devient 0.1.1
//   npm run release -- minor   → 0.1.0 devient 0.2.0
//   npm run release -- major   → 0.1.0 devient 1.0.0
//   npm run release -- 1.4.2   → version exacte
//
// Met à jour le numéro de version partout, crée le commit et le tag, puis pousse.
// GitHub Actions compile ensuite les installateurs et publie la Release :
// les apps installées proposent alors la mise à jour.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const sh = (cmd) => execSync(cmd, { stdio: "inherit" });
const out = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

if (out("git status --porcelain")) {
  console.error("Des modifications ne sont pas commitées. Commitez-les avant de publier.");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);
const arg = process.argv[2] ?? "patch";
const next =
  arg === "major" ? `${maj + 1}.0.0`
  : arg === "minor" ? `${maj}.${min + 1}.0`
  : arg === "patch" ? `${maj}.${min}.${pat + 1}`
  : arg;
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`Version invalide : ${arg}`);
  process.exit(1);
}

sh(`npm version ${next} --no-git-tag-version`);

const conf = "src-tauri/tauri.conf.json";
const c = JSON.parse(readFileSync(conf, "utf8"));
c.version = next;
writeFileSync(conf, JSON.stringify(c, null, 2) + "\n");

const cargo = "src-tauri/Cargo.toml";
writeFileSync(cargo, readFileSync(cargo, "utf8").replace(/^version = ".*"$/m, `version = "${next}"`));
// Met Cargo.lock à jour pour le paquet « base » uniquement.
sh("cargo update -p base --offline --manifest-path src-tauri/Cargo.toml");

sh(`git add package.json package-lock.json ${conf} ${cargo} src-tauri/Cargo.lock`);
sh(`git commit -m "Version ${next}"`);
sh(`git tag v${next}`);
sh("git push");
sh(`git push origin v${next}`);

console.log(`\nVersion ${next} envoyée. Suivez la compilation dans l'onglet Actions du dépôt GitHub.`);
