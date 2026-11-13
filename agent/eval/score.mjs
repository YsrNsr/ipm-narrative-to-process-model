// Scoreur du banc d'evaluation : compare un modele genere a un modele de
// reference par unites de contenu (decision 2 de la revision), et non par
// alignement positionnel. S'appuie sur l'appariement tolerant de
// src/editdistance.js : normalisation casse/accents, similarite Jaccard
// sur les mots completee d'un Dice sur bigrammes, seuil ajustable.
// Ordre de restitution des metriques : 1 rappel des metadonnees,
// 2 effort d'edition, 3 couverture acteurs/taches, 4 rattachement,
// 5 ratio de granularite (descriptif). Robustesse et latence (6, 7)
// sont renseignees par run.mjs a partir des informations de generation.

import { compareModels, matchLists, norm, similarity } from "../src/editdistance.js";
// La normalisation des durees vit dans src/duration.js (partagee avec le
// rendu de la barre de temps) ; reexportee ici pour les tests existants.
import { normalizeDuration } from "../src/duration.js";
export { normalizeDuration };

const prf = (matched, generated, expected) => {
  const precision = generated ? matched / generated : 0;
  const recall = expected ? matched / expected : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { matched, generated, expected, precision, recall, f1 };
};

// Un element attendu est rappele si un element du champ correspondant de
// la tache generee appariee lui est suffisamment similaire.
function recallOfList(expectedItems, generatedItems, threshold, acc) {
  expectedItems.forEach((e) => {
    acc.expected++;
    if ((generatedItems || []).some((g) => similarity(e, g) >= threshold)) acc.recalled++;
  });
}

function recallOfScalar(expectedValue, generatedValue, threshold, acc) {
  if (!norm(expectedValue)) return;
  acc.expected++;
  // pour un scalaire, une valeur non vide et similaire suffit
  if (norm(generatedValue) && similarity(expectedValue, generatedValue) >= threshold) acc.recalled++;
}

// Pour les durees : comparaison sur la valeur canonique en minutes si
// les deux expressions sont interpretables, similarite textuelle sinon.
function recallOfDuration(expectedValue, generatedValue, threshold, acc) {
  if (!norm(expectedValue)) return;
  acc.expected++;
  const de = normalizeDuration(expectedValue);
  const dg = normalizeDuration(generatedValue);
  if (de != null && dg != null) {
    if (de === dg) acc.recalled++;
  } else if (norm(generatedValue) && similarity(expectedValue, generatedValue) >= threshold) {
    acc.recalled++;
  }
}

// Separe valeurs attestees et deduites (v3) : la reference du corpus est
// annotee en fidelite stricte au texte, une valeur deduite y serait donc
// un faux positif. Les deduites sortent du modele compare (rappel et
// effort d'edition portent sur les seules attestees) et sont denombrees
// par categorie pour etre rapportees separement.
function splitAttested(model) {
  const counts = { documents: 0, donnees: 0, outils: 0, temps: 0, volumes: 0, frictions: 0, procedure: 0, opportunites: 0, total: 0 };
  const steps = (model.steps || []).map((s) => {
    const inf = s.inferred || {};
    const keepList = (items, flags, cat) => {
      const kept = [];
      (items || []).forEach((v, i) => {
        if (flags && flags[i]) { counts[cat]++; counts.total++; } else kept.push(v);
      });
      return kept;
    };
    const keepScalar = (v, flag, cat) => {
      if (v && flag) { counts[cat]++; counts.total++; return ""; }
      return v || "";
    };
    return {
      ...s,
      documents_in: keepList(s.documents_in, inf.documents_in, "documents"),
      documents_out: keepList(s.documents_out, inf.documents_out, "documents"),
      data_in: keepList(s.data_in, inf.data_in, "donnees"),
      data_out: keepList(s.data_out, inf.data_out, "donnees"),
      tools: keepList(s.tools, inf.tools, "outils"),
      duration: keepScalar(s.duration, inf.duration, "temps"),
      duration_min: keepScalar(s.duration_min, inf.duration_min, "temps"),
      duration_max: keepScalar(s.duration_max, inf.duration_max, "temps"),
      volume: keepScalar(s.volume, inf.volume, "volumes"),
      frequency: keepScalar(s.frequency, inf.frequency, "volumes"),
      friction: keepScalar(s.friction, inf.friction, "frictions"),
      procedure: keepScalar(s.procedure, inf.procedure, "procedure"),
      opportunity: keepScalar(s.opportunity, inf.opportunity, "opportunites")
    };
  });
  return { attested: { ...model, steps }, counts };
}

export function scoreModel(generatedRaw, expected, options = {}) {
  const threshold = options.threshold != null ? options.threshold : 0.4;
  const metaThreshold = options.metaThreshold != null ? options.metaThreshold : 0.3;

  const { attested: generated, counts: inferredCounts } = splitAttested(generatedRaw);
  const gSteps = generated.steps || [], eSteps = expected.steps || [];
  const tm = matchLists(gSteps, eSteps, threshold, (s) => s.label);
  const pairs = [...tm.exact, ...tm.renamed]; // [indexGenere, indexAttendu]
  const pairOfExpected = new Map(pairs.map(([g, e]) => [e, g]));

  // 1. Rappel des metadonnees par categorie. Les metadonnees des taches
  // de reference non appariees comptent comme manquees (denominateur).
  const cat = () => ({ expected: 0, recalled: 0 });
  const metadata = { documents: cat(), outils: cat(), temps: cat(), frictions: cat() };
  eSteps.forEach((es, e) => {
    const gs = pairOfExpected.has(e) ? gSteps[pairOfExpected.get(e)] : {};
    recallOfList(es.documents_in || [], gs.documents_in, metaThreshold, metadata.documents);
    recallOfList(es.documents_out || [], gs.documents_out, metaThreshold, metadata.documents);
    recallOfList(es.tools || [], gs.tools, metaThreshold, metadata.outils);
    recallOfDuration(es.duration, gs.duration, metaThreshold, metadata.temps);
    recallOfScalar(es.friction, gs.friction, metaThreshold, metadata.frictions);
  });
  Object.values(metadata).forEach((c) => { c.recall = c.expected ? c.recalled / c.expected : null; });

  // 2. Effort d'edition estime : transformer le modele genere en la
  // reference (added = omissions, removed = hallucinations).
  const editEffort = compareModels(generated, expected, { threshold });

  // 3. Couverture des acteurs et des taches par unites de contenu.
  const am = matchLists(generated.actors || [], expected.actors || [], threshold);
  const actorPairs = [...am.exact, ...am.renamed];
  const coverage = {
    actors: prf(actorPairs.length, (generated.actors || []).length, (expected.actors || []).length),
    tasks: prf(pairs.length, gSteps.length, eSteps.length)
  };

  // 4. Exactitude du rattachement tache -> acteur, sur les taches
  // appariees, en tenant compte des acteurs renommes.
  const actorMap = new Map();
  actorPairs.forEach(([g, e]) => actorMap.set(norm((generated.actors || [])[g]), norm((expected.actors || [])[e])));
  let attached = 0;
  pairs.forEach(([g, e]) => {
    const mapped = actorMap.get(norm(gSteps[g].actor)) || norm(gSteps[g].actor);
    if (mapped === norm(eSteps[e].actor)) attached++;
  });
  const attachment = { correct: attached, pairs: pairs.length, accuracy: pairs.length ? attached / pairs.length : null };

  // 5. Ratio de granularite, statistique descriptive et non penalite.
  const granularity = {
    generatedSteps: gSteps.length,
    expectedSteps: eSteps.length,
    ratio: eSteps.length ? gSteps.length / eSteps.length : null
  };

  return { metadata, editEffort, coverage, attachment, granularity, inferred: inferredCounts, threshold, metaThreshold };
}
