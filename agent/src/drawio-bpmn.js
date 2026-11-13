// Page "BPMN" native Draw.io, construite comme le canevas MIP :
// structuree, connectee, modulable — l'inverse des formes dessinees a
// la main en coordonnees absolues. Pool et lanes en VRAIS conteneurs
// (swimlane + stackLayout : ajouter ou deplacer une lane recompose le
// pool), chaque element enfant de sa lane en coordonnees relatives,
// aretes par id avec points d'accroche, jamais par coordonnees.
// La correspondance MIP -> BPMN vient de src/bpmn-map.js, partagee
// avec le fichier .bpmn : les deux sorties ne divergent pas.
// Formes : stencils integres mxgraph.bpmn.* de Draw.io (shape generale
// a symboles pour les evenements et la passerelle, mxgraph.bpmn.task a
// marqueur pour la service task). Ces formes sont EMBARQUEES dans
// l'editeur (y compris embed.diagrams.net) ; en cas de stencil
// indisponible dans un deploiement exotique, remplacer par les formes
// de base equivalentes : ellipse (debut), ellipse strokeWidth=3 (fin),
// rhombus avec libelle "X" (passerelle), rectangle arrondi (tache).

import { mapToBpmn, BPMN_COLORS } from "./bpmn-map.js";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escAttr = (s) => esc(s).replace(/\r?\n/g, "&#10;");

// ---- geometrie de la page (independante du fichier .bpmn) ----
const LANE_TITLE = 24;  // bande de titre d'une lane (et du pool)
const CX0 = 96;         // premiere colonne, dans le repere de la lane
                        // (laisse au libelle du start event la place de
                        // rester DANS la lane, sous l'evenement)
const COLW = 240;       // largeur d'une colonne de rang
const TASK_W = 150, TASK_H = 52;
const GW = 44, EVT = 36;
const PAD = 24;         // marge haute dans une lane
const SLOT_H = 92;      // hauteur d'un rang vertical empile
const POOL_X = 40, POOL_Y = 96;

// styles : conteneurs natifs, formes BPMN embarquees, palette MIP
// partagee (BPMN_COLORS) posee sur chaque cellule — donc editable
// element par element dans l'editeur. Construits a l'appel : le cycle
// de modules drawio -> drawio-bpmn -> bpmn-map -> drawio interdit de
// lire BPMN_COLORS au chargement.
const S_POOL = "swimlane;html=1;childLayout=stackLayout;resizeParent=1;resizeParentMax=0;horizontal=0;startSize=24;horizontalStack=0;collapsible=0;fillColor=#F5F7F8;strokeColor=#67747C;fontColor=#2C3136;fontSize=11;fontStyle=1;";
const S_LANE = "swimlane;html=1;startSize=24;horizontal=0;collapsible=0;fillColor=none;strokeColor=#67747C;fontColor=#2C3136;fontSize=10;";
const S_EDGE = "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;strokeColor=#2C3136;strokeWidth=1.2;jettySize=auto;orthogonalLoop=1;fontSize=9;fontColor=#8A3B33;";
const S_ASSOC = "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=none;dashed=1;strokeColor=#9AA0A6;strokeWidth=1;jettySize=auto;";
const S_NOTE = "text;html=1;align=left;verticalAlign=middle;fontSize=10;fontStyle=2;fontColor=#8A8F94;fontFamily=Arial,Helvetica,sans-serif;";
let STYLE_CACHE = null;
function styles() {
  if (STYLE_CACHE) return STYLE_CACHE;
  const paint = (k) => `fillColor=${BPMN_COLORS[k].fill};strokeColor=${BPMN_COLORS[k].stroke};`;
  STYLE_CACHE = {
    TASK: `rounded=1;whiteSpace=wrap;html=1;arcSize=12;${paint("task")}fontColor=#2C3136;fontFamily=Arial,Helvetica,sans-serif;fontSize=10;`,
    SERVICE: `shape=mxgraph.bpmn.task;html=1;whiteSpace=wrap;rounded=1;taskMarker=service;${paint("service")}fontColor=#2C3136;fontFamily=Arial,Helvetica,sans-serif;fontSize=10;`,
    // libelles d'evenements bornes en largeur et enroules : le texte
    // reste sous l'evenement, a l'interieur de la lane
    START: `shape=mxgraph.bpmn.shape;html=1;perimeter=ellipsePerimeter;symbol=general;outline=standard;${paint("start")}verticalLabelPosition=bottom;verticalAlign=top;align=center;labelBackgroundColor=none;fontSize=9;fontColor=#2C3136;outlineConnect=0;whiteSpace=wrap;labelWidth=64;`,
    END: `shape=mxgraph.bpmn.shape;html=1;perimeter=ellipsePerimeter;symbol=general;outline=end;${paint("end")}verticalLabelPosition=bottom;verticalAlign=top;align=center;labelBackgroundColor=none;fontSize=9;fontColor=#2C3136;outlineConnect=0;whiteSpace=wrap;labelWidth=140;`,
    GATEWAY: `shape=mxgraph.bpmn.shape;html=1;perimeter=rhombusPerimeter;background=gateway;outline=none;symbol=exclusiveGw;${paint("gateway")}verticalLabelPosition=bottom;verticalAlign=top;align=center;labelBackgroundColor=none;fontSize=9;fontColor=#2C3136;outlineConnect=0;`,
    PARALLEL: `shape=mxgraph.bpmn.shape;html=1;perimeter=rhombusPerimeter;background=gateway;outline=none;symbol=parallelGw;${paint("parallel")}verticalLabelPosition=bottom;verticalAlign=top;align=center;labelBackgroundColor=none;fontSize=9;fontColor=#2C3136;outlineConnect=0;`,
    ANNOT: `shape=note;html=1;whiteSpace=wrap;size=12;${paint("annotation")}fontColor=#57606A;fontFamily=Arial,Helvetica,sans-serif;fontSize=8;align=left;spacingLeft=4;`
  };
  return STYLE_CACHE;
}

// sommet, enveloppe dans un element object quand une infobulle existe
function vertex(id, parent, style, value, x, y, w, h, tooltip) {
  const geo = `<mxGeometry height="${h}" width="${w}" x="${x}" y="${y}" as="geometry"></mxGeometry>`;
  if (tooltip) {
    return `<object id="${id}" label="${esc(value)}" tooltip="${escAttr(tooltip)}">` +
      `<mxCell parent="${parent}" style="${style}" vertex="1">${geo}</mxCell></object>`;
  }
  return `<mxCell id="${id}" parent="${parent}" style="${style}" value="${esc(value)}" vertex="1">${geo}</mxCell>`;
}

export function bpmnPage(model) {
  const { actors, M, nodes, flows, annotations, associations, laneSlots, procDoc } = mapToBpmn(model);
  const out = [];
  out.push('<mxCell id="0" />');
  out.push('<mxCell id="bpmn-L0" parent="0" value="Processus" />');

  // note de derivation, discrete, en haut de page
  out.push(vertex("bpmn-note", "bpmn-L0", S_NOTE,
    "Vue BPMN dérivée du MIP : parallélisme d'étage en passerelles ET, terminaisons et exceptions représentées ; décisions binaires ; la grille MIP reste la référence.",
    POOL_X, 34, 900, 18));
  // petite legende des couleurs de la page
  out.push(vertex("bpmn-legend", "bpmn-L0", S_NOTE,
    "Jaune : tâche humaine · Bleu : tâche automatisée · Vert : début · Rouge : fin · Orange : passerelle · Gris : annotation",
    POOL_X, 56, 900, 18));

  // ---- pool et lanes : conteneurs natifs, empiles par stackLayout ----
  const laneH = laneSlots.map((n) => PAD * 2 + Math.max(1, n) * SLOT_H);
  const laneOffY = [];
  let accY = 0;
  actors.forEach((a, i) => { laneOffY.push(accY); accY += laneH[i]; });
  const poolW = LANE_TITLE + CX0 + M * COLW + 140;
  const poolTip = procDoc.length ? procDoc.join("\n") : "";
  out.push(vertex("bpmn-pool", "bpmn-L0", S_POOL, model.process || "Processus",
    POOL_X, POOL_Y, poolW, accY, poolTip));
  actors.forEach((a, i) => {
    out.push(vertex(`bpmn-lane_${i}`, "bpmn-pool", S_LANE, a,
      LANE_TITLE, laneOffY[i], poolW - LANE_TITLE, laneH[i]));
  });

  // ---- elements : ENFANTS de leur lane, coordonnees relatives ----
  // position relative d'un noeud dans sa lane
  const relPos = (n) => {
    const slotY = PAD + n.slot * SLOT_H;
    if (n.kind === "gateway") {
      return { x: CX0 + n.col * COLW + TASK_W + 24, y: slotY + (TASK_H - GW) / 2, w: GW, h: GW };
    }
    if (n.kind === "parallel") {
      // split avant la colonne du stage, join apres
      const x = n.side === "in" ? CX0 + n.col * COLW - 56 : CX0 + n.col * COLW + TASK_W + 78;
      return { x, y: slotY + (TASK_H - GW) / 2, w: GW, h: GW };
    }
    if (n.kind === "start") return { x: CX0 - 52, y: slotY + (TASK_H - EVT) / 2, w: EVT, h: EVT };
    if (n.kind === "end") {
      return { x: CX0 + Math.min(n.col, M - 1) * COLW + TASK_W + 132, y: slotY + (TASK_H - EVT) / 2, w: EVT, h: EVT };
    }
    return { x: CX0 + n.col * COLW, y: slotY, w: TASK_W, h: TASK_H };
  };
  const ST = styles();
  const pos = new Map();
  for (const n of nodes) {
    const p = relPos(n);
    pos.set(n.id, { ...p, lane: n.lane, kind: n.kind });
    const style = n.kind === "service" ? ST.SERVICE
      : n.kind === "task" ? ST.TASK
      : n.kind === "gateway" ? ST.GATEWAY
      : n.kind === "parallel" ? ST.PARALLEL
      : n.kind === "start" ? ST.START : ST.END;
    out.push(vertex(`bpmn-${n.id}`, `bpmn-lane_${n.lane}`, style, n.name,
      p.x, p.y, p.w, p.h, n.doc.length ? n.doc.join("\n") : ""));
  }
  // exceptions rattachees : annotation sous la tache, dans sa lane,
  // reliee par une association en tiret gris
  for (const a of annotations) {
    const t = pos.get(a.taskId);
    const p = { x: t.x + 16, y: t.y + TASK_H + 6, w: 150, h: 30, lane: a.lane, kind: "annotation" };
    pos.set(a.id, p);
    out.push(vertex(`bpmn-${a.id}`, `bpmn-lane_${a.lane}`, ST.ANNOT, a.text, p.x, p.y, p.w, p.h));
  }
  associations.forEach((a) => {
    out.push(`<mxCell id="bpmn-${a.id}" parent="bpmn-L0" style="${S_ASSOC}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" ` +
      `source="bpmn-${a.source}" target="bpmn-${a.target}"><mxGeometry relative="1" as="geometry"></mxGeometry></mxCell>`);
  });

  // position absolue (pour les points de passage des retours)
  const absOf = (id) => {
    const p = pos.get(id);
    return {
      x: POOL_X + LANE_TITLE + p.x,
      y: POOL_Y + laneOffY[p.lane] + p.y,
      w: p.w, h: p.h, lane: p.lane
    };
  };

  // ---- aretes : par id, points d'accroche, jamais par coordonnees ----
  // sens usuel : sortie a droite, entree a gauche ; les retours (cible
  // a un rang anterieur) sortent par le bas de la passerelle, longent
  // un couloir sous la lane source en trait discontinu, et entrent par
  // le bas de la cible
  const anchors = (exit, entry) =>
    `exitX=${exit[0]};exitY=${exit[1]};exitDx=0;exitDy=0;entryX=${entry[0]};entryY=${entry[1]};entryDx=0;entryDy=0;`;
  flows.forEach((f, i) => {
    const A = absOf(f.source), B = absOf(f.target);
    const back = B.x + B.w / 2 < A.x + A.w / 2;
    let style, pts = "";
    if (!back) {
      style = S_EDGE + anchors([1, 0.5], [0, 0.5]);
    } else {
      // retour : couloir horizontal explicite sous la lane la plus basse
      const laneBottom = (l) => POOL_Y + laneOffY[l] + laneH[l];
      const yCorr = Math.max(laneBottom(A.lane), laneBottom(B.lane)) - 10;
      style = S_EDGE + "dashed=1;" + anchors([0.5, 1], [0.5, 1]);
      pts = `<Array as="points">` +
        `<mxPoint x="${Math.round(A.x + A.w / 2)}" y="${Math.round(yCorr)}" />` +
        `<mxPoint x="${Math.round(B.x + B.w / 2)}" y="${Math.round(yCorr)}" />` +
        `</Array>`;
    }
    // le label "non" est decale de sa branche pour ne pas la froler
    const labelOff = f.name === "non" ? '<mxPoint x="12" y="10" as="offset" />' : "";
    out.push(`<mxCell id="bpmn-${f.id}" parent="bpmn-L0" style="${style}" value="${esc(f.name)}" edge="1" ` +
      `source="bpmn-${f.source}" target="bpmn-${f.target}">` +
      `<mxGeometry relative="1" as="geometry">${labelOff}${pts}</mxGeometry></mxCell>`);
  });

  const pageW = Math.round(POOL_X * 2 + poolW);
  const pageH = Math.round(POOL_Y + accY + 80);
  return `<diagram id="bpmn" name="BPMN">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0">
      <root>
        ${out.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>`;
}
