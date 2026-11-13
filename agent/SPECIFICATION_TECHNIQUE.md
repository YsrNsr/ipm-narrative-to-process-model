# Spécification technique : agent de cartographie de processus

Document de référence pour le développement de l'artefact logiciel du mémoire
« Du savoir tacite au modèle explicite ». À fournir tel quel à Claude Code comme
brief de départ. Sert également de base documentaire pour les chapitres 5 et 6.

---

## 1. Objet et périmètre

L'artefact prend en entrée un texte narratif brut (transcription d'entretien,
notes) et produit une maquette de processus éditable au format XML Draw.io,
conforme au Modèle de cartographie hybride (couloirs par acteur + métadonnées
opérationnelles, logique Makigami / FIPOC). La philosophie est le peaufinage
d'une maquette pré-générée plutôt que la création depuis une page blanche.

## 2. Lien avec le mémoire (principes de conception)

| Principe | Traduction technique |
|----------|----------------------|
| PC1 Couloirs par acteur | un couloir (swimlane) par acteur dans le XML |
| PC2 Métadonnées | documents in/out, outils, temps, frictions par étape |
| PC3 Vulgarisation | notation réduite, libellés en langage courant |
| PC5 Entrée non structurée | l'API accepte du texte libre |
| PC6 Maquette éditable | sortie XML chargée dans l'éditeur Draw.io |
| PC7 Conformité au Modèle | rendu déterministe à partir d'un JSON validé |
| PC8 Peaufinage | édition et régénération dans l'éditeur intégré |
| ENF4 Confidentialité | abstraction LLM local (Ollama) vs cloud |

## 3. Architecture générale

Pipeline en deux temps (choix d'ingénierie clé) :

```
Texte brut
   --> [LLM] extraction --> JSON structuré (Modèle hybride)
   --> [validation / réparation du JSON]
   --> [rendu déterministe] --> XML Draw.io (mxGraph)
   --> [éditeur Draw.io intégré] --> peaufinage utilisateur
```

Faire produire au LLM un JSON structuré (et non directement du XML) est plus
robuste : le JSON est facile à valider et à réparer, et la conversion en XML est
déterministe, ce qui garantit la conformité au Modèle (PC7). Cette approche
reprend l'idée de représentation intermédiaire utilisée par ProMoAI.

Trois couches :
1. Présentation : page web + éditeur Draw.io intégré (iframe embed.diagrams.net).
2. Orchestration : backend Node / Express (endpoint de génération).
3. Génération : abstraction de fournisseur LLM (local ou cloud).

## 4. Stack technique recommandée

- Backend : Node.js (>= 18) + Express, modules ESM.
- LLM : abstraction unique avec trois fournisseurs interchangeables :
  - Ollama (local, open-source) via son API REST sur le port 11434.
  - OpenAI via le SDK officiel.
  - Anthropic via le SDK officiel.
- Frontend : HTML / CSS / JS sans framework, éditeur Draw.io via embed et
  protocole postMessage.
- Configuration : dotenv (fichier .env).

Node est retenu pour unifier le langage front / back et simplifier l'exécution
(npm install puis npm start). Une variante Python (FastAPI) reste possible mais
non nécessaire.

## 5. Arborescence du projet

```
artefact-starter/
  README.md
  SPECIFICATION_TECHNIQUE.md
  package.json
  .env.example
  .gitignore
  server.js                # serveur Express + routes API
  src/
    prompts.js             # prompt système + few-shot (sortie JSON)
    schema.js              # schéma du Modèle hybride + validation
    drawio.js              # rendu JSON vers XML Draw.io (mxGraph)
    repair.js              # extraction / nettoyage de la sortie LLM
    llm/
      index.js             # dispatch selon le fournisseur configuré
      ollama.js            # fournisseur local
      openai.js            # fournisseur cloud
      anthropic.js         # fournisseur cloud
  public/
    index.html             # interface
    app.js                 # appel API + chargement dans Draw.io
    style.css
  examples/
    transcript_raccordement.txt
```

## 6. Schéma du Modèle hybride (JSON intermédiaire)

```json
{
  "process": "Traitement d'une demande de raccordement",
  "actors": ["Client", "Conseiller clientèle", "Bureau technique", "Technicien terrain"],
  "steps": [
    {
      "id": "s1",
      "actor": "Client",
      "label": "Soumettre la demande",
      "documents_in": ["Formulaire de demande"],
      "documents_out": [],
      "tools": ["Portail web"],
      "duration": "10 min",
      "friction": ""
    }
  ]
}
```

Contraintes de validation : `actors` non vide ; chaque `step.actor` doit
appartenir à `actors` ; `label` obligatoire ; les champs de métadonnées sont des
chaînes ou des tableaux de chaînes (valeurs vides autorisées).

## 7. Ingénierie des prompts

- Prompt système : décrit le rôle, le schéma JSON cible et l'ordre de
  raisonnement (acteurs, puis tâches, puis enchaînement, puis métadonnées). Il
  impose une sortie JSON unique et valide, sans texte autour.
- Few-shot : un exemple court (récit vers JSON attendu) pour ancrer le format.
- Décomposition : raisonnement par étapes avant la production du JSON.
- Paramètres : température basse pour la fidélité et la reproductibilité.

## 8. Génération du XML Draw.io (mapping)

Règles de transposition JSON vers mxGraph :
- chaque acteur devient un `mxCell` conteneur de style `swimlane` ;
- chaque étape devient un `mxCell` sommet (tâche), placé dans le couloir de son
  acteur, l'abscisse dépendant de l'index de l'étape ;
- les enchaînements deviennent des `mxCell` arcs (`edge=1`) entre étapes
  consécutives ;
- les métadonnées deviennent un tableau de cellules en partie basse (une ligne
  par catégorie : Documents, Outils, Temps, Points de friction ; une colonne par
  étape).

Le rendu est entièrement déterministe (aucun appel LLM), ce qui garantit un XML
toujours bien formé et conforme au Modèle.

## 9. Abstraction de fournisseur LLM et sécurité

`src/llm/index.js` expose `extract(text)` qui choisit le fournisseur via la
variable `PROVIDER` (`ollama`, `openai` ou `anthropic`). Cela permet la
comparaison local vs cloud du mémoire :
- Ollama (local) : les données ne quittent pas la machine (conforme nLPD, ENF4).
  À privilégier pour des données d'entreprise sensibles.
- OpenAI / Anthropic (cloud) : qualité souvent supérieure, mais transmission des
  données à un tiers. À traiter comme étalon de qualité.

Les clés d'API ne sont jamais codées en dur : elles passent par .env.

## 10. API backend

- `POST /api/generate`, corps `{ "text": "...", "provider": "ollama" }`, réponse
  `{ "model": <json hybride>, "xml": "<mxGraphModel>...", "warnings": [] }`.
- `GET /api/health`, réponse `{ "status": "ok", "provider": "..." }`.

## 11. Frontend et intégration Draw.io

- Zone de texte pour la transcription, sélecteur de fournisseur, bouton Générer.
- Éditeur Draw.io intégré via embed.diagrams.net en mode embed et protocole JSON.
- Protocole postMessage : à la réception de `{event:'init'}`, le frontend envoie
  `{action:'load', xml}` ; l'utilisateur édite puis exporte.

## 12. Validation et réparation

- Le JSON renvoyé par le LLM est nettoyé (retrait d'éventuelles balises Markdown)
  puis analysé.
- En cas d'échec d'analyse ou de schéma invalide, une requête corrective unique
  est émise (le message d'erreur est renvoyé au LLM). Sinon, l'erreur est
  remontée proprement à l'interface.

## 13. Points d'évaluation (préparer le chapitre 7)

- time-on-task : horodater la génération et l'export (gain de temps).
- fidélité : journaliser le JSON généré et le JSON après peaufinage pour mesurer
  le nombre de corrections.
- utilisabilité (SUS) et charge cognitive (NASA-TLX) : questionnaires hors
  application, avec un identifiant de session pour le rapprochement.

## 14. Configuration et démarrage

```
cp .env.example .env       # renseigner le fournisseur et les clés
npm install
# option locale : installer Ollama puis 'ollama pull mistral'
npm start                  # http://localhost:3000
```

## 15. Roadmap suggérée dans Claude Code

1. Initialiser le dépôt git et installer les dépendances.
2. Faire fonctionner le pipeline avec Ollama en local sur l'exemple fourni.
3. Affiner le prompt système et le few-shot pour la fidélité.
4. Soigner le rendu de `drawio.js` (couloirs et tableau de métadonnées) pour
   coller à la figure du chapitre 6.
5. Ajouter le fournisseur cloud et comparer (qualité, temps, confidentialité).
6. Brancher l'éditeur Draw.io et le cycle de peaufinage.
7. Instrumenter les mesures d'évaluation, puis figer une version pour l'étude de
   cas.
