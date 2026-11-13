// Page BPMN native Draw.io : structuree (pool et lanes en vrais
// conteneurs), connectee (aretes par id avec points d'accroche),
// modulable (elements enfants de leur lane). Et non-divergence des
// deux sorties : toBpmn reste identique octet pour octet a
// l'instantane capture avant la factorisation. Hors ligne.
// Usage : node test/drawio-bpmn.mjs

import { readFileSync } from "node:fs";
import { normalizeModel } from "../src/schema.js";
import { renderDrawioXml } from "../src/drawio.js";
import { toBpmn } from "../src/export-bpmn.js";
import { parseDrawioXml } from "../src/drawio-parse.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

console.log("\n[1] toBpmn inchange apres factorisation (bpmn-map partage)");
{
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/bpmn-fixture.json", import.meta.url), "utf8"));
  const snapshot = readFileSync(new URL("./fixtures/bpmn-snapshot.xml", import.meta.url), "utf8");
  ok(toBpmn(fixture) === snapshot, "sortie .bpmn identique octet pour octet a l'instantane");
}

// modele factice : decision avec retour, etape automatisee, deux acteurs
const model = normalizeModel({
  process: "Validation des demandes",
  trigger: "Une demande arrive",
  outcome: "Demande traitee",
  actors: ["Guichetier", "Systeme central"],
  steps: [
    { id: "s1", actors: ["Guichetier"], stage: 1, label: "Saisir la demande", tools: ["GED"], duration: "10 min" },
    { id: "s2", actors: ["Guichetier"], stage: 2, label: "Controler le dossier",
      decision: { question: "Dossier complet ?", on_no: { label: "Reclamer les pieces", return_to: "s1" } } },
    { id: "s3", actors: ["Systeme central"], stage: 3, label: "Notifier automatiquement", automated: true }
  ]
});
const xml = renderDrawioXml(model, { pages: ["Makigami", "BPMN"] });
const pages = [...xml.matchAll(/<diagram id="[^"]+" name="([^"]+)">([\s\S]*?)<\/diagram>/g)];
const page = (pages.find((p) => p[1] === "BPMN") || [])[2] || "";

console.log("\n[2] Composition et structures natives");
ok(pages.length === 2 && pages[1][1] === "BPMN", "page BPMN presente apres la Makigami");
ok(/id="bpmn-pool"[^>]*><mxCell[^>]*style="swimlane;[^"]*childLayout=stackLayout[^"]*resizeParent=1[^"]*"|<mxCell id="bpmn-pool"[^>]*style="swimlane;[^"]*childLayout=stackLayout[^"]*resizeParent=1[^"]*"/.test(page) ||
  /bpmn-pool"[\s\S]{0,400}?childLayout=stackLayout/.test(page),
  "pool en conteneur swimlane a stackLayout (ajout de lane recompose le pool)");
ok(!/collapsible=1/.test(page) && /collapsible=0/.test(page), "conteneurs non repliables");
const lanes = [...page.matchAll(/<mxCell id="(bpmn-lane_\d+)"[^>]*parent="bpmn-pool"/g)].map((m) => m[1]);
ok(lanes.length === 2, `une lane par acteur, enfant du pool (recu: ${lanes.length})`);

console.log("\n[3] Chaque element est enfant de sa lane");
const inLane = (id, lane) => new RegExp(
  `(?:<mxCell id="${id}"[^>]*parent="${lane}"|<object id="${id}"[^>]*><mxCell parent="${lane}")`).test(page);
ok(inLane("bpmn-Task_s1", "bpmn-lane_0"), "tache s1 dans la lane du guichetier");
ok(inLane("bpmn-Gw_s2", "bpmn-lane_0"), "passerelle dans la lane de son etape");
ok(inLane("bpmn-Task_s3", "bpmn-lane_1"), "tache automatisee dans la lane du systeme");
ok(inLane("bpmn-Start_1", "bpmn-lane_0"), "evenement de debut dans la lane du premier acteur");
ok(/bpmn-End_main"[^>]*(?:parent="bpmn-lane_1"|><mxCell parent="bpmn-lane_1")/.test(page),
  "evenement de fin la ou le flux se termine");

console.log("\n[4] Formes BPMN et marqueurs");
ok(/bpmn-Task_s3"[\s\S]{0,300}?taskMarker=service/.test(page), "service task avec marqueur (mxgraph.bpmn.task)");
ok(/bpmn-Gw_s2"[\s\S]{0,300}?symbol=exclusiveGw/.test(page), "passerelle exclusive avec marqueur X");
ok(/bpmn-Start_1"[\s\S]{0,300}?outline=standard/.test(page), "evenement de debut en cercle simple");
ok(/bpmn-End_main"[\s\S]{0,300}?outline=end/.test(page), "evenement de fin en cercle epais");

console.log("\n[5] Aretes par id avec points d'accroche, jamais par coordonnees");
const edges = [...page.matchAll(/<mxCell id="(bpmn-Flow_\d+)"[^>]*style="([^"]*)"[^>]*source="([^"]+)" target="([^"]+)"/g)];
ok(edges.length === flowsCount(page), `toutes les aretes declarees (recu: ${edges.length})`);
function flowsCount(p) { return (p.match(/id="bpmn-Flow_\d+"/g) || []).length; }
ok(edges.every((e) => e[3].startsWith("bpmn-") && e[4].startsWith("bpmn-")),
  "chaque arete reference source et cible par id");
ok(edges.every((e) => /exitX=/.test(e[2]) && /entryX=/.test(e[2])), "points d'accroche sur chaque arete");
ok(edges.every((e) => /orthogonalEdgeStyle/.test(e[2])), "routage orthogonal");
ok(/value="oui"/.test(page) && /value="non"/.test(page), "etiquettes oui / non en labels d'arete");
const backEdge = edges.find((e) => e[4] === "bpmn-Task_s1" && e[3] === "bpmn-Gw_s2");
ok(backEdge && /dashed=1/.test(backEdge[2]), "retour en trait discontinu");
ok(new RegExp(`id="${backEdge && backEdge[1]}"[\\s\\S]{0,700}?<Array as="points">`).test(page),
  "retour route par points de passage explicites");

console.log("\n[6] Rien de perdu en silence");
ok(/tooltip="[^"]*Outils : GED/.test(page), "metadonnees en infobulle des elements");
ok(page.includes("Vue BPMN dérivée du MIP"), "note de derivation en haut de page");
ok(!/id="maki_/.test(page) && !/id="proc-/.test(page), "prefixe bpmn- exclusif sur la page");

console.log("\n[7] Le parseur reste indifferent a la page BPMN");
const full = renderDrawioXml(model, { pages: ["Makigami", "Processus", "BPMN", "RACI"] });
ok((full.match(/<diagram /g) || []).length === 4, "fichier a quatre pages");
const parsed = parseDrawioXml(full);
ok(parsed.steps.length === 3 && parsed.actors.length === 2,
  "modele relu depuis la seule page Makigami");

console.log("\n[8] Fidele a la complexite sur la page aussi (chantier 2)");
{
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/bpmn-fixture.json", import.meta.url), "utf8"));
  const x2 = renderDrawioXml(fixture, { pages: ["Makigami", "BPMN"] });
  const p2 = ([...x2.matchAll(/<diagram id="[^"]+" name="([^"]+)">([\s\S]*?)<\/diagram>/g)]
    .find((p) => p[1] === "BPMN"))[2];
  ok(/id="bpmn-GwSplit_c3"[\s\S]{0,400}?symbol=parallelGw/.test(p2), "AND split en forme parallele");
  ok(p2.includes('id="bpmn-GwJoin_c3"'), "AND join present");
  ok((p2.match(/symbol=parallelGw/g) || []).length === 2, "paire AND, aucune ailleurs");
  ok(/<mxCell id="bpmn-Ann_0"[^>]*parent="bpmn-lane_2"/.test(p2),
    "annotation enfant de la lane de sa tache");
  ok(/id="bpmn-Assoc_0"[^>]*source="bpmn-Task_s3" target="bpmn-Ann_0"/.test(p2),
    "association tache -> annotation, en tiret");
  ok(/fillColor=#FFF6D6/.test(p2) && /fillColor=#E8F0FE/.test(p2) &&
    /fillColor=#E4F2E9/.test(p2) && /fillColor=#FCE8E6/.test(p2) && /fillColor=#FFE6CC/.test(p2),
    "palette MIP posee sur les cellules (jaune, bleu, vert, rouge, orange)");
  ok(p2.includes("Jaune : tâche humaine"), "legende de couleurs presente sur la page");
}

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
