// Validation de la chaine complete avec un vrai LLM (etape 1 des briefs).
// Execute N fois le pipeline sur examples/transcript_raccordement.txt via
// /api/generate, verifie la conformite au schema et la bonne formation du
// XML, puis compare chaque modele genere au modele de reference.
// Usage : node scripts/check-llm.mjs [runs] [provider]
//   ex. : node scripts/check-llm.mjs 3 ollama

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { validateModel } from "../src/schema.js";
import { postJson } from "../src/httpjson.js";
import { compareModels } from "../src/editdistance.js";

const RUNS = Number(process.argv[2] || 3);
const PROVIDER = process.argv[3] || "ollama";
const BASE = process.env.BASE_URL || "http://localhost:3000";

// Reference canonique, annotee selon eval/REGLES_ANNOTATION_CORPUS.md.
const REFERENCE = JSON.parse(
  readFileSync(new URL("../eval/corpus/01_raccordement.expected.json", import.meta.url), "utf8")
);

// Comparaison par unites de contenu (compareModels) : la comparaison
// positionnelle produisait de faux ecarts des que le grain differait.
function compareToReference(model) {
  const e = compareModels(model, REFERENCE);
  const gaps = [];
  const push = (n, msg) => { if (n) gaps.push(`${n} ${msg}`); };
  push(e.actors.added, "acteur(s) manquant(s) dans la generation");
  push(e.actors.removed, "acteur(s) hallucine(s)");
  push(e.actors.renamed, "acteur(s) renomme(s)");
  push(e.tasks.added, "tache(s) de reference non captee(s)");
  push(e.tasks.removed, "tache(s) en trop ou grain plus fin");
  push(e.tasks.renamed, "tache(s) au libelle eloigne");
  push(e.tasks.reassigned, "tache(s) mal attribuee(s)");
  push(e.metadata.added, "metadonnee(s) manquante(s)");
  push(e.metadata.removed, "metadonnee(s) hallucinee(s)");
  push(e.metadata.renamed, "metadonnee(s) reformulee(s)");
  return gaps;
}

const text = readFileSync(new URL("../examples/transcript_raccordement.txt", import.meta.url), "utf8");
mkdirSync(new URL("../examples/generated/", import.meta.url), { recursive: true });

let stableRuns = 0;
for (let run = 1; run <= RUNS; run++) {
  console.log(`\n=== Execution ${run}/${RUNS} (fournisseur: ${PROVIDER}) ===`);
  const t0 = Date.now();
  const res = await postJson(`${BASE}/api/generate`, { text, provider: PROVIDER });
  const body = JSON.parse(res.body);
  if (res.status !== 200) {
    console.log(`  ECHEC HTTP ${res.status}: ${body.error}`);
    continue;
  }
  const { model, xml, warnings, repaired } = body;
  const v = validateModel(model);
  const wellFormed = xml && xml.includes("<mxGraphModel") && xml.includes("</mxGraphModel>");
  console.log(`  latence: ${Date.now() - t0} ms | reparation: ${repaired ? "oui" : "non"} | avertissements: ${warnings.length}`);
  console.log(`  schema valide: ${v.ok ? "oui" : "NON -> " + v.errors.join(" | ")}`);
  console.log(`  XML bien forme: ${wellFormed ? "oui" : "NON"}`);
  console.log(`  acteurs (${model.actors.length}): ${model.actors.join(" | ")}`);
  model.steps.forEach((s, i) => console.log(`    s${i + 1} [${s.actor}] ${s.label}`));
  const gaps = compareToReference(model);
  console.log(`  ecarts avec la reference (${gaps.length}):`);
  gaps.forEach((g) => console.log(`    - ${g}`));
  if (v.ok && wellFormed) stableRuns++;
  writeFileSync(new URL(`../examples/generated/run${run}_${PROVIDER}.json`, import.meta.url), JSON.stringify(model, null, 2));
  writeFileSync(new URL(`../examples/generated/run${run}_${PROVIDER}.drawio`, import.meta.url), xml);
}

console.log(`\n${stableRuns}/${RUNS} executions valides (schema + XML).`);
process.exit(stableRuns === RUNS ? 0 : 1);
