// Test hors ligne de la fusion multi-entretiens (src/merge.js).
// Usage : node test/merge.mjs

import { mergeModels } from "../src/merge.js";
import { normalizeModel } from "../src/schema.js";
import { renderDrawioXml } from "../src/drawio.js";
import { toMarkdown } from "../src/export.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
};

const A = normalizeModel({
  process: "Traitement des demandes",
  trigger: "Reception d'une demande",
  actors: ["Service clientele", "Direction"],
  steps: [
    { actors: ["Service clientele"], stage: 1, label: "Recevoir la demande",
      tools: ["CRM"], duration: "10 min" },
    { actors: ["Direction"], stage: 2, label: "Valider le dossier" }
  ]
});
const B = normalizeModel({
  process: "Traitement des demandes",
  actors: ["Service clientele", "Archives"],
  steps: [
    { actors: ["Service clientele"], stage: 1, label: "Recevoir la demande",
      tools: ["GED"], duration: "un quart d'heure" },
    { actors: ["Archives"], stage: 2, label: "Archiver le dossier" }
  ]
});

console.log("\n[1] Appariement et union des metadonnees");
const merged = mergeModels([A, B], ["entretien 1", "entretien 2"]);
{
  ok(merged.steps.length === 3, `3 etapes apres fusion (recu: ${merged.steps.length})`);
  const s1 = merged.steps.find((s) => s.label === "Recevoir la demande");
  ok(s1.tools.includes("CRM") && s1.tools.includes("GED"), "union des outils des deux sources");
  ok(s1.sources.length === 2, "l'etape appariee trace ses deux sources");
  ok(merged.actors.includes("Archives"), "union des acteurs du processus");
  ok(merged.trigger === "Reception d'une demande", "borne conservee quand une seule source la donne");
}

console.log("\n[2] Contradictions signalees, jamais tranchees");
{
  const s1 = merged.steps.find((s) => s.label === "Recevoir la demande");
  ok(merged.conflicts.length === 1, `1 contradiction detectee (recu: ${merged.conflicts.length})`);
  ok(/duration/.test(merged.conflicts[0]) && /10 min/.test(merged.conflicts[0]) && /quart d'heure/.test(merged.conflicts[0]),
    "la contradiction cite les deux durees et leurs sources");
  ok(s1.conflict === true, "l'etape en conflit est marquee");
  ok(s1.duration === "10 min / un quart d'heure", "les deux valeurs sont conservees cote a cote");
}

console.log("\n[3] Durees equivalentes : pas de faux conflit");
{
  const A2 = normalizeModel({ actors: ["X"], steps: [{ actors: ["X"], label: "Traiter", duration: "15 min" }] });
  const B2 = normalizeModel({ actors: ["X"], steps: [{ actors: ["X"], label: "Traiter", duration: "un quart d'heure" }] });
  const m2 = mergeModels([A2, B2]);
  ok(m2.conflicts.length === 0, "15 min et un quart d'heure reconnues equivalentes");
}

console.log("\n[4] Rendu et fiche : contradictions visibles");
{
  const x = renderDrawioXml(merged);
  ok(x.includes("⚠ Recevoir la demande"), "marqueur de contradiction sur la carte");
  ok(x.includes("Contradictions : 1"), "contradiction comptee dans la synthese");
  ok(x.includes("contradiction entre les sources"), "entree de legende presente");
  const md = toMarkdown(merged);
  ok(md.includes("Contradictions entre sources"), "section contradictions dans la fiche");
}

console.log(`\n${failures === 0 ? "TOUS LES TESTS PASSENT" : failures + " TEST(S) EN ECHEC"}\n`);
process.exit(failures === 0 ? 0 : 1);
