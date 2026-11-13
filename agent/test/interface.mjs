// Interface : logique pure des modules du navigateur (sans DOM) et
// controles statiques du poste de travail. Aucun appel LLM ni serveur.
// Usage : node test/interface.mjs

import { readFileSync, existsSync } from "node:fs";
import { splitLegacy, countWords } from "../public/js/interviews.js";
import { detectSensitive, applyReplacement } from "../public/js/anonymize.js";
import { listPages, singlePageXml } from "../public/js/pagepick.js";
import { diffDetails } from "../src/editdistance.js";
import { normalizeModel } from "../src/schema.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

console.log("\n[1] Decoupage retrocompatible des entretiens");
{
  const t = "Premier recit.\n=== ENTRETIEN ===\nDeuxieme recit.\n===ENTRETIEN 3===\nTroisieme.";
  const parts = splitLegacy(t);
  ok(parts.length === 3, `3 blocs depuis l'ancien separateur (recu: ${parts.length})`);
  ok(parts[0] === "Premier recit." && parts[2] === "Troisieme.", "contenus preserves");
  ok(splitLegacy("Un seul texte").length === 1, "texte sans separateur intact");
  ok(countWords("un deux  trois\nquatre") === 4, "compteur de mots");
}

console.log("\n[2] Aide a l'anonymisation : detection naive locale");
{
  const text = [
    "Le dossier passe chez Martine qui verifie tout.",
    "Ensuite Martine transmet a la comptabilite via SAP.",
    "En cas de souci on ecrit a support@exemple.ch ou on appelle le 022 379 11 11.",
    "Le lundi c'est différent."
  ].join("\n");
  const items = detectSensitive([text]);
  const byKind = (k) => items.filter((x) => x.kind === k);
  ok(byKind("nom").some((x) => x.term === "Martine"), "nom repete hors debut de phrase detecte");
  ok(!items.some((x) => x.term === "Le" || x.term === "Ensuite"), "mots de debut de phrase ignores");
  ok(byKind("email").length === 1, "adresse mail detectee");
  ok(byKind("telephone").length === 1, "numero de telephone detecte");
  ok(byKind("nom")[0].replacement.startsWith("Personne "), "remplacement propose Personne X");
  const replaced = applyReplacement(text, "Martine", "Personne A");
  ok(!replaced.includes("Martine") && replaced.includes("Personne A"), "remplacement applique partout");
  ok(applyReplacement("preMartine reste", "Martine", "X") === "preMartine reste",
    "les occurrences internes a un mot ne sont pas touchees");
  ok(applyReplacement("Ecrire a support@exemple.ch.", "support@exemple.ch", "[mail]") === "Ecrire a [mail].",
    "le point de fin de phrase apres une adresse ne bloque pas le remplacement");
  ok(applyReplacement("a@b.ch.plus reste", "a@b.ch", "[mail]") === "a@b.ch.plus reste",
    "une adresse plus longue n'est pas coupee");
}

console.log("\n[3] Comparaison lisible (diffDetails)");
{
  const initial = normalizeModel({
    actors: ["Guichetier", "Chef"],
    steps: [
      { actors: ["Guichetier"], stage: 1, label: "Recevoir la demande" },
      { actors: ["Chef"], stage: 2, label: "Valider le dossier" }
    ]
  });
  const final = normalizeModel({
    actors: ["Guichetier", "Chef d'agence"],
    steps: [
      { actors: ["Guichetier"], stage: 1, label: "Recevoir la demande" },
      { actors: ["Chef d'agence"], stage: 2, label: "Approuver le dossier complet" },
      { actors: ["Guichetier"], stage: 3, label: "Archiver la demande" }
    ]
  });
  const d = diffDetails(initial, final, { threshold: 0.4 });
  ok(d.tasks.added.includes("Archiver la demande"), "ajout d'etape liste par son libelle");
  ok(d.tasks.renamed.some(([a, b]) => a === "Valider le dossier" && b === "Approuver le dossier complet"),
    "renommage d'etape liste avant -> apres");
  ok(d.actors.renamed.length === 1, "renommage d'acteur repere");
  ok(d.actors.added.length === 0 && d.actors.removed.length === 0, "pas de faux ajouts d'acteurs");
}

console.log("\n[4] Poste de travail : controles statiques");
{
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  for (const id of ["interviews", "provider", "gen", "progress", "drawio", "validation-panel",
    "btn-validate", "sessions-dialog", "anonymize-box", "btn-example", "outputs",
    "outputs-pages", "page-maki", "page-proc", "page-bpmn", "page-raci", "page-sipoc", "page-ana", "btn-png",
    "png-page", "pages-hint"]) {
    ok(html.includes(`id="${id}"`), `element #${id} present`);
  }
  ok(/type="module"\s+src="js\/main\.js"/.test(html), "chargement en module natif");
  ok(!/cartograph|maquette|peaufin|brouillon/i.test(html), "terminologie MIP respectee");
  for (const f of ["main.js", "interviews.js", "anonymize.js", "editor.js", "sessions.js", "validation.js"]) {
    ok(existsSync(new URL(`../public/js/${f}`, import.meta.url)), `module public/js/${f} present`);
  }
}

console.log("\n[5] Choix de page pour l'export PNG (module pur)");
{
  const xml = `<mxfile pages="3">
  <diagram id="a" name="Makigami"><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram>
  <diagram id="b" name="BPMN"><mxGraphModel><root><mxCell id="0"/><mxCell id="x" value="repere"/></root></mxGraphModel></diagram>
  <diagram id="c" name="RACI"><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram>
</mxfile>`;
  ok(listPages(xml).join(",") === "Makigami,BPMN,RACI", "liste des noms de pages");
  const single = singlePageXml(xml, "BPMN");
  ok(single.includes('pages="1"') && single.includes("repere") && !single.includes("RACI"),
    "extraction d'une page unique re-enveloppee");
  ok(singlePageXml(xml, "Inconnue") === null, "page inconnue -> null");
}

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
