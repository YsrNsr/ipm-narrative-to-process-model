// Schema v6 : regles, exceptions, incertitudes au niveau processus.
// Traverse normalisation, ancrage, rendu, exports et fusion sur des
// modeles factices, sans aucun appel LLM.
// Usage : node test/v6-fields.mjs

import { normalizeModel, validateModel } from "../src/schema.js";
import { markUngrounded } from "../src/grounding.js";
import { renderDrawioXml } from "../src/drawio.js";
import { toCsv, toMarkdown } from "../src/export.js";
import { mergeModels } from "../src/merge.js";
import { PROMPT_VERSION } from "../src/prompts.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

console.log("\n[1] Version du prompt");
ok(PROMPT_VERSION === "7", `PROMPT_VERSION vaut "7" (recu: "${PROMPT_VERSION}")`);

console.log("\n[2] Normalisation des trois listes polymorphes");
const raw = {
  actors: ["Guichetier", "Controleur"],
  steps: [
    { id: "s1", actors: ["Guichetier"], stage: 1, label: "Recevoir la demande" },
    { id: "s2", actors: ["Controleur"], stage: 2, label: "Controler le dossier" }
  ],
  rules: ["Au-dela de 500 francs, validation du chef", { value: "Toujours deux signatures", inferred: true }],
  exceptions: [
    { value: "Cas urgent : depot direct au guichet", step_id: "s1" },
    { value: "Derogation estivale", step_id: "s99" },
    "Variante papier pour les anciens dossiers"
  ],
  uncertainties: ["En general la reponse part le lendemain, ca depend du volume"]
};
const m = normalizeModel(raw);
ok(m.rules.length === 2 && m.rules[0].includes("500 francs"), "regles aplaties en chaines");
ok(m.inferredProcess.rules[0] === false && m.inferredProcess.rules[1] === true,
  "drapeaux d'inference conserves par regle");
ok(m.exceptions.length === 3, `3 exceptions (recu: ${m.exceptions.length})`);
ok(m.exceptions[0].step_id === "s1", "rattachement a une etape conserve");
ok(m.exceptions[1].step_id === null, "step_id inconnu replie sur null");
ok(m.exceptions[2].step_id === null && m.exceptions[2].text.includes("Variante papier"),
  "exception en chaine simple acceptee");
ok(m.uncertainties.length === 1 && m.uncertainties[0].includes("ca depend"),
  "incertitude conservee telle quelle");
ok(validateModel(m).ok, "le modele v6 reste valide");

console.log("\n[3] Ancrage applique aux champs du niveau processus");
const src = [
  "Le guichetier recoit la demande au guichet.",
  "Au-dela de 500 francs, la validation du chef est obligatoire.",
  "En general la reponse part le lendemain, ca depend du volume.",
  "Le controleur controle le dossier."
].join("\n");
const marked = markUngrounded(m, src, { threshold: 0.7 });
ok(m.inferredProcess.rules[0] === false, "regle ancree non marquee");
ok(m.provenanceProcess.rules[0] && m.provenanceProcess.rules[0].line === 2,
  "provenance de la regle ancree (ligne 2)");
ok(m.inferredProcess.exceptions[1] === true, "exception non ancree marquee deduite");
ok(m.inferredProcess.rules[1] === true, "marquage auto-declare conserve (union)");
ok(m.inferredProcess.uncertainties[0] === false && m.provenanceProcess.uncertainties[0],
  "incertitude ancree avec provenance");
ok(marked >= 2, `au moins 2 valeurs marquees par la verification (recu: ${marked})`);

console.log("\n[4] Rendu : encart sous les bandes");
const xml = renderDrawioXml(m);
const page = xml.split('<diagram id="raci"')[0];
ok(page.includes("RÈGLES, EXCEPTIONS ET INCERTITUDES"), "encart present");
ok(/Règle métier/.test(page) && /Exception/.test(page) && /Incertitude/.test(page),
  "les trois familles etiquetees");
ok(/≈ Toujours deux signatures/.test(page), "valeur deduite marquee ≈ dans l'encart");
ok(/label="≈ Toujours deux signatures"[^>]*><mxCell[^>]*fontStyle=2/.test(page),
  "valeur deduite presente en cellule attenuee (italique) avec avertissement");
ok(page.includes("[étape 1]"), "exception rattachee a son etape par numero");
ok(page.includes("Au-dela de 500 francs, la validation du chef est obligatoire") ||
  /tooltip="[^"]*l\.2/.test(page), "provenance en infobulle dans l'encart");
const mVide = normalizeModel({ actors: ["A"], steps: [{ actors: ["A"], label: "Unique" }, { actors: ["A"], stage: 2, label: "Suite" }] });
ok(!renderDrawioXml(mVide).includes("RÈGLES, EXCEPTIONS"), "encart absent quand rien n'est extrait");

console.log("\n[5] Exports CSV et fiche");
const csv = toCsv(m);
const lines = csv.trim().split("\r\n");
ok(lines[0].split(";").length === 22, "l'en-tete garde ses 22 colonnes");
ok(lines.some((l) => l.startsWith("regle;")), "ligne regle en fin de tableau");
ok(lines.some((l) => l.startsWith("exception;") && l.includes("(s1)")), "exception avec rattachement");
ok(lines.some((l) => l.startsWith("incertitude;")), "ligne incertitude");
ok(lines.every((l) => l.split(";").length >= 22 || !l.includes(";")), "colonnes homogenes");
const md = toMarkdown(m);
ok(md.includes("## Règles, exceptions et incertitudes"), "section fiche presente");
ok(md.includes("### Incertitudes exprimées (à conserver telles quelles)"),
  "les incertitudes annoncees comme a conserver");
ok(md.includes("≈ Toujours deux signatures"), "valeur deduite signalee dans la fiche");
ok(md.includes("*(étape s1)*"), "rattachement d'exception dans la fiche");

console.log("\n[6] Fusion : union avec source, enonces proches signales");
const mA = normalizeModel({
  actors: ["A"],
  steps: [{ id: "s1", actors: ["A"], stage: 1, label: "Traiter la demande" }],
  rules: ["Au-dela de 500 francs, validation du chef"],
  uncertainties: ["En general sous un jour"]
});
const mB = normalizeModel({
  actors: ["A"],
  steps: [{ id: "s1", actors: ["A"], stage: 1, label: "Traiter la demande" }],
  rules: ["Au-dela de 800 francs, validation du chef", "Toujours archiver la piece"],
  exceptions: [{ value: "Cas urgent : depot direct", step_id: "s1" }],
  uncertainties: ["En general sous un jour"]
});
const fused = mergeModels([mA, mB], ["entretien 1", "entretien 2"]);
ok(fused.rules.length === 3, `union des regles sans doublon exact (recu: ${fused.rules.length})`);
ok(fused.uncertainties.length === 1, "incertitude identique dedupliquee");
ok(fused.exceptions.length === 1 && fused.exceptions[0].step_id === "s1",
  "exception de la seconde source reprise avec son rattachement");
ok(fused.conflicts.some((c) => c.includes("regle") && c.includes("500") && c.includes("800")),
  "enonces proches mais differents signales comme contradiction potentielle");
ok(fused.rules.includes("Au-dela de 500 francs, validation du chef") &&
  fused.rules.includes("Au-dela de 800 francs, validation du chef"),
  "les deux enonces conserves cote a cote, jamais tranches");

console.log("\n[7] Fusion : ids d'etapes uniques entre sources, references remappees");
{
  const mC = normalizeModel({
    actors: ["A"],
    steps: [
      { id: "s1", actors: ["A"], stage: 1, label: "Recevoir la piece" },
      { id: "s2", actors: ["A"], stage: 2, label: "Controler la piece",
        decision: { question: "Conforme ?", on_no: { label: "Retour", return_to: "s1" } } }
    ]
  });
  const mD = normalizeModel({
    actors: ["B"],
    steps: [
      { id: "s1", actors: ["B"], stage: 1, label: "Expedier le colis" },
      { id: "s2", actors: ["B"], stage: 2, label: "Facturer le client",
        decision: { question: "Paye ?", on_no: { label: "Relancer", return_to: "s1" } } }
    ],
    exceptions: [{ value: "Envoi express le vendredi", step_id: "s1" }]
  });
  const f2 = mergeModels([mC, mD], ["entretien 1", "entretien 2"]);
  const ids = f2.steps.map((s) => s.id);
  ok(new Set(ids).size === ids.length, `aucun id duplique apres fusion (recu: ${ids.join(",")})`);
  const exp = f2.steps.find((s) => s.label === "Expedier le colis");
  const fac = f2.steps.find((s) => s.label === "Facturer le client");
  ok(fac.decision.on_no.return_to === exp.id, "retour de decision de la seconde source remappe");
  ok(f2.exceptions[0].step_id === exp.id, "exception rattachee de la seconde source remappee");
  ok(f2.steps.find((s) => s.label === "Controler la piece").decision.on_no.return_to === "s1",
    "les references de la base restent intactes");
}

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
