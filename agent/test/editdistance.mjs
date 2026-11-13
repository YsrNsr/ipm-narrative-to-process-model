// Test hors ligne de la mesure d'effort d'edition (src/editdistance.js)
// et du parseur XML -> modele (src/drawio-parse.js).
// Usage : node test/editdistance.mjs

import { compareModels } from "../src/editdistance.js";
import { parseDrawioXml } from "../src/drawio-parse.js";
import { renderDrawioXml } from "../src/drawio.js";
import { normalizeModel } from "../src/schema.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
};

const BASE = normalizeModel({
  process: "Traitement d'une demande de raccordement",
  actors: ["Client", "Service clientele", "Bureau technique", "Technicien terrain"],
  steps: [
    { id: "s1", actor: "Client", label: "Remplir le formulaire de demande",
      documents_out: ["Demande de raccordement"], tools: ["Portail web"] },
    { id: "s2", actor: "Service clientele", label: "Recuperer et verifier le dossier",
      documents_in: ["Demande de raccordement"], tools: ["CRM"], friction: "Pieces justificatives souvent manquantes" },
    { id: "s3", actor: "Bureau technique", label: "Etudier la faisabilite",
      documents_out: ["Avis de faisabilite"], tools: ["SIG"], duration: "5 jours" },
    { id: "s4", actor: "Technicien terrain", label: "Realiser le raccordement", friction: "Acces au site requis" },
    { id: "s5", actor: "Service clientele", label: "Cloturer le dossier et facturer",
      documents_out: ["Facture"], tools: ["ERP"] }
  ]
});

const clone = (m) => JSON.parse(JSON.stringify(m));

console.log("\n[1] Modeles identiques : effort nul");
{
  const r = compareModels(BASE, clone(BASE));
  ok(r.total === 0, `total = 0 (recu: ${r.total})`);
}

console.log("\n[2] Aller-retour rendu -> parse : effort nul");
{
  const parsed = parseDrawioXml(renderDrawioXml(BASE));
  ok(parsed.actors.length === 4, `4 acteurs reconstruits (recu: ${parsed.actors.length})`);
  ok(parsed.steps.length === 5, `5 etapes reconstruites (recu: ${parsed.steps.length})`);
  const r = compareModels(BASE, parsed);
  ok(r.total === 0, `total = 0 apres aller-retour (recu: ${r.total}${r.total ? " -> " + JSON.stringify(r) : ""})`);
}

console.log("\n[3] Renommage d'un acteur et d'un libelle");
{
  const final = clone(BASE);
  final.actors[1] = "Service client";                       // renommage acteur
  final.steps.forEach((s) => { if (s.actor === "Service clientele") s.actor = "Service client"; });
  final.steps[2].label = "Etudier la faisabilite technique"; // renommage tache
  const r = compareModels(BASE, final);
  ok(r.actors.renamed === 1, `1 acteur renomme (recu: ${r.actors.renamed})`);
  ok(r.tasks.renamed === 1, `1 tache renommee (recu: ${r.tasks.renamed})`);
  ok(r.tasks.added === 0 && r.tasks.removed === 0, "aucun ajout ni suppression parasite");
  ok(r.tasks.reassigned === 0, `le renommage d'acteur ne compte pas comme reattribution (recu: ${r.tasks.reassigned})`);
}

console.log("\n[4] Ajout et suppression de taches");
{
  const final = clone(BASE);
  final.steps.splice(3, 1); // suppression d'une tache (hallucination corrigee)
  final.steps.push({ id: "s9", actor: "Client", label: "Confirmer la reception",
    documents_in: [], documents_out: [], tools: [], duration: "", friction: "" });
  const r = compareModels(BASE, final);
  ok(r.tasks.removed === 1, `1 tache supprimee (recu: ${r.tasks.removed})`);
  ok(r.tasks.added === 1, `1 tache ajoutee (recu: ${r.tasks.added})`);
}

console.log("\n[5] Reattribution d'une tache a un autre acteur");
{
  const final = clone(BASE);
  final.steps[3].actor = "Bureau technique";
  const r = compareModels(BASE, final);
  ok(r.tasks.reassigned === 1, `1 tache reattribuee (recu: ${r.tasks.reassigned})`);
}

console.log("\n[6] Metadonnees : ajout, suppression, modification");
{
  const final = clone(BASE);
  final.steps[0].tools.push("Application mobile");     // ajout d'outil
  final.steps[1].friction = "";                        // suppression de friction
  final.steps[2].duration = "10 jours";                // modification de duree
  const r = compareModels(BASE, final);
  ok(r.metadata.added === 1, `1 metadonnee ajoutee (recu: ${r.metadata.added})`);
  ok(r.metadata.removed === 1, `1 metadonnee supprimee (recu: ${r.metadata.removed})`);
  ok(r.metadata.renamed === 1, `1 metadonnee modifiee (recu: ${r.metadata.renamed})`);
}

console.log("\n[7] Edition simulee du XML (renommage de carte + cellule de bande)");
{
  // simule une edition faite dans Draw.io : renommage du libelle d'une
  // carte et d'une valeur de bande directement dans le XML
  let xml = renderDrawioXml(BASE);
  xml = xml.replace('value="Etudier la faisabilite"', 'value="Analyser la faisabilite technique"');
  xml = xml.replace('value="CRM"', 'value="CRM, GED"');
  const parsed = parseDrawioXml(xml);
  const r = compareModels(BASE, parsed);
  ok(r.tasks.renamed === 1, `1 tache renommee via XML (recu: ${r.tasks.renamed})`);
  ok(r.metadata.added === 1, `1 outil ajoute via XML (recu: ${r.metadata.added})`);
}

console.log(`\n${failures === 0 ? "TOUS LES TESTS PASSENT" : failures + " TEST(S) EN ECHEC"}\n`);
process.exit(failures === 0 ? 0 : 1);
