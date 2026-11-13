// Page "Processus" : le deroulement seul, sans metadonnees. Verifie
// sur un modele factice que la page ne contient ni bandes ni encart ni
// synthese, que les fleches referencent des ids avec points d'accroche,
// que les couloirs restent des conteneurs natifs et que les ids portent
// le prefixe proc-. Hors ligne.
// Usage : node test/process-page.mjs

import { normalizeModel } from "../src/schema.js";
import { markUngrounded } from "../src/grounding.js";
import { renderDrawioXml } from "../src/drawio.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

const model = normalizeModel({
  process: "Traitement des demandes",
  trigger: "Une demande arrive au guichet",
  outcome: "Demande traitee et archivee",
  rules: ["Enregistrement le jour meme"],
  uncertainties: ["En general ca part le lendemain"],
  actors: ["Guichetier", "Controleur", "Robot"],
  steps: [
    { id: "s1", actors: ["Guichetier", "Controleur"], stage: 1, label: "Recevoir la demande",
      procedure: "Saisir la demande dans l'outil", duration: "10 min",
      friction: "File d'attente le lundi", tools: ["GED"] },
    { id: "s2", actors: ["Controleur"], stage: 2, label: "Controler le dossier",
      decision: { question: "Dossier complet ?", on_no: { label: "Reclamer les pieces", return_to: "s1" } } },
    { id: "s3", actors: ["Robot"], stage: 3, label: "Notifier automatiquement", automated: true }
  ]
});
markUngrounded(model, "Une demande arrive au guichet du guichetier.\nLe controleur controle le dossier complet.", { threshold: 0.7 });

const xml = renderDrawioXml(model, { pages: ["Makigami", "Processus", "RACI"] });
const pages = [...xml.matchAll(/<diagram id="[^"]+" name="([^"]+)">([\s\S]*?)<\/diagram>/g)];

console.log("\n[1] Composition");
ok(pages.length === 3, `trois pages (recu: ${pages.length})`);
ok(pages.map((p) => p[1]).join(",") === "Makigami,Processus,RACI", "ordre Makigami, Processus, RACI");
const proc = pages[1][2];
const maki = pages[0][2];

console.log("\n[2] La page Processus est depouillee");
for (const banned of ["DOCUMENTS", "DONNÉES", "OUTILS / SYSTÈMES", "TEMPS (par étape)",
  "VOLUMES ET FRÉQUENCE", "RÈGLES, EXCEPTIONS", "MODE OPÉRATOIRE", "synth", "⚐", "●"]) {
  ok(!proc.includes(banned), `sans « ${banned} »`);
}
ok(!/proc-bar_/.test(proc), "aucune barre de temps");
ok(!/strokeWidth=3/.test(proc), "aucune bordure diagnostique");
ok(!/proc-part_/.test(proc), "aucune carte de participation");
ok(proc.includes("PROCESSUS — Traitement des demandes"), "titre de grille propre a la page");
ok(proc.includes("Une demande arrive au guichet") && proc.includes("Demande traitee et archivee"),
  "en-tete reduit : declencheur et issue");
ok(!proc.includes("Pilote"), "pas de table d'identification complete");

console.log("\n[3] Structures natives et prefixe proc-");
ok(!/id="maki_/.test(proc), "aucun id maki_ residuel");
ok(/id="proc-card_0"/.test(proc) && /id="proc-grid"/.test(proc), "ids prefixes proc-");
ok(/shape=table/.test(proc) && /tableRow/.test(proc), "couloirs en conteneurs natifs");
const edges = [...proc.matchAll(/<mxCell id="(proc-(?:flow|declink)[^"]*)"[^>]*style="([^"]*)"[^>]*source="([^"]+)" target="([^"]+)"/g)];
ok(edges.length >= 4, `fleches presentes (recu: ${edges.length})`);
ok(edges.every((e) => /exitX=/.test(e[2]) && /entryX=/.test(e[2])),
  "chaque fleche porte ses points d'accroche");
ok(edges.every((e) => e[3].startsWith("proc-") && e[4].startsWith("proc-")),
  "chaque fleche reference des ids proc- en source et cible");
ok(/proc-flow_back_1/.test(proc), "fleche de retour presente");
ok(/value="oui"/.test(proc) && /value="non"/.test(proc), "sorties de decision etiquetees");

console.log("\n[4] Infobulles discretes et legende minimale");
ok(/tooltip="[^"]*Mode opératoire : Saisir la demande/.test(proc), "mode operatoire en infobulle");
ok(/tooltip="[^"]*Durée : 10 min/.test(proc), "duree en infobulle");
ok(!proc.includes("Barre jaune") && !proc.includes("Bordure épaisse") && !proc.includes("pastille"),
  "legende sans conventions diagnostiques");
ok(proc.includes("Carte bleue"), "legende : carte automatisee (convention utilisee)");

console.log("\n[5] La page Makigami reste complete");
ok(maki.includes("DOCUMENTS") && maki.includes("MAKIGAMI —") && /maki_part_0_0/.test(maki),
  "bandes, titre et participants intacts sur la page Makigami");

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
