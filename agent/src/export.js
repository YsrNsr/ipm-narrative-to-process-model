// Exports exploitables du Modele hybride : CSV pour tableur et fiche
// processus Markdown imprimable. Chaque valeur deduite est signalee et
// la provenance (ligne source) est reportee quand elle est disponible.

import { normalizeDuration } from "./duration.js";

const LIST_FIELDS = [
  ["documents_in", "documents entrants"],
  ["documents_out", "documents sortants"],
  ["data_in", "donnees entrantes"],
  ["data_out", "donnees sortantes"],
  ["tools", "outils"]
];
const SCALAR_FIELDS = [
  ["duration", "duree"],
  ["duration_min", "duree min"],
  ["duration_max", "duree max"],
  ["volume", "volume"],
  ["frequency", "frequence"],
  ["friction", "friction"],
  ["procedure", "mode operatoire"],
  ["opportunity", "opportunite"]
];

// liste des valeurs deduites d'une etape, au format "champ : valeur"
function inferredList(s) {
  const inf = s.inferred || {};
  const outList = [];
  for (const [f, name] of LIST_FIELDS) {
    (s[f] || []).forEach((v, i) => { if (v && (inf[f] || [])[i]) outList.push(`${name} : ${v}`); });
  }
  for (const [f, name] of SCALAR_FIELDS) {
    if (s[f] && inf[f]) outList.push(`${name} : ${s[f]}`);
  }
  return outList;
}

// lignes sources connues d'une etape, au format "champ l.N"
function sourceLines(s) {
  const prov = s.provenance || {};
  const outList = [];
  if (prov.label) outList.push(`etape l.${prov.label.line}`);
  for (const [f, name] of LIST_FIELDS) {
    ((prov[f] || [])).forEach((p, i) => { if (p && (s[f] || [])[i]) outList.push(`${name} (${s[f][i]}) l.${p.line}`); });
  }
  for (const [f, name] of SCALAR_FIELDS) {
    if (prov[f] && s[f]) outList.push(`${name} l.${prov[f].line}`);
  }
  return outList;
}

// Export tabulaire : une ligne par etape, separateur point-virgule et
// BOM UTF-8 pour une ouverture directe dans Excel en francais.
export function toCsv(model) {
  const q = (v) => {
    const t = String(v == null ? "" : v);
    return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const header = [
    "id", "stage", "etape", "responsable", "participants",
    "documents_entrants", "documents_sortants", "donnees_entrantes", "donnees_sortantes",
    "outils", "duree", "duree_min", "duree_max", "volume", "frequence",
    "friction", "mode_operatoire", "opportunite", "automatisee", "decision",
    "valeurs_deduites", "lignes_sources"
  ];
  const rows = (model.steps || []).map((s) => [
    s.id, s.stage, s.label, (s.actors || [s.actor])[0], (s.actors || []).slice(1).join(", "),
    (s.documents_in || []).join(", "), (s.documents_out || []).join(", "),
    (s.data_in || []).join(", "), (s.data_out || []).join(", "),
    (s.tools || []).join(", "), s.duration, s.duration_min, s.duration_max,
    s.volume, s.frequency, s.friction, s.procedure, s.opportunity,
    s.automated ? "oui" : "non",
    s.decision ? `${s.decision.question} | non : ${s.decision.on_no.label} (retour ${s.decision.on_no.return_to})` : "",
    inferredList(s).join(" | "),
    sourceLines(s).join(" | ")
  ]);
  // v6 : les elements du niveau processus (regles, exceptions,
  // incertitudes) sont ajoutes en fin de tableau, memes colonnes — le
  // type dans la colonne id, le texte dans la colonne etape
  const ip = model.inferredProcess || {};
  const pp = model.provenanceProcess || {};
  const procRow = (type, text, inferred, prov) => {
    const r = new Array(header.length).fill("");
    r[0] = type;
    r[2] = text;
    if (inferred) r[header.length - 2] = `${type} : ${text}`;
    if (prov) r[header.length - 1] = `${type} l.${prov.line}`;
    return r;
  };
  (model.rules || []).forEach((t, i) =>
    rows.push(procRow("regle", t, (ip.rules || [])[i], (pp.rules || [])[i])));
  (model.exceptions || []).forEach((x, i) =>
    rows.push(procRow("exception", x.text + (x.step_id ? ` (${x.step_id})` : ""), (ip.exceptions || [])[i], (pp.exceptions || [])[i])));
  (model.uncertainties || []).forEach((t, i) =>
    rows.push(procRow("incertitude", t, (ip.uncertainties || [])[i], (pp.uncertainties || [])[i])));
  // BOM UTF-8 : Excel en francais detecte alors l'encodage sans dialogue
  return "﻿" + [header, ...rows].map((r) => r.map(q).join(";")).join("\r\n") + "\r\n";
}

// marque une valeur pour la fiche : deduite ou tracee vers sa ligne
function mark(v, inferred, prov) {
  if (!v) return "";
  if (inferred) return `≈ ${v} *(a verifier)*`;
  return prov ? `${v} (l.${prov.line})` : v;
}

// Export fiche processus : Markdown imprimable, diffusable sans l'outil.
export function toMarkdown(model) {
  const steps = model.steps || [];
  const md = [];
  md.push(`# Fiche processus : ${model.process || "Processus"}`);
  md.push("");
  md.push(`- **Déclencheur** : ${model.trigger || "—"}`);
  md.push(`- **Résultat attendu** : ${model.outcome || "—"}`);
  md.push(`- **Acteurs** : ${(model.actors || []).join(", ")}`);
  const mins = steps.map((s) =>
    normalizeDuration(s.duration) ?? normalizeDuration(s.duration_max) ?? normalizeDuration(s.duration_min))
    .filter((v) => v != null);
  const total = mins.reduce((a, v) => a + v, 0);
  md.push("");
  md.push("## Synthèse");
  md.push("");
  md.push(`${steps.length} étapes · ${(model.actors || []).length} acteurs · ` +
    `${steps.filter((s) => s.friction).length} frictions · ` +
    `${steps.filter((s) => s.automated).length} étapes automatisées · ` +
    (mins.length ? `temps cumulé ${Math.round(total)} min (${mins.length}/${steps.length} étapes chiffrées)` : "durées non chiffrées"));
  if ((model.conflicts || []).length) {
    md.push("");
    md.push("### ⚠ Contradictions entre sources");
    md.push("");
    model.conflicts.forEach((c) => md.push(`- ${c}`));
  }
  // Lecture d'analyste (6b) : memes indicateurs que la synthese
  // enrichie de la grille, en texte
  {
    const stepMin = (s) =>
      normalizeDuration(s.duration) ?? normalizeDuration(s.duration_max) ?? normalizeDuration(s.duration_min);
    let domIdx = -1, domMin = 0;
    steps.forEach((s, j) => {
      const v = stepMin(s);
      if (v != null && v > domMin) { domMin = v; domIdx = j; }
    });
    // enchainement stage a stage avec preference documentaire, comme la
    // grille : le compte des transferts reste comparable
    const stages = [...new Set(steps.map((s, j) => s.stage || j + 1))].sort((a, b) => a - b);
    const byCol = stages.map((v) => steps.filter((s, j) => (s.stage || j + 1) === v));
    const normDoc = (d) => String(d || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    let transfers = 0, totalFlows = 0;
    const pairCount = new Map();
    for (let c = 1; c < byCol.length; c++) {
      const candidates = [];
      for (const a of byCol[c - 1]) {
        for (const b of byCol[c]) {
          const outDocs = (a.documents_out || []).map(normDoc).filter(Boolean);
          const inDocs = new Set((b.documents_in || []).map(normDoc).filter(Boolean));
          candidates.push({ a, b, doc: outDocs.some((d) => inDocs.has(d)) });
        }
      }
      const doc = candidates.filter((p) => p.doc);
      (doc.length ? doc : candidates).forEach(({ a, b }) => {
        totalFlows++;
        if (a.actor !== b.actor) {
          transfers++;
          const key = `${a.actor} → ${b.actor}`;
          pairCount.set(key, (pairCount.get(key) || 0) + 1);
        }
      });
    }
    let topPair = null;
    for (const [k, n] of pairCount) if (!topPair || n > topPair[1]) topPair = [k, n];
    const fr = steps.filter((s) => s.friction);
    const autos = steps.filter((s) => s.automated).length;
    md.push("");
    md.push("## Lecture d'analyste");
    md.push("");
    if (domIdx >= 0 && total > 0) {
      md.push(`- **Étape dominante en temps** : ${steps[domIdx].label} — ${Math.round(domMin)} min, soit ${Math.round(100 * domMin / total)} % du temps cumulé chiffré`);
    } else {
      md.push("- **Étape dominante en temps** : indéterminée (durées non chiffrées)");
    }
    md.push(`- **Transferts entre acteurs** : ${transfers} sur ${totalFlows} enchaînements` +
      (topPair ? ` ; couple le plus sollicité : ${topPair[0]} (×${topPair[1]})` : ""));
    md.push(`- **Frictions** : ${fr.length}` +
      (fr.length ? ` — ${fr.map((s) => `« ${s.friction} » (${s.label})`).join(" ; ")}` : ""));
    md.push(`- **Étapes automatisées** : ${autos}/${steps.length}` +
      (steps.length ? ` (${Math.round(100 * autos / steps.length)} %)` : ""));
  }
  // v6 : regles, exceptions et incertitudes du niveau processus
  const ip = model.inferredProcess || {};
  const pp = model.provenanceProcess || {};
  const hasRei = (model.rules || []).length || (model.exceptions || []).length || (model.uncertainties || []).length;
  if (hasRei) {
    md.push("");
    md.push("## Règles, exceptions et incertitudes");
    const sub = (title, arr, flags, prov, textOf) => {
      if (!arr.length) return;
      md.push("");
      md.push(`### ${title}`);
      md.push("");
      arr.forEach((x, i) => md.push(`- ${mark(textOf(x), (flags || [])[i], (prov || [])[i])}`));
    };
    sub("Règles métier", model.rules || [], ip.rules, pp.rules, (x) => x);
    sub("Exceptions et variantes", model.exceptions || [], ip.exceptions, pp.exceptions,
      (x) => x.text + (x.step_id ? ` *(étape ${x.step_id})*` : ""));
    sub("Incertitudes exprimées (à conserver telles quelles)", model.uncertainties || [], ip.uncertainties, pp.uncertainties, (x) => x);
  }
  steps.forEach((s) => {
    const inf = s.inferred || {};
    const prov = s.provenance || {};
    md.push("");
    md.push(`## Étape ${s.stage} — ${s.label}${s.automated ? " (automatisée)" : ""}`);
    md.push("");
    md.push(`- **Responsable** : ${(s.actors || [s.actor])[0]}`);
    if ((s.actors || []).length > 1) md.push(`- **Participants** : ${s.actors.slice(1).join(", ")}`);
    const list = (f) => (s[f] || []).map((v, i) =>
      mark(v, (inf[f] || [])[i], (prov[f] || [])[i])).filter(Boolean).join(", ");
    const scal = (f) => mark(s[f], inf[f], prov[f]);
    const line = (label, v) => { if (v) md.push(`- **${label}** : ${v}`); };
    line("Mode opératoire", scal("procedure"));
    line("Documents entrants", list("documents_in"));
    line("Documents sortants", list("documents_out"));
    line("Données entrantes", list("data_in"));
    line("Données sortantes", list("data_out"));
    line("Outils", list("tools"));
    line("Temps", [scal("duration"), s.duration_min || s.duration_max ? `fourchette ${scal("duration_min")} – ${scal("duration_max")}` : ""].filter(Boolean).join(" ; "));
    line("Volume", scal("volume"));
    line("Fréquence", scal("frequency"));
    line("Friction", scal("friction"));
    line("Opportunité", scal("opportunity"));
    if (s.decision) line("Décision", `${s.decision.question} — si non : ${s.decision.on_no.label} (retour ${s.decision.on_no.return_to})`);
  });
  md.push("");
  md.push("*Les valeurs précédées de « ≈ » sont déduites par le modèle et à vérifier ; les numéros de ligne renvoient à la transcription source.*");
  return md.join("\n") + "\n";
}
