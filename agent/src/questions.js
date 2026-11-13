// Questions pour l'entretien de suivi, derivees MECANIQUEMENT du
// modele : aucun appel LLM. Chaque trou ou signal devient une question
// prete a poser au metier — support de preparation d'atelier.

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

// [{ id, text, meta }] dans l'ordre de lecture de la grille
export function buildQuestions(model) {
  const items = [];
  const steps = model.steps || [];
  const ref = (s, j) => `Étape ${j + 1} — ${s.label}`;

  // valeurs deduites -> confirmation
  steps.forEach((s, j) => {
    const inf = s.inferred || {};
    for (const [f, name] of LIST_FIELDS) {
      (s[f] || []).forEach((v, i) => {
        if (v && (inf[f] || [])[i]) {
          items.push({ id: `q_inf_${j}_${f}_${i}`,
            text: `Confirmez-vous que « ${v} » (${name}) intervient bien à l'étape « ${s.label} » ?`,
            meta: ref(s, j) });
        }
      });
    }
    for (const [f, name] of SCALAR_FIELDS) {
      if (s[f] && inf[f]) {
        items.push({ id: `q_inf_${j}_${f}`,
          text: `Confirmez-vous que « ${s[f]} » (${name}) s'applique à l'étape « ${s.label} » ?`,
          meta: ref(s, j) });
      }
    }
  });
  // incertitudes -> precision
  (model.uncertainties || []).forEach((u, i) => {
    items.push({ id: `q_unc_${i}`,
      text: `Pouvez-vous préciser dans quels cas « ${u} » ?`, meta: "Incertitude conservée du récit" });
  });
  // decisions sans issue claire -> que se passe-t-il si
  steps.forEach((s, j) => {
    if (!s.decision) return;
    const no = s.decision.on_no || {};
    const vague = !no.label || /^non\b|^\?|^rien/i.test(no.label.trim());
    if (vague) {
      items.push({ id: `q_dec_${j}`,
        text: `Que se passe-t-il si la réponse à « ${s.decision.question} » est non ?`,
        meta: ref(s, j) });
    }
  });
  // durees absentes -> combien de temps
  steps.forEach((s, j) => {
    if (!s.duration && !s.duration_min && !s.duration_max) {
      items.push({ id: `q_dur_${j}`,
        text: `Combien de temps prend « ${s.label} » ?`, meta: ref(s, j) });
    }
  });
  // frictions -> frequence et parade
  steps.forEach((s, j) => {
    if (s.friction) {
      items.push({ id: `q_fri_${j}`,
        text: `« ${s.friction} » : à quelle fréquence ce problème survient-il et que faites-vous alors ?`,
        meta: ref(s, j) });
    }
  });
  return items;
}

// Export Markdown imprimable pour preparer l'atelier de suivi.
export function toQuestionsMarkdown(model) {
  const items = buildQuestions(model);
  const md = [];
  md.push(`# Questions pour l'entretien de suivi : ${model.process || "Processus"}`);
  md.push("");
  md.push(`${items.length} question${items.length > 1 ? "s" : ""} dérivée${items.length > 1 ? "s" : ""} mécaniquement des trous et signaux de la grille MIP.`);
  md.push("");
  items.forEach((it) => {
    md.push(`- [ ] ${it.text}${it.meta ? `  \n      *${it.meta}*` : ""}`);
  });
  if (!items.length) md.push("Aucune question : la grille ne présente ni trou ni signal.");
  md.push("");
  return md.join("\n");
}
