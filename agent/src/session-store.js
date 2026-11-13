// Gestion disque du journal des sessions : chargement, persistance,
// corbeille et retention. La suppression n'efface jamais brutalement :
// le fichier part dans <dir>/corbeille/ (horodate), filet de securite ;
// vider ce dossier est l'effacement definitif (README). Module pur
// (chemins passes en parametre), teste hors ligne sur un repertoire
// temporaire — jamais sur le vrai logs/sessions/.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";

// Map id -> session depuis les .json du dossier (corrompus ignores ;
// le sous-dossier corbeille/ ne finit pas par .json, il est ignore)
export function loadSessions(dir) {
  mkdirSync(dir, { recursive: true });
  const sessions = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const s = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
      if (s && s.id) sessions.set(s.id, s);
    } catch (_) { /* fichier corrompu : ignore */ }
  }
  return sessions;
}

export function persistSession(dir, s) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${s.id}.json`), JSON.stringify(s, null, 2));
}

// Deplace une session en corbeille. Renvoie le nom du fichier cree,
// ou null si le fichier n'existait pas.
export function trashSession(dir, id, now = Date.now()) {
  const src = path.join(dir, `${id}.json`);
  if (!existsSync(src)) return null;
  const trashDir = path.join(dir, "corbeille");
  mkdirSync(trashDir, { recursive: true });
  // horodatage sans ':' (interdit dans les noms de fichiers Windows)
  const stamp = new Date(now).toISOString().slice(0, 19).replace(/:/g, "-");
  const name = `${stamp}_${id}.json`;
  renameSync(src, path.join(trashDir, name));
  return path.join("corbeille", name);
}

// Sessions plus anciennes que `days` jours (par createdAt), sans les
// deplacer : sert le recapitulatif de la purge avant confirmation.
export function listExpired(dir, days, now = Date.now()) {
  const limit = now - days * 86400e3;
  const expired = [];
  for (const [id, s] of loadSessions(dir)) {
    const t = Date.parse(s.createdAt || "");
    if (Number.isFinite(t) && t < limit) {
      expired.push({ id, createdAt: s.createdAt, process: (s.model && s.model.process) || "Processus" });
    }
  }
  return expired;
}

// Retention : deplace en corbeille les sessions expirees. Renvoie la
// liste des deplacements — l'appelant journalise, jamais de purge
// silencieuse.
export function applyRetention(dir, days, now = Date.now()) {
  const moved = [];
  for (const e of listExpired(dir, days, now)) {
    const file = trashSession(dir, e.id, now);
    if (file) moved.push({ ...e, file });
  }
  return moved;
}
