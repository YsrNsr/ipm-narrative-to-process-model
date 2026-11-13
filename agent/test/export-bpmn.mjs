// Export BPMN 2.0 : structure et references sur un modele factice avec
// decision, retour, parallelisme et etape automatisee. Hors ligne.
// Usage : node test/export-bpmn.mjs

import { normalizeModel } from "../src/schema.js";
import { toBpmn } from "../src/export-bpmn.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

const model = normalizeModel({
  process: "Commande de materiel",
  trigger: "Un employe veut commander",
  outcome: "Materiel commande",
  actors: ["Employe", "Responsable", "Comptabilite"],
  rules: ["Au-dela de 500 francs, validation du chef"],
  uncertainties: ["En general sous un jour"],
  exceptions: [{ value: "Cas urgent par telephone", step_id: "s3" }],
  steps: [
    { id: "s1", actors: ["Employe"], stage: 1, label: "Envoyer la demande",
      tools: ["Messagerie"], duration: "10 min" },
    { id: "s2", actors: ["Responsable"], stage: 2, label: "Verifier le budget",
      decision: { question: "Budget disponible ?", on_no: { label: "Reduire la demande", return_to: "s1" } } },
    { id: "s3", actors: ["Comptabilite"], stage: 3, label: "Enregistrer l'engagement" },
    { id: "s4", actors: ["Employe"], stage: 4, label: "Confirmer la reception" },
    { id: "s6", actors: ["Responsable"], stage: 4, label: "Classer la decision" },
    { id: "s5", actors: ["Comptabilite"], stage: 5, label: "Notifier automatiquement", automated: true,
      decision: { question: "Notification recue ?", on_no: { label: "Relancer par mail", return_to: "fin" } } }
  ]
});
const xml = toBpmn(model);

console.log("\n[1] Bonne formation et espaces de noms");
ok(xml.startsWith('<?xml version="1.0"'), "declaration XML en tete");
ok(xml.includes("<!--") && /Transpose/.test(xml) && /Degrade/.test(xml),
  "commentaire d'en-tete listant transpose et degrade");
ok(xml.includes('xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"'), "espace de noms BPMN");
ok(xml.includes("bpmndi:BPMNDiagram"), "BPMNDiagram present (affichage direct)");
const openTags = (xml.match(/<bpmn:\w+/g) || []).length;
const closedOrSelf = (xml.match(/<\/bpmn:\w+>|<bpmn:\w+[^>]*\/>/g) || []).length;
ok(openTags === closedOrSelf, `balises bpmn equilibrees (${openTags} ouvertes, ${closedOrSelf} fermees)`);

console.log("\n[2] Identifiants uniques");
const ids = [...xml.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
ok(ids.length === new Set(ids).size, `aucun id duplique (${ids.length} ids)`);

console.log("\n[3] Structure : pool, lanes, taches");
ok(/<bpmn:participant [^>]*name="Commande de materiel"/.test(xml), "un pool nomme");
ok((xml.match(/<bpmn:lane /g) || []).length === 3, "une lane par acteur");
ok((xml.match(/<bpmn:task /g) || []).length === 5, "une tache par etape non automatisee");
// parallelisme reel : le stage 4 (deux etapes) recoit une paire AND
ok((xml.match(/<bpmn:parallelGateway/g) || []).length === 2,
  "une paire de passerelles paralleles, et aucune ailleurs");
ok(/sourceRef="Task_s3" targetRef="GwSplit_c3"/.test(xml), "le stage precedent alimente le split");
ok((xml.match(/sourceRef="GwSplit_c3"/g) || []).length === 2, "AND split : deux sorties (une par etape)");
ok((xml.match(/targetRef="GwJoin_c3"/g) || []).length === 2, "AND join : deux entrees");
ok(/sourceRef="GwJoin_c3" targetRef="Task_s5"/.test(xml), "le join alimente le stage suivant");
ok((xml.match(/<bpmn:sequenceFlow[^>]*sourceRef="Task_s3"/g) || []).length === 1,
  "plus de fork implicite : une seule sortie de flux par tache hors decision");
ok(/<bpmn:serviceTask id="Task_s5"/.test(xml), "etape automatisee en service task");
const laneRefs = [...xml.matchAll(/<bpmn:flowNodeRef>([^<]+)<\/bpmn:flowNodeRef>/g)].map((m) => m[1]);
for (const t of ["Task_s1", "Task_s2", "Task_s3", "Task_s4", "Task_s5", "Gw_s2", "Start_1"]) {
  ok(laneRefs.filter((r) => r === t).length === 1, `${t} rattache a exactement une lane`);
}

console.log("\n[4] Passerelles et flux");
ok((xml.match(/<bpmn:exclusiveGateway /g) || []).length === 2, "une passerelle exclusive par decision");
const gwOut = (xml.match(/<bpmn:sequenceFlow [^>]*sourceRef="Gw_s2"/g) || []).length;
ok(gwOut === 2, `la passerelle a deux sorties (recu: ${gwOut})`);
ok(/sourceRef="Gw_s2" targetRef="Task_s1" name="non"/.test(xml), "flux non : retour vers l'etape cible");
ok(/sourceRef="Gw_s2" targetRef="Task_s3" name="oui"/.test(xml), "flux oui vers le stage suivant");
ok(/sourceRef="Gw_s5" targetRef="End_no_s5" name="non"/.test(xml), "non sans retour -> end event dedie");
ok(/<bpmn:endEvent id="End_no_s5" name="Relancer par mail"/.test(xml), "end event nomme par l'action de sortie");
ok(/<bpmn:startEvent id="Start_1" name="Un employe veut commander"/.test(xml), "start event depuis le declencheur");

console.log("\n[5] Coherence des references");
const nodeIds = new Set([...xml.matchAll(/<bpmn:(?:task|serviceTask|exclusiveGateway|parallelGateway|startEvent|endEvent) id="([^"]+)"/g)].map((m) => m[1]));
const flowRefs = [...xml.matchAll(/<bpmn:sequenceFlow id="([^"]+)" sourceRef="([^"]+)" targetRef="([^"]+)"/g)];
ok(flowRefs.every((m) => nodeIds.has(m[2]) && nodeIds.has(m[3])),
  "chaque flux relie deux noeuds existants");
const flowIds = new Set(flowRefs.map((m) => m[1]));
const inOut = [...xml.matchAll(/<bpmn:(?:incoming|outgoing)>([^<]+)</g)].map((m) => m[1]);
ok(inOut.every((f) => flowIds.has(f)), "incoming/outgoing pointent des flux declares");
const shapes = new Set([...xml.matchAll(/bpmnElement="([^"]+)"/g)].map((m) => m[1]));
ok([...nodeIds].every((n) => shapes.has(n)), "chaque noeud a sa forme dans le diagramme");
ok(flowRefs.every((m) => shapes.has(m[1])), "chaque flux a son arete dans le diagramme");

console.log("\n[6] Documentation, annotations et couleurs");
ok(/Task_s1[^>]*><bpmn:documentation>[^<]*Outils : Messagerie/.test(xml), "outils en documentation de tache");
ok(/Duree : 10 min/.test(xml), "duree en documentation");
ok(/Regle metier : Au-dela de 500 francs/.test(xml), "regles en documentation du processus");
// exception rattachee : annotation associee a la tache, plus une
// ligne de documentation cachee
ok(/<bpmn:textAnnotation id="Ann_0"><bpmn:text>Cas urgent par telephone<\/bpmn:text>/.test(xml),
  "exception rattachee en annotation");
ok(/<bpmn:association id="Assoc_0" sourceRef="Task_s3" targetRef="Ann_0"/.test(xml),
  "association vers la bonne tache");
ok(!/documentation>[^<]*Exception : Cas urgent/.test(xml), "l'exception rattachee quitte la documentation");
ok(/xmlns:bioc="http:\/\/bpmn.io\/schema\/bpmn\/biocolor\/1.0"/.test(xml), "espace de noms bioc declare");
ok(/bpmnElement="Task_s1" bioc:stroke="#E0B400" bioc:fill="#FFF6D6"/.test(xml), "tache humaine en jaune MIP");
ok(/bpmnElement="Task_s5" bioc:stroke="#6C8EBF" bioc:fill="#E8F0FE"/.test(xml), "service task en bleu MIP");
ok(/bpmnElement="Start_1" bioc:stroke="#2F7D4F"/.test(xml) && /bpmnElement="End_main" bioc:stroke="#B85450"/.test(xml),
  "debut en vert tendre, fin en rouge tendre");
ok(/bpmnElement="GwSplit_c3" bioc:stroke="#D79B00"/.test(xml), "passerelles en orange clair");
ok(xml.includes("parallelisme d'etage (paire de passerelles paralleles"),
  "en-tete de degradation mis a jour");

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
