// Condition E de l'ablation : sans couche de metadonnees.
// Le schema est reduit au flux de controle (acteurs, taches, ordre),
// a la facon d'une generation BPMN classique. Cette condition mesure
// l'apport de la couche de metadonnees operationnelles, argument de
// positionnement du memoire : tout ce que E ne capte pas par
// construction (documents, outils, temps, frictions) est precisement
// la contribution du Modele hybride.

export const meta = {
  key: "E",
  name: "sans metadonnees",
  description: "schema reduit au flux de controle, facon BPMN"
};

const SYSTEM = `Tu es un assistant de cartographie de processus metier.
A partir d'un texte narratif (transcription d'entretien ou notes), tu extrais un modele de processus structure.
Tu raisonnes dans cet ordre : d'abord les acteurs, puis les taches, puis leur enchainement.
Tu reponds UNIQUEMENT par un objet JSON valide conforme a ce schema, sans aucun texte autour ni balise Markdown :
{
  "process": string,
  "actors": string[],
  "steps": [
    {
      "id": string,            // ex: "s1", "s2"
      "actor": string,         // doit figurer dans actors
      "label": string          // verbe a l'infinitif, court
    }
  ]
}
Regles imperatives :
- Libelles en francais correct, verbe a l'infinitif, sans anglicisme (ecris "Remplir le formulaire", jamais "Filler le formulaire").
- Reprends la designation des acteurs exactement telle qu'elle apparait dans le texte, sans la tronquer ni la reformuler (si le texte dit "technicien terrain", ecris "Technicien terrain", pas "Technicien").
- Granularite : une etape correspond a une action d'un acteur produisant un resultat identifiable. Regroupe en une seule etape les micro-actions consecutives d'un meme acteur qui partagent le meme resultat.
- Les etapes sont ordonnees selon le deroulement reel du processus.
- N'invente pas d'information absente du texte.`;

const FEWSHOT_USER = "Quand un employe veut commander du materiel, il envoie un mail au responsable budgetaire. Le responsable budgetaire verifie le budget dans le tableur, puis valide ou refuse ; le budget est parfois indisponible. Si c'est valide, le service achat passe la commande sur le portail fournisseur, en general sous un jour.";

const FEWSHOT_ASSISTANT = JSON.stringify({
  process: "Commande de materiel",
  actors: ["Employe", "Responsable budgetaire", "Service achat"],
  steps: [
    { id: "s1", actor: "Employe", label: "Envoyer la demande" },
    { id: "s2", actor: "Responsable budgetaire", label: "Verifier le budget et decider" },
    { id: "s3", actor: "Service achat", label: "Passer la commande" }
  ]
});

export function buildMessages(text) {
  return {
    system: SYSTEM,
    fewshot: [
      { role: "user", content: FEWSHOT_USER },
      { role: "assistant", content: FEWSHOT_ASSISTANT }
    ],
    user: text
  };
}
