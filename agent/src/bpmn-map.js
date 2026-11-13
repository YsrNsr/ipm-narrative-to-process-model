// Correspondance MIP -> concepts BPMN, partagee entre les deux
// sorties : le fichier .bpmn (export-bpmn.js, pour Camunda / bpmn.io)
// et la page Draw.io native (drawio-bpmn.js). Toute evolution de la
// correspondance se fait ICI, pour que les deux sorties ne divergent
// jamais : lanes (une par acteur, ordre du modele), taches et service
// tasks, passerelles exclusives avec branches oui/non et retours,
// evenements de debut et de fin, documentation des elements sans
// equivalent BPMN. Les rangs de colonnes viennent de computeLayout
// (memes rangs que la grille MIP).
// Fidele a la complexite, sans jamais en inventer : un stage partage
// devient une vraie paire de passerelles paralleles (AND split avant,
// AND join apres) ; chaque terminaison a son end event etiquete ; une
// exception rattachee a une etape (step_id) devient une annotation
// associee a sa tache — pas de boundary event invente, le recit ne
// donne pas la semantique d'interruption. Pas de passerelle a plus de
// deux sorties (le MIP est binaire), pas d'evenement intermediaire,
// pas de message flow.

import { computeLayout } from "./drawio.js";

// palette partagee par la page Draw.io et le fichier .bpmn : coherente
// avec la grille MIP et douce a l'impression
export const BPMN_COLORS = {
  task: { fill: "#FFF6D6", stroke: "#E0B400" },       // tache humaine (jaune MIP)
  service: { fill: "#E8F0FE", stroke: "#6C8EBF" },    // tache automatisee (bleu MIP)
  start: { fill: "#E4F2E9", stroke: "#2F7D4F" },      // debut (vert tendre)
  end: { fill: "#FCE8E6", stroke: "#B85450" },        // fin (rouge tendre)
  gateway: { fill: "#FFE6CC", stroke: "#D79B00" },    // passerelle exclusive (orange clair)
  parallel: { fill: "#FFE6CC", stroke: "#D79B00" },   // passerelle parallele
  annotation: { fill: "#F5F5F5", stroke: "#9AA0A6" }  // annotation (gris)
};

export function mapToBpmn(model) {
  const steps = model.steps || [];
  const actors = model.actors || [];
  const laneOf = new Map(actors.map((a, i) => [a, i]));
  // rangs temporels du gabarit de la grille (affectations comprises)
  const layout = computeLayout(model);
  const colOfStep = layout.colOfStep;
  const byCol = layout.byCol;
  const col = (s, j) => colOfStep[j];
  const M = Math.max(byCol.length, 1);

  // documentation d'une etape : tout ce que BPMN ne represente pas
  const docOf = (s) => {
    const parts = [];
    const put = (label, v) => { if (v && String(v).trim()) parts.push(`${label} : ${v}`); };
    put("Documents entrants", (s.documents_in || []).join(", "));
    put("Documents sortants", (s.documents_out || []).join(", "));
    put("Donnees entrantes", (s.data_in || []).join(", "));
    put("Donnees sortantes", (s.data_out || []).join(", "));
    put("Outils", (s.tools || []).join(", "));
    put("Duree", s.duration);
    put("Duree min", s.duration_min);
    put("Duree max", s.duration_max);
    put("Volume", s.volume);
    put("Frequence", s.frequency);
    put("Friction", s.friction);
    put("Mode operatoire", s.procedure);
    put("Opportunite", s.opportunity);
    if ((s.actors || []).length > 1) put("Participants", s.actors.slice(1).join(", "));
    // les exceptions rattachees deviennent des annotations visibles,
    // elles ne restent plus cachees dans la documentation
    return parts;
  };

  // ---- flux, dans l'ordre de creation historique (ids stables) ----
  const flows = [];
  let flowSeq = 0;
  const flow = (source, target, name, doc) => {
    flows.push({ id: `Flow_${++flowSeq}`, source, target, name: name || "", doc: doc || "" });
  };
  const taskId = (s) => `Task_${s.id}`;
  const gwId = (s) => `Gw_${s.id}`;
  const outNode = (s) => (s.decision ? gwId(s) : taskId(s));
  const ends = [];
  // parallelisme reel : un stage a plusieurs etapes recoit une paire
  // de passerelles paralleles ; l'entree du stage est le split, sa
  // sortie le join. Un stage a etape unique reste inchange.
  const multi = (c) => (byCol[c] || []).length > 1;
  const splitId = (c) => `GwSplit_c${c}`;
  const joinId = (c) => `GwJoin_c${c}`;
  const stageIn = (c) => (multi(c) ? splitId(c) : taskId(byCol[c][0].s));
  const stageOut = (c) => (multi(c) ? joinId(c) : outNode(byCol[c][0].s));
  // etiquette "oui" uniquement quand la sortie de stage est la
  // passerelle exclusive d'une etape unique a decision
  const stageOutLabel = (c) => (!multi(c) && byCol[c][0].s.decision ? "oui" : "");
  for (let c = 1; c < M; c++) {
    flow(stageOut(c - 1), stageIn(c), stageOutLabel(c - 1));
  }
  const startLane = byCol[0] && byCol[0][0] ? laneOf.get(byCol[0][0].s.actor) || 0 : 0;
  flow("Start_1", stageIn(0));
  const lastCol = byCol[M - 1] || [];
  const endMain = { id: "End_main", name: model.outcome || "Fin", lane: lastCol[0] ? (laneOf.get(lastCol[0].s.actor) || 0) : 0, col: M };
  ends.push(endMain);
  flow(stageOut(M - 1), endMain.id, stageOutLabel(M - 1));
  // interieur des stages paralleles : split -> chaque tache, puis la
  // sortie de chaque etape (tache, ou issue oui de sa passerelle) -> join
  for (let c = 0; c < M; c++) {
    if (!multi(c)) continue;
    byCol[c].forEach((x) => flow(splitId(c), taskId(x.s)));
    byCol[c].forEach((x) => flow(outNode(x.s), joinId(c), x.s.decision ? "oui" : ""));
  }
  steps.forEach((s, j) => {
    if (!s.decision) return;
    flow(taskId(s), gwId(s), "");
    const no = s.decision.on_no || {};
    const back = no.return_to;
    const target = back !== "fin" && steps.some((t) => t.id === back);
    if (target) {
      flow(gwId(s), `Task_${back}`, "non", no.label || "");
    } else {
      const e = { id: `End_no_${s.id}`, name: no.label || "Fin (non)", lane: laneOf.get(s.actor) || 0, col: col(s, j) };
      ends.push(e);
      flow(gwId(s), e.id, "non");
    }
  });
  // exceptions rattachees (step_id) : annotations associees a la tache
  const annotations = [];
  const associations = [];
  (model.exceptions || []).forEach((x, i) => {
    if (!x.step_id) return;
    const k = steps.findIndex((t) => t.id === x.step_id);
    if (k < 0) return;
    const s = steps[k];
    const ann = { id: `Ann_${i}`, text: x.text, taskId: taskId(s), lane: laneOf.get(s.actor) || 0, col: col(s, k) };
    annotations.push(ann);
    associations.push({ id: `Assoc_${i}`, source: taskId(s), target: ann.id });
  });

  // ---- rangs verticaux (slots) : taches dans l'ordre du modele, puis
  // evenements de fin — meme ordre de reclamation que l'historique ----
  const slotCount = new Map();
  const claim = (lane, c) => {
    const k = `${lane}|${c}`;
    const n = slotCount.get(k) || 0;
    slotCount.set(k, n + 1);
    return n;
  };
  const laneSlots = actors.map(() => 1);
  const nodes = [{ id: "Start_1", kind: "start", name: model.trigger || "Debut", lane: startLane, col: -1, slot: 0, doc: [] }];
  steps.forEach((s, j) => {
    const lane = laneOf.get(s.actor) || 0;
    const c = col(s, j);
    const slot = claim(lane, c);
    laneSlots[lane] = Math.max(laneSlots[lane], slot + 1);
    nodes.push({ id: taskId(s), kind: s.automated ? "service" : "task", name: s.label, lane, col: c, slot, doc: docOf(s) });
    if (s.decision) {
      nodes.push({ id: gwId(s), kind: "gateway", name: s.decision.question, lane, col: c, slot, doc: [] });
    }
  });
  // passerelles paralleles : posees au rang du premier pas du stage
  for (let c = 0; c < M; c++) {
    if (!multi(c)) continue;
    const first = nodes.find((n) => n.id === taskId(byCol[c][0].s));
    nodes.push({ id: splitId(c), kind: "parallel", name: "", lane: first.lane, col: c, slot: first.slot, side: "in", doc: [] });
    nodes.push({ id: joinId(c), kind: "parallel", name: "", lane: first.lane, col: c, slot: first.slot, side: "out", doc: [] });
  }
  ends.forEach((e) => {
    const c = Math.min(e.col, M - 1);
    const slot = claim(e.lane, c);
    laneSlots[e.lane] = Math.max(laneSlots[e.lane], slot + 1);
    nodes.push({ id: e.id, kind: "end", name: e.name, lane: e.lane, col: e.col, slot, doc: [] });
  });

  // ---- documentation du niveau processus ----
  const procDoc = [];
  (model.rules || []).forEach((r) => procDoc.push(`Regle metier : ${r}`));
  (model.uncertainties || []).forEach((u) => procDoc.push(`Incertitude : ${u}`));
  (model.exceptions || []).forEach((x) => { if (!x.step_id) procDoc.push(`Exception : ${x.text}`); });

  return { actors, M, nodes, flows, annotations, associations, laneSlots, startLane, procDoc };
}
