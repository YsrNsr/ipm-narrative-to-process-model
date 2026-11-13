import express from "express";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extract, extractAll, getRepairCount } from "./src/llm/index.js";
import { renderDrawioXml, renderRaciXml, renderChecks } from "./src/drawio.js";
import { validateModel } from "./src/schema.js";
import { parseDrawioXml } from "./src/drawio-parse.js";
import { compareModels, diffDetails } from "./src/editdistance.js";
import { toCsv, toMarkdown } from "./src/export.js";
import { mergeModels } from "./src/merge.js";
import { buildValidationList, toValidationMarkdown } from "./src/validation-list.js";
import { toBpmn } from "./src/export-bpmn.js";
import { buildQuestions, toQuestionsMarkdown } from "./src/questions.js";
import { PROMPT_VERSION } from "./src/prompts.js";
import { slugify, sessionName, resolvePages, PAGE_NAMES } from "./src/names.js";
import { authMiddleware } from "./src/auth.js";
import { loadSessions, persistSession as storePersist, trashSession, applyRetention } from "./src/session-store.js";

dotenv.config();

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static("public"));
// jeton d'acces optionnel : AUTH_TOKEN vide = poste local sans friction ;
// defini = toutes les routes /api/* l'exigent (le statique reste ouvert)
app.use("/api", authMiddleware(process.env.AUTH_TOKEN || ""));

const PROVIDER = process.env.PROVIDER || "ollama";

// Journal des sessions de relecture et correction : modele initial,
// XML final, horodatages et mesure d'effort d'edition (chapitre 7).
// LOGS_DIR configurable (volume Docker) ; defaut : logs/ du projet.
const LOGS_DIR = process.env.LOGS_DIR || fileURLToPath(new URL("./logs", import.meta.url));
const SESSIONS_DIR = path.join(LOGS_DIR, "sessions");

// Recharge les sessions persistees : un redemarrage du serveur ne doit
// pas interrompre une session de relecture et correction en cours.
const sessions = loadSessions(SESSIONS_DIR);

// Retention configurable : SESSION_RETENTION_DAYS vide, rien n'expire
// (comportement historique). Definie, les sessions plus anciennes
// partent en corbeille au demarrage — jamais de purge silencieuse.
const retentionDays = Number(process.env.SESSION_RETENTION_DAYS || 0);
if (retentionDays > 0) {
  const moved = applyRetention(SESSIONS_DIR, retentionDays);
  for (const m of moved) {
    sessions.delete(m.id);
    console.log(`[retention] session ${m.id} (« ${m.process} », ${m.createdAt}) deplacee : ${m.file}`);
  }
  console.log(`[retention] ${moved.length} session(s) de plus de ${retentionDays} jours deplacee(s) en corbeille`);
}

function persistSession(s) {
  storePersist(SESSIONS_DIR, s);
}

// modele effectivement utilise par chaque fournisseur (env ou defaut)
const resolvedModels = () => ({
  ollama: process.env.OLLAMA_MODEL || "mistral",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: process.env.ANTHROPIC_MODEL || "claude-opus-5"
});

app.get("/api/health", (req, res) => {
  const models = resolvedModels();
  res.json({ status: "ok", provider: PROVIDER, model: models[PROVIDER] || null, models });
});

// Modeles proposables par fournisseur, defaut en tete. Anthropic et
// OpenAI : listes configurables (ANTHROPIC_MODELS / OPENAI_MODELS,
// noms separes par des virgules) avec repli sur les identifiants
// eprouves ; Ollama : modeles reellement installes (GET /api/tags du
// demon local, delai court), repli sur OLLAMA_MODEL si le demon ne
// repond pas.
app.get("/api/models", async (req, res) => {
  const defaults = resolvedModels();
  const confList = (env, fallback) => {
    const conf = (process.env[env] || "").split(",").map((s) => s.trim()).filter(Boolean);
    return conf.length ? conf : fallback;
  };
  const headDefault = (arr, def) => (arr.includes(def) ? [def, ...arr.filter((x) => x !== def)] : [def, ...arr]);
  const anthropic = headDefault(confList("ANTHROPIC_MODELS", ["claude-opus-5", "claude-sonnet-4-6"]), defaults.anthropic);
  const openai = headDefault(confList("OPENAI_MODELS", [defaults.openai]), defaults.openai);
  let ollama = [defaults.ollama];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch((process.env.OLLAMA_URL || "http://localhost:11434") + "/api/tags", { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const names = ((await r.json()).models || []).map((m) => m.name).filter(Boolean);
      if (names.length) ollama = headDefault(names, defaults.ollama).filter((n, i, a) => a.indexOf(n) === i);
    }
  } catch (_) { /* demon absent : repli sur le modele configure */ }
  res.json({
    defaultProvider: PROVIDER,
    providers: {
      ollama: { models: ollama, default: ollama[0] },
      openai: { models: openai, default: defaults.openai },
      anthropic: { models: anthropic, default: defaults.anthropic }
    }
  });
});

// Transcription d'exemple livree avec l'outil (bouton de l'interface) :
// le recit de reference du memoire, la demande de conges.
app.get("/api/example", (req, res) => {
  try {
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send(readFileSync(new URL("./examples/transcript_conges.txt", import.meta.url), "utf8"));
  } catch (e) {
    res.status(404).json({ error: "Transcription d'exemple introuvable." });
  }
});

// statut d'une session : ebauche generee -> corrigee -> validee metier
const sessionStatus = (s) =>
  s.xmlValidated ? "validee metier" : (s.saves > 0 ? "corrigee" : "ebauche generee");

// en-tete de telechargement : nom de fichier derive du processus (ou
// du nom personnalise de la session), en ASCII sur via le slug
const attachName = (res, s, suffix) =>
  res.set("Content-Disposition", `attachment; filename="${slugify(sessionName(s))}${suffix}"`);

// resume d'une session pour l'historique (sans les XML, volumineux)
const sessionSummary = (s) => ({
  id: s.id,
  createdAt: s.createdAt,
  provider: s.provider,
  // nom effectif : le nom personnalise (renommage) prime sur l'extrait
  process: sessionName(s),
  name: s.name || null,
  slug: slugify(sessionName(s)),
  steps: ((s.model && s.model.steps) || []).length,
  actors: ((s.model && s.model.actors) || []).length,
  saves: s.saves || 0,
  editEffort: s.editEffort ? s.editEffort.total : null,
  status: sessionStatus(s),
  validatedAt: s.validatedAt || null,
  // composition du fichier ; les sessions anterieures au composeur
  // portaient toujours Makigami + RACI
  pages: s.pages || ["Makigami", "RACI"],
  // provenance (null pour les sessions anterieures a sa journalisation)
  llmModel: s.llmModel || null,
  promptVersion: s.promptVersion || null,
  // duree de generation, pour l'ordre de grandeur affiche a l'attente
  ms: s.ms || null
});

// Historique : liste des sessions journalisees, la plus recente d'abord.
app.get("/api/sessions", (req, res) => {
  const list = [...sessions.values()]
    .map(sessionSummary)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ sessions: list });
});

// Detail d'une session : modele + XML courant (pour rouvrir la grille).
app.get("/api/session/:id", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  res.json({
    ...sessionSummary(s),
    model: s.model,
    xml: s.xmlValidated || s.xmlFinal || s.xmlInitial,
    warnings: s.warnings || [],
    validationState: s.validationState || {}
  });
});

// Renommage d'une session : le nom personnalise prime ensuite partout
// (historique, noms des fichiers exportes). Nom vide : retour au nom
// de processus extrait.
app.patch("/api/session/:id", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  const name = String((req.body && req.body.name) || "").trim().slice(0, 120);
  s.name = name || null;
  persistSession(s);
  res.json(sessionSummary(s));
});

// Suppression d'une session (droit a l'effacement d'un entretien,
// nLPD) : retiree de la memoire ET deplacee en corbeille plutot
// qu'effacee brutalement — filet de securite ; vider le dossier
// logs/sessions/corbeille/ est l'effacement definitif (README).
app.delete("/api/session/:id", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  const file = trashSession(SESSIONS_DIR, s.id);
  sessions.delete(s.id);
  console.log(`[session ${s.id}] supprimee, ${file ? `deplacee : ${file}` : "fichier deja absent"}`);
  res.json({ ok: true, trashed: !!file });
});

// Pages derivables apres coup : compose a la demande n'importe quel
// sous-ensemble de pages depuis le modele journalise, sans nouvel
// appel LLM. C'est le filet de securite de la grille MIP optionnelle :
// rien n'est perdu, tout est re-derivable. Sans parametre, la
// composition d'origine de la session ; pages inconnues ignorees.
app.get("/api/session/:id/render.drawio", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  const pages = resolvePages(req.query.pages, s.pages || ["Makigami", "RACI"]);
  if (!pages.length) {
    return res.status(400).json({ error: `Aucune page reconnue. Pages possibles : ${PAGE_NAMES.join(", ")}.` });
  }
  res.set("Content-Type", "application/xml; charset=utf-8");
  attachName(res, s, ".drawio");
  res.send(renderDrawioXml(s.model, { pages }));
});

// Le modele extrait brut, joli-imprime : la matiere premiere de
// l'analyste outille (scripts, tableurs, autres outils).
app.get("/api/session/:id/export.json", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  res.set("Content-Type", "application/json; charset=utf-8");
  attachName(res, s, ".json");
  res.send(JSON.stringify(s.model, null, 2));
});

// Comparaison lisible entre la sortie brute de l'IA et la version
// courante (validee metier si elle existe, sinon derniere sauvegarde).
app.get("/api/session/:id/diff", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  const currentXml = s.xmlValidated || s.xmlFinal;
  if (!currentXml) return res.json({ unchanged: true, details: null });
  // session generee sans la grille MIP : pas de comparaison possible,
  // reponse propre plutot qu'une erreur
  if (!/<diagram\b[^>]*name="Makigami"/.test(currentXml)) {
    return res.json({ unchanged: false, details: null, noMakigami: true });
  }
  try {
    const current = parseDrawioXml(currentXml);
    res.json({ unchanged: false, details: diffDetails(s.model, current), effort: compareModels(s.model, current) });
  } catch (e) {
    res.status(422).json({ error: "XML courant illisible : " + String((e && e.message) || e) });
  }
});

// Marquage de la validation metier : fige un troisieme etat, distinct
// de la sortie brute et des sauvegardes courantes. C'est l'artefact de
// reference destine a l'analyste.
app.post("/api/session/:id/validate-metier", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  const xml = (req.body && req.body.xml) || s.xmlFinal || s.xmlInitial;
  s.xmlValidated = xml;
  s.validatedAt = new Date().toISOString();
  persistSession(s);
  console.log(`[session ${s.id}] validation metier enregistree`);
  res.json({ ok: true, validatedAt: s.validatedAt, status: sessionStatus(s) });
});

// Etat des cases de la liste de validation (panneau droit) : journalise
// dans la session pour que la seance puisse s'interrompre et reprendre.
app.post("/api/session/:id/validation-state", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  s.validationState = (req.body && req.body.state) || {};
  s.validationUpdatedAt = new Date().toISOString();
  persistSession(s);
  res.json({ ok: true });
});

// Liste de validation : memes donnees pour le panneau interactif
// (JSON) et l'export imprimable a cases a cocher (Markdown).
app.get("/api/session/:id/validation-list", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  // le panneau recoit aussi les questions d'entretien de suivi, en
  // section dediee apres les six familles de validation
  const items = [
    ...buildValidationList(s.model),
    ...buildQuestions(s.model).map((q) => ({ ...q, family: "Questions pour l'entretien de suivi" }))
  ];
  res.json({ items, state: s.validationState || {} });
});

// Questions d'entretien de suivi, en export imprimable.
app.get("/api/session/:id/export-questions.md", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  res.set("Content-Type", "text/markdown; charset=utf-8");
  attachName(res, s, "-questions.md");
  res.send(toQuestionsMarkdown(s.model));
});

app.get("/api/session/:id/export-validation.md", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  res.set("Content-Type", "text/markdown; charset=utf-8");
  attachName(res, s, "-validation.md");
  // l'export reflete la seance : cases cochees et date du pointage
  res.send(toValidationMarkdown(s.model, {
    state: s.validationState || {},
    checkedAt: s.validationUpdatedAt || null
  }));
});

// Export BPMN 2.0 (converti depuis le JSON du MIP, jamais du XML).
app.get("/api/session/:id/export.bpmn", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  res.set("Content-Type", "application/xml; charset=utf-8");
  attachName(res, s, ".bpmn");
  res.send(toBpmn(s.model));
});

// Matrice de responsabilites seule (page RACI), en fichier .drawio.
app.get("/api/session/:id/export-raci.drawio", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "Session inconnue." });
  res.set("Content-Type", "application/xml; charset=utf-8");
  attachName(res, s, "-raci.drawio");
  res.send(renderRaciXml(s.model));
});

app.post("/api/generate", async (req, res) => {
  // une transcription (text) ou plusieurs pour le meme processus (texts)
  const texts = Array.isArray(req.body && req.body.texts)
    ? req.body.texts.map((t) => String(t || "").trim()).filter(Boolean)
    : [((req.body && req.body.text) || "").trim()].filter(Boolean);
  const provider = (req.body && req.body.provider) || PROVIDER;
  // modele choisi dans l'interface ; priorite parametre > env > defaut
  const reqModel = (req.body && typeof req.body.model === "string" && req.body.model.trim().slice(0, 120)) || null;
  const llmModel = reqModel || resolvedModels()[provider] || null;
  // pages du fichier .drawio, grille MIP comprise, selon les cases
  // cochees ; absent : composition historique (Makigami + RACI)
  const pages = Array.isArray(req.body && req.body.pages)
    ? req.body.pages.filter((p) => PAGE_NAMES.includes(p))
    : null;
  if (pages && !pages.length) {
    return res.status(400).json({ error: "Au moins une page est requise dans le fichier genere." });
  }
  if (!texts.length) return res.status(400).json({ error: "Texte d'entree vide." });
  try {
    const t0 = Date.now();
    let model, repaired = false;
    if (texts.length === 1) {
      ({ model, repaired } = await extract(texts[0], { provider, model: reqModel }));
    } else {
      // fusion multi-entretiens : un modele par transcription, puis
      // appariement des etapes et union des metadonnees ; les
      // contradictions sont signalees dans le modele fusionne
      // extractions en parallele pour le cloud (limite 3), sequentiel
      // pour Ollama ; la fusion ne change pas. Si le client a annule,
      // la requete fournisseur va a son terme et le resultat est
      // simplement jete (aucune complexite d'annulation serveur).
      const r = await extractAll(texts, { provider, model: reqModel });
      repaired = r.repaired;
      model = mergeModels(r.models, texts.map((_, i) => `entretien ${i + 1}`));
    }
    const { ok, errors } = validateModel(model);
    // cas degenere : message clair plutot qu'un diagramme vide
    if (!(model.steps || []).length || !(model.actors || []).length) {
      return res.status(422).json({
        error: "Aucun processus reconnaissable dans ce texte : aucune etape ou aucun acteur n'a pu etre extrait. Verifiez que la transcription decrit bien un processus.",
        details: errors
      });
    }
    const warnings = (ok ? [] : errors.slice()).concat(renderChecks(model));
    const xml = renderDrawioXml(model, pages ? { pages } : {});
    // une session de relecture et correction demarre a chaque generation
    const session = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      provider,
      repaired,
      model,
      warnings,
      pages: pages || ["Makigami", "RACI"],
      llmModel,
      promptVersion: PROMPT_VERSION,
      ms: Date.now() - t0,
      xmlInitial: xml,
      xmlFinal: null,
      finalizedAt: null,
      saves: 0,
      editEffort: null,
      xmlValidated: null,
      validatedAt: null,
      validationState: {}
    };
    sessions.set(session.id, session);
    persistSession(session);
    // repaired et repairCount alimentent l'indicateur de robustesse (chapitre 7)
    // provenance visible : version du prompt et modele effectifs
    res.json({
      sessionId: session.id, model, xml,
      warnings, ms: Date.now() - t0,
      repaired, repairCount: getRepairCount(),
      provider, llmModel, promptVersion: PROMPT_VERSION,
      // slug des noms de fichiers cote client (lien Draw.io, PNG)
      slug: slugify(sessionName(session))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

// Recoit le XML courant de l'editeur (evenements save / autosave) et
// journalise le modele final avec la mesure d'effort d'edition.
app.post("/api/session/:id/final", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session inconnue." });
  const xml = req.body && req.body.xml;
  if (!xml) return res.status(400).json({ error: "XML manquant." });
  session.xmlFinal = xml;
  session.finalizedAt = new Date().toISOString();
  session.saves++;
  // la mesure d'effort repose sur la page Makigami, cherchee strictement
  // par son nom ; un fichier genere sans elle est journalise tel quel,
  // editEffort restant null, sans erreur ni avertissement anxiogene
  const hasMakigami = /<diagram\b[^>]*name="Makigami"/.test(xml);
  if (hasMakigami) {
    try {
      const finalModel = parseDrawioXml(xml);
      session.editEffort = compareModels(session.model, finalModel);
      session.parseError = null;
    } catch (e) {
      session.parseError = String((e && e.message) || e);
    }
  }
  persistSession(session);
  console.log(`[session ${session.id}] sauvegarde n°${session.saves}` +
    (session.editEffort ? ` | effort d'edition total: ${session.editEffort.total}` :
      (hasMakigami ? "" : " | sans grille MIP : effort non mesure")));
  res.json({ ok: true, saves: session.saves, editEffort: session.editEffort });
});

// Exports exploitables : CSV pour tableur, fiche processus Markdown.
app.get("/api/session/:id/export.csv", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session inconnue." });
  res.set("Content-Type", "text/csv; charset=utf-8");
  attachName(res, session, ".csv");
  res.send(toCsv(session.model));
});

app.get("/api/session/:id/export.md", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session inconnue." });
  res.set("Content-Type", "text/markdown; charset=utf-8");
  attachName(res, session, ".md");
  res.send(toMarkdown(session.model));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Agent MIP : http://localhost:${PORT} (fournisseur: ${PROVIDER})`);
});
