// Pages d'analyste : "SIPOC" (prefixe sipoc-) et "Analyse" (prefixe
// ana-), derivees deterministes du modele JSON, en tableaux natifs
// Draw.io (lignes ajoutables depuis la barre laterale). Jamais
// d'invention : une cellule sans donnee derivable reste vide, une
// valeur deduite garde son marquage "≈".
// Les styles de table sont copies du modele de reference (memes
// constantes que drawio.js : shape=table + tableRow + partialRectangle).

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escAttr = (s) => esc(s).replace(/\r?\n/g, "&#10;");

const S_TABLE_TITLED = "shape=table;startSize=26;container=1;collapsible=0;childLayout=tableLayout;html=1;strokeColor=#C9CFD3;fillColor=#414A50;fontColor=#FFFFFF;fontStyle=1;fontSize=12;align=left;spacingLeft=14;verticalAlign=middle;";
const S_ROW = "shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;strokeColor=inherit;top=0;left=0;bottom=0;right=0;collapsible=0;dropTarget=0;fillColor=none;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;";
const INFER_MARK = "≈ ";

function pcell(opts) {
  return "shape=partialRectangle;html=1;whiteSpace=wrap;connectable=0;strokeColor=inherit;overflow=hidden;" +
    `fillColor=${opts.fill};top=0;left=0;bottom=1;right=1;pointerEvents=1;` +
    "fontFamily=Arial,Helvetica,sans-serif;" +
    `fontSize=${opts.fontSize};fontColor=${opts.fontColor};align=${opts.align};verticalAlign=${opts.valign};` +
    (opts.bold ? "fontStyle=1;" : "") + (opts.italic ? "fontStyle=2;" : "") +
    (opts.spacingLeft ? `spacingLeft=${opts.spacingLeft};` : "");
}

function vertex(id, parent, style, value, x, y, w, h, tooltip) {
  const geo = `<mxGeometry height="${h}" width="${w}" x="${x}" y="${y}" as="geometry"></mxGeometry>`;
  if (tooltip) {
    return `<object id="${id}" label="${esc(value)}" tooltip="${escAttr(tooltip)}">` +
      `<mxCell parent="${parent}" style="${style}" vertex="1">${geo}</mxCell></object>`;
  }
  return `<mxCell id="${id}" parent="${parent}" style="${style}" value="${esc(value)}" vertex="1">${geo}</mxCell>`;
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const stageOf = (s, j) => s.stage || j + 1;
const orderSteps = (model) =>
  (model.steps || []).map((s, j) => ({ s, j })).sort((a, b) => stageOf(a.s, a.j) - stageOf(b.s, b.j) || a.j - b.j);

// ---- derivations SIPOC (pures, exportees pour les tests) ----
export function computeSipoc(model) {
  const ordered = orderSteps(model);
  const item = (text, inferred) => ({ text, inferred: !!inferred });
  const seen = new Set();
  const push = (arr, it) => {
    if (!it.text || seen.has(norm(it.text))) return;
    seen.add(norm(it.text));
    arr.push(it);
  };
  // Entrees : documents et donnees de la premiere etape du flux, plus
  // les documents entrant plus loin sans avoir ete produits avant
  const inputs = [];
  if (ordered.length) {
    const first = ordered[0].s;
    const inf = first.inferred || {};
    (first.documents_in || []).forEach((v, i) => push(inputs, item(v, (inf.documents_in || [])[i])));
    (first.data_in || []).forEach((v, i) => push(inputs, item(v, (inf.data_in || [])[i])));
  }
  ordered.forEach(({ s, j }, k) => {
    const producedBefore = new Set();
    ordered.slice(0, k).forEach(({ s: p }) => (p.documents_out || []).forEach((d) => producedBefore.add(norm(d))));
    const inf = s.inferred || {};
    (s.documents_in || []).forEach((v, i) => {
      if (!producedBefore.has(norm(v))) push(inputs, item(v, (inf.documents_in || [])[i]));
    });
  });
  // Sorties : produits jamais consommes ensuite, plus l'issue
  const outputs = [];
  ordered.forEach(({ s }, k) => {
    const consumedAfter = new Set();
    ordered.slice(k + 1).forEach(({ s: n }) => {
      (n.documents_in || []).forEach((d) => consumedAfter.add(norm(d)));
      (n.data_in || []).forEach((d) => consumedAfter.add(norm(d)));
    });
    const inf = s.inferred || {};
    (s.documents_out || []).forEach((v, i) => {
      if (!consumedAfter.has(norm(v))) push(outputs, item(v, (inf.documents_out || [])[i]));
    });
    (s.data_out || []).forEach((v, i) => {
      if (!consumedAfter.has(norm(v))) push(outputs, item(v, (inf.data_out || [])[i]));
    });
  });
  if (model.outcome) push(outputs, item(model.outcome, false));
  // Processus : cinq a sept macro-etapes, regroupement des etapes
  // consecutives du meme acteur, libelles repris
  const groups = [];
  ordered.forEach(({ s }) => {
    const last = groups[groups.length - 1];
    if (last && last.actor === s.actor) last.labels.push(s.label);
    else groups.push({ actor: s.actor, labels: [s.label] });
  });
  while (groups.length > 7) {
    // fusionne la paire adjacente la plus legere
    let best = 0, bestSize = Infinity;
    for (let i = 0; i < groups.length - 1; i++) {
      const size = groups[i].labels.length + groups[i + 1].labels.length;
      if (size < bestSize) { bestSize = size; best = i; }
    }
    groups[best].labels.push(...groups[best + 1].labels);
    groups[best].actor += ` + ${groups[best + 1].actor}`;
    groups.splice(best + 1, 1);
  }
  const process = groups.map((g) => ({ actor: g.actor, text: g.labels.join(" ; ") }));
  // Fournisseurs et Clients : seulement quand le texte les nomme — le
  // modele ne porte pas d'origine ni de destinataire nominal, les
  // colonnes restent donc vides (jamais d'invention)
  return { suppliers: [], inputs, process, outputs, clients: [] };
}

export function sipocPage(model) {
  const { suppliers, inputs, process, outputs, clients } = computeSipoc(model);
  const cols = [
    ["Fournisseurs", suppliers.map((x) => x.text ? x : x)],
    ["Entrées", inputs],
    ["Processus", process.map((g) => ({ text: g.text, inferred: false, tooltip: g.actor }))],
    ["Sorties", outputs],
    ["Clients", clients]
  ];
  const COLW = 250, HEAD = 30;
  const W = cols.length * COLW;
  const nRows = Math.max(1, ...cols.map(([, arr]) => arr.length));
  const rowH = 44;
  const out = [];
  out.push('<mxCell id="0" />');
  out.push('<mxCell id="sipoc-L0" parent="0" value="Processus" />');
  const H = 26 + HEAD + nRows * rowH;
  out.push(vertex("sipoc-table", "sipoc-L0", S_TABLE_TITLED, `SIPOC — ${model.process || "Processus"}`, 40, 60, W, H));
  const headCell = pcell({ fill: "#67747C", fontSize: 11, fontColor: "#FFFFFF", align: "center", valign: "middle", bold: true });
  out.push(vertex("sipoc-head", "sipoc-table", S_ROW, "", 0, 26, W, HEAD));
  cols.forEach(([title], c) => {
    out.push(vertex(`sipoc-head_c${c}`, "sipoc-head", headCell, title, c * COLW, 0, COLW, HEAD));
  });
  const valCell = pcell({ fill: "#FFFFFF", fontSize: 9, fontColor: "#2C3136", align: "left", valign: "middle", spacingLeft: 6 });
  const infCell = pcell({ fill: "#FFFFFF", fontSize: 9, fontColor: "#8A8F94", align: "left", valign: "middle", spacingLeft: 6, italic: true });
  for (let r = 0; r < nRows; r++) {
    const rid = `sipoc-r${r}`;
    out.push(vertex(rid, "sipoc-table", S_ROW, "", 0, 26 + HEAD + r * rowH, W, rowH));
    cols.forEach(([, arr], c) => {
      const it = arr[r];
      const text = it ? (it.inferred ? INFER_MARK + it.text : it.text) : "";
      out.push(vertex(`${rid}_c${c}`, rid, it && it.inferred ? infCell : valCell,
        text.length > 90 ? text.slice(0, 89) + "…" : text,
        c * COLW, 0, COLW, rowH, it && (it.tooltip || text.length > 90) ? (it.tooltip || it.text) : ""));
    });
  }
  const pageW = W + 120;
  const pageH = H + 160;
  return `<diagram id="sipoc" name="SIPOC">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0">
      <root>
        ${out.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>`;
}

// ---- page Analyse : tous les constats, rassembles et ordonnes ----
export function computeAnalysis(model) {
  const ordered = orderSteps(model);
  const ip = model.inferredProcess || {};
  const rows = [];
  const durOf = (s) => s.duration || (s.duration_min || s.duration_max
    ? `${s.duration_min || "?"} – ${s.duration_max || "?"}` : "");
  ordered.forEach(({ s, j }, k) => {
    const inf = s.inferred || {};
    const ref = `${k + 1}. ${s.label}`;
    if (s.friction) rows.push({ etape: ref, type: "friction", constat: s.friction, duree: durOf(s), inferred: !!inf.friction });
    if (s.opportunity) rows.push({ etape: ref, type: "opportunité", constat: s.opportunity, duree: durOf(s), inferred: !!inf.opportunity });
    (model.exceptions || []).forEach((x, i) => {
      if (x.step_id === s.id) {
        rows.push({ etape: ref, type: "exception", constat: x.text, duree: durOf(s), inferred: !!(ip.exceptions || [])[i] });
      }
    });
  });
  (model.rules || []).forEach((r, i) =>
    rows.push({ etape: "—", type: "règle", constat: r, duree: "", inferred: !!(ip.rules || [])[i] }));
  (model.exceptions || []).forEach((x, i) => {
    if (!x.step_id) rows.push({ etape: "—", type: "exception", constat: x.text, duree: "", inferred: !!(ip.exceptions || [])[i] });
  });
  (model.uncertainties || []).forEach((u, i) =>
    rows.push({ etape: "—", type: "incertitude", constat: u, duree: "", inferred: !!(ip.uncertainties || [])[i] }));
  return rows;
}

export function analysePage(model) {
  const rows = computeAnalysis(model);
  // synthese d'analyste en une ligne (memes calculs que la fiche)
  const steps = model.steps || [];
  const mins = [];
  let domIdx = -1, domMin = 0, total = 0;
  steps.forEach((s, j) => {
    const m = String(s.duration || s.duration_max || s.duration_min || "").match(/(\d+(?:[.,]\d+)?)\s*(min|h|heure|j|jour)/i);
    if (!m) return;
    let v = parseFloat(m[1].replace(",", "."));
    if (/h/i.test(m[2])) v *= 60;
    if (/j/i.test(m[2])) v *= 1440;
    mins.push(v);
    total += v;
    if (v > domMin) { domMin = v; domIdx = j; }
  });
  const frictions = steps.filter((s) => s.friction).length;
  const autos = steps.filter((s) => s.automated).length;
  const transfers = (() => {
    const ordered = orderSteps(model);
    let t = 0;
    for (let k = 1; k < ordered.length; k++) {
      if (ordered[k].s.actor !== ordered[k - 1].s.actor) t++;
    }
    return t;
  })();
  const synth = [
    domIdx >= 0 && total > 0 ? `étape dominante : ${steps[domIdx].label} (${Math.round(100 * domMin / total)} %)` : "étape dominante : —",
    `transferts : ${transfers}`,
    `frictions : ${frictions}`,
    `automatisation : ${steps.length ? Math.round(100 * autos / steps.length) : 0} %`
  ].join(" · ");

  const COLS = [["Étape", 320], ["Type", 110], ["Constat (verbatim)", 470], ["Durée de l'étape", 130]];
  const W = COLS.reduce((a, [, w]) => a + w, 0);
  const HEAD = 30;
  const rowH = (t) => Math.max(36, 16 + Math.ceil(String(t).length / 66) * 13);
  const heights = rows.map((r) => rowH(r.constat));
  const H = 26 + HEAD + heights.reduce((a, h) => a + h, 0) + 36;
  const out = [];
  out.push('<mxCell id="0" />');
  out.push('<mxCell id="ana-L0" parent="0" value="Processus" />');
  out.push(vertex("ana-table", "ana-L0", S_TABLE_TITLED,
    `ANALYSE — ${model.process || "Processus"} · préparation d'atelier`, 40, 60, W, H));
  const headCell = pcell({ fill: "#67747C", fontSize: 11, fontColor: "#FFFFFF", align: "center", valign: "middle", bold: true });
  out.push(vertex("ana-head", "ana-table", S_ROW, "", 0, 26, W, HEAD));
  let cx = 0;
  COLS.forEach(([title, w], c) => {
    out.push(vertex(`ana-head_c${c}`, "ana-head", headCell, title, cx, 0, w, HEAD));
    cx += w;
  });
  const cellS = pcell({ fill: "#FFFFFF", fontSize: 9, fontColor: "#2C3136", align: "left", valign: "middle", spacingLeft: 6 });
  const cellI = pcell({ fill: "#FFFFFF", fontSize: 9, fontColor: "#8A8F94", align: "left", valign: "middle", spacingLeft: 6, italic: true });
  const typeCell = pcell({ fill: "#FFF6D6", fontSize: 9, fontColor: "#8A6D00", align: "center", valign: "middle", bold: true });
  let ry = 26 + HEAD;
  rows.forEach((r, i) => {
    const rid = `ana-r${i}`;
    const h = heights[i];
    out.push(vertex(rid, "ana-table", S_ROW, "", 0, ry, W, h));
    const vals = [r.etape, r.type, (r.inferred ? INFER_MARK : "") + r.constat, r.duree];
    let x = 0;
    vals.forEach((v, c) => {
      const style = c === 1 ? typeCell : (c === 2 && r.inferred ? cellI : cellS);
      out.push(vertex(`${rid}_c${c}`, rid, style, v, x, 0, COLS[c][1], h));
      x += COLS[c][1];
    });
    ry += h;
  });
  const synCell = pcell({ fill: "#E7EAEC", fontSize: 9, fontColor: "#2C3136", align: "left", valign: "middle", bold: true, spacingLeft: 6 });
  out.push(vertex("ana-synth", "ana-table", S_ROW, "", 0, ry, W, 36));
  out.push(vertex("ana-synth_c0", "ana-synth", synCell, "Synthèse", 0, 0, COLS[0][1], 36));
  out.push(vertex("ana-synth_c1", "ana-synth", synCell, synth, COLS[0][1], 0, W - COLS[0][1], 36));
  const pageW = W + 120;
  const pageH = H + 160;
  return `<diagram id="ana" name="Analyse">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0">
      <root>
        ${out.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>`;
}
