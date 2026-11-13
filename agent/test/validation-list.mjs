// Liste de validation : les six familles sur un modele factice, et
// l'export imprimable. Hors ligne, aucun appel LLM.
// Usage : node test/validation-list.mjs

import { normalizeModel } from "../src/schema.js";
import { markUngrounded } from "../src/grounding.js";
import { mergeModels } from "../src/merge.js";
import { buildValidationList, toValidationMarkdown } from "../src/validation-list.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

// modele factice couvrant les six familles :
// - une valeur deduite (outil absent du recit)
// - une incertitude conservee
// - une regle metier
// - une decision avec cas negatif
// - une contradiction de fusion (via mergeModels)
// - deux manques : aucune duree chiffree, acteur sans metadonnees
const base = {
  actors: ["Guichetier", "Archiviste"],
  steps: [
    { id: "s1", actors: ["Guichetier"], stage: 1, label: "Recevoir la demande",
      tools: [{ value: "GED", inferred: true }],
      decision: { question: "Dossier complet ?", on_no: { label: "Reclamer les pieces", return_to: "fin" } } },
    { id: "s2", actors: ["Archiviste"], stage: 2, label: "Archiver le dossier" }
  ],
  rules: ["Toute demande est enregistree le jour meme"],
  uncertainties: ["En general ca part le lendemain"]
};
const src = [
  "Le guichetier recoit la demande au guichet et verifie que le dossier est complet.",
  "Toute demande est enregistree le jour meme.",
  "En general ca part le lendemain.",
  "L'archiviste archive le dossier."
].join("\n");

const mA = normalizeModel(JSON.parse(JSON.stringify(base)));
markUngrounded(mA, src, { threshold: 0.7 });
const mB = normalizeModel({
  actors: ["Guichetier", "Archiviste"],
  steps: [
    { id: "s1", actors: ["Guichetier"], stage: 1, label: "Recevoir la demande", duration: "10 min" },
    { id: "s2", actors: ["Archiviste"], stage: 2, label: "Archiver le dossier" }
  ]
});
mB.steps[0].duration = "20 min"; // contradiction de duree avec... rien : mA n'a pas de duree
// pour obtenir une vraie contradiction, mA recoit une duree differente
mA.steps[0].duration = "10 min";
const fused = mergeModels([mA, mB], ["entretien 1", "entretien 2"]);
// la fusion a resolu 10 vs 20 min ? non : valeurs differentes -> conflit
ok((fused.conflicts || []).length >= 1, `fusion : au moins une contradiction (recu: ${(fused.conflicts || []).length})`);

console.log("\n[1] Les six familles sur le modele fusionne");
const items = buildValidationList(fused);
const fams = new Set(items.map((i) => i.family));
ok(fams.has("Valeurs déduites à confirmer"), "famille des valeurs deduites");
ok(fams.has("Incertitudes conservées"), "famille des incertitudes");
ok(fams.has("Règles métier extraites"), "famille des regles");
ok(fams.has("Décisions et leur cas négatif"), "famille des decisions");
ok(fams.has("Contradictions entre sources"), "famille des contradictions");
ok(fams.has("Manques évidents"), "famille des manques");
ok(fams.size === 6, `exactement six familles (recu: ${fams.size})`);

console.log("\n[2] Contenu des points");
const by = (f) => items.filter((i) => i.family === f);
const inf = by("Valeurs déduites à confirmer");
ok(inf.some((i) => i.text.includes("GED") && /Étape 1/.test(i.meta)),
  "valeur deduite avec etape et champ");
ok(inf.some((i) => /récit l\.\d+/.test(i.meta)),
  "ligne source du recit presente quand elle existe");
ok(by("Incertitudes conservées")[0].text.includes("En general"),
  "incertitude conservee telle quelle");
const dec = by("Décisions et leur cas négatif")[0];
ok(dec.text.includes("Dossier complet ?") && dec.meta.includes("Reclamer les pieces") &&
  dec.meta.includes("fin du processus"), "decision avec devenir de la branche negative");
const gaps = by("Manques évidents");
ok(gaps.some((i) => i.text.includes("Aucune métadonnée") && i.text.includes("Archiviste")),
  "acteur sans metadonnees repere");
ok(items.every((i) => i.id && typeof i.id === "string"), "identifiants stables pour journaliser les cases");

console.log("\n[3] Manque : bande des durees vide");
const mSans = normalizeModel({
  actors: ["A"],
  steps: [{ actors: ["A"], stage: 1, label: "Faire" }, { actors: ["A"], stage: 2, label: "Refaire" }]
});
ok(buildValidationList(mSans).some((i) => i.text.includes("Aucune durée chiffrée")),
  "grille sans duree signalee");
ok(!buildValidationList(fused).some((i) => i.text.includes("Aucune durée chiffrée")),
  "pas de faux manque quand une duree existe");

console.log("\n[4] Export imprimable");
const md = toValidationMarkdown(fused);
ok(md.startsWith("# Liste de validation"), "titre de l'export");
ok((md.match(/- \[ \] /g) || []).length === items.length, "une case a cocher par point");
ok(md.includes("## Valeurs déduites à confirmer"), "familles en sections");
ok(/\d+ points? à parcourir/.test(md), "compteur en tete");

console.log("\n[5] Etat des cases dans l'export (trace de la seance)");
{
  const st = { [items[0].id]: true };
  const mdChecked = toValidationMarkdown(fused, { state: st, checkedAt: "2026-08-21T10:00:00Z" });
  ok((mdChecked.match(/- \[x\] /g) || []).length === 1, "la case cochee du panneau ressort [x]");
  ok((mdChecked.match(/- \[ \] /g) || []).length === items.length - 1, "les autres restent [ ]");
  ok(/\*\*Pointage\*\* : 1\/\d+ coché/.test(mdChecked), "compteur de pointage en tete");
  ok(mdChecked.includes("dernier pointage le"), "date du dernier pointage");
  ok(!toValidationMarkdown(fused).includes("**Pointage**"),
    "sans etat : export inchange, aucune ligne de pointage");
}

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
