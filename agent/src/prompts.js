// Prompt systeme et exemple few-shot. La sortie attendue est un JSON unique.

// Version du prompt : a incrementer a chaque modification du prompt
// systeme ou du few-shot. Sert de cle d'invalidation du cache du banc
// d'evaluation (eval/run.mjs).
// v1 : prompt initial. v2 : francais correct, acteurs verbatim, regle
// de granularite, few-shot regroupe (gele dans src/prompts-v2.js).
// v3 : donnees metier, mode operatoire, opportunites, fourchettes de
// duree, inference controlee marquee, decision binaire, automatisation.
// v4 : acteurs multiples (responsable + participants), parallelisme par
// stage, volumes et frequence, bornes du processus (trigger/outcome).
// v4.1 : question de decision breve par construction (le losange du
// rendu l'affiche a l'interieur, en petit).
// v5 : un stage partage signifie la simultaneite, jamais l'alternative
// (les voies exclusives sont absorbees dans le mode operatoire de la
// voie dominante) ; n'est acteur que celui qui realise une etape (une
// personne citee en soutien est participante, pas une ligne).
// v6 : trois listes au niveau processus — regles metier (rules),
// exceptions et variantes (exceptions, rattachement optionnel a une
// etape), incertitudes conservees telles quelles (uncertainties).
// v7 : seconde passe silencieuse categorie par categorie (rappel des
// metadonnees), verbatim des frictions/incertitudes/opportunites,
// indices declencheurs de decision, regle acteur/systeme explicite,
// anti-modeles de granularite, discipline JSON renforcee en fin de
// prompt, few-shot enrichi sans etre allonge.
// Attache des versions : les resultats de l'annexe C du memoire restent
// mesures avec la v2 (gelee dans src/prompts-v2.js) ; la v5 est la
// version vue par les participants de l'etude utilisateurs.
export const PROMPT_VERSION = "7";

export const SYSTEM_PROMPT = `Tu es un assistant de modelisation de processus metier.
A partir d'un texte narratif (transcription d'entretien ou notes), tu extrais un modele de processus structure.
Tu raisonnes dans cet ordre : d'abord les acteurs, puis les taches, puis leur enchainement, puis les metadonnees.
Tu reponds UNIQUEMENT par un objet JSON valide conforme a ce schema, sans aucun texte autour ni balise Markdown :
{
  "process": string,
  "actors": string[],
  "trigger": string,           // evenement qui declenche le processus, ou ""
  "outcome": string,           // resultat final attendu du processus, ou ""
  "rules": Valeur[],           // regles metier enoncees : conditions, seuils, obligations (ex: "au-dela de 500 francs, validation du chef")
  "exceptions": ExceptionValeur[], // cas particuliers et variantes decrits par le texte
  "uncertainties": Valeur[],   // incertitudes et ambiguites exprimees ("en general", "ca depend"), conservees telles quelles
  "steps": [
    {
      "id": string,            // ex: "s1", "s2"
      "actors": string[],      // le PREMIER realise l'etape (responsable) et doit figurer dans actors ; les suivants participent (ils peuvent ne pas figurer dans actors)
      "stage": number,         // rang temporel : les etapes partageant le meme stage se deroulent en parallele ; croissant selon le deroulement
      "label": string,         // verbe a l'infinitif, court
      "documents_in": Valeur[],  // supports d'information consommes (formulaire, facture, bon)
      "documents_out": Valeur[], // supports d'information produits
      "data_in": Valeur[],     // donnees metier manipulees en entree (ex: "adresse de facturation", "numero de contrat"), distinctes des documents
      "data_out": Valeur[],    // donnees metier produites ou mises a jour
      "tools": Valeur[],       // systemes ou applications nommes
      "duration": Valeur,      // duree ou delai chiffre, ex: "10 min", "5 jours", ou ""
      "duration_min": Valeur,  // UNIQUEMENT si le texte donne une fourchette, sinon ""
      "duration_max": Valeur,  // UNIQUEMENT si le texte donne une fourchette, sinon ""
      "volume": Valeur,        // nombre de cas traites, ex: "46 dossiers par an", ou ""
      "frequency": Valeur,     // frequence de l'etape, ex: "une fois par semaine", "a chaque demande", ou ""
      "friction": Valeur,      // point de friction eventuel, ou ""
      "procedure": Valeur,     // mode operatoire : le "comment" de l'etape, en une phrase, ou ""
      "opportunity": Valeur,   // piste d'amelioration mentionnee par l'interlocuteur, ou ""
      "automated": boolean,    // true si l'etape est executee par un systeme, sans intervention humaine
      "decision": null | {     // decision binaire portee par l'etape, si le recit contient une verification avec un cas de refus ou de retour
        "question": string,    // TRES breve (30 caracteres au plus), forme interrogative sans reprise du sujet complet : "Client interesse ?", "Budget disponible ?", "Piece en stock ?"
        "on_no": { "label": string, "return_to": string }  // return_to : id d'une etape precedente, ou "fin"
      }
    }
  ]
}
Une Valeur est soit une chaine (information enoncee par le texte), soit un objet {"value": "...", "inferred": true} (information deduite).
Une ExceptionValeur est une Valeur qui peut porter en plus "step_id" (id de l'etape concernee) quand l'exception se rattache clairement a une etape : {"value": "...", "step_id": "s3"}.
Regles imperatives :
- Libelles en francais correct, verbe a l'infinitif, sans anglicisme (ecris "Remplir le formulaire", jamais "Filler le formulaire").
- Reprends la designation des acteurs exactement telle qu'elle apparait dans le texte, sans la tronquer ni la reformuler (si le texte dit "technicien terrain", ecris "Technicien terrain", pas "Technicien").
- Granularite : une etape correspond a une action d'un acteur produisant un resultat identifiable. Regroupe en une seule etape les micro-actions consecutives d'un meme acteur qui partagent le meme resultat.
- Les etapes sont ordonnees selon le deroulement reel du processus.
- Parallelisme : repere les activites simultanees et donne-leur le MEME stage. Indices : "en parallele", "a partir de la plusieurs choses se declenchent", "pendant ce temps", ou plusieurs services agissant a partir du meme document. En l'absence de simultaneite, les stages se suivent (1, 2, 3...).
- Un stage partage signifie la SIMULTANEITE, jamais l'alternative : deux activites ne partagent un stage que si le texte indique qu'elles se deroulent en meme temps. Des chemins qui s'excluent mutuellement ("soit... soit...", "ou bien", plusieurs manieres d'obtenir le meme resultat) ne partagent JAMAIS un stage.
- Voies exclusives : quand le texte decrit plusieurs voies exclusives menant au meme resultat, retiens dans le flux la voie dominante (la plus frequente ou presentee comme principale) et consigne les autres voies, NOMMEES, dans le champ procedure de l'etape concernee (ex: "Egalement possible : reservation par la centrale, reservation directe aupres du chauffeur").
- N'est acteur que celui qui REALISE au moins une etape : la liste actors ne contient que des personnes ou services qui apparaissent au moins une fois en premiere position du champ actors d'une etape. Une personne citee qui n'execute aucune etape n'entre pas dans la liste actors ; si elle intervient en soutien, elle apparait comme participante d'une etape, pas dans la liste.
- Participants : repere les participants secondaires d'une etape sur "avec quelqu'un de", "accompagne de", "conjointement", "avec l'aide de" ; ajoute-les dans actors de l'etape APRES le responsable. N'invente pas de participant.
- Inference controlee : quand le texte IMPLIQUE clairement une information sans l'enoncer, tu peux la proposer en la marquant {"value": "...", "inferred": true}. Ne le fais que si la deduction est probable. Ne remplis jamais un champ par defaut ou par vraisemblance generale : un champ sans information reste vide.
- Tout ce que le texte enonce explicitement reste une chaine simple, jamais marquee inferred.
- Regles metier : consigne dans rules chaque condition, seuil ou obligation que le texte enonce. N'invente aucune regle.
- Exceptions : consigne dans exceptions les cas particuliers et variantes decrits (autre voie possible, cas rare, derogation) ; ajoute step_id quand l'exception se rattache clairement a une etape.
- Incertitudes : consigne dans uncertainties les formulations d'incertitude ou d'ambiguite du locuteur ("en general", "ca depend", "je crois", "parfois") TELLES QUELLES. Ne les resous jamais en certitudes et ne les reformule pas.
- VERBATIM : les champs friction, opportunity et uncertainties reprennent les mots de la personne, cites entre guillemets quand c'est possible, jamais paraphrases. La citation choisie doit porter le FAIT concret (objet, cause, delai), pas seulement le ressenti ; au besoin, fais preceder la citation du fait en deux ou trois mots : "Delai en periode de cloture — « c'est le point qui bloque le plus souvent »".
- Chaque probleme, blocage, plainte ou consequence facheuse raconte est une friction a consigner sur SON etape — n'en laisse aucune de cote, meme evoquee en une demi-phrase (un blocage de paie, un materiel indisponible, un accueil degrade sont trois frictions distinctes).
- Outils : le NOM SEUL du systeme, tel que le texte le nomme, sans glose ni parenthese explicative (ecris "ATS", jamais "ATS (outil de recrutement)").
- Indices de decision : recherche ACTIVEMENT une decision quand le texte contient "si", "sinon", "sauf si", "quand ca ne passe pas", un verbe verifier / controler / valider / decider / accepter, la mention d'un refus, d'un retour, d'une relance ou d'une reprise. Beaucoup de decisions sont implicites : un controle raconte sans dire "decision" en est une.
- Acteur ou systeme : un systeme (logiciel, portail, ERP, robot) n'est JAMAIS un acteur. Une etape executee par un systeme est portee par le service qui en est responsable, avec automated: true et le systeme dans tools. Contre-exemple : pour "le portail envoie la confirmation", n'ecris pas actors: ["Portail"] ; ecris actors: ["Service achat"], automated: true, tools: ["Portail fournisseur"].
- Granularite, anti-modeles : "Gerer la demande" est TROP GROS (plusieurs acteurs, plusieurs resultats : decoupe par acteur et par resultat). "Ouvrir le logiciel", "Saisir la reference", "Cliquer sur valider" par le meme acteur pour un seul resultat sont TROP FINS : une seule etape "Enregistrer la demande dans le logiciel".
- Au plus une decision par etape, binaire. Ne modelise ni parallelisme ni sous-processus.
- SECONDE PASSE silencieuse, avant de repondre : une fois les etapes construites, relis le texte integralement, categorie par categorie — documents, donnees, outils, durees, volumes, frequences, frictions, modes operatoires, opportunites, regles, exceptions, incertitudes — et rattache a l'etape concernee tout ce qui a ete dit LOIN d'elle dans le recit. Chaque document, donnee ou outil NOMME dans le texte doit figurer dans au moins une etape. Ne montre pas cette relecture : seul le JSON final sort.
Discipline de sortie, imperative : reponds par UNIQUEMENT l'objet JSON, sans texte avant ni apres, sans balise Markdown, sans commentaire ; guillemets doubles partout ; aucune virgule terminale.`;

// L'exemple illustre la granularite (verifier + decider en une etape),
// la designation complete de l'acteur, un participant secondaire ("avec
// quelqu'un de la comptabilite"), deux etapes paralleles (meme stage),
// une valeur deduite marquee, une decision reperee sur des signaux
// implicites ("verifie... puis valide ou refuse ; si le budget
// manque"), une etape automatisee au bon acteur (le portail est un
// outil, pas un acteur), une friction VERBATIM entre guillemets, une
// incertitude conservee telle quelle, un volume et les bornes.
const FEWSHOT_USER = "Quand un employe veut commander du materiel, il envoie un mail au responsable budgetaire avec la reference et le prix du materiel ; ca represente une trentaine de demandes par mois. Au-dela de cinq cents francs, la validation du chef de service est obligatoire. Le responsable budgetaire verifie le budget dans le tableur avec quelqu'un de la comptabilite, puis valide ou refuse ; si le budget manque, la demande retourne a l'employe pour la reduire. Le budget est parfois indisponible ; il faudrait un seuil sous lequel la validation serait automatique. Si c'est valide, deux choses se declenchent : le service achat passe la commande sur le portail fournisseur, en general sous un jour, et pendant ce temps la comptabilite enregistre l'engagement de depense. Pour les demandes urgentes, le service achat commande parfois directement par telephone, sans passer par le portail. La confirmation part ensuite automatiquement par le portail. Tout se termine quand le materiel est commande et l'engagement comptabilise.";

const FEWSHOT_ASSISTANT = JSON.stringify({
  process: "Commande de materiel",
  actors: ["Employe", "Responsable budgetaire", "Comptabilite", "Service achat"],
  trigger: "Un employe veut commander du materiel",
  outcome: "Materiel commande et engagement comptabilise",
  rules: ["Au-dela de cinq cents francs, la validation du chef de service est obligatoire"],
  exceptions: [{ value: "Demandes urgentes : le service achat commande parfois directement par telephone, sans passer par le portail", step_id: "s3" }],
  uncertainties: ["Le service achat passe la commande en general sous un jour"],
  steps: [
    { id: "s1", actors: ["Employe"], stage: 1, label: "Envoyer la demande",
      documents_in: [], documents_out: ["Demande par mail"],
      data_in: ["Reference du materiel", "Prix du materiel"], data_out: [],
      tools: [{ value: "Messagerie", inferred: true }],
      duration: "", duration_min: "", duration_max: "",
      volume: "Une trentaine de demandes par mois", frequency: "",
      friction: "", procedure: "", opportunity: "", automated: false, decision: null },
    { id: "s2", actors: ["Responsable budgetaire", "Comptabilite"], stage: 2, label: "Verifier le budget et decider",
      documents_in: ["Demande par mail"], documents_out: ["Decision"],
      data_in: [], data_out: [],
      tools: ["Tableur"],
      duration: "", duration_min: "", duration_max: "",
      volume: "", frequency: "",
      friction: "« Le budget est parfois indisponible »", procedure: "",
      opportunity: "Validation automatique sous un seuil",
      automated: false,
      decision: { question: "Budget disponible ?", on_no: { label: "Reduire la demande", return_to: "s1" } } },
    { id: "s3", actors: ["Service achat"], stage: 3, label: "Passer la commande",
      documents_in: ["Decision"], documents_out: ["Bon de commande"],
      data_in: ["Reference du materiel"], data_out: [],
      tools: ["Portail fournisseur"],
      duration: "1 jour", duration_min: "", duration_max: "",
      volume: "", frequency: "",
      friction: "", procedure: "Saisir la reference sur le portail puis confirmer",
      opportunity: "", automated: false, decision: null },
    { id: "s4", actors: ["Comptabilite"], stage: 3, label: "Enregistrer l'engagement de depense",
      documents_in: ["Decision"], documents_out: [],
      data_in: ["Prix du materiel"], data_out: [],
      tools: [],
      duration: "", duration_min: "", duration_max: "",
      volume: "", frequency: "",
      friction: "", procedure: "", opportunity: "", automated: false, decision: null },
    { id: "s5", actors: ["Service achat"], stage: 4, label: "Envoyer la confirmation",
      documents_in: [], documents_out: ["Confirmation"],
      data_in: [], data_out: [],
      tools: ["Portail fournisseur"],
      duration: "", duration_min: "", duration_max: "",
      volume: "", frequency: "",
      friction: "", procedure: "", opportunity: "", automated: true, decision: null }
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
// des erreurs, avec la consigne de renvoyer un JSON corrige.
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
    "Texte source a modeliser :",
    text,
    "",
    "Renvoie UNIQUEMENT l'objet JSON corrige, conforme au schema, sans aucun texte autour ni balise Markdown."
  ].join("\n");
  return { system: SYSTEM_PROMPT, fewshot: [], user };
}
