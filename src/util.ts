const PALETTE = ["#8AA8FF", "#F2A65A", "#6FD39B", "#A99BFF", "#C7A6FF", "#FF9B8A", "#F5C26B", "#9FB3C8", "#7FD1D8", "#FFB86B"];

export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const ROMAN: Record<string, string> = { II: "2", III: "3", IV: "4", V: "5", VI: "6", VII: "7", VIII: "8", IX: "9", X: "10" };

/** « Baldur's Gate 3 » → « BG3 », « Hades II » → « H2 », « Firefox » → « Fi ». */
export function initials(name: string): string {
  const words = name
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const isNum = (w: string) => /^\d+$/.test(w) || w in ROMAN;
  const num = words.slice(1).find(isNum);
  const letters = words.filter((w) => !isNum(w));
  const suffix = num ? (ROMAN[num] ?? num).slice(0, 2) : "";
  if (letters.length === 0) return words[0].slice(0, 3);
  if (letters.length === 1) {
    const w = letters[0];
    return suffix ? w[0].toUpperCase() + suffix : w[0].toUpperCase() + (w[1] ?? "");
  }
  return letters[0][0].toUpperCase() + letters[1][0].toUpperCase() + suffix;
}

export function timeAgo(ms: number): string {
  if (!ms) return "";
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d} jours`;
  if (d < 31) return `il y a ${Math.floor(d / 7)} sem.`;
  if (d < 365) return `il y a ${Math.floor(d / 30)} mois`;
  return `il y a ${Math.floor(d / 365)} an${d >= 730 ? "s" : ""}`;
}

export function shortPath(path: string, home: string): string {
  if (home && path.startsWith(home)) return "~" + path.slice(home.length);
  return path;
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export const SOURCE_LABEL: Record<string, string> = {
  system: "Application",
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  custom: "Ajout perso",
};

/** Transforme un raccourci au format Tauri en texte lisible. */
export function prettyShortcut(acc: string, os: string): string {
  return acc
    .split("+")
    .map((k) => {
      if (k === "CommandOrControl" || k === "CmdOrCtrl") return os === "macos" ? "⌘" : "Ctrl";
      if (k === "Shift") return os === "macos" ? "⇧" : "Maj";
      if (k === "Alt") return os === "macos" ? "⌥" : "Alt";
      if (k === "Space") return "Espace";
      return k;
    })
    .join(os === "macos" ? " " : " + ");
}

/** Construit un raccourci au format Tauri depuis un événement clavier. */
export function shortcutFromEvent(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  else if (e.code === "Space") key = "Space";
  if (!key || mods.length === 0) return null;
  return [...mods, key].join("+");
}

export function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 18) return "Bonjour";
  return "Bonsoir";
}
