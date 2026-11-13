// Condition C de l'ablation : sans ordre de raisonnement.
// La consigne de decomposition (acteurs, puis taches, puis enchainement,
// puis metadonnees) est retiree du prompt v2. Le retrait est fait par
// suppression de la ligne exacte : si le prompt principal change, ce
// module echoue explicitement plutot que de tester une condition fausse.

import { SYSTEM_PROMPT, buildMessages as buildReference } from "../../src/prompts.js";

export const meta = {
  key: "C",
  name: "sans raisonnement",
  description: "ordre acteurs/taches/enchainement/metadonnees retire"
};

const LINE = "Tu raisonnes dans cet ordre : d'abord les acteurs, puis les taches, puis leur enchainement, puis les metadonnees.\n";
if (!SYSTEM_PROMPT.includes(LINE)) {
  throw new Error("Condition C : la ligne de raisonnement est introuvable dans le prompt v2 (prompt modifie ?).");
}
const SYSTEM = SYSTEM_PROMPT.replace(LINE, "");

export function buildMessages(text) {
  return { ...buildReference(text), system: SYSTEM };
}
