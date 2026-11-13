// Liste de validation d'une grille MIP : les points a parcourir avec
// le metier pendant la seance de relecture. Six familles, dans l'ordre
// de lecture de la grille : valeurs deduites, incertitudes, regles
// metier, decisions et leur cas negatif, contradictions de fusion,
// manques evidents. Memes donnees pour l'export imprimable et le
// panneau interactif de l'interface.

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

const FAMILIES = {
  inferred: "Valeurs déduites à confirmer",
  uncertainty: "Incertitudes conservées",
  rule: "Règles métier extraites",
  decision: "Décisions et leur cas négatif",
  conflict: "Contradictions entre sources",
  gap: "Manques évidents"
};

// [{ id, family, text, meta }] — id stable pour journaliser les cases
export function buildValidationList(model) {
  const items = [];
  const steps = model.steps || [];
  const stepRef = (s, j) => {
    const line = s.provenance && s.provenance.label && s.provenance.label.line;
    return `Étape ${j + 1} — ${s.label}${line ? ` (récit l.${line})` : ""}`;
  };

  // 1. valeurs deduites : etape, champ, valeur, ligne source du recit
  steps.forEach((s, j) => {
    const inf = s.inferred || {};
    for (const [f, name] of LIST_FIELDS) {
      (s[f] || []).forEach((v, i) => {
        if (v && (inf[f] || [])[i]) {
          items.push({ id: `inf_${j}_${f}_${i}`, family: FAMILIES.inferred,
            text: `${name} : ${v}`, meta: stepRef(s, j) });
        }
      });
    }
    for (const [f, name] of SCALAR_FIELDS) {
      if (s[f] && inf[f]) {
        items.push({ id: `inf_${j}_${f}`, family: FAMILIES.inferred,
          text: `${name} : ${s[f]}`, meta: stepRef(s, j) });
      }
    }
  });
  const ip = model.inferredProcess || {};
  const procInf = (field, arr, textOf) => {
    (arr || []).forEach((x, i) => {
      if ((ip[field] || [])[i]) {
        items.push({ id: `inf_proc_${field}_${i}`, family: FAMILIES.inferred,
          text: textOf(x), meta: "Niveau processus" });
      }
    });
  };
  procInf("rules", model.rules, (x) => `règle : ${x}`);
  procInf("exceptions", model.exceptions, (x) => `exception : ${x.text}`);
  procInf("uncertainties", model.uncertainties, (x) => `incertitude : ${x}`);

  // 2. incertitudes conservees telles quelles
  const pp = model.provenanceProcess || {};
  (model.uncertainties || []).forEach((u, i) => {
    const p = (pp.uncertainties || [])[i];
    items.push({ id: `unc_${i}`, family: FAMILIES.uncertainty,
      text: u, meta: p ? `Récit l.${p.line}` : "" });
  });

  // 3. regles metier extraites
  (model.rules || []).forEach((r, i) => {
    const p = (pp.rules || [])[i];
    items.push({ id: `rule_${i}`, family: FAMILIES.rule,
      text: r, meta: p ? `Récit l.${p.line}` : "" });
  });

  // 4. decisions et leur cas negatif
  steps.forEach((s, j) => {
    if (!s.decision) return;
    const no = s.decision.on_no || {};
    items.push({ id: `dec_${j}`, family: FAMILIES.decision,
      text: `${s.decision.question}`,
      meta: `${stepRef(s, j)} · si non : ${no.label || "?"} → ${no.return_to === "fin" ? "fin du processus" : no.return_to}` });
  });

  // 5. contradictions de fusion (jamais tranchees, a arbitrer)
  (model.conflicts || []).forEach((c, i) => {
    items.push({ id: `confl_${i}`, family: FAMILIES.conflict, text: c, meta: "" });
  });

  // 6. manques evidents
  const hasDuration = steps.some((s) => s.duration || s.duration_min || s.duration_max);
  if (steps.length && !hasDuration) {
    items.push({ id: "gap_durations", family: FAMILIES.gap,
      text: "Aucune durée chiffrée : la bande des temps est vide",
      meta: "Demander des ordres de grandeur au métier" });
  }
  const metaCount = (s) => {
    let n = 0;
    for (const [f] of LIST_FIELDS) n += (s[f] || []).filter(Boolean).length;
    for (const [f] of SCALAR_FIELDS) if (s[f]) n++;
    return n;
  };
  (model.actors || []).forEach((a, i) => {
    const own = steps.filter((s) => (s.actors || [s.actor])[0] === a);
    if (own.length && own.every((s) => metaCount(s) === 0)) {
      items.push({ id: `gap_actor_${i}`, family: FAMILIES.gap,
        text: `Aucune métadonnée sur les étapes de « ${a} »`,
        meta: own.map((s) => s.label).join(" ; ") });
    }
  });

  return items;
}

// Export imprimable : cases a cocher pour la seance de relecture.
// options.state (etat des cases du panneau, par id) et
// options.checkedAt (date du dernier pointage) rendent l'export fidele
// a la seance : une validation laisse une trace imprimable.
export function toValidationMarkdown(model, options = {}) {
  const state = options.state || {};
  const items = buildValidationList(model);
  const checked = items.filter((it) => state[it.id]).length;
  const md = [];
  md.push(`# Liste de validation : ${model.process || "Processus"}`);
  md.push("");
  md.push(`${items.length} point${items.length > 1 ? "s" : ""} à parcourir avec le métier pendant la relecture de la grille MIP.`);
  if (checked || options.checkedAt) {
    md.push("");
    md.push(`**Pointage** : ${checked}/${items.length} coché${checked > 1 ? "s" : ""}` +
      (options.checkedAt ? ` — dernier pointage le ${new Date(options.checkedAt).toLocaleString("fr-CH")}` : "") + ".");
  }
  let fam = null;
  items.forEach((it) => {
    if (it.family !== fam) {
      md.push("");
      md.push(`## ${it.family}`);
      md.push("");
      fam = it.family;
    }
    md.push(`- [${state[it.id] ? "x" : " "}] ${it.text}${it.meta ? `  \n      *${it.meta}*` : ""}`);
  });
  if (!items.length) {
    md.push("");
    md.push("Rien à valider : aucune valeur déduite, incertitude ou signal détecté.");
  }
  md.push("");
  return md.join("\n");
}
