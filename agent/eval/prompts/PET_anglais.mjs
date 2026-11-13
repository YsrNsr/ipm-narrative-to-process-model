// Variante de prompt pour la validation externe sur le jeu PET.
// PET est en anglais : la regle v2 imposant des libelles en francais
// est remplacee par une regle de langue du texte source. Tout le reste
// du prompt v2 (gele) est conserve. Cette variante constitue une
// condition distincte, rapportee comme telle (robustesse linguistique).

import { SYSTEM_PROMPT, buildMessages as buildReference } from "../../src/prompts.js";

export const meta = {
  key: "PET",
  name: "PET (anglais)",
  description: "prompt v2, libelles dans la langue du texte source"
};

const LINE = '- Libelles en francais correct, verbe a l\'infinitif, sans anglicisme (ecris "Remplir le formulaire", jamais "Filler le formulaire").\n';
if (!SYSTEM_PROMPT.includes(LINE)) {
  throw new Error("Variante PET : la regle de langue des libelles est introuvable dans le prompt v2 (prompt modifie ?).");
}
const SYSTEM = SYSTEM_PROMPT.replace(LINE,
  "- Libelles courts, verbe a l'infinitif, rediges dans la langue du texte source.\n");

export function buildMessages(text) {
  return { ...buildReference(text), system: SYSTEM };
}
