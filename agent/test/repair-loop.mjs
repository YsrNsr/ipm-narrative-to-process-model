// Test de la boucle de validation / reparation (src/llm/index.js).
// Simule un fournisseur LLM factice (aucun appel reseau) dont la premiere
// sortie est invalide, et verifie que la requete corrective est emise.
// Usage : node test/repair-loop.mjs

import { extract, getRepairCount } from "../src/llm/index.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
};

const VALID_JSON = JSON.stringify({
  process: "Processus test",
  actors: ["Acteur A"],
  steps: [{ id: "s1", actor: "Acteur A", label: "Faire une chose", documents_in: [], documents_out: [], tools: [], duration: "", friction: "" }]
});

// Fabrique un fournisseur factice qui renvoie ses reponses dans l'ordre
// et memorise les messages recus pour inspection.
function fakeProvider(responses) {
  const calls = [];
  return {
    calls,
    complete: async (messages) => {
      calls.push(messages);
      return responses[calls.length - 1];
    }
  };
}

console.log("\n[1] Sortie valide au premier essai : aucune reparation");
{
  const impl = fakeProvider([VALID_JSON]);
  const before = getRepairCount();
  const { model, repaired } = await extract("texte", { impl });
  ok(impl.calls.length === 1, `un seul appel au fournisseur (recu: ${impl.calls.length})`);
  ok(repaired === false, "repaired vaut false");
  ok(getRepairCount() === before, "compteur de reparations inchange");
  ok(model.actors.length === 1, "modele exploitable");
}

console.log("\n[2] Sortie invalide puis corrigee : une reparation declenchee");
{
  const impl = fakeProvider(["Voici le resultat : je ne sais pas produire du JSON.", VALID_JSON]);
  const before = getRepairCount();
  const { model, repaired } = await extract("texte", { impl });
  ok(impl.calls.length === 2, `deux appels au fournisseur (recu: ${impl.calls.length})`);
  ok(repaired === true, "repaired vaut true");
  ok(getRepairCount() === before + 1, "compteur de reparations incremente de 1");
  ok(model.steps.length === 1, "modele repare exploitable");
  const repairMsg = impl.calls[1];
  ok(repairMsg.user.includes("Erreurs detectees"), "la requete corrective liste les erreurs");
  ok(repairMsg.user.includes("je ne sais pas produire du JSON"), "la requete corrective contient la sortie precedente");
  ok(repairMsg.user.includes("texte"), "la requete corrective contient le texte source");
}

console.log("\n[3] Schema invalide (JSON parsable mais non conforme) : reparation declenchee");
{
  // JSON syntaxiquement correct mais sans steps : la validation doit echouer.
  const impl = fakeProvider([JSON.stringify({ process: "X", actors: [] }), VALID_JSON]);
  const before = getRepairCount();
  const { repaired } = await extract("texte", { impl });
  ok(repaired === true, "reparation declenchee sur echec de validation");
  ok(getRepairCount() === before + 1, "compteur incremente");
}

console.log("\n[4] Echec persistant : une seule tentative puis erreur explicite");
{
  const impl = fakeProvider(["pas du JSON", "toujours pas du JSON"]);
  let error = null;
  try {
    await extract("texte", { impl });
  } catch (e) {
    error = e;
  }
  ok(error !== null, "une erreur est levee");
  ok(impl.calls.length === 2, `exactement deux appels, pas de troisieme tentative (recu: ${impl.calls.length})`);
  ok(error && /reparation/i.test(error.message), "le message d'erreur mentionne la reparation");
}

console.log(`\n${failures === 0 ? "TOUS LES TESTS PASSENT" : failures + " TEST(S) EN ECHEC"}\n`);
process.exit(failures === 0 ? 0 : 1);
