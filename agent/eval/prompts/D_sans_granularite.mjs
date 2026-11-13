// Condition D de l'ablation : sans regle de granularite.
// La regle de regroupement des micro-actions (constitutive du Modele,
// chapitre 4) est retiree du prompt v2. Retrait par suppression de la
// ligne exacte, avec echec explicite si le prompt principal a change.

import { SYSTEM_PROMPT, buildMessages as buildReference } from "../../src/prompts.js";

export const meta = {
  key: "D",
  name: "sans granularite",
  description: "regle de regroupement des micro-actions retiree"
};

const LINE = "- Granularite : une etape correspond a une action d'un acteur produisant un resultat identifiable. Regroupe en une seule etape les micro-actions consecutives d'un meme acteur qui partagent le meme resultat.\n";
if (!SYSTEM_PROMPT.includes(LINE)) {
  throw new Error("Condition D : la regle de granularite est introuvable dans le prompt v2 (prompt modifie ?).");
}
const SYSTEM = SYSTEM_PROMPT.replace(LINE, "");

export function buildMessages(text) {
  return { ...buildReference(text), system: SYSTEM };
}
