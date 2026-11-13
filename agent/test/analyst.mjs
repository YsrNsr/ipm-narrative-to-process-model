// Fonctions d'analyste (chantier 6) : questions d'entretien derivees
// mecaniquement et synthese enrichie. Hors ligne, aucun appel LLM.
// Usage : node test/analyst.mjs

import { normalizeModel } from "../src/schema.js";
import { buildQuestions, toQuestionsMarkdown } from "../src/questions.js";
import { renderDrawioXml } from "../src/drawio.js";
import { toMarkdown } from "../src/export.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

const model = normalizeModel({
  process: "Traitement des demandes",
  actors: ["Guichetier", "Controleur", "Archiviste"],
  uncertainties: ["En general ca part le lendemain"],
  steps: [
    { id: "s1", actors: ["Guichetier"], stage: 1, label: "Recevoir la demande",
      tools: [{ value: "GED", inferred: true }], duration: "10 min" },
    { id: "s2", actors: ["Controleur"], stage: 2, label: "Controler le dossier",
      duration: "45 min", friction: "Pieces souvent manquantes",
      decision: { question: "Dossier complet ?", on_no: { label: "Non", return_to: "s1" } } },
    { id: "s3", actors: ["Archiviste"], stage: 3, label: "Archiver le dossier" }
  ]
});

console.log("\n[1] Questions d'entretien de suivi (6a)");
const qs = buildQuestions(model);
ok(qs.some((q) => q.text.startsWith("Confirmez-vous que « GED »")),
  "valeur deduite -> question de confirmation");
ok(qs.some((q) => q.text === "Pouvez-vous préciser dans quels cas « En general ca part le lendemain » ?"),
  "incertitude -> question de precision");
ok(qs.some((q) => q.text.includes("Que se passe-t-il si la réponse à « Dossier complet ? » est non")),
  "decision a issue vague -> que se passe-t-il si");
ok(qs.some((q) => q.text === "Combien de temps prend « Archiver le dossier » ?"),
  "duree absente -> combien de temps");
ok(!qs.some((q) => q.text.includes("Combien de temps prend « Recevoir la demande »")),
  "pas de question de duree quand la duree existe");
ok(qs.some((q) => q.text.includes("Pieces souvent manquantes") && q.text.includes("quelle fréquence")),
  "friction -> frequence et parade");
const md = toQuestionsMarkdown(model);
ok(md.startsWith("# Questions pour l'entretien de suivi"), "export Markdown des questions");
ok((md.match(/- \[ \] /g) || []).length === qs.length, "une case par question");

console.log("\n[2] Synthese enrichie de la grille (6b)");
const xml = renderDrawioXml(model);
ok(/Étape dominante : Controler le dossier \(82 % du temps\)/.test(xml),
  "etape dominante avec sa part du total (45/55 = 82 %)");
ok(/Transfert le plus sollicité : /.test(xml), "couple d'acteurs le plus sollicite affiche");
ok(/Frictions : 1/.test(xml), "compte des frictions conserve");

console.log("\n[3] Lecture d'analyste dans la fiche");
const fiche = toMarkdown(model);
ok(fiche.includes("## Lecture d'analyste"), "section presente");
ok(/Étape dominante en temps.*Controler le dossier.*82 %/.test(fiche), "dominante et part");
ok(/Transferts entre acteurs.*2 sur 2/.test(fiche), "transferts comptes");
ok(/couple le plus sollicité/.test(fiche), "couple le plus sollicite");
ok(/Frictions.*1.*Pieces souvent manquantes.*Controler le dossier/.test(fiche),
  "liste des frictions avec leur etape");
ok(/Étapes automatisées.*0\/3/.test(fiche), "part d'etapes automatisees");
const sans = normalizeModel({ actors: ["A"], steps: [
  { actors: ["A"], stage: 1, label: "Faire" }, { actors: ["A"], stage: 2, label: "Suite" }] });
ok(toMarkdown(sans).includes("indéterminée (durées non chiffrées)"),
  "dominante indeterminee sans duree");

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
