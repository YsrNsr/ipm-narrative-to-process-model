// Schema du Modele hybride : validation et normalisation.
// Depuis la v3 du prompt, une valeur de metadonnee est polymorphe :
// soit une chaine (valeur attestee par le texte), soit un objet
// { "value": "...", "inferred": true } (valeur deduite par le modele).
// normalizeModel accepte les deux formes et produit une structure
// uniforme : valeurs en chaines simples + drapeaux paralleles dans
// step.inferred. Les references du corpus, ecrites en chaines simples,
// restent valides et sont traitees comme attestees.

// Extrait la chaine d'une valeur polymorphe.
const valueOf = (v) => {
  if (v && typeof v === "object" && !Array.isArray(v)) return String(v.value == null ? "" : v.value);
  return v == null ? "" : String(v);
};
// Indique si une valeur polymorphe est marquee comme deduite.
const isInferred = (v) => !!(v && typeof v === "object" && !Array.isArray(v) && v.inferred);

export function validateModel(m) {
  const errors = [];
  if (!m || typeof m !== "object") return { ok: false, errors: ["Modele absent ou non-objet."] };
  if (!Array.isArray(m.actors) || m.actors.length === 0) errors.push("actors manquant ou vide.");
  if (!Array.isArray(m.steps) || m.steps.length === 0) errors.push("steps manquant ou vide.");
  const actors = new Set(m.actors || []);
  (m.steps || []).forEach((s, i) => {
    if (!s || !s.label) errors.push(`step[${i}] sans label.`);
    // seul le RESPONSABLE (premier acteur) doit figurer dans la liste :
    // un participant peut etre une personne citee en soutien, qui n'a
    // pas de ligne dans la grille (regle de l'acteur passif)
    const stepActors = s && (Array.isArray(s.actors) ? s.actors : (s.actor ? [s.actor] : []));
    if (!stepActors || !stepActors.length || !actors.has(stepActors[0])) {
      errors.push(`step[${i}] acteur absent de la liste: ${stepActors && stepActors.join(", ")}.`);
    }
    if (s && s.decision) {
      if (!s.decision.question) errors.push(`step[${i}] decision sans question.`);
      if (!s.decision.on_no || !s.decision.on_no.label) errors.push(`step[${i}] decision sans branche on_no.`);
    }
  });
  return { ok: errors.length === 0, errors };
}

// Garantit la presence et le type des champs (tolerant aux sorties LLM
// imparfaites) et separe valeurs et drapeaux d'inference.
export function normalizeModel(m) {
  const listField = (v, flags, name) => {
    const arr = Array.isArray(v) ? v : (v ? [v] : []);
    flags[name] = arr.map((x) => isInferred(x));
    return arr.map((x) => valueOf(x));
  };
  const scalarField = (v, flags, name) => {
    flags[name] = isInferred(v);
    return valueOf(v);
  };
  const out = {};
  out.process = valueOf(m && m.process) || "Processus";
  // bornes du processus : evenement declencheur et resultat attendu
  out.trigger = valueOf(m && m.trigger);
  out.outcome = valueOf(m && m.outcome);
  out.actors = (m && Array.isArray(m.actors)) ? m.actors.map((a) => valueOf(a)) : [];
  const rawSteps = (m && Array.isArray(m.steps)) ? m.steps : [];
  const ids = new Set(rawSteps.map((s, i) => (s && s.id) || `s${i + 1}`));
  // v6 : trois listes au niveau processus, valeurs polymorphes comme
  // les metadonnees d'etape. Les incertitudes sont conservees telles
  // quelles, jamais resolues. Une exception peut se rattacher a une
  // etape par id (step_id), verifie contre la liste des etapes.
  out.inferredProcess = {};
  const procList = (v, name) => {
    const arr = Array.isArray(v) ? v : (v ? [v] : []);
    const texts = [], flags = [];
    arr.forEach((x) => {
      const t = valueOf(x);
      if (!t) return;
      texts.push(t);
      flags.push(isInferred(x));
    });
    out.inferredProcess[name] = flags;
    return texts;
  };
  out.rules = procList(m && m.rules, "rules");
  out.uncertainties = procList(m && m.uncertainties, "uncertainties");
  const rawExc = (m && Array.isArray(m.exceptions)) ? m.exceptions : [];
  out.inferredProcess.exceptions = [];
  out.exceptions = [];
  rawExc.forEach((x) => {
    const text = valueOf(x);
    if (!text) return;
    let stepId = (x && typeof x === "object" && x.step_id) ? String(x.step_id) : null;
    if (stepId && !ids.has(stepId)) stepId = null;
    out.exceptions.push({ text, step_id: stepId });
    out.inferredProcess.exceptions.push(isInferred(x));
  });
  out.steps = rawSteps.map((s, i) => {
    const inferred = {};
    // acteurs multiples : accepte l'ancienne forme actor (chaine) et la
    // nouvelle forme actors (tableau, le premier est le responsable)
    let actorsList = [];
    if (s && Array.isArray(s.actors)) actorsList = s.actors.map((a) => valueOf(a)).filter(Boolean);
    else if (s && s.actor) actorsList = [valueOf(s.actor)];
    if (!actorsList.length) actorsList = [out.actors[0] || "Acteur"];
    // stage : entier > 0 ; les etapes partageant un stage sont simultanees.
    // stage_given retient si le stage vient du modele (concomitance
    // affirmee) ou a ete deduit du rang (partage par defaut possible).
    const st = Number(s && s.stage);
    const step = {
      id: (s && s.id) || `s${i + 1}`,
      actor: actorsList[0],
      actors: actorsList,
      stage: Number.isInteger(st) && st > 0 ? st : null,
      stage_given: Number.isInteger(st) && st > 0,
      label: valueOf(s && s.label) || `Etape ${i + 1}`,
      documents_in: listField(s && s.documents_in, inferred, "documents_in"),
      documents_out: listField(s && s.documents_out, inferred, "documents_out"),
      data_in: listField(s && s.data_in, inferred, "data_in"),
      data_out: listField(s && s.data_out, inferred, "data_out"),
      tools: listField(s && s.tools, inferred, "tools"),
      duration: scalarField(s && s.duration, inferred, "duration"),
      duration_min: scalarField(s && s.duration_min, inferred, "duration_min"),
      duration_max: scalarField(s && s.duration_max, inferred, "duration_max"),
      volume: scalarField(s && s.volume, inferred, "volume"),
      frequency: scalarField(s && s.frequency, inferred, "frequency"),
      friction: scalarField(s && s.friction, inferred, "friction"),
      procedure: scalarField(s && s.procedure, inferred, "procedure"),
      opportunity: scalarField(s && s.opportunity, inferred, "opportunity"),
      automated: !!(s && s.automated),
      decision: null,
      inferred
    };
    // decision binaire vulgarisee : question + branche "non"
    if (s && s.decision && s.decision.question) {
      const onNo = s.decision.on_no || {};
      let returnTo = valueOf(onNo.return_to) || "fin";
      // cible de retour inconnue : repli tolerant sur "fin"
      if (returnTo !== "fin" && !ids.has(returnTo)) returnTo = "fin";
      step.decision = {
        question: valueOf(s.decision.question),
        on_no: { label: valueOf(onNo.label) || "Non", return_to: returnTo }
      };
    }
    return step;
  });
  // stages manquants : deduits du rang (comportement sequentiel) ; un
  // stage fourni est conserve, la numerotation est ensuite compactee
  let prev = 0;
  out.steps.forEach((s) => {
    if (s.stage == null) s.stage = prev + 1;
    prev = s.stage;
  });
  const order = [...new Set(out.steps.map((s) => s.stage))].sort((a, b) => a - b);
  const rankOf = new Map(order.map((v, i) => [v, i + 1]));
  out.steps.forEach((s) => { s.stage = rankOf.get(s.stage); });
  // si le RESPONSABLE d'une etape manque dans la liste, on l'ajoute
  out.steps.forEach((s) => {
    if (!out.actors.includes(s.actor)) out.actors.push(s.actor);
  });
  // Regle de l'acteur passif, imposee par le code plutot qu'esperee du
  // modele : un acteur qui ne realise aucune etape ne recoit pas de
  // ligne dans la grille. Une personne citee en soutien reste
  // participante des etapes concernees (step.actors), sans ligne.
  // Le retrait est journalise pour rester tracable.
  const responsibles = new Set(out.steps.map((s) => s.actor));
  const removed = out.actors.filter((a) => !responsibles.has(a));
  if (removed.length && out.steps.length) {
    out.actors = out.actors.filter((a) => responsibles.has(a));
    console.log(`[acteur-passif] ${removed.length} acteur(s) sans activite retire(s) de la grille : ${removed.join(", ")}`);
  }
  return out;
}
