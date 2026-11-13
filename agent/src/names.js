// Noms : pages du fichier Draw.io, nom effectif d'une session et noms
// de fichiers exportes. Module pur, sans dependance, teste hors ligne.

// Noms de pages composables, dans l'ordre fixe du registre du
// composeur (src/drawio.js). Unique source de verite pour les routes.
export const PAGE_NAMES = ["Makigami", "Processus", "BPMN", "RACI", "SIPOC", "Analyse"];

// Nom effectif d'une session : le nom personnalise (renommage) prime
// sur le nom de processus extrait par le modele.
export function sessionName(s) {
  return (s && s.name && String(s.name).trim())
    || (s && s.model && s.model.process)
    || "Processus";
}

// Nom de fichier sur : minuscules sans accents, mots separes par des
// tirets, ASCII pur (aucun probleme d'encodage dans l'en-tete
// Content-Disposition), longueur bornee. Vide -> "processus".
export function slugify(name) {
  const s = String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return s || "processus";
}

// Sous-ensemble de pages demande en parametre d'URL ("BPMN,SIPOC") :
// resolution insensible a la casse contre les noms connus, pages
// inconnues ignorees, doublons fusionnes. Parametre absent ou vide ->
// repli fourni ; toutes inconnues -> [] (l'appelant repond 400).
export function resolvePages(param, fallback) {
  const asked = String(param || "").split(",").map((p) => p.trim()).filter(Boolean);
  if (!asked.length) return fallback;
  const byLower = new Map(PAGE_NAMES.map((n) => [n.toLowerCase(), n]));
  const found = [];
  for (const a of asked) {
    const n = byLower.get(a.toLowerCase());
    if (n && !found.includes(n)) found.push(n);
  }
  return found;
}
