// Fusion de plusieurs modeles extraits de transcriptions decrivant le
// meme processus (un entretien par personne, chacun sur son perimetre).
// Appariement des etapes par similarite de libelle en REUTILISANT
// matchLists (src/editdistance.js), union des metadonnees, chaque
// valeur gardant la trace de sa source. Les contradictions entre
// sources (durees incompatibles, responsables differents) sont
// SIGNALEES, jamais tranchees silencieusement : les deux valeurs sont
// conservees cote a cote et la liste des conflits accompagne le modele.

import { matchLists, norm, similarity } from "./editdistance.js";
import { normalizeDuration } from "./duration.js";

const LIST_FIELDS = ["documents_in", "documents_out", "data_in", "data_out", "tools"];
const SCALAR_FIELDS = ["duration", "duration_min", "duration_max", "volume", "frequency", "friction", "procedure", "opportunity"];
const DURATION_FIELDS = new Set(["duration", "duration_min", "duration_max"]);

// etiquette la source de chaque etape et de sa provenance
function tagSource(model, name) {
  for (const s of model.steps || []) {
    s.sources = [name];
    const prov = s.provenance || {};
    if (prov.label) prov.label.source = name;
    for (const f of LIST_FIELDS) (prov[f] || []).forEach((p) => { if (p) p.source = name; });
    for (const f of SCALAR_FIELDS) { if (prov[f]) prov[f].source = name; }
  }
}

// fusionne l'etape b (autre source) dans l'etape a (base)
function mergeStep(a, b, sourceB, conflicts) {
  a.inferred = a.inferred || {};
  a.provenance = a.provenance || {};
  const bInf = b.inferred || {};
  const bProv = b.provenance || {};
  const sourceA = (a.sources || [])[0] || "source 1";
  a.sources = [...new Set([...(a.sources || []), ...(b.sources || [])])];
  const note = (t) => { conflicts.push(t); (a.conflictNotes = a.conflictNotes || []).push(t); a.conflict = true; };
  // responsable different : contradiction a arbitrer par le metier
  if (norm(a.actors[0]) !== norm(b.actors[0])) {
    note(`[${a.label}] responsable : « ${a.actors[0]} » (${sourceA}) ≠ « ${b.actors[0]} » (${sourceB})`);
  }
  b.actors.forEach((x) => { if (!a.actors.some((y) => norm(y) === norm(x))) a.actors.push(x); });
  a.actor = a.actors[0];
  // listes : union dedupliquee, drapeaux et provenance suivent
  for (const f of LIST_FIELDS) {
    const flags = a.inferred[f] = a.inferred[f] || [];
    const prov = a.provenance[f] = a.provenance[f] || [];
    (b[f] || []).forEach((v, i) => {
      if (!v || a[f].some((x) => norm(x) === norm(v))) return;
      a[f].push(v);
      flags[a[f].length - 1] = !!(bInf[f] || [])[i];
      prov[a[f].length - 1] = (bProv[f] || [])[i] || null;
    });
  }
  // scalaires : la base vide prend la valeur de l'autre source ; deux
  // valeurs non equivalentes sont conservees cote a cote et signalees
  for (const f of SCALAR_FIELDS) {
    const va = a[f], vb = b[f];
    if (!vb) continue;
    if (!va) {
      a[f] = vb;
      a.inferred[f] = !!bInf[f];
      a.provenance[f] = bProv[f] || null;
      continue;
    }
    let same = norm(va) === norm(vb);
    if (!same && DURATION_FIELDS.has(f)) {
      const da = normalizeDuration(va), db = normalizeDuration(vb);
      if (da != null && da === db) same = true;
    }
    if (!same) {
      note(`[${a.label}] ${f} : « ${va} » (${sourceA}) ≠ « ${vb} » (${sourceB})`);
      a[f] = `${va} / ${vb}`;
    }
  }
  if (b.automated !== a.automated && b.sources) {
    note(`[${a.label}] automatisation : ${a.automated ? "oui" : "non"} (${sourceA}) ≠ ${b.automated ? "oui" : "non"} (${sourceB})`);
  }
  if (!a.decision && b.decision) a.decision = b.decision;
}

// Fusionne des modeles normalises ; sources est la liste des noms de
// transcriptions (defaut : entretien 1, 2, ...).
export function mergeModels(models, sources = [], options = {}) {
  if (!models.length) throw new Error("Aucun modele a fusionner.");
  // seuil volontairement plus exigeant que celui du scoreur : fusionner
  // a tort deux etapes distinctes est pire que de les laisser separees
  const threshold = options.threshold != null ? options.threshold : 0.7;
  const name = (k) => sources[k] || `entretien ${k + 1}`;
  const base = JSON.parse(JSON.stringify(models[0]));
  tagSource(base, name(0));
  const conflicts = [];
  for (let k = 1; k < models.length; k++) {
    const other = JSON.parse(JSON.stringify(models[k]));
    tagSource(other, name(k));
    const m = matchLists(base.steps, other.steps, threshold, (s) => s.label);
    // les ids d'etapes des deux sources peuvent entrer en collision
    // (chaque entretien numerote s1, s2...) : l'autre source est
    // remappee AVANT fusion — une etape appariee prend l'id de sa
    // jumelle de base, une etape propre recoit un id neuf — et ses
    // references (retours de decision, exceptions rattachees) suivent
    const otherIdMap = new Map();
    const usedIds = new Set(base.steps.map((s) => s.id));
    let nextId = base.steps.length + other.steps.length;
    const matchedJ = new Map([...m.exact, ...m.renamed].map(([i, j]) => [j, i]));
    other.steps.forEach((s, j) => {
      if (matchedJ.has(j)) {
        otherIdMap.set(s.id, base.steps[matchedJ.get(j)].id);
        return;
      }
      let fresh = s.id;
      while (usedIds.has(fresh)) fresh = `s${++nextId}`;
      otherIdMap.set(s.id, fresh);
      usedIds.add(fresh);
    });
    other.steps.forEach((s, j) => {
      if (!matchedJ.has(j)) s.id = otherIdMap.get(s.id) || s.id;
      if (s.decision && s.decision.on_no && s.decision.on_no.return_to !== "fin") {
        s.decision.on_no.return_to = otherIdMap.get(s.decision.on_no.return_to) || "fin";
      }
    });
    const matched = new Set();
    [...m.exact, ...m.renamed].forEach(([i, j]) => {
      matched.add(j);
      mergeStep(base.steps[i], other.steps[j], name(k), conflicts);
    });
    // etapes propres a l'autre source : ajoutees apres la base
    const maxStage = Math.max(0, ...base.steps.map((s) => s.stage || 0));
    other.steps.forEach((s, j) => {
      if (matched.has(j)) return;
      s.stage = maxStage + (s.stage || 1);
      base.steps.push(s);
    });
    // union des acteurs du processus
    (other.actors || []).forEach((x) => {
      if (!base.actors.some((y) => norm(y) === norm(x))) base.actors.push(x);
    });
    // bornes du processus
    for (const f of ["trigger", "outcome"]) {
      if (!base[f] && other[f]) base[f] = other[f];
      else if (base[f] && other[f] && norm(base[f]) !== norm(other[f])) {
        conflicts.push(`[processus] ${f === "trigger" ? "declencheur" : "resultat"} : « ${base[f]} » ≠ « ${other[f]} » (${name(k)})`);
      }
    }
    // v6 : union des regles, exceptions et incertitudes, source tracee
    // dans la provenance ; deux enonces proches mais non identiques
    // (meme sujet, seuil ou formulation qui differe) sont conserves
    // TOUS LES DEUX et signales comme contradiction potentielle
    base.inferredProcess = base.inferredProcess || {};
    base.provenanceProcess = base.provenanceProcess || {};
    other.inferredProcess = other.inferredProcess || {};
    other.provenanceProcess = other.provenanceProcess || {};
    const unionProc = (field, famLabel, textOf, cloneItem) => {
      const bFlags = base.inferredProcess[field] = base.inferredProcess[field] || [];
      const bProv = base.provenanceProcess[field] = base.provenanceProcess[field] || [];
      const oFlags = other.inferredProcess[field] || [];
      const oProv = other.provenanceProcess[field] || [];
      (other[field] = other[field] || []).forEach((x, i) => {
        const t = textOf(x);
        if (!t) return;
        const twin = (base[field] = base[field] || []).findIndex((y) => norm(textOf(y)) === norm(t));
        if (twin >= 0) return;
        const close = base[field].find((y) => similarity(textOf(y), t) >= 0.7);
        if (close) {
          conflicts.push(`[processus] ${famLabel} : « ${textOf(close)} » ≠ « ${t} » (${name(k)}) — enonces proches, a arbitrer`);
        }
        base[field].push(cloneItem(x));
        bFlags[base[field].length - 1] = !!oFlags[i];
        const p = oProv[i] || null;
        if (p) p.source = name(k);
        bProv[base[field].length - 1] = p;
      });
    };
    unionProc("rules", "regle", (x) => x, (x) => x);
    unionProc("uncertainties", "incertitude", (x) => x, (x) => x);
    unionProc("exceptions", "exception", (x) => (x && x.text) || "",
      (x) => ({ ...x, step_id: x.step_id ? (otherIdMap.get(x.step_id) || x.step_id) : x.step_id }));
  }
  // compacte la numerotation des stages apres les ajouts
  const order = [...new Set(base.steps.map((s) => s.stage))].sort((a, b) => a - b);
  const rankOf = new Map(order.map((v, i) => [v, i + 1]));
  base.steps.forEach((s) => { s.stage = rankOf.get(s.stage); });
  base.conflicts = conflicts;
  return base;
}
