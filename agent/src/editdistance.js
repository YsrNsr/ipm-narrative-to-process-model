// Mesure d'effort d'edition entre le modele initial (genere) et le
// modele final (apres relecture et correction). Metrique de tete du
// chapitre d'evaluation : elle operationnalise le principe de relecture
// et correction (PC8) en comptant ce que
// l'utilisateur a du ajouter (omissions), supprimer (hallucinations) et
// renommer, par categorie (acteurs, taches, metadonnees).
// L'appariement est tolerant : casse, accents et espaces normalises,
// similarite de Jaccard sur les mots pour reperer les renommages.

export const norm = (s) => String(s == null ? "" : s)
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\s+/g, " ")
  .trim();

function jaccardWords(a, b) {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}

// Coefficient de Dice sur les bigrammes de caracteres : capte les
// renommages d'un seul mot (ex: "clientele" -> "client") que le Jaccard
// sur les mots ne voit pas.
function diceBigrams(a, b) {
  const grams = (s) => {
    const t = norm(s);
    const g = new Set();
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  const A = grams(a), B = grams(b);
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((g) => { if (B.has(g)) inter++; });
  return (2 * inter) / (A.size + B.size);
}

export const similarity = (a, b) => Math.max(jaccardWords(a, b), diceBigrams(a, b));

// Apparie deux listes de chaines : d'abord les correspondances exactes
// (apres normalisation), puis les similaires (renommages, similarite
// maximale d'abord), le reste etant supprime (initial) ou ajoute (final).
// keyOf permet d'apparier des objets par un de leurs champs.
export function matchLists(initial, final, threshold, keyOf = (x) => x) {
  const usedI = new Set(), usedF = new Set();
  const exact = [], renamed = [];
  initial.forEach((vi, i) => {
    const j = final.findIndex((vf, k) => !usedF.has(k) && norm(keyOf(vf)) === norm(keyOf(vi)));
    if (j >= 0) { usedI.add(i); usedF.add(j); exact.push([i, j]); }
  });
  const candidates = [];
  initial.forEach((vi, i) => {
    if (usedI.has(i)) return;
    final.forEach((vf, j) => {
      if (usedF.has(j)) return;
      const sim = similarity(keyOf(vi), keyOf(vf));
      if (sim >= threshold) candidates.push([sim, i, j]);
    });
  });
  candidates.sort((a, b) => b[0] - a[0]);
  candidates.forEach(([, i, j]) => {
    if (usedI.has(i) || usedF.has(j)) return;
    usedI.add(i); usedF.add(j);
    renamed.push([i, j]);
  });
  const removed = initial.map((_, i) => i).filter((i) => !usedI.has(i));
  const added = final.map((_, j) => j).filter((j) => !usedF.has(j));
  return { exact, renamed, removed, added };
}

// Comparaison de deux valeurs scalaires (duree, friction).
function scalarDiff(a, b, acc) {
  const na = norm(a), nb = norm(b);
  if (!na && nb) acc.added++;
  else if (na && !nb) acc.removed++;
  else if (na && nb && na !== nb) acc.renamed++;
}

// Comparaison de deux listes de chaines (documents, outils).
function listDiff(a, b, threshold, acc) {
  const m = matchLists(a || [], b || [], threshold);
  acc.added += m.added.length;
  acc.removed += m.removed.length;
  acc.renamed += m.renamed.length;
}

// Detail lisible de la comparaison : listes nommees (ajouts,
// suppressions, renommages, reattributions) destinees a l'affichage
// dans l'historique. Ne remplace pas compareModels (qui compte), le
// complete pour montrer QUOI a change.
export function diffDetails(initial, final, options = {}) {
  const threshold = options.threshold != null ? options.threshold : 0.4;
  const ai = initial.actors || [], af = final.actors || [];
  const am = matchLists(ai, af, threshold);
  const actorMap = new Map();
  [...am.exact, ...am.renamed].forEach(([i, j]) => actorMap.set(norm(ai[i]), norm(af[j])));
  const si = initial.steps || [], sf = final.steps || [];
  const tm = matchLists(si, sf, threshold, (s) => s.label);
  const reassigned = [];
  [...tm.exact, ...tm.renamed].forEach(([i, j]) => {
    const expected = actorMap.get(norm(si[i].actor)) || norm(si[i].actor);
    if (expected !== norm(sf[j].actor)) reassigned.push([sf[j].label, si[i].actor, sf[j].actor]);
  });
  return {
    actors: {
      added: am.added.map((j) => af[j]),
      removed: am.removed.map((i) => ai[i]),
      renamed: am.renamed.map(([i, j]) => [ai[i], af[j]])
    },
    tasks: {
      added: tm.added.map((j) => sf[j].label),
      removed: tm.removed.map((i) => si[i].label),
      renamed: tm.renamed.map(([i, j]) => [si[i].label, sf[j].label]),
      reassigned
    }
  };
}

export function compareModels(initial, final, options = {}) {
  const threshold = options.threshold != null ? options.threshold : 0.4;
  const result = {
    actors: { added: 0, removed: 0, renamed: 0 },
    tasks: { added: 0, removed: 0, renamed: 0, reassigned: 0 },
    metadata: { added: 0, removed: 0, renamed: 0 }
  };

  // Acteurs
  const ai = initial.actors || [], af = final.actors || [];
  const am = matchLists(ai, af, threshold);
  result.actors.added = am.added.length;
  result.actors.removed = am.removed.length;
  result.actors.renamed = am.renamed.length;
  // correspondance initial -> final, pour que le renommage d'un acteur ne
  // compte pas ses taches comme reattribuees
  const actorMap = new Map();
  [...am.exact, ...am.renamed].forEach(([i, j]) => actorMap.set(norm(ai[i]), norm(af[j])));

  // Taches : appariement par libelle ; un acteur different sur une tache
  // appariee compte comme une reattribution.
  const si = initial.steps || [], sf = final.steps || [];
  const tm = matchLists(si, sf, threshold, (s) => s.label);
  result.tasks.added = tm.added.length;
  result.tasks.removed = tm.removed.length;
  result.tasks.renamed = tm.renamed.length;
  const pairs = [...tm.exact, ...tm.renamed];
  pairs.forEach(([i, j]) => {
    const expected = actorMap.get(norm(si[i].actor)) || norm(si[i].actor);
    if (expected !== norm(sf[j].actor)) result.tasks.reassigned++;
  });

  // Metadonnees : comparees uniquement sur les taches appariees, pour ne
  // pas compter deux fois l'effort des taches ajoutees ou supprimees.
  pairs.forEach(([i, j]) => {
    listDiff(si[i].documents_in, sf[j].documents_in, 0.5, result.metadata);
    listDiff(si[i].documents_out, sf[j].documents_out, 0.5, result.metadata);
    listDiff(si[i].tools, sf[j].tools, 0.5, result.metadata);
    scalarDiff(si[i].duration, sf[j].duration, result.metadata);
    scalarDiff(si[i].friction, sf[j].friction, result.metadata);
  });

  result.total =
    result.actors.added + result.actors.removed + result.actors.renamed +
    result.tasks.added + result.tasks.removed + result.tasks.renamed + result.tasks.reassigned +
    result.metadata.added + result.metadata.removed + result.metadata.renamed;
  return result;
}
