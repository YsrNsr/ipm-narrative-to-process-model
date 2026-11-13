// Validation externe sur le jeu PET (Bellan et al.), annote pour
// l'extraction de processus depuis du texte. Objectif : mesurer la
// performance sur des donnees ni ecrites ni annotees par l'auteur du
// memoire (objection de circularite du corpus), en anglais (condition
// distincte : robustesse linguistique).
//
// Seules les dimensions comparables sont scorees : acteurs et
// activites. Les metadonnees du Modele hybride n'existent pas dans PET.
// La proportion de documents PET comportant des passerelles (XOR/AND)
// est rapportee separement : elle quantifie la limite du choix lineaire.
//
// Usage : node eval/pet.mjs [--provider anthropic] [--docs 12]
//         [--from-cache] [--threshold 0.4]
// Source : PET v1.1 (entites), telecharge une fois puis mis en cache.

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { extractJson } from "../src/repair.js";
import { normalizeModel, validateModel } from "../src/schema.js";
import { norm, similarity } from "../src/editdistance.js";
// PET a ete mesure avec la variante anglaise derivee du prompt v2 gele :
// sa cle de cache reste ancree sur la version 2.
import { PROMPT_VERSION } from "../src/prompts-v2.js";
import * as ollama from "../src/llm/ollama.js";
import * as openai from "../src/llm/openai.js";
import * as anthropic from "../src/llm/anthropic.js";
import { buildMessages } from "./prompts/PET_anglais.mjs";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const PET_URL = "https://raw.githubusercontent.com/patriziobellan86/PETv1.1/master/PETv1.1-entities.jsonl";

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);
const PROVIDER = opt("provider", process.env.PROVIDER || "anthropic");
const N_DOCS = Number(opt("docs", "12"));
const FROM_CACHE = has("from-cache");
const THRESHOLD = Number(opt("threshold", "0.4"));

const providers = { ollama, openai, anthropic };
const impl = providers[PROVIDER];
if (!impl) { console.log(`Fournisseur inconnu: ${PROVIDER}`); process.exit(1); }
function modelName(provider) {
  if (provider === "ollama") return process.env.OLLAMA_MODEL || "mistral";
  if (provider === "openai") return process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  return "inconnu";
}
const MODEL = modelName(PROVIDER);

const CACHE = new URL("./cache/", import.meta.url);
const RESULTS = new URL("./results/", import.meta.url);
mkdirSync(CACHE, { recursive: true });
mkdirSync(RESULTS, { recursive: true });

// --- Chargement du jeu (telecharge une fois, cache sur disque) ---
const petFile = new URL("pet-entities.jsonl", CACHE);
if (!existsSync(petFile)) {
  console.log("Telechargement de PET v1.1 ...");
  const res = await fetch(PET_URL);
  if (!res.ok) { console.log(`Echec du telechargement PET (HTTP ${res.status}).`); process.exit(1); }
  writeFileSync(petFile, await res.text());
}
const sentences = readFileSync(petFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));

// Reconstruction des documents : texte, entites or (spans BIO) et
// presence de passerelles.
function spansOf(tokens, tags, type) {
  const spans = [];
  let current = null;
  tokens.forEach((tok, i) => {
    const tag = tags[i] || "O";
    if (tag === `B-${type}`) { if (current) spans.push(current); current = [tok]; }
    else if (tag === `I-${type}` && current) current.push(tok);
    else { if (current) spans.push(current); current = null; }
  });
  if (current) spans.push(current);
  return spans.map((s) => s.join(" "));
}

const docs = new Map();
for (const s of sentences) {
  const name = s["document name"];
  if (!docs.has(name)) docs.set(name, { name, sents: [], actors: new Set(), activities: [], hasGateway: false });
  const d = docs.get(name);
  d.sents.push({ id: s["sentence-ID"], tokens: s.tokens });
  const tags = s["ner-tags"];
  spansOf(s.tokens, tags, "Actor").forEach((a) => d.actors.add(norm(a)));
  spansOf(s.tokens, tags, "Activity").forEach((a) => d.activities.push(a));
  if (tags.some((t) => t.includes("XOR Gateway") || t.includes("AND Gateway"))) d.hasGateway = true;
}
const allDocs = [...docs.values()];
allDocs.forEach((d) => {
  d.sents.sort((a, b) => a.id - b.id);
  d.text = d.sents.map((s) => s.tokens.join(" ")).join(" ");
});
const gatewayDocs = allDocs.filter((d) => d.hasGateway).length;
const selected = allDocs.slice(0, N_DOCS);
console.log(`PET : ${allDocs.length} documents, ${gatewayDocs} avec passerelles ; extraction sur ${selected.length}.`);

// --- Generation (tentative unique, cache disque) ---
async function generate(doc) {
  const key = createHash("sha256")
    .update(JSON.stringify({ text: doc.text, provider: PROVIDER, model: MODEL, promptVersion: `pet-v${PROMPT_VERSION}` }))
    .digest("hex");
  const file = new URL(`${key}.json`, CACHE);
  if (existsSync(file)) return { ...JSON.parse(readFileSync(file, "utf8")), fromCache: true };
  if (FROM_CACHE) return { skipped: true };
  const t0 = Date.now();
  const raw = await impl.complete(buildMessages(doc.text));
  const entry = {
    docName: doc.name, provider: PROVIDER, model: MODEL, promptVersion: `pet-v${PROMPT_VERSION}`,
    generatedAt: new Date().toISOString(), latencyMs: Date.now() - t0, raw
  };
  writeFileSync(file, JSON.stringify(entry, null, 2));
  return { ...entry, fromCache: false };
}

// --- Appariement PET : les activites or sont souvent des verbes seuls
// ("reviews"), les libelles generes des phrases courtes a l'infinitif.
// Une racinisation legere neutralise les flexions anglaises (notifies /
// notify, checks / check), sinon l'appariement echoue sur la seule
// conjugaison. Un element or est rappele si tous ses mots racinises
// figurent dans un libelle genere, ou si la similarite depasse le seuil.
const stem = (w) => {
  if (w.length < 4) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("es")) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
};
const words = (s) => new Set(norm(s).split(" ").filter(Boolean).map(stem));
function matches(goldSpan, generatedLabel) {
  const g = words(goldSpan), l = words(generatedLabel);
  if (g.size && [...g].every((w) => l.has(w))) return true;
  return similarity(goldSpan, generatedLabel) >= THRESHOLD;
}
function prfSets(goldItems, genItems) {
  const recalled = goldItems.filter((g) => genItems.some((x) => matches(g, x))).length;
  const matched = genItems.filter((x) => goldItems.some((g) => matches(g, x))).length;
  const precision = genItems.length ? matched / genItems.length : 0;
  const recall = goldItems.length ? recalled / goldItems.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, gold: goldItems.length, generated: genItems.length };
}

const results = [];
for (const doc of selected) {
  process.stdout.write(`${doc.name} (${doc.sents.length} phrases${doc.hasGateway ? ", passerelles" : ""}) ... `);
  let g;
  try { g = await generate(doc); } catch (e) {
    console.log(`ECHEC APPEL: ${e.message}`);
    results.push({ doc: doc.name, hasGateway: doc.hasGateway, usable: false, error: String(e.message) });
    continue;
  }
  if (g.skipped) { console.log("ignore (cache absent)"); continue; }
  let model = null, usable = false, parseError = null;
  try {
    model = normalizeModel(extractJson(g.raw));
    usable = validateModel(model).ok;
    if (!usable) parseError = "schema invalide";
  } catch (e) { parseError = String(e.message); }
  if (!usable) {
    console.log(`INEXPLOITABLE: ${parseError}`);
    results.push({ doc: doc.name, hasGateway: doc.hasGateway, usable: false, parseError, latencyMs: g.latencyMs });
    continue;
  }
  const gold = { actors: [...doc.actors], activities: [...new Set(doc.activities.map(norm))] };
  const gen = { actors: model.actors, activities: model.steps.map((s) => s.label) };
  results.push({
    doc: doc.name, hasGateway: doc.hasGateway, usable: true,
    latencyMs: g.latencyMs, fromCache: g.fromCache,
    actors: prfSets(gold.actors, gen.actors),
    activities: prfSets(gold.activities, gen.activities)
  });
  console.log(`ok (${g.fromCache ? "cache" : Math.round(g.latencyMs / 1000) + " s"})`);
}

// --- Rapport ---
const usable = results.filter((r) => r.usable);
const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const f2 = (x) => (x == null ? "—" : x.toFixed(2));
const pct = (x) => (x == null ? "—" : Math.round(x * 100) + " %");
const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const md = [];
md.push(`# Validation externe sur PET — ${now.toISOString()}`);
md.push("");
md.push(`Fournisseur : **${PROVIDER}** · modele : **${MODEL}** · prompt : variante PET du v2 (libelles en langue source) · seuil : ${THRESHOLD}`);
md.push("");
md.push("**Condition distincte : textes en anglais** (robustesse linguistique). Seules les dimensions comparables sont scorees (acteurs, activites) ; les metadonnees du Modele hybride n'existent pas dans PET et ne sont pas scorees. Donnees externes, ni ecrites ni annotees par l'auteur (reponse a l'objection de circularite du corpus).");
md.push("");
md.push(`**Passerelles : ${gatewayDocs}/${allDocs.length} documents PET (${pct(gatewayDocs / allDocs.length)}) contiennent au moins une passerelle XOR ou AND.** Le Modele lineaire ne les represente pas : ce chiffre quantifie la portee de la limite assumee du choix lineaire.`);
md.push("");
md.push("| Document | Passerelles | Acteurs P | Acteurs R | Acteurs F1 | Activites P | Activites R | Activites F1 |");
md.push("|----------|-------------|-----------|-----------|------------|-------------|-------------|--------------|");
for (const r of results) {
  if (!r.usable) { md.push(`| ${r.doc} | ${r.hasGateway ? "oui" : "non"} | **inexploitable** (${r.parseError || r.error}) | | | | | |`); continue; }
  md.push(`| ${r.doc} | ${r.hasGateway ? "oui" : "non"} | ${f2(r.actors.precision)} | ${f2(r.actors.recall)} | ${f2(r.actors.f1)} | ${f2(r.activities.precision)} | ${f2(r.activities.recall)} | ${f2(r.activities.f1)} |`);
}
md.push(`| **moyenne** |  | ${f2(mean(usable.map((r) => r.actors.precision)))} | ${f2(mean(usable.map((r) => r.actors.recall)))} | ${f2(mean(usable.map((r) => r.actors.f1)))} | ${f2(mean(usable.map((r) => r.activities.precision)))} | ${f2(mean(usable.map((r) => r.activities.recall)))} | ${f2(mean(usable.map((r) => r.activities.f1)))} |`);
md.push("");
md.push(`Sorties exploitables au premier essai : ${usable.length}/${results.length}.`);

writeFileSync(new URL(`${stamp}_pet_${PROVIDER}.json`, RESULTS),
  JSON.stringify({ generatedAt: now.toISOString(), provider: PROVIDER, model: MODEL, threshold: THRESHOLD, totalDocs: allDocs.length, gatewayDocs, results }, null, 2));
writeFileSync(new URL(`${stamp}_pet_${PROVIDER}.md`, RESULTS), md.join("\n") + "\n");
console.log(`\nRapport PET : eval/results/${stamp}_pet_${PROVIDER}.md (et .json)`);
