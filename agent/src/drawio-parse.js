// Reconstruction du Modele hybride (JSON) depuis un XML Draw.io produit
// par renderDrawioXml puis eventuellement edite par l'utilisateur.
// Lecture structurelle (tables, lignes, cellules, cartes), tolerante aux
// editions : renommages, deplacements de cartes, lignes ou colonnes
// ajoutees depuis la barre laterale de Draw.io.

const PLACEHOLDER = "[…]";

function unesc(s) {
  return String(s == null ? "" : s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

// Isole le contenu de la page demandee, STRICTEMENT par son nom : pas
// de repli sur la premiere page venue (la page Processus a une grille
// proche mais sans bandes, la comparer produirait de fausses
// suppressions). Un mxGraphModel nu (sans <diagram>) reste accepte.
function extractPage(xml, name) {
  const pages = [...String(xml).matchAll(/<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g)];
  if (!pages.length) return String(xml); // mxGraphModel nu
  const wanted = pages.find((p) => p[1].includes(`name="${name}"`));
  if (!wanted) throw new Error(`Page ${name} absente du fichier : rien a relire.`);
  if (!wanted[2].includes("<mxGraphModel")) {
    throw new Error("Page Draw.io compressee : exporter en XML non compresse.");
  }
  return wanted[2];
}

// Les cellules a tracabilite sont enveloppees dans un element object
// qui porte id et label (v4) : on les replie en mxCell equivalents
// avant l'analyse, pour un traitement uniforme.
function unwrapObjects(xml) {
  return String(xml).replace(
    /<object\b([^>]*)>\s*<mxCell\b([^>]*?)(\/>|>[\s\S]*?<\/mxCell>)\s*<\/object>/g,
    (m, objAttrs, cellAttrs, cellRest) => {
      const id = (objAttrs.match(/\bid="([^"]*)"/) || [])[1] || "";
      const label = (objAttrs.match(/\blabel="([^"]*)"/) || [])[1] || "";
      return `<mxCell id="${id}" value="${label}" ${cellAttrs}${cellRest}`;
    }
  );
}

// Extrait tous les mxCell avec attributs et geometrie, sans dependre de
// l'ordre des attributs (Draw.io les reordonne a la sauvegarde).
function parseCells(xml) {
  const cells = [];
  const cellRe = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  let m;
  while ((m = cellRe.exec(xml))) {
    const attrs = {};
    const attrRe = /([\w:]+)="([^"]*)"/g;
    let a;
    while ((a = attrRe.exec(m[1]))) attrs[a[1]] = unesc(a[2]);
    let geo = { x: 0, y: 0, width: 0, height: 0 };
    if (m[2]) {
      const g = m[2].match(/<mxGeometry\b([^>]*)/);
      if (g) {
        const gAttrs = {};
        let ga;
        const gRe = /([\w]+)="([^"]*)"/g;
        while ((ga = gRe.exec(g[1]))) gAttrs[ga[1]] = ga[2];
        geo = {
          x: Number(gAttrs.x || 0), y: Number(gAttrs.y || 0),
          width: Number(gAttrs.width || 0), height: Number(gAttrs.height || 0)
        };
      }
    }
    cells.push({
      id: attrs.id, parent: attrs.parent,
      style: attrs.style || "", value: attrs.value || "",
      vertex: attrs.vertex === "1", geo
    });
  }
  return cells;
}

// Retire l'espace reserve, le marqueur d'inference "≈" et le marqueur
// de friction "⚑" (les valeurs redeviennent simples a la relecture).
const clean = (v) => (v === PLACEHOLDER ? "" : String(v || "").replace(/[≈⚑⚐⚠]\s*/g, "").trim());
const splitList = (v) => clean(v).split(/\s*,\s*/).filter(Boolean);

export function parseDrawioXml(xml) {
  const cells = parseCells(unwrapObjects(extractPage(xml, "Makigami")));
  const children = (pid) => cells.filter((c) => c.parent === pid);

  // Grille Makigami : table dont le titre commence par MAKIGAMI.
  const grid = cells.find((c) => /shape=table/.test(c.style) && /^MAKIGAMI/.test(c.value));
  if (!grid) throw new Error("Grille Makigami introuvable dans le XML.");
  const process = (grid.value.match(/^MAKIGAMI\s*[—-]\s*(.*?)\s*·/) || [])[1] || "Processus";

  const rows = children(grid.id).filter((c) => /tableRow/.test(c.style)).sort((a, b) => a.geo.y - b.geo.y);
  if (rows.length < 2) throw new Error("Grille Makigami sans lignes d'acteur.");
  const headCells = children(rows[0].id).sort((a, b) => a.geo.x - b.geo.x);
  // abscisse de chaque colonne d'etape (le coin est ignore) et libelle
  // d'en-tete (sert de libelle aux etapes en losange, dont la carte
  // porte la question et non le libelle)
  const colX = headCells.slice(1).map((c) => c.geo.x);
  const headLabels = headCells.slice(1).map((c) => clean(c.value).replace(/^\d+\.\s*/, ""));
  const colIndex = (x) => {
    let best = 0, bd = Infinity;
    colX.forEach((cx, i) => {
      const d = Math.abs(cx - x);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };

  // Acteurs (premiere cellule de chaque ligne), cartes d'activite et
  // cartes de participants (sommets contenus dans les cellules du corps).
  const actors = [];
  const cards = [];
  const participants = [];
  rows.slice(1).forEach((row, r) => {
    const rcs = children(row.id).sort((a, b) => a.geo.x - b.geo.x);
    if (!rcs.length) return;
    const actor = clean(rcs[0].value) || `Acteur ${r + 1}`;
    actors.push(actor);
    rcs.slice(1).forEach((cell) => {
      children(cell.id).filter((c) => c.vertex && clean(c.value)).forEach((card) => {
        // ni les terminateurs (ellipse), ni les noeuds de sortie de
        // branche "non" (#FCE8E6), ni les losanges de decision
        // (rhombus : la carte d'activite porte deja le libelle) ne
        // sont des cartes d'activite
        if (/ellipse|#FCE8E6|rhombus/.test(card.style)) return;
        const col = colIndex(cell.geo.x);
        // carte allegee d'un participant (#FFFDF5) : memorisee pour
        // etre rattachee a l'etape correspondante
        if (/#FFFDF5/.test(card.style)) {
          participants.push({ col, actor, cellY: cell.geo.y });
          return;
        }
        cards.push({ col, order: cell.geo.x, actor, label: clean(card.value) });
      });
    });
  });
  cards.sort((a, b) => a.col - b.col || a.order - b.order);

  // Bandes de metadonnees : chaque ligne est reperee par le libelle de sa
  // premiere cellule, les valeurs sont rangees par colonne d'etape.
  const bands = {};
  cells.filter((c) => /tableRow/.test(c.style) && c.parent !== grid.id).forEach((row) => {
    const rcs = children(row.id).sort((a, b) => a.geo.x - b.geo.x);
    if (rcs.length < 2) return;
    const label = clean(rcs[0].value);
    if (!label) return;
    const vals = [];
    rcs.slice(1).forEach((cell) => { vals[colIndex(cell.geo.x)] = clean(cell.value); });
    bands[label] = vals;
  });
  const bandAt = (label, col) => (bands[label] || [])[col] || "";

  const steps = cards.map((c, i) => ({
    id: `s${i + 1}`,
    actor: c.actor,
    actors: [c.actor],
    stage: c.col + 1,
    label: c.label,
    documents_in: splitList(bandAt("Documents entrants", c.col)),
    documents_out: splitList(bandAt("Documents sortants", c.col)),
    data_in: splitList(bandAt("Données entrantes", c.col)),
    data_out: splitList(bandAt("Données sortantes", c.col)),
    tools: splitList(bandAt("Outils / systèmes", c.col)),
    duration: bandAt("Délai (temps écoulé)", c.col),
    duration_min: bandAt("Temps min", c.col),
    duration_max: bandAt("Temps max", c.col),
    friction: bandAt("Problèmes / risques", c.col),
    procedure: bandAt("Déroulé", c.col),
    opportunity: bandAt("Opportunités / solutions", c.col)
  }));

  // rattache les participants a une etape de leur colonne (la carte de
  // participation ne porte plus le libelle de l'activite)
  participants.forEach((p) => {
    const inCol = steps.filter((s) => s.stage === p.col + 1);
    const step = inCol.find((s) => !s.actors.includes(p.actor)) || inCol[0];
    if (step && !step.actors.includes(p.actor)) step.actors.push(p.actor);
  });

  return { process, actors, steps };
}
