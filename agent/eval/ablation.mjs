// Ablation des principes de conception : execute les cas 02 a 06 dans
// des conditions degradees, chacune retirant une decision de conception,
// et compare chaque condition a la reference (prompt v2 complet).
//
//   A. reference        prompt v2 complet (reutilise le cache du banc)
//   B. sans few-shot    exemple resolu retire
//   C. sans raisonnement ordre acteurs/taches/enchainement/metadonnees retire
//   D. sans granularite regle de regroupement retiree
//   E. sans metadonnees schema reduit au flux de controle, facon BPMN
//   F. sans JSON        le modele produit directement le XML Draw.io
//
// Usage : node eval/ablation.mjs [--provider anthropic] [--only 02,03]
//         [--conditions B,E] [--from-cache] [--threshold 0.4]
// Chaque generation est une tentative unique (pas de boucle de
// reparation) : le taux de sorties exploitables au premier essai est
// une metrique de l'ablation. Cache disque par condition.

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
// La condition A (reference) de l'ablation est le prompt v2 GELE, celui
// des resultats publies : ne pas la faire suivre les evolutions de
// src/prompts.js.
import { buildMessages as buildReference, PROMPT_VERSION } from "../src/prompts-v2.js";
import { extractJson } from "../src/repair.js";
import { normalizeModel, validateModel } from "../src/schema.js";
import * as ollama from "../src/llm/ollama.js";
import * as openai from "../src/llm/openai.js";
import * as anthropic from "../src/llm/anthropic.js";
import { scoreModel } from "./score.mjs";
import * as B from "./prompts/B_sans_fewshot.mjs";
import * as C from "./prompts/C_sans_raisonnement.mjs";
import * as D from "./prompts/D_sans_granularite.mjs";
import * as E from "./prompts/E_sans_metadonnees.mjs";
import * as F from "./prompts/F_sans_json.mjs";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const providers = { ollama, openai, anthropic };
const defaultParse = (raw) => {
  const model = normalizeModel(extractJson(raw));
  const v = validateModel(model);
  if (!v.ok) throw new Error(v.errors.join(" | "));
  return model;
};

const CONDITIONS = [
  { key: "A", name: "reference", description: "prompt v2 complet", buildMessages: buildReference, parse: defaultParse, cacheVersion: PROMPT_VERSION },
  ...[B, C, D, E, F].map((mod) => ({
    key: mod.meta.key, name: mod.meta.name, description: mod.meta.description,
    buildMessages: mod.buildMessages,
    parse: mod.parseOutput || defaultParse,
    cacheVersion: `ablation-${mod.meta.key}-v${PROMPT_VERSION}`
  }))
];

// --- Options ---
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);
const PROVIDER = opt("provider", process.env.PROVIDER || "anthropic");
const ONLY = opt("only", "02,03,04,05,06").split(",").map((s) => s.trim()).filter(Boolean);
const CONDS = opt("conditions", "A,B,C,D,E,F").split(",").map((s) => s.trim().toUpperCase());
const FROM_CACHE = has("from-cache");
const THRESHOLD = Number(opt("threshold", "0.4"));

function modelName(provider) {
  if (provider === "ollama") return process.env.OLLAMA_MODEL || "mistral";
  if (provider === "openai") return process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  return "inconnu";
}
const MODEL = modelName(PROVIDER);
const impl = providers[PROVIDER];
if (!impl) { console.log(`Fournisseur inconnu: ${PROVIDER}`); process.exit(1); }

const CORPUS = new URL("./corpus/", import.meta.url);
const CACHE = new URL("./cache/", import.meta.url);
const RESULTS = new URL("./results/", import.meta.url);
mkdirSync(CACHE, { recursive: true });
mkdirSync(RESULTS, { recursive: true });

const cases = readdirSync(CORPUS).sort()
  .filter((f) => f.endsWith(".txt") && ONLY.some((p) => f.startsWith(p)))
  .map((f) => {
    const base = f.replace(/\.txt$/, "");
    return {
      id: base,
      text: readFileSync(new URL(f, CORPUS), "utf8"),
      expected: JSON.parse(readFileSync(new URL(`${base}.expected.json`, CORPUS), "utf8"))
    };
  });
if (!cases.length) { console.log("Aucun cas selectionne."); process.exit(1); }

// --- Generation avec cache (tentative unique, sans reparation) ---
async function generateRaw(cond, c) {
  const key = createHash("sha256")
    .update(JSON.stringify({ text: c.text, provider: PROVIDER, model: MODEL, promptVersion: cond.cacheVersion }))
    .digest("hex");
  const file = new URL(`${key}.json`, CACHE);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    // la condition A reutilise le cache du banc, qui stocke le modele
    // deja analyse et non la sortie brute
    return { ...cached, fromCache: true };
  }
  if (FROM_CACHE) return { skipped: "cache absent" };
  const t0 = Date.now();
  const raw = await impl.complete(cond.buildMessages(c.text));
  const entry = {
    caseId: c.id, condition: cond.key, provider: PROVIDER, model: MODEL,
    promptVersion: cond.cacheVersion, generatedAt: new Date().toISOString(),
    latencyMs: Date.now() - t0, raw
  };
  writeFileSync(file, JSON.stringify(entry, null, 2));
  return { ...entry, fromCache: false };
}

const rows = [];
for (const cond of CONDITIONS.filter((c) => CONDS.includes(c.key))) {
  const perCase = [];
  for (const c of cases) {
    process.stdout.write(`[${cond.key}] ${c.id} ... `);
    let g;
    try {
      g = await generateRaw(cond, c);
    } catch (e) {
      console.log(`ECHEC APPEL: ${e.message}`);
      perCase.push({ id: c.id, usable: false, error: String(e.message) });
      continue;
    }
    if (g.skipped) { console.log("ignore (cache absent)"); perCase.push({ id: c.id, skipped: true }); continue; }
    let model = null, usable = false, parseError = null;
    if (g.generated) {
      // entree du banc (condition A) : modele deja analyse et valide
      model = g.generated; usable = g.valid !== false;
    } else {
      try {
        model = cond.parse(g.raw);
        usable = true;
      } catch (e) {
        parseError = String(e.message);
      }
    }
    const scores = usable ? scoreModel(model, c.expected, { threshold: THRESHOLD }) : null;
    perCase.push({ id: c.id, usable, parseError, latencyMs: g.latencyMs, fromCache: g.fromCache, scores });
    console.log(usable ? `ok (${g.fromCache ? "cache" : Math.round(g.latencyMs / 1000) + " s"})` : `INEXPLOITABLE: ${parseError}`);
  }
  rows.push({ condition: cond, perCase });
}

// --- Tableau comparatif ---
const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const median = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const pct = (x) => (x == null ? "—" : Math.round(x * 100) + " %");
const f2 = (x) => (x == null ? "—" : x.toFixed(2));

const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const md = [];
md.push(`# Ablation des principes de conception — ${now.toISOString()}`);
md.push("");
md.push(`Fournisseur : **${PROVIDER}** · modele : **${MODEL}** · reference : prompt **v${PROMPT_VERSION}** (gele) · cas : ${cases.map((c) => c.id.slice(0, 2)).join(", ")} · seuil : ${THRESHOLD}`);
md.push("Tentative unique par generation (pas de boucle de reparation) : le taux de sorties exploitables au premier essai fait partie des resultats. Les metriques ne sont moyennees que sur les sorties exploitables.");
md.push("");
md.push("| Condition | Exploitable 1er essai | Documents | Outils | Temps | Frictions | F1 acteurs | F1 taches | Rattachement | Ratio gran. | Effort moyen | Latence med. |");
md.push("|-----------|----------------------|-----------|--------|-------|-----------|------------|-----------|--------------|-------------|--------------|--------------|");
for (const { condition, perCase } of rows) {
  const done = perCase.filter((p) => !p.skipped);
  const scoredRows = done.filter((p) => p.scores);
  const s = (fn) => mean(scoredRows.map((p) => fn(p.scores)));
  const usableRate = done.length ? done.filter((p) => p.usable).length / done.length : null;
  md.push(`| ${condition.key}. ${condition.name} | ${done.filter((p) => p.usable).length}/${done.length} (${pct(usableRate)}) | ` +
    `${pct(s((x) => x.metadata.documents.recall))} | ${pct(s((x) => x.metadata.outils.recall))} | ` +
    `${pct(s((x) => x.metadata.temps.recall))} | ${pct(s((x) => x.metadata.frictions.recall))} | ` +
    `${f2(s((x) => x.coverage.actors.f1))} | ${f2(s((x) => x.coverage.tasks.f1))} | ` +
    `${pct(s((x) => x.attachment.accuracy))} | ${f2(s((x) => x.granularity.ratio))} | ` +
    `${f2(s((x) => x.editEffort.total))} | ${median(done.map((p) => p.latencyMs)) != null ? Math.round(median(done.map((p) => p.latencyMs)) / 1000) + " s" : "—"} |`);
}
md.push("");
md.push("Lecture : la condition E chiffre l'apport de la couche de metadonnees (tout rappel perdu par rapport a A est capte par le Modele hybride seul) ; la condition F chiffre l'apport de la representation intermediaire JSON (exploitabilite et conformite structurelle).");
for (const { condition, perCase } of rows) {
  const bad = perCase.filter((p) => p.parseError);
  if (bad.length) {
    md.push(`\nSorties inexploitables en ${condition.key} : ${bad.map((p) => `${p.id} (${p.parseError})`).join(" ; ")}`);
  }
}

writeFileSync(new URL(`${stamp}_ablation_${PROVIDER}.json`, RESULTS),
  JSON.stringify({ generatedAt: now.toISOString(), provider: PROVIDER, model: MODEL, promptVersion: PROMPT_VERSION, threshold: THRESHOLD, rows }, null, 2));
writeFileSync(new URL(`${stamp}_ablation_${PROVIDER}.md`, RESULTS), md.join("\n") + "\n");
console.log(`\nRapport d'ablation : eval/results/${stamp}_ablation_${PROVIDER}.md (et .json)`);
