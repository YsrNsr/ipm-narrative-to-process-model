// Aide a l'anonymisation avant envoi cloud : detection NAIVE, cote
// client, de candidats a remplacer. Aucune requete reseau. C'est une
// aide, pas une garantie : l'utilisateur relit et decide terme par
// terme. Module pur (sans DOM), importable par les tests Node.

// mots courants en debut de phrase a ne pas prendre pour des noms
const COMMON = new Set([
  "le", "la", "les", "un", "une", "des", "il", "elle", "ils", "elles", "on",
  "je", "tu", "nous", "vous", "ce", "cette", "ces", "mon", "ma", "mes",
  "quand", "si", "mais", "donc", "or", "ni", "car", "puis", "ensuite",
  "alors", "apres", "avant", "chaque", "tout", "toute", "tous", "toutes",
  "voila", "bon", "bref", "enfin", "du", "au", "aux", "en", "dans", "pour",
  "par", "avec", "sans", "sous", "sur", "lundi", "mardi", "mercredi",
  "jeudi", "vendredi", "samedi", "dimanche", "monsieur", "madame"
]);

const strip = (w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Detecte les candidats dans un texte :
// - adresses mail et numeros de telephone (motifs),
// - mots capitalises repetes dont au moins une occurrence n'est PAS en
//   debut de phrase (indice d'un nom propre),
// - sigles en capitales (2 lettres et plus), traites comme des systemes.
// Renvoie [{ term, kind, count, replacement }].
export function detectSensitive(texts) {
  const all = Array.isArray(texts) ? texts.join("\n\n") : String(texts || "");
  const found = new Map();
  const add = (term, kind) => {
    const k = `${kind}|${term}`;
    if (!found.has(k)) found.set(k, { term, kind, count: 0 });
    found.get(k).count++;
  };
  for (const m of all.matchAll(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi)) add(m[0], "email");
  for (const m of all.matchAll(/(?:\+\d{2}[\s.]?|0)\d{2}(?:[\s.]?\d{2,3}){3,4}/g)) add(m[0].trim(), "telephone");
  // positions de debut de phrase : apres . ! ? ou saut de ligne
  const sentenceStarts = new Set([0]);
  for (const m of all.matchAll(/[.!?\n]\s*/g)) sentenceStarts.add(m.index + m[0].length);
  const capOcc = new Map(); // mot -> { total, horsDebut }
  for (const m of all.matchAll(/\b[A-ZÀ-Þ][a-zà-þ'’-]{2,}\b/g)) {
    const w = m[0];
    if (COMMON.has(strip(w))) continue;
    const e = capOcc.get(w) || { total: 0, horsDebut: 0 };
    e.total++;
    if (!sentenceStarts.has(m.index)) e.horsDebut++;
    capOcc.set(w, e);
  }
  for (const [w, e] of capOcc) {
    if (e.total >= 2 && e.horsDebut >= 1) { add(w, "nom"); found.get(`nom|${w}`).count = e.total; }
  }
  for (const m of all.matchAll(/\b[A-Z]{2,}[0-9]*\b/g)) add(m[0], "sigle");
  // remplacements proposes : Personne A, B... pour les noms, Systeme 1,
  // 2... pour les sigles, [email]/[telephone] pour les motifs
  const items = [...found.values()].filter((x) => x.count >= (x.kind === "sigle" ? 2 : 1));
  let p = 0, s = 0;
  const letter = (n) => String.fromCharCode(65 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : "");
  for (const it of items) {
    if (it.kind === "nom") it.replacement = `Personne ${letter(p++)}`;
    else if (it.kind === "sigle") it.replacement = `Système ${++s}`;
    else if (it.kind === "email") it.replacement = "[adresse mail]";
    else it.replacement = "[téléphone]";
  }
  return items;
}

// Applique un remplacement (toutes occurrences exactes) dans un texte.
export function applyReplacement(text, term, replacement) {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // limites de mot pour les termes alphanumeriques ; un point n'est
  // bloquant que s'il est suivi d'un caractere de mot (adresse plus
  // longue), pas quand c'est la ponctuation de fin de phrase
  const re = /^[\w@.+-]+$/.test(term)
    ? new RegExp(`(?<![\\w@.-])${esc}(?![\\w@-])(?!\\.[\\w])`, "g")
    : new RegExp(esc, "g");
  return text.replace(re, replacement);
}
