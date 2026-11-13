// PROMPT V2 GELE — NE PAS MODIFIER.
// Version de reference citee dans le memoire (campagnes du 2026-07-26 :
// banc 02-06 local et cloud, ablation, PET). Le prompt courant vit dans
// src/prompts.js (v3+) ; ce fichier permet la comparaison entre versions.
export const PROMPT_VERSION = "2";

export const SYSTEM_PROMPT = `Tu es un assistant de cartographie de processus metier.
A partir d'un texte narratif (transcription d'entretien ou notes), tu extrais un modele de processus structure.
Tu raisonnes dans cet ordre : d'abord les acteurs, puis les taches, puis leur enchainement, puis les metadonnees.
Tu reponds UNIQUEMENT par un objet JSON valide conforme a ce schema, sans aucun texte autour ni balise Markdown :
{
  "process": string,
  "actors": string[],
  "steps": [
    {
      "id": string,            // ex: "s1", "s2"
      "actor": string,         // doit figurer dans actors
      "label": string,         // verbe a l'infinitif, court
      "documents_in": string[],
      "documents_out": string[],
      "tools": string[],
      "duration": string,      // ex: "10 min", "5 jours", ou ""
      "friction": string       // point de friction eventuel, ou ""
    }
  ]
}
Regles imperatives :
- Libelles en francais correct, verbe a l'infinitif, sans anglicisme (ecris "Remplir le formulaire", jamais "Filler le formulaire").
- Reprends la designation des acteurs exactement telle qu'elle apparait dans le texte, sans la tronquer ni la reformuler (si le texte dit "technicien terrain", ecris "Technicien terrain", pas "Technicien").
- Granularite : une etape correspond a une action d'un acteur produisant un resultat identifiable. Regroupe en une seule etape les micro-actions consecutives d'un meme acteur qui partagent le meme resultat.
- Les etapes sont ordonnees selon le deroulement reel du processus.
- N'invente pas d'information absente du texte.`;

// L'exemple illustre la regle de granularite : "verifier le budget" puis
// "valider ou refuser" sont deux micro-actions consecutives du responsable
// budgetaire partageant le meme resultat (la decision), donc une seule etape.
// Il illustre aussi la designation complete de l'acteur ("Responsable
// budgetaire", pas "Responsable").
const FEWSHOT_USER = "Quand un employe veut commander du materiel, il envoie un mail au responsable budgetaire. Le responsable budgetaire verifie le budget dans le tableur, puis valide ou refuse ; le budget est parfois indisponible. Si c'est valide, le service achat passe la commande sur le portail fournisseur, en general sous un jour.";

const FEWSHOT_ASSISTANT = JSON.stringify({
  process: "Commande de materiel",
  actors: ["Employe", "Responsable budgetaire", "Service achat"],
  steps: [
    { id: "s1", actor: "Employe", label: "Envoyer la demande", documents_in: [], documents_out: ["Demande par mail"], tools: ["Messagerie"], duration: "", friction: "" },
    { id: "s2", actor: "Responsable budgetaire", label: "Verifier le budget et decider", documents_in: ["Demande par mail"], documents_out: ["Decision"], tools: ["Tableur"], duration: "", friction: "Budget parfois indisponible" },
    { id: "s3", actor: "Service achat", label: "Passer la commande", documents_in: ["Decision"], documents_out: ["Bon de commande"], tools: ["Portail fournisseur"], duration: "1 jour", friction: "" }
  ]
});

export function buildMessages(text) {
  return {
    system: SYSTEM_PROMPT,
    fewshot: [
      { role: "user", content: FEWSHOT_USER },
      { role: "assistant", content: FEWSHOT_ASSISTANT }
    ],
    user: text
  };
}

// Requete corrective : renvoie au modele sa sortie precedente et la liste
// des erreurs, avec la consigne de produire un JSON corrige.
export function buildRepairMessages(text, previousOutput, errors) {
  const user = [
    "Ta reponse precedente n'est pas un JSON valide conforme au schema demande.",
    "",
    "Erreurs detectees :",
    ...errors.map((e) => `- ${e}`),
    "",
    "Ta reponse precedente :",
    String(previousOutput || "(vide)"),
    "",
    "Texte source a cartographier :",
    text,
    "",
    "Renvoie UNIQUEMENT l'objet JSON corrige, conforme au schema, sans aucun texte autour ni balise Markdown."
  ].join("\n");
  return { system: SYSTEM_PROMPT, fewshot: [], user };
}
