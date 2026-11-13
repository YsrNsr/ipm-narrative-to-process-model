// Banc d'evaluation : execute le corpus, met en cache chaque generation,
// calcule les scores (eval/score.mjs) et produit un rapport horodate en
// JSON et en Markdown dans eval/results/.
//
// Usage : node eval/run.mjs [options]
//   --provider <p>      fournisseur LLM (defaut : PROVIDER du .env, sinon ollama)
//   --only 01,03        ne traite que les cas dont l'identifiant commence ainsi
//   --from-cache        aucun appel LLM : rejoue uniquement ce qui est en cache
//   --threshold 0.4     seuil d'appariement des libelles (score et effort)
//   --no-paraphrases    ignore les variantes de eval/paraphrases/
//   --threshold-sweep   analyse de sensibilite au seuil : rejoue le
//                       calcul des scores depuis le cache (aucun appel
//                       LLM) pour les seuils 0.3 a 0.7 et produit le
//                       tableau d'evolution des F1 acteurs et taches
//
// Reprise apres interruption : chaque generation reussie est ecrite dans
// eval/cache/ sous une cle qui identifie son contexte exact (hash du
// texte + fournisseur + modele + version du prompt). Relancer la meme
// commande repart du cache et ne regenere que ce qui manque. Modifier le
// prompt (PROMPT_VERSION), le modele ou le texte invalide la cle.

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { extract } from "../src/llm/index.js";
import { PROMPT_VERSION } from "../src/prompts.js";
import { validateModel } from "../src/schema.js";
import { scoreModel } from "./score.mjs";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

// Le cas 01 a servi a la mise au point du prompt sur trois sessions :
// il est contamine (le prompt a ete ajuste en le regardant) et se
// rapporte a part, comme cas de developpement. Le cas 07 (reel,
// bruite) se rapporte aussi a part (voir eval/corpus/README.md).
// La moyenne principale porte donc sur les cas 02 a 06.
const DEV_CASES = ["01"];
const EXCLUDED_FROM_AVERAGE = ["07"];

// --- Options ---
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);
const PROVIDER = opt("provider", process.env.PROVIDER || "ollama");
const ONLY = opt("only", "").split(",").map((s) => s.trim()).filter(Boolean);
const SWEEP = has("threshold-sweep");
// le balayage de seuil ne fait jamais d'appel LLM
const FROM_CACHE = has("from-cache") || SWEEP;
const THRESHOLD = Number(opt("threshold", "0.4"));
const WITH_PARAPHRASES = !has("no-paraphrases");
const SWEEP_THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7];

function modelName(provider) {
  if (provider === "ollama") return process.env.OLLAMA_MODEL || "mistral";
  if (provider === "openai") return process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  return "inconnu";
}
const MODEL = modelName(PROVIDER);

// --- Decouverte des cas ---
const CORPUS = new URL("./corpus/", import.meta.url);
const PARAPHRASES = new URL("./paraphrases/", import.meta.url);
const CACHE = new URL("./cache/", import.meta.url);
const RESULTS = new URL("./results/", import.meta.url);
mkdirSync(CACHE, { recursive: true });
mkdirSync(RESULTS, { recursive: true });

const cases = [];
for (const f of readdirSync(CORPUS).sort()) {
  if (!f.endsWith(".txt")) continue;
  const base = f.replace(/\.txt$/, "");
  const expectedFile = new URL(`${base}.expected.json`, CORPUS);
  if (!existsSync(expectedFile)) {
    console.log(`! ${base} : pas de ${base}.expected.json, cas ignore`);
    continue;
  }
  const expected = JSON.parse(readFileSync(expectedFile, "utf8"));
  cases.push({ id: base, baseId: base, kind: "corpus", text: readFileSync(new URL(f, CORPUS), "utf8"), expected });
  // variantes paraphrasees : <base>.paraN.txt, evaluees contre la meme reference
  if (WITH_PARAPHRASES && existsSync(PARAPHRASES)) {
    for (const p of readdirSync(PARAPHRASES).sort()) {
      const m = p.match(new RegExp(`^${base}\\.para(\\d+)\\.txt$`));
      if (m) {
        cases.push({
          id: `${base}.para${m[1]}`, baseId: base, kind: "paraphrase",
          text: readFileSync(new URL(p, PARAPHRASES), "utf8"), expected
        });
      }
    }
  }
}
const selected = ONLY.length ? cases.filter((c) => ONLY.some((p) => c.id.startsWith(p))) : cases;
if (!selected.length) {
  console.log("Aucun cas selectionne."); process.exit(1);
}

// --- Generation avec cache ---
function cacheKey(text) {
  return createHash("sha256")
    .update(JSON.stringify({ text, provider: PROVIDER, model: MODEL, promptVersion: PROMPT_VERSION }))
    .digest("hex");
}

async function generate(c) {
  const key = cacheKey(c.text);
  const file = new URL(`${key}.json`, CACHE);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    return { ...cached, fromCache: true };
  }
  if (FROM_CACHE) return { skipped: "cache absent" };
  const t0 = Date.now();
  try {
    const { model, repaired } = await extract(c.text, { provider: PROVIDER });
    const entry = {
      caseId: c.id, provider: PROVIDER, model: MODEL, promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(), latencyMs: Date.now() - t0,
      repaired, valid: validateModel(model).ok, generated: model
    };
    writeFileSync(file, JSON.stringify(entry, null, 2));
    return { ...entry, fromCache: false };
  } catch (e) {
    // echec apres reparation : compte dans la robustesse, pas de cache
    return { failed: String((e && e.message) || e), latencyMs: Date.now() - t0 };
  }
}

// --- Execution ---
const results = [];
for (const c of selected) {
  process.stdout.write(`${c.id} (${c.kind}) ... `);
  const g = await generate(c);
  if (g.skipped) { console.log(`ignore (${g.skipped})`); results.push({ id: c.id, kind: c.kind, baseId: c.baseId, skipped: g.skipped }); continue; }
  if (g.failed) { console.log(`ECHEC: ${g.failed}`); results.push({ id: c.id, kind: c.kind, baseId: c.baseId, failed: g.failed, latencyMs: g.latencyMs }); continue; }
  const scores = scoreModel(g.generated, c.expected, { threshold: THRESHOLD });
  results.push({
    id: c.id, kind: c.kind, baseId: c.baseId,
    fromCache: g.fromCache, latencyMs: g.latencyMs,
    robustness: { firstTryValid: g.valid && !g.repaired, repaired: !!g.repaired },
    scores,
    generated: SWEEP ? g.generated : undefined
  });
  console.log(`ok (${g.fromCache ? "cache" : Math.round(g.latencyMs / 1000) + " s"})`);
}

// --- Rapport ---
// ordre de restitution : cas d'evaluation (02-06), puis cas de
// developpement (01), puis cas 07
const rank = (r) => DEV_CASES.some((p) => r.id.startsWith(p)) ? 1
  : EXCLUDED_FROM_AVERAGE.some((p) => r.id.startsWith(p)) ? 2 : 0;
results.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
const label = (r) => r.id + (rank(r) === 1 ? " (dev)" : rank(r) === 2 ? " (hors moyenne)" : "");

const scored = results.filter((r) => r.scores);
const averaged = scored.filter((r) => r.kind === "corpus" && rank(r) === 0);
const pct = (x) => (x == null ? "—" : Math.round(x * 100) + " %");
const f2 = (x) => (x == null ? "—" : x.toFixed(2));
const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");

// --- Analyse de sensibilite au seuil d'appariement ---
if (SWEEP) {
  const caseById = new Map(selected.map((c) => [c.id, c]));
  const sweepRows = scored.map((r) => ({
    label: label(r), rk: rank(r),
    byThreshold: SWEEP_THRESHOLDS.map((t) => {
      const s = scoreModel(r.generated, caseById.get(r.id).expected, { threshold: t });
      return { threshold: t, actorsF1: s.coverage.actors.f1, tasksF1: s.coverage.tasks.f1 };
    })
  }));
  const md2 = [];
  md2.push(`# Sensibilite au seuil d'appariement — ${now.toISOString()}`);
  md2.push("");
  md2.push(`Fournisseur : **${PROVIDER}** · modele : **${MODEL}** · prompt : **v${PROMPT_VERSION}** · seuils : ${SWEEP_THRESHOLDS.join(" / ")}`);
  md2.push("Scores rejoues depuis le cache, sans appel LLM. Objectif : montrer que les conclusions ne dependent pas du reglage du seuil (annexe methodologique du chapitre 7).");
  for (const [metric, title] of [["actorsF1", "F1 des acteurs"], ["tasksF1", "F1 des taches"]]) {
    md2.push(`\n## ${title}\n`);
    md2.push(`| Cas | ${SWEEP_THRESHOLDS.map((t) => t.toFixed(1)).join(" | ")} |`);
    md2.push(`|-----|${SWEEP_THRESHOLDS.map(() => "------").join("|")}|`);
    for (const row of sweepRows) {
      md2.push(`| ${row.label} | ${row.byThreshold.map((x) => f2(x[metric])).join(" | ")} |`);
    }
    const evalRows = sweepRows.filter((r) => r.rk === 0);
    if (evalRows.length) {
      md2.push(`| **moyenne (02-06)** | ${SWEEP_THRESHOLDS.map((_, i) => f2(mean(evalRows.map((r) => r.byThreshold[i][metric])))).join(" | ")} |`);
    }
  }
  writeFileSync(new URL(`${stamp}_${PROVIDER}_sweep.json`, RESULTS),
    JSON.stringify({ generatedAt: now.toISOString(), provider: PROVIDER, model: MODEL, promptVersion: PROMPT_VERSION, thresholds: SWEEP_THRESHOLDS, rows: sweepRows }, null, 2));
  writeFileSync(new URL(`${stamp}_${PROVIDER}_sweep.md`, RESULTS), md2.join("\n") + "\n");
  console.log(`\nAnalyse de sensibilite : eval/results/${stamp}_${PROVIDER}_sweep.md (et .json)`);
  process.exit(0);
}

const md = [];
md.push(`# Rapport d'evaluation — ${now.toISOString()}`);
md.push("");
md.push(`Fournisseur : **${PROVIDER}** · modele : **${MODEL}** · prompt : **v${PROMPT_VERSION}** · seuil d'appariement : ${THRESHOLD}`);
md.push(`Cas traites : ${scored.length}/${selected.length}` + (FROM_CACHE ? " (rejeu depuis le cache, aucun appel LLM)" : ""));
md.push("");
md.push(`**Moyenne principale calculee sur les cas ${averaged.map((r) => r.id).join(", ") || "(aucun)"}.** Le cas 01, utilise pour la mise au point du prompt sur trois sessions, est un cas de developpement : il est rapporte a part car le prompt a ete ajuste en l'observant, ce qui rendrait sa performance non representative. Le cas 07, reel et bruite, est egalement rapporte a part (voir corpus/README.md).`);

md.push("\n## 1. Rappel des metadonnees par categorie\n");
md.push("| Cas | Documents | Outils | Temps | Frictions |");
md.push("|-----|-----------|--------|-------|-----------|");
for (const r of scored) {
  const m = r.scores.metadata;
  const cell = (c) => (c.expected ? `${c.recalled}/${c.expected} (${pct(c.recall)})` : "—");
  md.push(`| ${label(r)} | ${cell(m.documents)} | ${cell(m.outils)} | ${cell(m.temps)} | ${cell(m.frictions)} |`);
}
md.push(`| **moyenne (02-06)** | ${pct(mean(averaged.map((r) => r.scores.metadata.documents.recall)))} | ${pct(mean(averaged.map((r) => r.scores.metadata.outils.recall)))} | ${pct(mean(averaged.map((r) => r.scores.metadata.temps.recall)))} | ${pct(mean(averaged.map((r) => r.scores.metadata.frictions.recall)))} |`);

// propositions deduites (prompt v3) : hors rappel et hors effort, a
// verifier par le metier ; denombrement par categorie
if (scored.some((r) => r.scores.inferred)) {
  md.push("\n### Propositions deduites (marquees, hors score, a verifier)\n");
  md.push("| Cas | Documents | Donnees | Outils | Temps | Frictions | Procedure | Opportunites | Total |");
  md.push("|-----|-----------|---------|--------|-------|-----------|-----------|--------------|-------|");
  for (const r of scored) {
    const i = r.scores.inferred || {};
    md.push(`| ${label(r)} | ${i.documents || 0} | ${i.donnees || 0} | ${i.outils || 0} | ${i.temps || 0} | ${i.frictions || 0} | ${i.procedure || 0} | ${i.opportunites || 0} | **${i.total || 0}** |`);
  }
}

md.push("\n## 2. Effort d'edition estime\n");
md.push("| Cas | Ajouts | Suppressions | Renommages | Reattributions | Total |");
md.push("|-----|--------|--------------|------------|----------------|-------|");
for (const r of scored) {
  const e = r.scores.editEffort;
  const add = e.actors.added + e.tasks.added + e.metadata.added;
  const rem = e.actors.removed + e.tasks.removed + e.metadata.removed;
  const ren = e.actors.renamed + e.tasks.renamed + e.metadata.renamed;
  md.push(`| ${label(r)} | ${add} | ${rem} | ${ren} | ${e.tasks.reassigned} | **${e.total}** |`);
}
md.push(`| **moyenne (02-06)** |  |  |  |  | ${f2(mean(averaged.map((r) => r.scores.editEffort.total)))} |`);

md.push("\n## 3. Couverture des acteurs et des taches\n");
md.push("| Cas | Acteurs P | Acteurs R | Acteurs F1 | Taches P | Taches R | Taches F1 |");
md.push("|-----|-----------|-----------|------------|----------|----------|-----------|");
for (const r of scored) {
  const a = r.scores.coverage.actors, t = r.scores.coverage.tasks;
  md.push(`| ${label(r)} | ${f2(a.precision)} | ${f2(a.recall)} | ${f2(a.f1)} | ${f2(t.precision)} | ${f2(t.recall)} | ${f2(t.f1)} |`);
}
md.push(`| **moyenne (02-06)** |  |  | ${f2(mean(averaged.map((r) => r.scores.coverage.actors.f1)))} |  |  | ${f2(mean(averaged.map((r) => r.scores.coverage.tasks.f1)))} |`);

md.push("\n## 4. Exactitude du rattachement tache -> acteur\n");
md.push("| Cas | Rattachement correct |");
md.push("|-----|----------------------|");
for (const r of scored) {
  const at = r.scores.attachment;
  md.push(`| ${label(r)} | ${at.correct}/${at.pairs} (${pct(at.accuracy)}) |`);
}
md.push(`| **moyenne (02-06)** | ${pct(mean(averaged.map((r) => r.scores.attachment.accuracy)))} |`);

md.push("\n## 5. Ratio de granularite (statistique descriptive)\n");
md.push("| Cas | Etapes generees | Etapes de reference | Ratio |");
md.push("|-----|-----------------|---------------------|-------|");
for (const r of scored) {
  const gr = r.scores.granularity;
  md.push(`| ${label(r)} | ${gr.generatedSteps} | ${gr.expectedSteps} | ${f2(gr.ratio)} |`);
}
md.push(`| **moyenne (02-06)** |  |  | ${f2(mean(averaged.map((r) => r.scores.granularity.ratio)))} |`);
md.push("\nLe ratio decrit le grain relatif, il n'est pas une penalite (decision 2 de la revision).");

md.push("\n## 6. Robustesse\n");
md.push("| Cas | JSON valide au premier essai | Reparation declenchee |");
md.push("|-----|------------------------------|-----------------------|");
for (const r of results) {
  if (r.skipped) { md.push(`| ${label(r)} | non genere (${r.skipped}) | — |`); continue; }
  if (r.failed) { md.push(`| ${label(r)} | **echec de generation** | oui, sans succes |`); continue; }
  md.push(`| ${label(r)} | ${r.robustness.firstTryValid ? "oui" : "non"} | ${r.robustness.repaired ? "oui" : "non"} |`);
}

md.push("\n## 7. Latence\n");
md.push("| Cas | Latence | Source |");
md.push("|-----|---------|--------|");
for (const r of results) {
  if (r.skipped) { md.push(`| ${label(r)} | — | non genere |`); continue; }
  md.push(`| ${label(r)} | ${r.latencyMs != null ? Math.round(r.latencyMs / 1000) + " s" : "—"} | ${r.fromCache ? "cache (latence d'origine)" : "generation"} |`);
}
const lat = results.filter((r) => r.latencyMs != null).map((r) => r.latencyMs).sort((a, b) => a - b);
if (lat.length) md.push(`\nMediane : ${Math.round(lat[Math.floor(lat.length / 2)] / 1000)} s.`);

// stabilite par paraphrase (methode de Klievtsova et al. 2023)
const bases = [...new Set(scored.filter((r) => r.kind === "paraphrase").map((r) => r.baseId))];
if (bases.length) {
  md.push("\n## 8. Stabilite par paraphrase\n");
  md.push("Variantes reformulees d'une meme transcription, evaluees contre la meme reference.\n");
  md.push("| Variante | F1 taches | Rattachement | Rappel documents | Rappel outils |");
  md.push("|----------|-----------|--------------|------------------|---------------|");
  for (const b of bases) {
    for (const r of scored.filter((x) => x.baseId === b)) {
      const s = r.scores;
      md.push(`| ${label(r)}${r.kind === "corpus" ? " (originale)" : ""} | ${f2(s.coverage.tasks.f1)} | ${pct(s.attachment.accuracy)} | ${pct(s.metadata.documents.recall)} | ${pct(s.metadata.outils.recall)} |`);
    }
    const group = scored.filter((x) => x.baseId === b).map((x) => x.scores.coverage.tasks.f1);
    md.push(`| _ecart max F1 (${b})_ | ${f2(Math.max(...group) - Math.min(...group))} |  |  |  |`);
  }
}

const jsonOut = { generatedAt: now.toISOString(), provider: PROVIDER, model: MODEL, promptVersion: PROMPT_VERSION, threshold: THRESHOLD, results };
writeFileSync(new URL(`${stamp}_${PROVIDER}.json`, RESULTS), JSON.stringify(jsonOut, null, 2));
writeFileSync(new URL(`${stamp}_${PROVIDER}.md`, RESULTS), md.join("\n") + "\n");
console.log(`\nRapport : eval/results/${stamp}_${PROVIDER}.md (et .json)`);
