// Verification lexicale d'ancrage : une valeur de metadonnee est-elle
// soutenue par le texte source ? Contre-mesure au marquage auto-declare
// du modele, dont l'audit (eval/audit_ancrage.json) a montre le rappel
// tres faible : toute valeur non ancree est marquee deduite en
// post-traitement, en union avec le marquage du modele.
// Limite assumee : le detecteur repere l'absence d'ancrage lexical
// (invention), pas le mauvais rattachement d'un terme present ailleurs
// dans le texte.

const norm = (s) => String(s == null ? "" : s)
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");

// mots outils du francais courant, non porteurs d'information
const STOP = new Set(("le la les un une des du de d l au aux et ou a en dans sur pour par avec sans sous vers chez si que qui quoi dont est sont etre avoir fait faire plus moins tres bien tout tous toute toutes selon entre apres avant puis donc alors comme aussi meme cette ce ces son sa ses leur leurs notre nos il elle ils elles on nous vous je tu ne pas non oui lors afin cas fois chaque ex").split(" "));

// racinisation legere : tolere flexions et derivations usuelles sans
// lemmatiseur (verification / verifie, planification / planifie) ;
// racine plafonnee a 6 caracteres
const stem = (w) => w.slice(0, Math.min(6, Math.max(4, w.length - 2)));

// mots significatifs d'une valeur
export function significantWords(value) {
  return norm(value).replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

// Prepare une source pour des tests repetes (normalisation unique).
// Les locutions figees sont retirees pour eviter les faux amis : dans
// "par rapport a", "rapport" n'est pas le nom d'un document.
export function prepareSource(text) {
  return norm(text).replace(/par rapport a\b/g, " ").replace(/en rapport avec\b/g, " ");
}

// Determine si une valeur est ancree dans la source preparee.
// - valeur vide : ancree par convention (rien a verifier) ;
// - valeur tres courte (un seul mot significatif, ex. sigle ou nom
//   d'outil) : la presence de ce seul mot suffit, sans racinisation
//   pour les sigles courts (SITG, ERP) afin d'eviter les faux amis ;
// - sinon : proportion de mots significatifs retrouves >= seuil.
export function isGrounded(value, preparedSource, options = {}) {
  const threshold = options.threshold != null ? options.threshold : 0.7;
  const ws = significantWords(value);
  if (!ws.length) return { grounded: true, coverage: 1, missing: [] };
  const found = (w) => {
    // jeton contenant un chiffre (1h30, 50) : recherche en sous-chaine,
    // les ecritures varient (01h30, "a 50 %")
    if (/\d/.test(w)) return preparedSource.includes(w);
    return w.length <= 4
      ? new RegExp(`(^|[^a-z0-9])${w}`).test(preparedSource)
      : preparedSource.includes(stem(w));
  };
  const missing = ws.filter((w) => !found(w));
  const coverage = 1 - missing.length / ws.length;
  if (ws.length === 1) return { grounded: missing.length === 0, coverage, missing };
  return { grounded: coverage >= threshold, coverage, missing };
}

// Decoupe la source en lignes normalisees pour localiser les preuves.
export function prepareSourceLines(text) {
  return String(text || "").split(/\r?\n/).map((l) => ({ raw: l, norm: prepareSource(l) }));
}

// Meilleure fenetre de preuve (3 lignes) pour une valeur : numero de la
// ligne centrale, extrait brut et couverture de la fenetre. Sert a la
// tracabilite : l'utilisateur voit la phrase qui justifie la valeur.
export function findEvidence(value, sourceLines) {
  const ws = significantWords(value);
  if (!ws.length || !sourceLines.length) return null;
  const match = (w, txt) => {
    if (/\d/.test(w)) return txt.includes(w);
    return w.length <= 4
      ? new RegExp(`(^|[^a-z0-9])${w}`).test(txt)
      : txt.includes(stem(w));
  };
  // chaque ligne est scoree seule : la preuve citee doit etre la phrase
  // qui porte effectivement les mots de la valeur
  let best = null;
  for (let i = 0; i < sourceLines.length; i++) {
    const txt = sourceLines[i].norm;
    if (!txt.trim()) continue;
    const cov = ws.filter((w) => match(w, txt)).length / ws.length;
    if (!best || cov > best.cov) best = { cov, i };
    if (best.cov === 1) break;
  }
  if (!best || best.cov === 0) return null;
  const raw = sourceLines[best.i].raw.trim();
  return { line: best.i + 1, excerpt: raw.length > 180 ? raw.slice(0, 179) + "…" : raw, coverage: best.cov };
}

const LIST_FIELDS = ["documents_in", "documents_out", "data_in", "data_out", "tools"];
const SCALAR_FIELDS = ["duration", "duration_min", "duration_max", "volume", "frequency", "friction", "procedure", "opportunity"];

// Post-traitement du pipeline : marque comme deduites (inferred) toutes
// les valeurs non ancrees dans le texte source. Le marquage final est
// l'UNION du marquage auto-declare par le modele et de cette
// verification ; rien n'est jamais demarque. Modifie le modele en place
// et renvoie le nombre de valeurs marquees par la verification.
export function markUngrounded(model, sourceText, options = {}) {
  const src = prepareSource(sourceText);
  const lines = prepareSourceLines(sourceText);
  let marked = 0;
  for (const s of model.steps || []) {
    s.inferred = s.inferred || {};
    // provenance : pour chaque valeur ancree, la phrase source (ligne +
    // extrait) ; null pour une valeur deduite
    s.provenance = s.provenance || {};
    // la carte d'activite recoit aussi sa meilleure phrase de contexte
    s.provenance.label = findEvidence(s.label, lines);
    for (const f of LIST_FIELDS) {
      const flags = s.inferred[f] = s.inferred[f] || [];
      const prov = s.provenance[f] = s.provenance[f] || [];
      (s[f] || []).forEach((v, i) => {
        if (!v) { prov[i] = null; return; }
        if (!flags[i] && !isGrounded(v, src, options).grounded) { flags[i] = true; marked++; }
        prov[i] = flags[i] ? null : findEvidence(v, lines);
      });
    }
    for (const f of SCALAR_FIELDS) {
      if (!s[f]) { s.provenance[f] = null; continue; }
      if (!s.inferred[f] && !isGrounded(s[f], src, options).grounded) { s.inferred[f] = true; marked++; }
      s.provenance[f] = s.inferred[f] ? null : findEvidence(s[f], lines);
    }
  }
  // v6 : les trois listes du niveau processus (regles, exceptions,
  // incertitudes) recoivent le meme traitement — union avec le marquage
  // auto-declare, provenance pour les valeurs ancrees
  model.inferredProcess = model.inferredProcess || {};
  model.provenanceProcess = model.provenanceProcess || {};
  const groundProcList = (name, textOf) => {
    const items = model[name] || [];
    const flags = model.inferredProcess[name] = model.inferredProcess[name] || [];
    const prov = model.provenanceProcess[name] = model.provenanceProcess[name] || [];
    items.forEach((x, i) => {
      const t = textOf(x);
      if (!t) { prov[i] = null; return; }
      if (!flags[i] && !isGrounded(t, src, options).grounded) { flags[i] = true; marked++; }
      prov[i] = flags[i] ? null : findEvidence(t, lines);
    });
  };
  groundProcList("rules", (x) => x);
  groundProcList("uncertainties", (x) => x);
  groundProcList("exceptions", (x) => (x && x.text) || "");
  return marked;
}
