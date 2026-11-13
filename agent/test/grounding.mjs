// Test hors ligne de la verification lexicale d'ancrage (src/grounding.js).
// Usage : node test/grounding.mjs

import { isGrounded, prepareSource, markUngrounded } from "../src/grounding.js";
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

const SRC = prepareSource(
  "Le client remplit le formulaire sur le portail web. Ensuite le service clientele " +
  "recupere la demande dans le CRM et verifie les pieces justificatives. Le bureau " +
  "technique etudie la faisabilite sur le SIG, cela prend cinq jours environ."
);

console.log("\n[1] Valeurs ancrees et inventees");
ok(isGrounded("Remplir le formulaire de demande", SRC).grounded === true, "reformulation proche ancree");
ok(isGrounded("Rapport d'audit qualite", SRC).grounded === false, "objet absent detecte comme non ancre");
ok(isGrounded("CRM", SRC).grounded === true, "sigle present : la seule presence suffit");
ok(isGrounded("ERP", SRC).grounded === false, "sigle absent rejete");
ok(isGrounded("", SRC).grounded === true, "valeur vide : rien a verifier");
ok(isGrounded("Verification des pieces justificatives", SRC).grounded === true, "flexions tolerees par racinisation");

console.log("\n[2] Seuil ajustable");
{
  const mixte = "Formulaire de faisabilite electrique"; // 1 mot sur 3 absent
  ok(isGrounded(mixte, SRC, { threshold: 0.5 }).grounded === true, "seuil 0.5 : valeur mixte acceptee");
  ok(isGrounded(mixte, SRC, { threshold: 0.9 }).grounded === false, "seuil 0.9 : valeur mixte rejetee");
  const r = isGrounded(mixte, SRC);
  ok(Math.abs(r.coverage - 2 / 3) < 1e-9, `couverture exacte 2/3 (recu: ${r.coverage})`);
}

console.log("\n[3] markUngrounded : union avec le marquage auto-declare");
{
  const model = normalizeModel({
    process: "P", actors: ["A"],
    steps: [{
      id: "s1", actor: "A", label: "Verifier le dossier",
      tools: ["CRM", "Salesforce"],                       // Salesforce absent de la source
      documents_in: [{ value: "Formulaire", inferred: true }], // auto-declare
      friction: "Pieces justificatives souvent manquantes",
      duration: "3 semaines"                               // absent de la source
    }]
  });
  const marked = markUngrounded(model, "Le client remplit le formulaire sur le portail web. Le service clientele verifie le dossier dans le CRM ; les pieces justificatives manquent souvent.", { threshold: 0.6 });
  const s = model.steps[0];
  ok(s.inferred.tools[0] === false && s.inferred.tools[1] === true, "outil absent marque, outil present intact");
  ok(s.inferred.documents_in[0] === true, "marquage auto-declare conserve (union)");
  ok(s.inferred.duration === true, "duree non ancree marquee");
  ok(s.inferred.friction === false, "friction ancree non marquee");
  ok(marked === 2, `2 valeurs marquees par la verification (recu: ${marked})`);
}

console.log(`\n${failures === 0 ? "TOUS LES TESTS PASSENT" : failures + " TEST(S) EN ECHEC"}\n`);
process.exit(failures === 0 ? 0 : 1);
