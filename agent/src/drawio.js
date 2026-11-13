// Rendu deterministe : Modele hybride (JSON) vers XML Draw.io.
// Reproduit la structure du modele de reference examples/MODELE_Processus.drawio :
// tables natives Draw.io (shape=table + tableRow + cellules), ce qui permet
// au metier d'ajouter des lignes (acteurs) et des colonnes (etapes) depuis
// la barre laterale de l'editeur sans casser la mise en page.
// Le nombre d'acteurs (lignes) et d'etapes (colonnes) est determine par le
// modele extrait de la transcription.
// Sortie : <mxfile> a deux pages, "Makigami" (grille acteurs x etapes +
// bandes de metadonnees par etape) et "RACI" (activites x acteurs).
// Depuis la v3 : valeurs deduites marquees et attenuees, decision
// binaire en losange avec branche "non", barre de temps proportionnelle,
// code couleur des etapes automatisees.

import { normalizeDuration } from "./duration.js";
import { bpmnPage } from "./drawio-bpmn.js";
import { sipocPage, analysePage } from "./drawio-analyst.js";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Constantes de mise en page, reprises du modele de reference.
const X0 = 40;          // marge gauche
const LABEL_W = 215;    // colonne des intitules (Makigami et bandes)
const COL_W = 235;      // largeur d'une colonne d'etape
const HEADER_H = 48;    // hauteur de la ligne d'en-tete du Makigami
const ACTOR_H = 132;    // hauteur d'une ligne d'acteur
const ROW_H = 44;       // hauteur d'une ligne de metadonnees
const IDENT_H = 154;    // hauteur de la table d'identification (4 lignes)
// Losange de decision : quatre cotes egaux (largeur = hauteur), donc
// une vraie forme de passerelle et non un losange aplati. La pile
// carte + losange + noeud de sortie en decoule.
const DEC_S = 70;             // cote du losange
const DEC_Y = 54;             // ordonnee du losange dans la case
const DEC_EXIT_Y = DEC_Y + DEC_S + 6;   // noeud de sortie sous le losange
const DEC_NEED = DEC_EXIT_Y + 30;       // hauteur de case requise
const PLACEHOLDER = "[…]"; // valeur a completer par le metier

// Styles copies du modele de reference (ne pas modifier a la main :
// c'est leur combinaison qui rend les tables editables nativement).
const S_TABLE_TITLED = "shape=table;startSize=26;container=1;collapsible=0;childLayout=tableLayout;html=1;strokeColor=#C9CFD3;fillColor=#414A50;fontColor=#FFFFFF;fontStyle=1;fontSize=12;align=left;spacingLeft=14;verticalAlign=middle;";
const S_TABLE_PLAIN = "shape=table;startSize=0;container=1;collapsible=0;childLayout=tableLayout;html=1;strokeColor=#C9CFD3;fillColor=none;";
const S_TABLE_MAKI = "shape=table;childLayout=tableLayout;startSize=34;collapsible=0;recursiveResize=0;expand=0;html=1;connectable=0;fillColor=#414A50;strokeColor=#C9CFD3;fontColor=#FFFFFF;fontStyle=1;fontSize=13;align=center;verticalAlign=middle;";
const S_ROW = "shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;strokeColor=inherit;top=0;left=0;bottom=0;right=0;collapsible=0;dropTarget=0;fillColor=none;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;";
const S_ROW_MAKI = "shape=tableRow;horizontal=0;swimlaneHead=0;swimlaneBody=0;top=0;left=0;strokeColor=inherit;bottom=0;right=0;dropTarget=0;connectable=0;fillColor=none;startSize=0;collapsible=0;recursiveResize=0;expand=0;";
const S_LEGEND = "rounded=0;whiteSpace=wrap;html=1;fillColor=#FFF6D6;strokeColor=#E0B400;fontColor=#8A6D00;fontFamily=Arial,Helvetica,sans-serif;fontSize=9;align=left;verticalAlign=middle;fontStyle=2;spacingLeft=8;";
// Fleche de flux entre cartes d'activite. Les ancres ne sont plus dans
// la constante : elles sont calculees par arete (baseAnchor) puis
// echelonnees pour les eventails.
const S_FLOW = "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;strokeColor=#8A6D00;strokeWidth=1.5;jettySize=auto;orthogonalLoop=1;";
// Branche "non" d'une decision : tiret, couleur distincte ; ancres
// calculees par arete.
const S_FLOW_NO = "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;dashed=1;strokeColor=#B85450;fontColor=#B85450;fontSize=9;strokeWidth=1.5;jettySize=auto;orthogonalLoop=1;";
const S_TERMINATOR = "ellipse;html=1;fillColor=#67747C;strokeColor=#414A50;fontColor=#FFFFFF;fontFamily=Arial,Helvetica,sans-serif;fontSize=8;align=center;verticalAlign=middle;";
// Carte allegee d'un participant secondaire (v4) : meme colonne que le
// responsable, style distinct pour ne pas suggerer un enchainement.
const S_PART = "rounded=1;arcSize=10;whiteSpace=wrap;html=1;dashed=1;fillColor=#FFFDF5;strokeColor=#D9C36A;fontColor=#6B6B6B;fontFamily=Arial,Helvetica,sans-serif;fontSize=8;fontStyle=2;align=center;verticalAlign=middle;";
// Trait de participation : fin, sans fleche, assez fonce pour rester
// visible sur fond blanc.
const S_LINK = "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=none;dashed=1;strokeColor=#B08A2E;strokeWidth=1;jettySize=auto;";
// Noeud de sortie de la branche "non" : porte l'action de sortie, dans
// un style distinct assorti a la branche (l'arete, elle, porte "non").
const S_EXIT = "rounded=1;arcSize=10;whiteSpace=wrap;html=1;fillColor=#FCE8E6;strokeColor=#B85450;fontColor=#8A3B33;fontFamily=Arial,Helvetica,sans-serif;fontSize=8;align=center;verticalAlign=middle;";
// Variante de la branche "non" pour un saut court a l'interieur de la
// cellule (du losange au noeud de sortie) ; ancres calculees par arete.
const S_FLOW_NO_LOCAL = "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;dashed=1;strokeColor=#B85450;fontColor=#B85450;fontSize=9;strokeWidth=1.5;jettySize=auto;orthogonalLoop=1;";
const S_TIMEBAR = "html=1;fillColor=#E0B400;strokeColor=none;";
// Marqueur discret des valeurs deduites par le modele (inference v3)
const INFER_MARK = "≈ ";
// Palette des cartes : jaune = etape humaine, bleu = etape automatisee.
const CARD_COLORS = { human: ["#FFF6D6", "#E0B400"], auto: ["#E8F0FE", "#6C8EBF"] };
// Carte d'activite ; en losange (rhombus) si l'etape porte une decision.
function cardStyle(automated, rhombus) {
  const [fill, stroke] = automated ? CARD_COLORS.auto : CARD_COLORS.human;
  return (rhombus ? "rhombus;" : "rounded=1;arcSize=10;") +
    `whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};fontColor=#2C3136;` +
    "fontFamily=Arial,Helvetica,sans-serif;fontSize=9;align=center;verticalAlign=middle;shadow=1;";
}

// Cellule de table basee sur partialRectangle (identification, bandes, RACI).
function pcell(opts) {
  return "shape=partialRectangle;html=1;whiteSpace=wrap;connectable=0;strokeColor=inherit;overflow=hidden;" +
    `fillColor=${opts.fill};top=0;left=0;bottom=1;right=1;pointerEvents=1;` +
    "fontFamily=Arial,Helvetica,sans-serif;" +
    `fontSize=${opts.fontSize};fontColor=${opts.fontColor};align=${opts.align};verticalAlign=${opts.valign};` +
    (opts.bold ? "fontStyle=1;" : "") + (opts.italic ? "fontStyle=2;" : "") +
    (opts.spacingLeft ? `spacingLeft=${opts.spacingLeft};` : "");
}

// Cellule de type swimlane utilisee dans la grille Makigami.
function scell(fill, fontSize, startSize, withFont) {
  return "swimlane;swimlaneHead=0;swimlaneBody=0;html=1;connectable=0;strokeColor=inherit;" +
    `fillColor=${fill};` + (withFont ? `fontColor=#FFFFFF;fontStyle=1;fontSize=${fontSize};align=center;verticalAlign=middle;whiteSpace=wrap;spacingLeft=6;spacingRight=6;` : `swimlaneFillColor=${fill};`) +
    `startSize=${startSize};collapsible=0;recursiveResize=0;expand=0;`;
}

// echappement des attributs multi-lignes (infobulles)
const escAttr = (s) => esc(s).replace(/\r?\n/g, "&#10;");

// arrondi a la grille de 10 px pour les elements libres et les
// dimensions de page, afin que les deplacements manuels dans l'editeur
// s'aimantent proprement (les tables gardent leurs largeurs exactes)
const r10 = (v) => Math.round(v / 10) * 10;

// ---- GABARIT ----
// Calcule, AVANT tout trace, l'affectation des fiches aux cases et les
// dimensions reelles de la grille. L'ordre est impose : la geometrie
// est arretee ici, le routage la lit ensuite telle quelle. Exporte pour
// que les controles et la verification lisent le gabarit retenu.
export function computeLayout(model) {
  const steps = model.steps || [];
  const actors = model.actors || [];
  // ordre des couloirs (RENDU SEULEMENT : le modele JSON conserve son
  // ordre d'acteurs, reference de l'evaluation) : premiere intervention
  const firstTouch = new Map();
  steps.forEach((s, j) => {
    (s.actors || [s.actor]).forEach((a) => { if (!firstTouch.has(a)) firstTouch.set(a, j); });
  });
  const rowActors = [...actors].sort((a, b) =>
    (firstTouch.has(a) ? firstTouch.get(a) : Infinity) - (firstTouch.has(b) ? firstTouch.get(b) : Infinity));
  const rowOfStep = (s) => Math.max(0, rowActors.indexOf(s.actor));

  // Affectation des fiches aux cases : deux fiches d'un meme acteur
  // dans une meme case ne restent empilees que si la concomitance est
  // affirmee par la representation intermediaire (stages tous
  // explicites) ; un partage survenu par defaut d'affectation est
  // re-etale sur des etages consecutifs et signale, plutot qu'absorbe
  // en silence par l'agrandissement de la case.
  const key = steps.map((s, j) => [s.stage || j + 1, 0]);
  const multiCells = [];
  const cellG = new Map();
  steps.forEach((s, j) => {
    const k = `${rowOfStep(s)}|${s.stage || j + 1}`;
    if (!cellG.has(k)) cellG.set(k, []);
    cellG.get(k).push(j);
  });
  for (const list of cellG.values()) {
    if (list.length < 2) continue;
    const s0 = steps[list[0]];
    const allExplicit = list.every((j) => steps[j].stage_given);
    if (!allExplicit) list.slice(1).forEach((j, i2) => { key[j][1] = i2 + 1; });
    multiCells.push({
      actor: s0.actor, stage: s0.stage,
      labels: list.map((j) => steps[j].label),
      action: allExplicit ? "empilees" : "reattribuees"
    });
  }
  const ck = key.map((k) => k[0] * 1000 + k[1]);
  const colKeys = [...new Set(ck)].sort((a, b) => a - b);
  const colIndex = new Map(colKeys.map((v, i) => [v, i]));
  const colOfStep = ck.map((v) => colIndex.get(v));
  const byCol = colKeys.map((_, c) => steps.map((s, j) => ({ s, j })).filter((x) => colOfStep[x.j] === c));

  // Largeur de colonne UNIQUE : besoin par colonne, maximum global,
  // borne entre COL_W et 300 px. Une largeur qui varierait d'une
  // colonne a l'autre serait une variable visuelle qui varie sans rien
  // signifier. Au-dela de la borne, le libelle est tronque et le texte
  // integral passe en infobulle.
  const PX_CHAR = 7.6;
  let needW = COL_W;
  steps.forEach((s) => {
    if (s.decision) return;
    const len = (s.label || "").length + (s.conflict ? 2 : 0) + (s.friction ? 2 : 0);
    needW = Math.max(needW, Math.ceil((len / 4) * PX_CHAR) + 44);
  });
  const colW = needW <= COL_W ? COL_W : Math.min(300, Math.max(COL_W, r10(needW)));
  const cardW = colW - 36;
  const charsPerLine = Math.max(10, Math.floor((cardW - 8) / PX_CHAR));
  const maxChars = charsPerLine * 4;

  // en-tete : passe a trois lignes si un titre d'etape long le demande
  const headChars = Math.max(12, Math.floor((colW - 12) / 6.6));
  let headerH = HEADER_H;
  byCol.forEach((group, c) => {
    const head = group.length > 1 ? `${c + 1}. ${group.length} activités simultanées` : `${c + 1}. ${group[0].s.label}`;
    if (Math.ceil(head.length / headChars) > 2) headerH = 64;
  });

  // dimensions des cartes : libelle eventuellement tronque (integral en
  // infobulle), hauteur selon le nombre de lignes a la largeur retenue
  const MARGIN = 10;
  const cardDim = steps.map((s) => {
    const flagLen = (s.conflict ? 2 : 0) + (s.friction ? 2 : 0);
    if (s.decision) return { h: 46, text: s.label || "", truncated: false };
    let text = s.label || "";
    let truncated = false;
    if (text.length + flagLen > maxChars) {
      text = text.slice(0, maxChars - flagLen - 1).trimEnd() + "…";
      truncated = true;
    }
    const lines = Math.ceil(Math.max(1, text.length + flagLen) / charsPerLine);
    return { h: Math.max(54, Math.min(96, 20 + lines * 13)), text, truncated };
  });

  // hauteur de ligne PAR ACTEUR : une ligne est un acteur, sa hauteur
  // ne signifie rien ; plancher a ACTOR_H (une ligne peu remplie ne se
  // reduit pas a un filet), sinon la plus haute pile de la ligne
  const rowHeights = rowActors.map(() => ACTOR_H);
  const cellLists = new Map();
  steps.forEach((s, j) => {
    const k = `${rowOfStep(s)}|${colOfStep[j]}`;
    if (!cellLists.has(k)) cellLists.set(k, []);
    cellLists.get(k).push(j);
  });
  const stackedSteps = new Set();
  for (const [k, list] of cellLists) {
    if (list.length > 1) list.forEach((j) => stackedSteps.add(j));
    const r = +k.split("|")[0];
    const hasDec = list.some((j) => steps[j].decision);
    let need = hasDec ? DEC_NEED : MARGIN;
    list.forEach((j) => { if (!steps[j].decision) need += cardDim[j].h + MARGIN; });
    rowHeights[r] = Math.max(rowHeights[r], need);
  }
  // position de chaque fiche dans sa case : empilement de haut en bas
  // dans l'ordre du recit, fiche seule centree comme auparavant
  const cardY = new Array(steps.length).fill(0);
  for (const [k, list] of cellLists) {
    const r = +k.split("|")[0];
    const plain = list.filter((j) => !steps[j].decision);
    const hasDec = list.length > plain.length;
    if (!hasDec && plain.length === 1) {
      const h = cardDim[plain[0]].h;
      cardY[plain[0]] = r10(Math.max(10, Math.round((rowHeights[r] - 36 - h) / 2) + 8));
    } else {
      let cur = hasDec ? DEC_NEED : MARGIN;
      plain.forEach((j) => { cardY[j] = Math.round(cur); cur += cardDim[j].h + MARGIN; });
    }
  }
  return { rowActors, rowOfStep, colOfStep, byCol, multiCells, colW, headerH, rowHeights, cardDim, cardY, stackedSteps };
}

function vertex(id, parent, style, value, x, y, w, h, alt, opts) {
  const inner = alt ? `<mxRectangle height="${h}" width="${w}" as="alternateBounds" />` : "";
  const geo = `<mxGeometry height="${h}" width="${w}" x="${x}" y="${y}" as="geometry">${inner}</mxGeometry>`;
  // tracabilite : la cellule est enveloppee dans un element object qui
  // porte le libelle, l'infobulle et la propriete personnalisee source
  // (visible au survol et dans "Modifier les donnees" de Draw.io)
  if (opts && opts.tooltip) {
    return `<object id="${id}" label="${esc(value)}" tooltip="${escAttr(opts.tooltip)}" source="${escAttr(opts.tooltip)}">` +
      `<mxCell parent="${parent}" style="${style}" vertex="1">${geo}</mxCell></object>`;
  }
  return `<mxCell id="${id}" parent="${parent}" style="${style}" value="${esc(value)}" vertex="1">${geo}</mxCell>`;
}

// Texte d'infobulle d'une valeur : phrase source (avec le nom de la
// transcription en cas de fusion) ou avertissement.
const NO_SOURCE = "Aucune phrase du texte ne soutient cette valeur — a verifier.";
const evidenceText = (prov) =>
  (prov ? `${prov.source ? prov.source + ", " : ""}l.${prov.line} : ${prov.excerpt}` : NO_SOURCE);

// Table d'identification du processus (commune aux deux pages).
// Les bornes extraites (declencheur, resultat) y figurent depuis la v4.
function identTable(out, prefix, parent, y, W, model) {
  const valueW = Math.max(120, (W - 2 * 185) / 2);
  const label = pcell({ fill: "#E7EAEC", fontSize: 10, fontColor: "#414A50", align: "left", valign: "middle", bold: true, spacingLeft: 6 });
  const value = pcell({ fill: "#FFFFFF", fontSize: 10, fontColor: "#2C3136", align: "left", valign: "middle", spacingLeft: 6 });
  out.push(vertex(`${prefix}_ident`, parent, S_TABLE_TITLED, "IDENTIFICATION DU PROCESSUS", X0, y, W, IDENT_H));
  const rows = [
    ["Processus", model.process || "Processus", "Pilote", PLACEHOLDER],
    ["Périmètre", PLACEHOLDER, "Référent", PLACEHOLDER],
    ["Déclencheur", model.trigger || PLACEHOLDER, "Résultat", model.outcome || PLACEHOLDER],
    ["Version", "[v0.1 — ébauche générée]", "Date", PLACEHOLDER]
  ];
  rows.forEach((r, i) => {
    const rid = `${prefix}_ident_r${i}`;
    out.push(vertex(rid, `${prefix}_ident`, S_ROW, "", 0, 26 + i * 32, W, 32));
    out.push(vertex(`${rid}_c0`, rid, label, r[0], 0, 0, 185, 32));
    out.push(vertex(`${rid}_c1`, rid, value, r[1], 185, 0, valueW, 32));
    out.push(vertex(`${rid}_c2`, rid, label, r[2], 185 + valueW, 0, 185, 32));
    out.push(vertex(`${rid}_c3`, rid, value, r[3], 370 + valueW, 0, valueW, 32));
  });
  return IDENT_H;
}

// Bande de metadonnees par etape (une table, une ligne par categorie).
// Chaque valeur est une chaine ou un objet { text, inferred } : une
// cellule entierement deduite est rendue en italique attenue.
function band(out, prefix, parent, y, W, title, rows, colW) {
  colW = colW || COL_W;
  const h = 26 + rows.reduce((a, r) => a + (r.h || ROW_H), 0);
  out.push(vertex(`${prefix}`, parent, S_TABLE_TITLED, title, X0, y, W, h));
  const label = pcell({ fill: "#E7EAEC", fontSize: 9, fontColor: "#2C3136", align: "left", valign: "middle", bold: true, spacingLeft: 6 });
  const value = pcell({ fill: "#FFFFFF", fontSize: 8, fontColor: "#2C3136", align: "left", valign: "top", spacingLeft: 6 });
  const valueInferred = pcell({ fill: "#FFFFFF", fontSize: 8, fontColor: "#8A8F94", align: "left", valign: "top", spacingLeft: 6, italic: true });
  let ry = 26;
  rows.forEach((r, i) => {
    const rh = r.h || ROW_H;
    const rid = `${prefix}_r${i}`;
    out.push(vertex(rid, prefix, S_ROW, "", 0, ry, W, rh));
    out.push(vertex(`${rid}_lab`, rid, label, r.label, 0, 0, LABEL_W, rh));
    r.values.forEach((v, j) => {
      const c = (v && typeof v === "object") ? v : { text: v, inferred: false };
      out.push(vertex(`${rid}_c${j}`, rid, c.inferred ? valueInferred : value, c.text,
        LABEL_W + j * colW, 0, colW, rh, false,
        c.text && c.tooltip ? { tooltip: c.tooltip } : undefined));
    });
    ry += rh;
  });
  return h;
}

// Page 1 : identification + grille Makigami + bandes de metadonnees.
// Depuis la v4, la colonne est le stage (rang temporel) : les etapes
// partageant un stage sont simultanees et occupent la meme colonne sur
// des lignes differentes.
// opts.bare : variante depouillee pour la page "Processus" — memes
// couloirs, cartes, losanges, fleches et ancres, mais sans bandes de
// metadonnees, sans encart, sans synthese, sans barre de temps ni
// marqueur diagnostique. Le mode par defaut (page Makigami) reste
// inchange octet pour octet.
function makigamiPage(model, opts = {}) {
  const bare = !!opts.bare;
  const actors = model.actors || [];
  const steps = model.steps || [];
  // gabarit arrete AVANT tout trace : affectation des fiches, largeur
  // de colonne unique, hauteurs de ligne reelles
  const layout = computeLayout(model);
  const { byCol, colOfStep, colW, headerH, rowHeights, cardDim, cardY, stackedSteps } = layout;
  const col = (s, j) => colOfStep[j];
  const M = Math.max(byCol.length, 1);
  const W = LABEL_W + M * colW;
  const out = [];
  out.push('<mxCell id="0" />');
  out.push('<mxCell id="maki_L0" parent="0" value="Processus" />');

  // duree exploitable d'une etape, en minutes
  const stepMinutes = (s) =>
    normalizeDuration(s.duration) ?? normalizeDuration(s.duration_max) ?? normalizeDuration(s.duration_min);
  const fmtMinutes = (min) => {
    if (min >= 1440) return `${Math.round(min / 144) / 10} j`;
    if (min >= 60) return `${Math.round(min / 6) / 10} h`;
    return `${Math.round(min)} min`;
  };
  // ordre des couloirs par premiere intervention (calcule dans le
  // gabarit ; rendu seulement, le modele JSON garde son ordre)
  const rowActors = layout.rowActors;
  const rowOfStep = layout.rowOfStep;

  let y = 112;
  if (bare) {
    // en-tete reduit de la page Processus : nom, declencheur, issue
    const labCell0 = pcell({ fill: "#E7EAEC", fontSize: 10, fontColor: "#414A50", align: "left", valign: "middle", bold: true, spacingLeft: 6 });
    const valCell0 = pcell({ fill: "#FFFFFF", fontSize: 10, fontColor: "#2C3136", align: "left", valign: "middle", spacingLeft: 6 });
    const identH = 26 + 2 * 32;
    out.push(vertex("maki_ident", "maki_L0", S_TABLE_TITLED,
      `PROCESSUS — ${model.process || "Processus"}`, X0, y, W, identH));
    [["Déclencheur", model.trigger || PLACEHOLDER], ["Résultat", model.outcome || PLACEHOLDER]]
      .forEach((r, i) => {
        const rid = `maki_ident_r${i}`;
        out.push(vertex(rid, "maki_ident", S_ROW, "", 0, 26 + i * 32, W, 32));
        out.push(vertex(`${rid}_c0`, rid, labCell0, r[0], 0, 0, 185, 32));
        out.push(vertex(`${rid}_c1`, rid, valCell0, r[1], 185, 0, W - 185, 32));
      });
    y += identH + 12;
  } else {
    y += identTable(out, "maki", "maki_L0", y, W, model) + 12;
  }

  // Aretes de flux entre stages consecutifs. Lien documentaire prefere :
  // A n'est reliee a B que si un document sortant de A figure parmi les
  // documents entrants de B ; a defaut de tout lien documentaire entre
  // les deux stages, maillage complet (le maillage integral de deux
  // stages multiples est illisible).
  const normDoc = (d) => String(d || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const flowPairs = [];
  for (let c = 1; c < M; c++) {
    const candidates = [];
    for (const a of byCol[c - 1]) {
      for (const b of byCol[c]) {
        const outDocs = (a.s.documents_out || []).map(normDoc).filter(Boolean);
        const inDocs = new Set((b.s.documents_in || []).map(normDoc).filter(Boolean));
        candidates.push({ a, b, doc: outDocs.some((d) => inDocs.has(d)) });
      }
    }
    const doc = candidates.filter((p) => p.doc);
    (doc.length ? doc : candidates).forEach((p) => flowPairs.push(p));
  }
  let transfers = 0;
  flowPairs.forEach((p) => { if (rowOfStep(p.a.s) !== rowOfStep(p.b.s)) transfers++; });
  const totalFlows = flowPairs.length;
  // les transferts ne sont epaissis que s'ils restent minoritaires :
  // au-dela, le taux de transfert de la synthese porte le diagnostic
  const emphTransfers = transfers > 0 && transfers * 2 < totalFlows;
  const hasBack = steps.some((s, j) => {
    if (!s.decision) return false;
    const k = steps.findIndex((t) => t.id === s.decision.on_no.return_to);
    return s.decision.on_no.return_to !== "fin" && k >= 0 && k !== j;
  });

  // Encart de synthese compact : une bande d'environ 40 px, une cellule
  // par indicateur, entierement calcule a partir du modele extrait.
  // (page Processus : aucune synthese)
  if (!bare) {
    const mins = steps.map(stepMinutes).filter((v) => v != null);
    const totalMin = mins.reduce((x, v) => x + v, 0);
    const frictions = steps.filter((s) => s.friction).length;
    const autos = steps.filter((s) => s.automated).length;
    let values = 0, inferredCount = 0;
    for (const s of steps) {
      const inf = s.inferred || {};
      ["documents_in", "documents_out", "data_in", "data_out", "tools"].forEach((f) =>
        (s[f] || []).forEach((v, i) => { if (v) { values++; if ((inf[f] || [])[i]) inferredCount++; } }));
      ["duration", "duration_min", "duration_max", "volume", "frequency", "friction", "procedure", "opportunity"].forEach((f) => {
        if (s[f]) { values++; if (inf[f]) inferredCount++; }
      });
    }
    const conflictCount = (model.conflicts || []).length;
    // lecture d'analyste (6b) : etape au temps dominant avec sa part,
    // couple d'acteurs le plus sollicite par les transferts
    let domIdx = -1, domMin = 0;
    steps.forEach((s, j) => {
      const v = stepMinutes(s);
      if (v != null && v > domMin) { domMin = v; domIdx = j; }
    });
    const pairCount = new Map();
    flowPairs.forEach((p) => {
      if (rowOfStep(p.a.s) === rowOfStep(p.b.s)) return;
      const key = `${p.a.s.actor} → ${p.b.s.actor}`;
      pairCount.set(key, (pairCount.get(key) || 0) + 1);
    });
    let topPair = null;
    for (const [k2, n2] of pairCount) if (!topPair || n2 > topPair[1]) topPair = [k2, n2];
    const short = (t) => (t.length > 26 ? t.slice(0, 25) + "…" : t);
    const items = [
      `Étapes : ${steps.length}`,
      `Acteurs : ${actors.length}`,
      `Transferts entre acteurs : ${transfers}/${totalFlows}`,
      mins.length ? `Temps cumulé : ${fmtMinutes(totalMin)} (${mins.length}/${steps.length} chiffrées)` : "Temps cumulé : —",
      `Frictions : ${frictions}`,
      `Automatisées : ${steps.length ? Math.round(100 * autos / steps.length) : 0} %`,
      `À vérifier : ${values ? Math.round(100 * inferredCount / values) : 0} %`
    ];
    if (domIdx >= 0 && totalMin > 0) {
      items.push(`Étape dominante : ${short(steps[domIdx].label)} (${Math.round(100 * domMin / totalMin)} % du temps)`);
    }
    if (topPair) items.push(`Transfert le plus sollicité : ${topPair[0]} (×${topPair[1]})`);
    if (conflictCount) items.push(`⚠ Contradictions : ${conflictCount}`);
    const synthCell = pcell({ fill: "#E7EAEC", fontSize: 8, fontColor: "#2C3136", align: "center", valign: "middle", bold: true });
    const cw = Math.floor(W / items.length);
    out.push(vertex("maki_synth", "maki_L0", S_TABLE_PLAIN, "", X0, y, W, 40));
    out.push(vertex("maki_synth_r0", "maki_synth", S_ROW, "", 0, 0, W, 40));
    items.forEach((t, i) => {
      const w = i === items.length - 1 ? W - cw * (items.length - 1) : cw;
      out.push(vertex(`maki_synth_c${i}`, "maki_synth_r0", synthCell, t, i * cw, 0, w, 40));
    });
    y += 52;
  }

  // Table Makigami : en-tete (coin + etapes), puis une ligne par acteur.
  // Les hauteurs de ligne viennent du gabarit (une ligne est un acteur,
  // sa hauteur ne signifie rien) ; les frontieres de colonnes restent
  // identiques d'une ligne a l'autre, condition des tables mxGraph.
  const rowPrefix = [0];
  rowHeights.forEach((h, i) => rowPrefix.push(rowPrefix[i] + h));
  const makiH = 34 + headerH + rowPrefix[rowHeights.length];
  const gridY = y;
  out.push(vertex("maki_grid", "maki_L0", S_TABLE_MAKI,
    `${bare ? "PROCESSUS" : "MAKIGAMI"} — ${model.process || "Processus"} · acteurs × étapes`, X0, y, W, makiH));
  out.push(vertex("maki_head", "maki_grid", S_ROW_MAKI, "", 0, 34, W, headerH));
  out.push(vertex("maki_head_corner", "maki_head", scell("#414A50", 10, headerH, true),
    "Acteurs ⟍ Étapes", 0, 0, LABEL_W, headerH, true));
  // en-tete : une colonne par stage ; un stage partage annonce le
  // nombre d'activites, les cartes portent les libelles
  byCol.forEach((group, c) => {
    const head = group.length > 1
      ? `${c + 1}. ${group.length} activités simultanées`
      : `${c + 1}. ${group[0].s.label}`;
    out.push(vertex(`maki_head_s${c}`, "maki_head", scell("#67747C", 11, headerH, true),
      head, LABEL_W + c * colW, 0, colW, headerH, true));
  });
  rowActors.forEach((a, i) => {
    const rid = `maki_row_${i}`;
    const fill = i % 2 === 0 ? "#FFFFFF" : "#F5F7F8";
    const rh = rowHeights[i];
    out.push(vertex(rid, "maki_grid", S_ROW_MAKI, "", 0, 34 + headerH + rowPrefix[i], W, rh));
    out.push(vertex(`${rid}_actor`, rid, scell("#67747C", 11, rh, true), a, 0, 0, LABEL_W, rh, true));
    for (let c = 0; c < M; c++) {
      out.push(vertex(`maki_cell_${i}_${c}`, rid, scell(fill, 0, 0, false), "", LABEL_W + c * colW, 0, colW, rh, true));
    }
  });
  // Cartes d'activite : une par etape, dans la cellule (responsable,
  // stage). Plusieurs cartes dans une meme cellule s'empilent. Une
  // etape porteuse d'une decision devient un losange qui affiche la
  // question (limitee en longueur, un losange etroit devient illisible).
  const cellOf = (i, c) => `maki_cell_${i}_${c}`;
  // geometrie absolue des formes, posee au rendu et utilisee par le
  // routeur : elle vient du gabarit reellement produit (hauteurs de
  // ligne variables), jamais des constantes
  const cellAbsX = (c) => X0 + LABEL_W + c * colW;
  const rowAbsY = (r) => gridY + 34 + headerH + rowPrefix[Math.min(r, rowHeights.length)];
  const cardRects = [], decRects = [], exitRects = [];
  // toutes les formes posees dans la grille, pour le choix des couloirs
  // horizontaux (une voie n'est retenue que si elle ne coupe rien)
  const obstacles = [];
  const addObstacle = (id, rect) => { obstacles.push({ id, ...rect }); return rect; };

  // Aretes : libelle pose par l'attribut value de la cellule d'arete,
  // toujours echappe (aucun HTML de la sortie du modele n'est
  // interprete) ; extraGeo permet d'injecter des points de passage.
  const edge = (id, style, valueText, source, target, extraGeo) =>
    `<mxCell id="${id}" parent="maki_L0" style="${style}" value="${esc(valueText)}" edge="1" source="${source}" target="${target}">` +
    `<mxGeometry relative="1" as="geometry">${extraGeo || ""}</mxGeometry></mxCell>`;
  const anchorStyle = (exit, entry) =>
    `exitX=${exit[0]};exitY=${exit[1]};exitDx=0;exitDy=0;entryX=${entry[0]};entryY=${entry[1]};entryDx=0;entryDy=0;`;

  // mise en evidence calculee : l'etape au temps de passage le plus
  // long recoit une bordure epaissie ; une etape a friction porte un
  // marqueur discret. Rien n'est invente : tout vient de l'extraction.
  const minsAll = steps.map(stepMinutes);
  let longestIdx = -1, bestMin = 0;
  minsAll.forEach((v, j) => { if (v != null && v > bestMin) { bestMin = v; longestIdx = j; } });
  steps.forEach((s, j) => {
    const i = rowOfStep(s);
    const c = col(s, j);
    const style = (rh) => cardStyle(s.automated, rh) + (!bare && j === longestIdx ? "strokeWidth=3;" : "");
    // repere de propriete, volontairement discret et systematique : le
    // drapeau evide localise les frictions, la gravite est portee par
    // le compteur de la synthese (a distinguer des mises en evidence
    // diagnostiques, qui doivent rester minoritaires). Page Processus :
    // libelle seul, aucun drapeau.
    const flag = bare ? "" : (s.conflict ? "⚠ " : "") + (s.friction ? "⚐ " : "");
    // infobulle de tracabilite : libelle integral si tronque, phrase de
    // contexte de l'etape, contradictions entre sources le cas echeant.
    // Page Processus : mode operatoire et duree seulement, rien de
    // visible sur le diagramme.
    const tipParts = [];
    if (cardDim[j].truncated) tipParts.push(s.label);
    if (bare) {
      if (s.procedure) tipParts.push(`Mode opératoire : ${s.procedure}`);
      const d = s.duration || s.duration_max || s.duration_min;
      if (d) tipParts.push(`Durée : ${d}`);
    } else {
      if (s.provenance && s.provenance.label) tipParts.push(evidenceText(s.provenance.label));
      if (s.conflictNotes && s.conflictNotes.length) tipParts.push("⚠ " + s.conflictNotes.join("\n⚠ "));
    }
    const tip = tipParts.length ? { tooltip: tipParts.join("\n") } : undefined;
    if (s.decision) {
      // etape a decision : DEUX formes empilees dans la cellule du
      // responsable — la carte d'activite (libelle conserve) puis le
      // losange qui teste son resultat, relies par une courte fleche.
      // C'est la sequence classique tache -> passerelle.
      out.push(vertex(`maki_card_${j}`, cellOf(i, c), style(false), flag + s.label,
        20, 2, colW - 36, 46, false, tip));
      cardRects[j] = addObstacle(`maki_card_${j}`, { x: cellAbsX(c) + 20, y: rowAbsY(i) + 2, w: colW - 36, h: 46 });
      const fullQ = s.decision.question || "";
      let q = fullQ;
      if (q.length > 30) q = q.slice(0, 29) + "…";
      // la question s'ecrit DANS le losange, en petit ; la question
      // complete reste accessible par l'infobulle
      const dx = r10((colW - DEC_S) / 2);
      out.push(vertex(`maki_dec_${j}`, cellOf(i, c),
        cardStyle(s.automated, true) + "fontSize=8;", q,
        dx, DEC_Y, DEC_S, DEC_S, false, { tooltip: fullQ }));
      decRects[j] = addObstacle(`maki_dec_${j}`, { x: cellAbsX(c) + dx, y: rowAbsY(i) + DEC_Y, w: DEC_S, h: DEC_S });
      out.push(edge(`maki_declink_${j}`,
        "html=1;endArrow=block;endFill=1;strokeColor=#8A6D00;strokeWidth=1;" + anchorStyle([0.5, 1], [0.5, 0]),
        "", `maki_card_${j}`, `maki_dec_${j}`));
      // le noeud de sortie "non" et l'eventuel terminateur "oui" sont
      // positionnes ici (et enregistres comme obstacles) pour que le
      // routage, qui suit, connaisse TOUTE la geometrie produite
      exitRects[j] = addObstacle(`maki_exit_${j}`, { x: cellAbsX(c) + 20, y: rowAbsY(i) + DEC_EXIT_Y, w: colW - 40, h: 22 });
      if (c === M - 1) {
        // terminateur aligne sur le median du losange
        addObstacle(`maki_term_yes_${j}`, { x: cellAbsX(c) + r10(colW - 50), y: rowAbsY(i) + DEC_Y + DEC_S / 2 - 20, w: 40, h: 40 });
      }
    } else {
      // position et dimensions arretees par le gabarit : empilement
      // dans l'ordre du recit, fiche seule centree dans sa case
      const { h, text } = cardDim[j];
      const yCard = cardY[j];
      out.push(vertex(`maki_card_${j}`, cellOf(i, c), style(false), flag + text,
        20, yCard, colW - 36, h, false, tip));
      cardRects[j] = addObstacle(`maki_card_${j}`, { x: cellAbsX(c) + 20, y: rowAbsY(i) + yCard, w: colW - 36, h });
    }
  });
  // Point noir du processus : l'unique marqueur diagnostique. L'etape
  // qui cumule le temps de passage le plus long ET une friction ; au
  // plus un par grille MIP, aucun pis-aller s'il n'existe pas.
  const blackspot = !bare && longestIdx >= 0 && steps[longestIdx].friction;
  if (blackspot) {
    // la carte d'activite existe desormais pour toutes les etapes, y
    // compris celles a decision
    out.push(vertex("maki_blackspot", `maki_card_${longestIdx}`,
      "ellipse;html=1;fillColor=#2C3136;strokeColor=#2C3136;", "",
      colW - 36 - 10, -5, 14, 14));
  }

  // Participants secondaires : carte allegee dans la cellule de chaque
  // participant, meme colonne, reliee au responsable par un trait fin
  // sans fleche (participation, pas enchainement).
  // le trait de liaison est route avec toutes les autres aretes, dans
  // le bloc ROUTAGE : aucune exception (c'est l'exception qui
  // produisait des traversees de pile de decision et de cartes
  // intercalees)
  const partPairs = [];
  // page Processus : le deroulement seul, sans cartes de participation
  if (!bare) steps.forEach((s, j) => {
    const respRow = rowOfStep(s);
    (s.actors || []).slice(1).forEach((a, k) => {
      const i = rowActors.indexOf(a);
      if (i < 0) return;
      const c = col(s, j);
      // carte de participation courte (elle signale, elle ne duplique
      // pas l'activite), centree dans la colonne comme la carte
      // responsable
      const px = r10((colW - 100) / 2);
      out.push(vertex(`maki_part_${j}_${k}`, cellOf(i, c), S_PART, "participe",
        px, 50, 100, 30, false, { tooltip: `Participe a : ${s.label}` }));
      const rect = addObstacle(`maki_part_${j}_${k}`, { x: cellAbsX(c) + px, y: rowAbsY(i) + 50, w: 100, h: 30 });
      partPairs.push({ j, k, i, respRow, c, rect });
    });
  });
  // ---- ROUTAGE ----
  // Le trace est calcule D'ABORD : tout segment vertical passe dans un
  // couloir inter-colonnes (36 px libres entre deux cartes), tout
  // segment horizontal longe une frontiere de lignes ou reste dans la
  // cellule source ; les ancres se deduisent de la direction des
  // segments adjacents. Une fleche ainsi construite ne peut traverser
  // aucune carte, par construction.
  const gridBottom = rowAbsY(rowActors.length);
  // voies dans un couloir vertical : chaque segment vertical recoit une
  // abscisse propre a l'interieur des 36 px du couloir
  const corridorSlots = new Map();
  const claimCorridor = (cIdx) => {
    const n = corridorSlots.get(cIdx) || 0;
    corridorSlots.set(cIdx, n + 1);
    return cellAbsX(cIdx) + ((n % 4) * 8 - 8);
  };
  // voies dans un couloir horizontal : un segment le long d'une
  // frontiere de lignes recoit une ordonnee libre — ni sur une forme
  // (verification contre la geometrie produite), ni sur une voie deja
  // prise a une abscisse commune. Faute de voie propre, la frontiere
  // est gardee et la configuration signalee plutot que masquee.
  const usedH = [];
  const hClear = (yy, x1, x2, excl) => !obstacles.some((o) =>
    !excl.includes(o.id) && yy > o.y + 1 && yy < o.y + o.h - 1 &&
    Math.min(x1, x2) < o.x + o.w - 1 && Math.max(x1, x2) > o.x + 1);
  const placeH = (bY, x1, x2, excl) => {
    for (const dy of [0, -6, 6, -12, 12, -18, 18]) {
      const yy = bY + dy;
      if (!hClear(yy, x1, x2, excl)) continue;
      if (usedH.some((u) => Math.abs(u.y - yy) < 2 &&
        Math.min(x1, x2) < u.x2 - 2 && Math.max(x1, x2) > u.x1 + 2)) continue;
      usedH.push({ y: yy, x1: Math.min(x1, x2), x2: Math.max(x1, x2) });
      return yy;
    }
    routeNotes.push(`couloir horizontal sature autour de y=${Math.round(bY)} : aucun trace propre disponible`);
    usedH.push({ y: bY, x1: Math.min(x1, x2), x2: Math.max(x1, x2) });
    return bY;
  };
  const routeNotes = [];
  const frac = (i, n) => Math.round(100 * (i + 1) / (n + 1)) / 100;
  const groupBy = (arr, key) => {
    const g = new Map();
    arr.forEach((x) => { const k = key(x); if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
    return g;
  };
  const ptsGeo = (pts) => (pts.length
    ? `<Array as="points">${pts.map(([px, py]) => `<mxPoint x="${Math.round(px)}" y="${Math.round(py)}" />`).join("")}</Array>`
    : "");

  // cotes de depart par proximite de la cible : meme ligne a droite,
  // cible plus basse par le bas, plus haute par le haut ; une source a
  // decision sort toujours du losange par la droite (le bas porte le
  // "non"). Meme logique pour les arrivees.
  flowPairs.forEach((p) => {
    p.dr = rowOfStep(p.b.s) - rowOfStep(p.a.s);
    p.srcRect = p.a.s.decision ? decRects[p.a.j] : cardRects[p.a.j];
    p.tgtRect = cardRects[p.b.j];
    // une fiche EMPILEE ne peut sortir ni entrer par le haut ou le bas
    // sans traverser sa voisine de pile : elle passe par ses flancs et
    // le couloir vertical voisin. Une cible a DECISION est un bloc
    // (carte + losange + noeud de sortie) : on vise la carte par le
    // haut ou par un flanc, jamais par le bas (la verticale longerait
    // la pile).
    p.exitSide = p.a.s.decision || p.dr === 0 || stackedSteps.has(p.a.j)
      ? "R" : p.dr > 0 ? "B" : "T";
    p.entrySide = (p.exitSide !== "R" && !stackedSteps.has(p.b.j) && Math.abs(p.dr) === 1 &&
      !(p.b.s.decision && p.dr < 0))
      ? (p.dr > 0 ? "T" : "B") : "L";
  });
  // la repartition se fait par COTE PHYSIQUE d'une forme, tous roles
  // confondus : le haut d'une carte peut porter une entree ET une
  // sortie, qui doivent recevoir des abscisses distinctes
  const uses = new Map();
  const addUse = (node, side, item) => {
    const k = `${node}|${side}`;
    if (!uses.has(k)) uses.set(k, []);
    uses.get(k).push(item);
  };
  flowPairs.forEach((p) => {
    addUse(p.a.s.decision ? `d${p.a.j}` : `c${p.a.j}`, p.exitSide, { p, role: "exit", other: rowOfStep(p.b.s) });
    addUse(`c${p.b.j}`, p.entrySide, { p, role: "entry", other: rowOfStep(p.a.s) });
  });
  // un trait de participation ne traverse pas la grille sur plus de
  // deux lignes : au-dela, la carte allegee (deja placee dans la ligne
  // du participant) suffit, sans trait
  const linkedParts = partPairs.filter((q) => Math.abs(q.i - q.respRow) <= 2);
  // les traits de participation qui devront passer par le couloir
  // entrent par le flanc gauche de la carte responsable : ils prennent
  // leur place dans la repartition du cote comme n'importe quelle arete
  linkedParts.forEach((q) => {
    addUse(`c${q.j}`, "L", { p: q, role: "entry", other: q.i });
  });
  // les retours entrent aussi par le flanc gauche de leur cible : ils
  // participent a la meme repartition (tries apres les flux)
  const backPairs = [];
  steps.forEach((s, j) => {
    if (!s.decision) return;
    const k = steps.findIndex((t) => t.id === s.decision.on_no.return_to);
    if (s.decision.on_no.return_to !== "fin" && k >= 0 && k !== j) {
      const bp = { j, k };
      backPairs.push(bp);
      addUse(`c${k}`, "L", { p: bp, role: "entry", other: rowActors.length + j });
    }
  });
  for (const list of uses.values()) {
    list.sort((u, v) => u.other - v.other);
    list.forEach((u, i) => {
      const f = list.length > 1 ? frac(i, list.length) : 0.5;
      if (u.role === "exit") u.p.exitFrac = f; else u.p.entryFrac = f;
    });
  }
  // les horizontales calees sur des medianes de cartes ne peuvent pas
  // bouger : elles sont inscrites AVANT tout placement de voie pour que
  // l'allocateur (placeH) les evite au lieu de s'y poser
  const noteH = (yy, x1, x2) => usedH.push({ y: yy, x1: Math.min(x1, x2), x2: Math.max(x1, x2) });
  flowPairs.forEach((p) => {
    const S = p.srcRect, T = p.tgtRect;
    const c2 = col(p.b.s, p.b.j);
    if (p.dr === 0 || p.exitSide === "R") {
      const sy = S.y + p.exitFrac * S.h;
      const ty = T.y + p.entryFrac * T.h;
      noteH(sy, S.x + S.w, T.x);
      if (Math.abs(sy - ty) > 4) noteH(ty, cellAbsX(c2) - 16, T.x);
    } else if (p.entrySide === "L") {
      noteH(T.y + p.entryFrac * T.h, cellAbsX(c2) - 16, T.x);
    }
  });
  linkedParts.forEach((q) => {
    const R = cardRects[q.j];
    const f = q.entryFrac || 0.5;
    noteH(q.rect.y + q.rect.h / 2, cellAbsX(q.c) - 16, q.rect.x);
    noteH(R.y + f * R.h, cellAbsX(q.c) - 16, R.x);
  });
  backPairs.forEach((bp) => {
    const K = cardRects[bp.k];
    const f = bp.entryFrac || 0.5;
    // l'entree du retour arrive desormais depuis le couloir exterieur
    // gauche : la reservation couvre toute la course horizontale
    noteH(K.y + f * K.h, 0, K.x);
  });
  // un transfert entre acteurs est trace plus marque UNIQUEMENT si les
  // transferts restent minoritaires ; sinon la synthese porte le chiffre
  flowPairs.forEach((p) => {
    const S = p.srcRect, T = p.tgtRect;
    const r1 = rowOfStep(p.a.s);
    const c2 = col(p.b.s, p.b.j);
    const srcId = p.a.s.decision ? `maki_dec_${p.a.j}` : `maki_card_${p.a.j}`;
    const tgtId = `maki_card_${p.b.j}`;
    let exit, entry, pts = [];
    if (p.dr === 0) {
      // meme ligne : tout droit si depart et arrivee sont alignes ;
      // sinon (pile de decision en cible, hauteurs de cartes
      // differentes, cible empilee) le decroche se fait DANS le
      // couloir, jamais le long du losange ou d'une carte voisine
      const sy = S.y + p.exitFrac * S.h;
      const ty = T.y + p.entryFrac * T.h;
      exit = [1, p.exitFrac];
      entry = [0, p.entryFrac];
      if (Math.abs(sy - ty) > 4) {
        const cx = claimCorridor(c2);
        pts = [[cx, sy], [cx, ty]];
      }
    } else if (p.exitSide === "R") {
      // losange ou fiche empilee : sortie droite, descente ou remontee
      // dans le couloir, entree par la gauche au niveau de la cible
      const sy = S.y + p.exitFrac * S.h;
      const ty = T.y + p.entryFrac * T.h;
      const cx = claimCorridor(c2);
      exit = [1, p.exitFrac];
      entry = [0, p.entryFrac];
      pts = [[cx, sy], [cx, ty]];
    } else if (p.entrySide === "T" || p.entrySide === "B") {
      // ligne adjacente : sortie bas/haut, voie horizontale le long de
      // la frontiere partagee, entree haut/bas de la cible
      const ax = S.x + p.exitFrac * S.w;
      const tx = T.x + p.entryFrac * T.w;
      const by = placeH(p.dr > 0 ? rowAbsY(r1 + 1) : rowAbsY(r1), ax, tx, [srcId, tgtId]);
      exit = [p.exitFrac, p.dr > 0 ? 1 : 0];
      entry = [p.entryFrac, p.dr > 0 ? 0 : 1];
      pts = [[ax, by], [tx, by]];
    } else {
      // cible eloignee ou empilee : sortie bas/haut jusqu'a la voie de
      // frontiere, couloir vertical, entree par la gauche de la cible
      const ax = S.x + p.exitFrac * S.w;
      const cx = claimCorridor(c2);
      const by = placeH(p.dr > 0 ? rowAbsY(r1 + 1) : rowAbsY(r1), ax, cx, [srcId, tgtId]);
      const ty = T.y + p.entryFrac * T.h;
      exit = [p.exitFrac, p.dr > 0 ? 1 : 0];
      entry = [0, p.entryFrac];
      pts = [[ax, by], [cx, by], [cx, ty]];
    }
    const transfer = p.dr !== 0;
    const st = (transfer && emphTransfers ? S_FLOW.replace("strokeWidth=1.5", "strokeWidth=2.5") : S_FLOW) +
      anchorStyle(exit, entry);
    out.push(edge(`maki_flow_${p.a.j}_${p.b.j}`, st, p.a.s.decision ? "oui" : "", srcId, tgtId, ptsGeo(pts)));
  });

  // Traits de participation : routes comme toutes les autres aretes.
  // Verticale directe dans l'axe de la colonne si le chemin est libre
  // (verification contre la geometrie produite) ; sinon sortie par le
  // flanc, couloir a gauche de la colonne, entree par le flanc de la
  // carte responsable a la hauteur repartie par le cote.
  const vClear = (x, yA, yB, excl) => !obstacles.some((o) =>
    !excl.includes(o.id) && x > o.x + 1 && x < o.x + o.w - 1 &&
    Math.min(yA, yB) < o.y + o.h - 1 && Math.max(yA, yB) > o.y + 1);
  partPairs.forEach((q) => {
    const partId = `maki_part_${q.j}_${q.k}`;
    const respId = `maki_card_${q.j}`;
    // au-dela de deux lignes d'ecart, pas de trait : la carte allegee
    // dans la ligne du participant porte l'information a elle seule
    if (Math.abs(q.i - q.respRow) > 2) {
      routeNotes.push(`participation sans trait (${Math.abs(q.i - q.respRow)} lignes d'ecart) : ${partId} vers ${respId}`);
      return;
    }
    const P = q.rect, R = cardRects[q.j];
    const below = q.i > q.respRow;
    const midX = P.x + P.w / 2;
    const yA = below ? R.y + R.h : P.y + P.h;
    const yB = below ? P.y : R.y;
    // la pile de decision est un bloc : une verticale directe vers une
    // carte a decision longerait losange et noeud de sortie
    const blocked = steps[q.j].decision && below;
    if (!blocked && vClear(midX, yA, yB, [partId, respId])) {
      out.push(edge(`maki_partlink_${q.j}_${q.k}`,
        S_LINK + anchorStyle(below ? [0.5, 0] : [0.5, 1], below ? [0.5, 1] : [0.5, 0]),
        "", partId, respId));
      return;
    }
    const cx = claimCorridor(q.c);
    const py = P.y + P.h / 2;
    const f = q.entryFrac || 0.5;
    const ry = R.y + f * R.h;
    out.push(edge(`maki_partlink_${q.j}_${q.k}`,
      S_LINK + anchorStyle([0, 0.5], [0, f]),
      "", partId, respId, ptsGeo([[cx, py], [cx, ry]])));
  });

  // Un losange a toujours exactement deux sorties etiquetees :
  // - "oui" : le stage suivant, ou un terminateur si la decision est au
  //   dernier stage ;
  // - "non" : l'arete porte "non" et mene au noeud de sortie (carte de
  //   style distinct sous le losange, dans la meme cellule) qui porte
  //   l'action de sortie ; de la, retour eventuel a l'etape indiquee.
  // chaque branche de retour recoit son propre couloir horizontal sous
  // la grille (etage de 20 px), pour que deux retours ne se recouvrent
  // jamais ; l'espace est reserve avant les bandes de metadonnees
  const backLanes = [];
  steps.forEach((s, j) => {
    if (!s.decision) return;
    const k = steps.findIndex((t) => t.id === s.decision.on_no.return_to);
    if (s.decision.on_no.return_to !== "fin" && k >= 0 && k !== j) backLanes.push(j);
  });
  steps.forEach((s, j) => {
    if (!s.decision) return;
    const i = rowOfStep(s);
    const c = col(s, j);
    // issue "oui" d'une decision au dernier stage : petit cercle de fin
    // (40 px), a droite du losange, convention des evenements de fin
    if (c === M - 1) {
      out.push(vertex(`maki_term_yes_${j}`, cellOf(i, c), S_TERMINATOR, "Fin", r10(colW - 50), DEC_Y + DEC_S / 2 - 20, 40, 40));
      out.push(edge(`maki_flow_yes_${j}`, S_FLOW + anchorStyle([1, 0.5], [0, 0.5]), "oui", `maki_dec_${j}`, `maki_term_yes_${j}`));
    }
    // issue "non" : noeud de sortie portant l'action, sous le losange ;
    // l'arete part du flanc GAUCHE du losange et contourne, pour que
    // son libelle "non" ne chevauche ni le losange ni la carte de sortie
    // (le rectangle du noeud est deja enregistre comme obstacle par la
    // passe des cartes, avant tout routage)
    const exitId = `maki_exit_${j}`;
    out.push(vertex(exitId, cellOf(i, c), S_EXIT, s.decision.on_no.label, 20, DEC_EXIT_Y, colW - 40, 22));
    // cas nominal : la carte de sortie est posee juste sous le losange
    // — un segment vertical court (bas du losange -> haut au centre de
    // la carte), sans point de passage ; l'etiquette "non" est decalee
    // a droite du trait par la geometrie du label, pas posee dessus.
    // Le bas du losange est libre : le lien carte->losange entre par le
    // haut et le "oui" sort par la droite.
    const D0 = decRects[j], E0 = exitRects[j];
    const decCx = D0.x + D0.w / 2;
    const exitUnder = E0.y >= D0.y + D0.h && decCx >= E0.x && decCx <= E0.x + E0.w;
    if (exitUnder) {
      out.push(edge(`maki_flow_no_${j}`,
        S_FLOW_NO_LOCAL + anchorStyle([0.5, 1], [0.5, 0]),
        "non", `maki_dec_${j}`, exitId,
        '<mxPoint x="16" y="0" as="offset" />'));
    } else {
      // sortie non situee sous le losange : ancien contournement par le
      // flanc gauche
      out.push(edge(`maki_flow_no_${j}`, S_FLOW_NO_LOCAL + anchorStyle([0, 0.5], [0.1, 0]), "non", `maki_dec_${j}`, exitId));
    }
    // retour eventuel du noeud de sortie vers une etape anterieure :
    // descente le long des couloirs inter-colonnes, couloir horizontal
    // dedie sous la grille (un etage par retour), remontee dans le
    // couloir a gauche de la cible, entree par la gauche : le trace ne
    // traverse jamais une cellule occupee
    const back = s.decision.on_no.return_to;
    const k = steps.findIndex((t) => t.id === back);
    if (back !== "fin" && k >= 0 && k !== j) {
      // couloir EXTERIEUR, jamais a travers la grille : sortie par la
      // droite de la carte, descente dans le couloir inter-colonnes
      // suivant, passage SOUS la grille, remontee le long du cote
      // GAUCHE de la table (entre le bord de page et la table), entree
      // par la gauche de la cible. Chaque retour a son etage sous la
      // grille et son abscisse exterieure, echelonnes.
      const backIdx = backLanes.indexOf(j);
      const laneY = r10(gridBottom + 12 + backIdx * 20);
      const xOut = Math.max(6, X0 - 14 - backIdx * 8);
      const scxR = claimCorridor(Math.min(c + 1, M));
      const kc = col(steps[k], k);
      const K = cardRects[k];
      // hauteur d'entree repartie avec les autres arrivees par la gauche
      const bf = ((backPairs.find((b) => b.j === j) || {}).entryFrac) || 0.5;
      const tty = K.y + bf * K.h;
      // l'entree par la gauche longe les colonnes qui precedent la
      // cible : si une carte s'y trouve a cette hauteur, repli sur la
      // remontee en couloir interieur a gauche de la colonne cible
      const entryBlocked = obstacles.some((o) =>
        o.id !== `maki_card_${k}` &&
        tty > o.y + 1 && tty < o.y + o.h - 1 &&
        o.x + o.w > xOut && o.x < K.x - 2);
      let pts;
      if (!entryBlocked) {
        pts = [[scxR, laneY], [xOut, laneY], [xOut, tty]];
      } else {
        const tcx = claimCorridor(kc);
        pts = [[scxR, laneY], [tcx, laneY], [tcx, tty]];
        routeNotes.push(`retour de l'etape ${j + 1} : colonne(s) occupee(s) devant la cible, remontee en couloir interieur`);
      }
      // les fleches de retour sont rares et toujours significatives :
      // emphase permanente
      out.push(edge(`maki_flow_back_${j}`,
        S_FLOW_NO.replace("strokeWidth=1.5", "strokeWidth=2.5") + anchorStyle([1, 0.5], [0, bf]),
        "", exitId, `maki_card_${k}`, ptsGeo(pts)));
    }
  });
  // reserve l'espace des couloirs de retour avant les bandes
  y += makiH + 18 + (backLanes.length ? backLanes.length * 20 + 6 : 0);
  // configurations sans trace propre : signalees, jamais masquees
  lastRouteNotes = routeNotes;

  // Bandes de metadonnees : les champs extraits sont remplis (avec
  // marqueur et attenuation pour les valeurs deduites), seul le champ
  // VA / NVA, jugement metier non extrait, garde son espace reserve.
  // Une cellule de bande agrege les etapes de sa colonne (stage) ; la
  // cellule entiere n'est attenuee que si tout son contenu est deduit.
  // Quand la provenance est disponible, la cellule porte une infobulle
  // citant la phrase source de chaque valeur (ou l'avertissement pour
  // une valeur deduite).
  // page Processus : AUCUNE bande, aucun encart, aucune barre de temps
  let maxMin = 0;
  if (!bare) {
  const listCell = (group, field) => {
    const parts = [], tips = [];
    let all = true, any = false;
    group.forEach(({ s }) => {
      const flags = (s.inferred && s.inferred[field]) || [];
      const prov = (s.provenance && s.provenance[field]) || null;
      (s[field] || []).forEach((v, i) => {
        if (!v) return;
        any = true;
        if (!flags[i]) all = false;
        parts.push(flags[i] ? INFER_MARK + v : v);
        if (prov !== null || flags[i]) tips.push(`« ${v} » — ${flags[i] ? NO_SOURCE : evidenceText(prov && prov[i])}`);
      });
    });
    return { text: parts.join(", "), inferred: any && all, tooltip: tips.length ? tips.join("\n") : undefined };
  };
  const scalCell = (group, field) => {
    const parts = [], tips = [];
    let all = true, any = false;
    group.forEach(({ s }) => {
      const v = s[field];
      if (!v) return;
      any = true;
      const inf = !!(s.inferred && s.inferred[field]);
      if (!inf) all = false;
      parts.push(inf ? INFER_MARK + v : v);
      if (s.provenance !== undefined) tips.push(inf ? NO_SOURCE : evidenceText(s.provenance && s.provenance[field]));
    });
    return { text: parts.join(" / "), inferred: any && all, tooltip: tips.length ? tips.join("\n") : undefined };
  };
  const per = (fn) => byCol.map(fn);
  const ph = () => byCol.map(() => PLACEHOLDER);
  const bands = [
    ["maki_doc", "DOCUMENTS", [
      { label: "Documents entrants", values: per((g) => listCell(g, "documents_in")) },
      { label: "Documents sortants", values: per((g) => listCell(g, "documents_out")) }
    ]],
    ["maki_don", "DONNÉES", [
      { label: "Données entrantes", values: per((g) => listCell(g, "data_in")) },
      { label: "Données sortantes", values: per((g) => listCell(g, "data_out")) }
    ]],
    ["maki_out", "OUTILS / SYSTÈMES", [
      { label: "Outils / systèmes", values: per((g) => listCell(g, "tools")) }
    ]],
    ["maki_tps", "TEMPS (par étape)", [
      { label: "Temps min", values: per((g) => scalCell(g, "duration_min")) },
      { label: "Temps max", values: per((g) => scalCell(g, "duration_max")) },
      { label: "Délai (temps écoulé)", values: per((g) => scalCell(g, "duration")) },
      { label: "VA / NVA (à qualifier)", values: ph() }
    ]],
    ["maki_vol", "VOLUMES ET FRÉQUENCE", [
      { label: "Volume", values: per((g) => scalCell(g, "volume")) },
      { label: "Fréquence", values: per((g) => scalCell(g, "frequency")) }
    ]],
    ["maki_pb", "PROBLÈMES / OPPORTUNITÉS & SOLUTIONS (par étape)", [
      { label: "Problèmes / risques", values: per((g) => scalCell(g, "friction")) },
      { label: "Opportunités / solutions", values: per((g) => scalCell(g, "opportunity")) }
    ]],
    ["maki_mo", "MODE OPÉRATOIRE (par étape)", [
      { label: "Déroulé", values: per((g) => scalCell(g, "procedure")), h: 72 }
    ]]
  ];
  bands.forEach(([prefix, title, rows]) => {
    y += band(out, prefix, "maki_L0", y, W, title, rows, colW) + 10;
  });

  // Encart v6 : regles metier, exceptions et incertitudes du niveau
  // processus. Contextuel (absent si rien n'est extrait), valeurs
  // deduites en "≈" italique attenue, exception rattachee a son etape
  // par numero, provenance en infobulle comme partout ailleurs.
  {
    const ip = model.inferredProcess || {};
    const pp = model.provenanceProcess || {};
    const fams = [
      ["Règle métier", model.rules || [], ip.rules || [], pp.rules || [], (x) => x, () => null],
      ["Exception", model.exceptions || [], ip.exceptions || [], pp.exceptions || [], (x) => (x && x.text) || "", (x) => x && x.step_id],
      ["Incertitude", model.uncertainties || [], ip.uncertainties || [], pp.uncertainties || [], (x) => x, () => null]
    ];
    const items = [];
    fams.forEach(([famLabel, arr, flags, prov, textOf, stepOf]) => {
      arr.forEach((x, i) => {
        let text = textOf(x);
        if (!text) return;
        const sid = stepOf(x);
        if (sid) {
          const k = steps.findIndex((s) => s.id === sid);
          if (k >= 0) text += ` [étape ${k + 1}]`;
        }
        items.push({ famLabel, text, inferred: !!flags[i], prov: prov[i] || null });
      });
    });
    if (items.length) {
      const labCell = pcell({ fill: "#E7EAEC", fontSize: 9, fontColor: "#2C3136", align: "left", valign: "middle", bold: true, spacingLeft: 6 });
      const valCell = pcell({ fill: "#FFFFFF", fontSize: 8, fontColor: "#2C3136", align: "left", valign: "middle", spacingLeft: 6 });
      const valInf = pcell({ fill: "#FFFFFF", fontSize: 8, fontColor: "#8A8F94", align: "left", valign: "middle", spacingLeft: 6, italic: true });
      const charsPerLine = Math.max(40, Math.floor((W - LABEL_W - 12) / 6.2));
      const rowHeights2 = items.map((it) => Math.max(26, 12 + Math.ceil(it.text.length / charsPerLine) * 14));
      const H = 26 + rowHeights2.reduce((a, h) => a + h, 0);
      out.push(vertex("maki_rei", "maki_L0", S_TABLE_TITLED, "RÈGLES, EXCEPTIONS ET INCERTITUDES", X0, y, W, H));
      let ry = 26;
      items.forEach((it, i) => {
        const rid = `maki_rei_r${i}`;
        const rh = rowHeights2[i];
        out.push(vertex(rid, "maki_rei", S_ROW, "", 0, ry, W, rh));
        out.push(vertex(`${rid}_lab`, rid, labCell, it.famLabel, 0, 0, LABEL_W, rh));
        const tip = it.inferred ? NO_SOURCE : (it.prov ? evidenceText(it.prov) : "");
        out.push(vertex(`${rid}_val`, rid, it.inferred ? valInf : valCell,
          (it.inferred ? INFER_MARK : "") + it.text, LABEL_W, 0, W - LABEL_W, rh, false,
          tip ? { tooltip: tip } : undefined));
        ry += rh;
      });
      y += H + 10;
    }
  }

  // Barre de temps du Makigami authentique : dans la ligne "Delai", une
  // barre proportionnelle au temps de passage, normalisee sur l'etape la
  // plus longue (duration, sinon borne haute de la fourchette).
  const minutes = byCol.map((g) => {
    const vals = g.map(({ s }) => stepMinutes(s)).filter((v) => v != null);
    return vals.length ? Math.max(...vals) : null;
  });
  maxMin = Math.max(0, ...minutes.filter((v) => v != null));
  if (maxMin > 0) {
    minutes.forEach((v, c) => {
      if (v == null || v <= 0) return;
      const w = Math.max(4, Math.round((colW - 16) * v / maxMin));
      out.push(vertex(`maki_bar_${c}`, `maki_tps_r2_c${c}`, S_TIMEBAR, "", 10, ROW_H - 10, w, 5));
    });
  }
  } // fin des blocs propres a la page Makigami complete

  // Legende contextuelle : seules les conventions effectivement
  // utilisees dans ce diagramme sont listees, en tableau symbole /
  // signification.
  {
    const anyInferred = steps.some((s) => {
      const inf = s.inferred || {};
      return Object.values(inf).some((v) => (Array.isArray(v) ? v.some(Boolean) : !!v));
    });
    const entries = [];
    entries.push(["Carte jaune", "étape réalisée par une personne"]);
    if (steps.some((s) => s.automated)) entries.push(["Carte bleue", "étape automatisée (système)"]);
    if (!bare && steps.some((s) => (s.actors || []).length > 1)) entries.push(["Carte pâle + trait fin", "participant à l'étape (le responsable porte la carte pleine)"]);
    if (steps.some((s) => s.decision)) entries.push(["Losange", "décision : « oui » flèche pleine, « non » tiret rouge vers la carte rouge d'action de sortie"]);
    if (!bare && anyInferred) entries.push(["« ≈ » + italique gris", "valeur déduite par le modèle, à vérifier (survoler pour lire la phrase source)"]);
    if (maxMin > 0) entries.push(["Barre jaune", "temps de passage relatif à l'étape la plus longue"]);
    if (!bare && longestIdx >= 0) entries.push(["Bordure épaisse", "étape au temps de passage le plus long"]);
    if (!bare && steps.some((s) => s.friction)) entries.push(["⚐", "friction relevée sur l'étape (repère, la gravité est dans la synthèse)"]);
    if (!bare && longestIdx >= 0 && steps[longestIdx].friction) entries.push(["● (pastille noire)", "point noir du processus : l'étape la plus longue porte aussi une friction"]);
    if (emphTransfers) entries.push(["Flèche épaissie", "transfert entre acteurs"]);
    if (hasBack) entries.push(["Tiret rouge épaissi remontant", "retour vers une étape antérieure"]);
    if (!bare && (model.conflicts || []).length) entries.push(["⚠", "contradiction entre les sources, a arbitrer"]);
    const LH = 26 + entries.length * 20;
    out.push(vertex("maki_legend", "maki_L0", S_TABLE_TITLED, "LÉGENDE", X0, y, W, LH));
    const symCell = pcell({ fill: "#FFF6D6", fontSize: 8, fontColor: "#8A6D00", align: "left", valign: "middle", bold: true, spacingLeft: 6 });
    const meanCell = pcell({ fill: "#FFFFFF", fontSize: 8, fontColor: "#2C3136", align: "left", valign: "middle", spacingLeft: 6 });
    entries.forEach((e, i) => {
      const rid = `maki_legend_r${i}`;
      out.push(vertex(rid, "maki_legend", S_ROW, "", 0, 26 + i * 20, W, 20));
      out.push(vertex(`${rid}_sym`, rid, symCell, e[0], 0, 0, 170, 20));
      out.push(vertex(`${rid}_txt`, rid, meanCell, e[1], 170, 0, W - 170, 20));
    });
    y += LH + 10;
  }

  const pageW = r10(W + 2 * X0);
  const pageH = r10(y + 60);
  return `<diagram id="${bare ? "proc" : "maki"}" name="${bare ? "Processus" : "Makigami"}">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0">
      <root>
        ${out.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>`;
}

// Page "Processus" : le deroulement seul, sans metadonnees. Meme
// grille native, memes cartes, losanges, fleches et ancres que la page
// Makigami (mode depouille) ; les ids sont prefixes proc- pour ne
// jamais entrer en collision avec la page Makigami, seule page lue par
// le parseur de la relecture.
function processPage(model) {
  return makigamiPage(model, { bare: true }).replace(/"maki_/g, '"proc-');
}

// notes du dernier routage (configurations sans trace propre), relues
// par renderChecks pour remonter l'information a l'utilisateur
let lastRouteNotes = [];

// Page 2 : matrice RACI (une ligne par activite, une colonne par acteur).
// R est pre-rempli pour l'acteur qui realise l'etape, le reste est a
// completer par le metier (A, C, I).
function raciPage(model) {
  const actors = model.actors || [];
  const steps = model.steps || [];
  const NUM_W = 46, ACT_W = 420, MARK_W = 96, RH = 44, HH = 46;
  const W = NUM_W + ACT_W + actors.length * MARK_W;
  const out = [];
  out.push('<mxCell id="0" />');
  out.push('<mxCell id="raci_L0" parent="0" value="Processus" />');

  let y = 112;
  y += identTable(out, "raci", "raci_L0", y, W, model) + 14;

  const tableH = HH + steps.length * RH;
  out.push(vertex("raci_tab", "raci_L0", S_TABLE_PLAIN, "", X0, y, W, tableH));

  const headDark = pcell({ fill: "#414A50", fontSize: 11, fontColor: "#FFFFFF", align: "center", valign: "middle", bold: true });
  const headTitle = pcell({ fill: "#414A50", fontSize: 12, fontColor: "#FFFFFF", align: "center", valign: "middle", bold: true });
  const headActor = pcell({ fill: "#67747C", fontSize: 9, fontColor: "#FFFFFF", align: "center", valign: "middle", bold: true });
  out.push(vertex("raci_head", "raci_tab", S_ROW, "", 0, 0, W, HH));
  out.push(vertex("raci_head_num", "raci_head", headDark, "#", 0, 0, NUM_W, HH));
  out.push(vertex("raci_head_act", "raci_head", headTitle, "ACTIVITÉ", NUM_W, 0, ACT_W, HH));
  actors.forEach((a, i) => {
    out.push(vertex(`raci_head_a${i}`, "raci_head", headActor, a, NUM_W + ACT_W + i * MARK_W, 0, MARK_W, HH));
  });

  const numCell = pcell({ fill: "#E7EAEC", fontSize: 11, fontColor: "#2C3136", align: "center", valign: "middle", bold: true });
  const markCell = pcell({ fill: "#FFFFFF", fontSize: 12, fontColor: "#2C3136", align: "center", valign: "middle" });
  steps.forEach((s, j) => {
    const rid = `raci_row_${j}`;
    const actFill = j % 2 === 0 ? "#FFFFFF" : "#F5F7F8";
    const actCell = pcell({ fill: actFill, fontSize: 10, fontColor: "#2C3136", align: "left", valign: "middle", spacingLeft: 6 });
    out.push(vertex(rid, "raci_tab", S_ROW, "", 0, HH + j * RH, W, RH));
    out.push(vertex(`${rid}_num`, rid, numCell, String(j + 1), 0, 0, NUM_W, RH));
    out.push(vertex(`${rid}_act`, rid, actCell, s.label, NUM_W, 0, ACT_W, RH));
    actors.forEach((a, i) => {
      // R = realise (premier acteur), C = participe (consulte)
      const list = s.actors || [s.actor];
      const mark = a === list[0] ? "R" : list.includes(a) ? "C" : "";
      out.push(vertex(`${rid}_m${i}`, rid, markCell, mark, NUM_W + ACT_W + i * MARK_W, 0, MARK_W, RH));
    });
  });
  y += tableH + 12;

  out.push(vertex("raci_legend", "raci_L0", S_LEGEND,
    "Légende : R = Réalise · A = Approuve (1 seul par ligne) · C = Consulté · I = Informé.", X0, y, W, 24));

  const pageW = r10(W + 2 * X0);
  const pageH = r10(y + 24 + 60);
  return `<diagram id="raci" name="RACI">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0">
      <root>
        ${out.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>`;
}

// ---- COMPOSITION DU FICHIER ----
// Le livrable reste UN fichier .drawio dont TOUTES les pages sont
// pilotables, grille MIP comprise : options.pages liste les pages
// voulues, servies dans l'ordre fixe du registre. Sans options,
// comportement historique inchange (Makigami + RACI) : les anciens
// flux et sessions restent valides. Au moins une page est requise.
const PAGE_REGISTRY = [
  ["Makigami", (model) => makigamiPage(model)],
  ["Processus", (model) => processPage(model)],
  ["BPMN", (model) => bpmnPage(model)],
  ["RACI", (model) => raciPage(model)],
  ["SIPOC", (model) => sipocPage(model)],
  ["Analyse", (model) => analysePage(model)]
];

export function renderDrawioXml(model, options = {}) {
  const wanted = Array.isArray(options.pages) ? options.pages : ["Makigami", "RACI"];
  const pageXmls = [];
  for (const [name, gen] of PAGE_REGISTRY) {
    if (wanted.includes(name)) pageXmls.push(gen(model));
  }
  if (!pageXmls.length) throw new Error("Aucune page demandee : au moins une page est requise.");
  return `<mxfile host="agent-mip" pages="${pageXmls.length}">
  ${pageXmls.join("\n  ")}
</mxfile>`;
}

// Matrice de responsabilites seule (page RACI), pour l'export dedie du
// selecteur de sorties : meme rendu que la page 2 du fichier complet.
export function renderRaciXml(model) {
  return `<mxfile host="agent-mip" pages="1">
  ${raciPage(model)}
</mxfile>`;
}

// Avertissements de rendu calcules a partir du modele : grille trop
// large pour etre lue, ou processus degenere. Le serveur les remonte a
// l'utilisateur avec le diagramme.
export function renderChecks(model) {
  const w = [];
  const steps = model.steps || [];
  const stages = new Set(steps.map((s) => s.stage)).size;
  if (stages > 10) {
    w.push(`Grille large : ${stages} colonnes. Le diagramme sera difficile a lire d'un seul tenant ; envisagez de scinder le processus ou de regrouper des etapes.`);
  }
  if (steps.length === 1) {
    w.push("Une seule etape extraite : le texte ne decrit probablement pas un enchainement d'activites. Verifiez que la transcription raconte bien un processus.");
  }
  // affectation corrigee par le rendu : exposee a l'utilisateur pendant
  // le raffinement plutot qu'absorbee en silence par le gabarit
  computeLayout(model).multiCells
    .filter((mc) => mc.action === "reattribuees")
    .forEach((mc) => {
      w.push(`Affectation : deux activites de « ${mc.actor} » partageaient l'etage ${mc.stage} sans concomitance affirmee ; elles ont ete re-etalees sur des etages consecutifs (${mc.labels.join(" ; ")}). Verifiez l'ordre lors du raffinement.`);
    });
  // configurations de routage restees sans trace propre
  renderDrawioXml(model);
  lastRouteNotes.forEach((n) => w.push(`Routage : ${n}`));
  return w;
}
