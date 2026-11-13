// Pages d'analyste SIPOC et Analyse : derivations exactes sur un cas
// construit, exhaustivite et ordre, prefixes, conteneurs natifs.
// Hors ligne, aucun appel LLM.
// Usage : node test/analyst-pages.mjs

import { normalizeModel } from "../src/schema.js";
import { computeSipoc, computeAnalysis } from "../src/drawio-analyst.js";
import { renderDrawioXml } from "../src/drawio.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

// cas construit : le formulaire entre en s1 (entree externe), le
// dossier est produit en s1 et consomme en s2 (interne, ni entree ni
// sortie), l'attestation entre en s3 SANS avoir ete produite avant
// (entree externe tardive), l'avis est produit en s3 et jamais
// consomme (sortie), plus l'issue du processus
const model = normalizeModel({
  process: "Instruction des demandes",
  trigger: "Une demande arrive",
  outcome: "Demande instruite et notifiee",
  actors: ["Guichetier", "Instructeur"],
  rules: ["Enregistrement le jour meme"],
  uncertainties: ["« En general ca part le lendemain »"],
  exceptions: [
    { value: "Cas urgent : depot direct", step_id: "s2" },
    "Derogation estivale"
  ],
  steps: [
    { id: "s1", actors: ["Guichetier"], stage: 1, label: "Recevoir la demande",
      documents_in: ["Formulaire de demande"], data_in: [{ value: "Identite du demandeur", inferred: true }],
      documents_out: ["Dossier de demande"], duration: "10 min",
      friction: "« Les formulaires arrivent incomplets »" },
    { id: "s2", actors: ["Guichetier"], stage: 2, label: "Completer le dossier",
      documents_in: ["Dossier de demande"], duration: "20 min" },
    { id: "s3", actors: ["Instructeur"], stage: 3, label: "Instruire la demande",
      documents_in: ["Attestation externe"], documents_out: ["Avis d'instruction"],
      duration: "2 h", opportunity: "« On pourrait pre-remplir l'avis »" },
    { id: "s4", actors: ["Instructeur"], stage: 4, label: "Notifier la decision" }
  ]
});

console.log("\n[1] Derivations SIPOC exactes");
const sipoc = computeSipoc(model);
const texts = (arr) => arr.map((x) => x.text);
ok(texts(sipoc.inputs).includes("Formulaire de demande"), "entree : document de la premiere etape");
ok(texts(sipoc.inputs).includes("Identite du demandeur"), "entree : donnee de la premiere etape");
ok(texts(sipoc.inputs).includes("Attestation externe"),
  "entree : document entrant plus loin sans avoir ete produit avant");
ok(!texts(sipoc.inputs).includes("Dossier de demande"),
  "un document produit par une etape precedente n'est PAS une entree");
ok(sipoc.inputs.find((x) => x.text === "Identite du demandeur").inferred === true,
  "le marquage ≈ suit la valeur deduite");
ok(texts(sipoc.outputs).includes("Avis d'instruction"), "sortie : produit jamais consomme");
ok(!texts(sipoc.outputs).includes("Dossier de demande"), "un produit consomme ensuite n'est pas une sortie");
ok(texts(sipoc.outputs).includes("Demande instruite et notifiee"), "l'issue figure dans les sorties");
ok(sipoc.process.length === 2, `macro-etapes par acteur consecutif (recu: ${sipoc.process.length})`);
ok(sipoc.process[0].text === "Recevoir la demande ; Completer le dossier" &&
  sipoc.process[1].text === "Instruire la demande ; Notifier la decision",
  "libelles repris dans les regroupements");
ok(sipoc.suppliers.length === 0 && sipoc.clients.length === 0,
  "fournisseurs et clients vides quand le texte ne les nomme pas (jamais d'invention)");

console.log("\n[2] Regroupement borne a sept macro-etapes");
const beaucoup = normalizeModel({
  actors: ["A", "B"],
  steps: Array.from({ length: 12 }, (_, i) => ({
    id: `s${i + 1}`, actors: [i % 2 ? "B" : "A"], stage: i + 1, label: `Etape ${i + 1}`
  }))
});
ok(computeSipoc(beaucoup).process.length <= 7,
  `au plus sept macro-etapes (recu: ${computeSipoc(beaucoup).process.length})`);

console.log("\n[3] Page Analyse : exhaustive et ordonnee");
const rows = computeAnalysis(model);
const kinds = rows.map((r) => r.type);
ok(kinds.includes("friction") && kinds.includes("opportunité") && kinds.includes("règle") &&
  kinds.includes("exception") && kinds.includes("incertitude"), "les cinq types presents");
ok(rows[0].type === "friction" && rows[0].etape.startsWith("1."),
  "ordre du flux : le premier constat vient de la premiere etape");
ok(rows.find((r) => r.type === "exception" && r.etape.startsWith("2.")),
  "exception rattachee posee a son etape");
ok(rows.find((r) => r.type === "exception" && r.etape === "—" && r.constat === "Derogation estivale"),
  "exception non rattachee au niveau processus");
ok(rows.find((r) => r.type === "friction").constat.includes("« Les formulaires arrivent incomplets »"),
  "constat verbatim conserve");
ok(rows.find((r) => r.type === "friction").duree === "10 min", "duree de l'etape presente");

console.log("\n[4] Pages natives, prefixes, composition");
const xml = renderDrawioXml(model, { pages: ["Makigami", "SIPOC", "Analyse"] });
const pages = [...xml.matchAll(/<diagram id="[^"]+" name="([^"]+)">([\s\S]*?)<\/diagram>/g)];
ok(pages.map((p) => p[1]).join(",") === "Makigami,SIPOC,Analyse", "ordre des pages");
const ps = pages[1][2], pa = pages[2][2];
ok(/shape=table/.test(ps) && /tableRow/.test(ps), "SIPOC en tableau natif (lignes ajoutables)");
ok(!/id="(?!sipoc-)[a-z]/.test(ps.replace(/id="0"/g, 'id="sipoc-zero"')), "ids SIPOC prefixes sipoc-");
ok(ps.includes("Fournisseurs") && ps.includes("Entrées") && ps.includes("Clients"), "cinq colonnes SIPOC");
ok(/(?:label|value)="≈ Identite du demandeur"/.test(ps), "≈ sur la valeur deduite dans la page");
ok(/shape=table/.test(pa) && /tableRow/.test(pa), "Analyse en tableau natif");
ok(pa.includes('id="ana-table"') && pa.includes('id="ana-r0"'), "ids Analyse prefixes ana-");
ok(pa.includes("Synthèse") && /étape dominante : Instruire la demande \(80 %\)/.test(pa),
  "ligne de synthese avec l'etape dominante (120/150 min = 80 %)");
ok(pa.includes("transferts : 1"), "transferts dans la synthese");

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
