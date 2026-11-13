// Test hors ligne des exports (src/export.js) : CSV tableur et fiche
// processus Markdown. Usage : node test/export.mjs

import { toCsv, toMarkdown } from "../src/export.js";
import { normalizeModel } from "../src/schema.js";
import { markUngrounded } from "../src/grounding.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
};

const SRC = "Intro.\nLe service clientele verifie le dossier dans le CRM ; cela prend 10 min.\nFin.";
const model = normalizeModel({
  process: "Traitement du dossier",
  trigger: "Reception du dossier",
  outcome: "Dossier valide",
  actors: ["Service clientele", "Direction"],
  steps: [
    { actors: ["Service clientele", "Direction"], stage: 1, label: "Verifier le dossier",
      tools: ["CRM", "Salesforce"], duration: "10 min", friction: "Pieces manquantes ; souvent" }
  ]
});
markUngrounded(model, SRC, { threshold: 0.7 });

console.log("\n[1] Export CSV");
{
  const csv = toCsv(model);
  ok(csv.charCodeAt(0) === 0xFEFF, "BOM UTF-8 en tete de fichier");
  const lines = csv.slice(1).split("\r\n");
  ok(lines[0].startsWith("id;stage;etape;responsable;participants"), "en-tete avec separateur point-virgule");
  ok(lines[0].split(";").length === 22, `22 colonnes (recu: ${lines[0].split(";").length})`);
  ok(lines[1].includes('"Pieces manquantes ; souvent"'), "valeur contenant un point-virgule protegee par guillemets");
  ok(lines[1].includes("Direction"), "participants exportes");
  ok(lines[1].includes("outils : Salesforce"), "colonne des valeurs deduites renseignee");
  ok(/l\.2/.test(lines[1]), "colonne des lignes sources renseignee");
}

console.log("\n[2] Export fiche processus Markdown");
{
  const md = toMarkdown(model);
  ok(md.startsWith("# Fiche processus : Traitement du dossier"), "titre de la fiche");
  ok(md.includes("**Déclencheur** : Reception du dossier") && md.includes("**Résultat attendu** : Dossier valide"), "bornes presentes");
  ok(md.includes("## Synthèse"), "synthese presente");
  ok(md.includes("## Étape 1 — Verifier le dossier"), "une section par etape");
  ok(md.includes("**Participants** : Direction"), "participants dans la fiche");
  ok(md.includes("≈ Salesforce *(a verifier)*"), "valeur deduite signalee comme dans le diagramme");
  ok(/CRM \(l\.2\)/.test(md), "valeur attestee tracee vers sa ligne source");
}

console.log(`\n${failures === 0 ? "TOUS LES TESTS PASSENT" : failures + " TEST(S) EN ECHEC"}\n`);
process.exit(failures === 0 ? 0 : 1);
