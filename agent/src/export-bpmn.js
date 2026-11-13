// Export BPMN 2.0 depuis le JSON du MIP (jamais depuis le XML Draw.io).
// La correspondance MIP -> concepts BPMN vit dans src/bpmn-map.js,
// partagee avec la page Draw.io native (drawio-bpmn.js) : les deux
// sorties ne peuvent pas diverger. Ce module ne fait que l'emission
// XML BPMN (definitions, process, DI minimal, couleurs bioc que
// bpmn.io et Camunda Modeler affichent) ; le commentaire d'en-tete du
// fichier liste ce qui est transpose et ce qui est degrade.

import { mapToBpmn, BPMN_COLORS } from "./bpmn-map.js";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// geometrie simple : une colonne par rang, une bande par lane
const COL_W = 260;   // largeur d'une colonne (tache + passerelle)
const TASK_W = 150, TASK_H = 60;
const GW = 40, EVT = 36;
const LANE_PAD = 30; // marge haute dans une lane
const SLOT_H = 110;  // hauteur occupee par une tache empilee
const X0 = 200;      // debut des colonnes (apres l'en-tete de lane)

export function toBpmn(model) {
  const { actors, M, nodes, flows, annotations, associations, laneSlots, procDoc } = mapToBpmn(model);

  // ---- geometrie : positions dans l'ordre historique (taches et
  // passerelles, puis evenement de debut, puis fins et annotations) ----
  const pos = new Map();
  for (const n of nodes) {
    if (n.kind === "task" || n.kind === "service") {
      pos.set(n.id, { x: X0 + n.col * COL_W, y: n.slot, w: TASK_W, h: TASK_H, lane: n.lane, col: n.col, kind: n.kind });
    } else if (n.kind === "gateway") {
      pos.set(n.id, { x: X0 + n.col * COL_W + TASK_W + 20, y: n.slot, w: GW, h: GW, lane: n.lane, col: n.col, isGw: true, kind: n.kind });
    } else if (n.kind === "parallel") {
      // split avant la colonne, join apres
      const x = n.side === "in" ? X0 + n.col * COL_W - 60 : X0 + n.col * COL_W + TASK_W + 70;
      pos.set(n.id, { x, y: n.slot, w: GW, h: GW, lane: n.lane, col: n.col, isGw: true, kind: n.kind });
    }
  }
  const start = nodes.find((n) => n.kind === "start");
  pos.set(start.id, { x: X0 - 70, y: 0, w: EVT, h: EVT, lane: start.lane, col: -1, kind: "start" });
  for (const n of nodes) {
    if (n.kind !== "end") continue;
    pos.set(n.id, { x: X0 + Math.min(n.col, M - 1) * COL_W + TASK_W + 130, y: n.slot, w: EVT, h: EVT, lane: n.lane, col: n.col, kind: "end" });
  }
  const laneH = laneSlots.map((n) => LANE_PAD * 2 + n * SLOT_H);
  const laneY = [];
  let acc = 40;
  for (let i = 0; i < actors.length; i++) { laneY.push(acc); acc += laneH[i]; }
  const poolH = Math.max(acc - 40, 120);
  const poolW = X0 + M * COL_W + 220;
  for (const p of pos.values()) {
    const base = laneY[p.lane] + LANE_PAD + p.y * SLOT_H;
    p.absY = p.isGw || p.w === EVT ? base + (TASK_H - p.h) / 2 : base;
  }
  // annotations : sous leur tache, dans la meme lane
  for (const a of annotations) {
    const t = pos.get(a.taskId);
    pos.set(a.id, { x: t.x + 20, y: t.y, w: 150, h: 30, lane: a.lane, col: a.col, kind: "annotation", absY: t.absY + TASK_H + 8 });
  }

  // ---- lanes : rattachement des noeuds de flux (les annotations sont
  // des artefacts, elles ne figurent pas dans les flowNodeRef) ----
  const laneNodes = actors.map(() => []);
  for (const [id, p] of pos) {
    if (p.kind === "annotation") continue;
    laneNodes[p.lane].push(id);
  }

  // ---- assemblage XML ----
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push("<!--");
  out.push("  Exporte par Agent MIP depuis le modele intermediaire de processus (JSON).");
  out.push("  Transpose fidelement : acteurs (lanes), etapes (taches ; service tasks si");
  out.push("  automatisees), decisions (passerelles exclusives, flux oui/non, retours),");
  out.push("  parallelisme d'etage (paire de passerelles paralleles AND split/join),");
  out.push("  declencheur (start event), chaque terminaison du flux (end events etiquetes),");
  out.push("  exceptions rattachees a une etape (annotations associees a leur tache),");
  out.push("  couleurs par type d'element (extension bioc, affichee par bpmn.io/Camunda).");
  out.push("  Degrade (sans equivalent BPMN direct) : documents, donnees, outils, durees,");
  out.push("  volumes, frequences, frictions, opportunites, regles metier, exceptions non");
  out.push("  rattachees et incertitudes -> documentation des elements concernes ; les");
  out.push("  decisions restent strictement binaires (le MIP l'est par construction) ;");
  out.push("  pas d'evenement intermediaire ni de message flow ; les marquages de valeurs");
  out.push("  deduites ne sont pas transposes.");
  out.push("-->");
  out.push('<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" id="Definitions_1" targetNamespace="http://agent-mip.local/bpmn">');
  out.push(`  <bpmn:collaboration id="Collab_1"><bpmn:participant id="Pool_1" name="${esc(model.process || "Processus")}" processRef="Process_1" /></bpmn:collaboration>`);
  out.push('  <bpmn:process id="Process_1" isExecutable="false">');
  if (procDoc.length) out.push(`    <bpmn:documentation>${esc(procDoc.join("\n"))}</bpmn:documentation>`);
  out.push('    <bpmn:laneSet id="LaneSet_1">');
  actors.forEach((a, i) => {
    out.push(`      <bpmn:lane id="Lane_${i}" name="${esc(a)}">`);
    laneNodes[i].forEach((id) => out.push(`        <bpmn:flowNodeRef>${id}</bpmn:flowNodeRef>`));
    out.push("      </bpmn:lane>");
  });
  out.push("    </bpmn:laneSet>");
  const io = (id) => {
    const inc = flows.filter((f) => f.target === id).map((f) => `<bpmn:incoming>${f.id}</bpmn:incoming>`);
    const outg = flows.filter((f) => f.source === id).map((f) => `<bpmn:outgoing>${f.id}</bpmn:outgoing>`);
    return [...inc, ...outg].join("");
  };
  out.push(`    <bpmn:startEvent id="${start.id}" name="${esc(start.name)}">${io(start.id)}</bpmn:startEvent>`);
  for (const n of nodes) {
    if (n.kind === "task" || n.kind === "service") {
      const tag = n.kind === "service" ? "bpmn:serviceTask" : "bpmn:task";
      out.push(`    <${tag} id="${n.id}" name="${esc(n.name)}">` +
        (n.doc.length ? `<bpmn:documentation>${esc(n.doc.join("\n"))}</bpmn:documentation>` : "") +
        io(n.id) + `</${tag}>`);
    } else if (n.kind === "gateway") {
      out.push(`    <bpmn:exclusiveGateway id="${n.id}" name="${esc(n.name)}">${io(n.id)}</bpmn:exclusiveGateway>`);
    } else if (n.kind === "parallel") {
      out.push(`    <bpmn:parallelGateway id="${n.id}">${io(n.id)}</bpmn:parallelGateway>`);
    }
  }
  for (const n of nodes) {
    if (n.kind !== "end") continue;
    out.push(`    <bpmn:endEvent id="${n.id}" name="${esc(n.name)}">${io(n.id)}</bpmn:endEvent>`);
  }
  flows.forEach((f) => {
    out.push(`    <bpmn:sequenceFlow id="${f.id}" sourceRef="${f.source}" targetRef="${f.target}"` +
      (f.name ? ` name="${esc(f.name)}"` : "") + ">" +
      (f.doc ? `<bpmn:documentation>${esc(f.doc)}</bpmn:documentation>` : "") +
      "</bpmn:sequenceFlow>");
  });
  annotations.forEach((a) => {
    out.push(`    <bpmn:textAnnotation id="${a.id}"><bpmn:text>${esc(a.text)}</bpmn:text></bpmn:textAnnotation>`);
  });
  associations.forEach((a) => {
    out.push(`    <bpmn:association id="${a.id}" sourceRef="${a.source}" targetRef="${a.target}" />`);
  });
  out.push("  </bpmn:process>");

  // ---- DI minimal : pool, lanes, noeuds, aretes en lignes droites,
  // couleurs bioc par type d'element ----
  const biocOf = (kind) => {
    const c = BPMN_COLORS[kind];
    return c ? ` bioc:stroke="${c.stroke}" bioc:fill="${c.fill}"` : "";
  };
  out.push('  <bpmndi:BPMNDiagram id="Diag_1"><bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collab_1">');
  out.push(`    <bpmndi:BPMNShape id="Pool_1_di" bpmnElement="Pool_1" isHorizontal="true"><dc:Bounds x="40" y="40" width="${poolW}" height="${poolH}" /></bpmndi:BPMNShape>`);
  actors.forEach((a, i) => {
    out.push(`    <bpmndi:BPMNShape id="Lane_${i}_di" bpmnElement="Lane_${i}" isHorizontal="true"><dc:Bounds x="70" y="${laneY[i]}" width="${poolW - 30}" height="${laneH[i]}" /></bpmndi:BPMNShape>`);
  });
  for (const [id, p] of pos) {
    out.push(`    <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"${biocOf(p.kind)}><dc:Bounds x="${p.x}" y="${Math.round(p.absY)}" width="${p.w}" height="${p.h}" /></bpmndi:BPMNShape>`);
  }
  const center = (id) => {
    const p = pos.get(id);
    return { cx: p.x + p.w / 2, cy: p.absY + p.h / 2, p };
  };
  const edgeDi = (id, source, target) => {
    const a = center(source), b = center(target);
    const x1 = a.cx < b.cx ? a.p.x + a.p.w : (a.cx > b.cx ? a.p.x : a.cx);
    const x2 = a.cx < b.cx ? b.p.x : (a.cx > b.cx ? b.p.x + b.p.w : b.cx);
    return `    <bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">` +
      `<di:waypoint x="${Math.round(x1)}" y="${Math.round(a.cy)}" />` +
      `<di:waypoint x="${Math.round(x2)}" y="${Math.round(b.cy)}" /></bpmndi:BPMNEdge>`;
  };
  flows.forEach((f) => out.push(edgeDi(f.id, f.source, f.target)));
  associations.forEach((a) => out.push(edgeDi(a.id, a.source, a.target)));
  out.push("  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>");
  out.push("</bpmn:definitions>");
  return out.join("\n") + "\n";
}
