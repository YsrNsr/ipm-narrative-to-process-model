# Agent MIP

*L'IA structure, le métier valide, l'analyste formalise.*

> **Version gelée pour le mémoire : prompt v7, défaut claude-opus-5.
> Seules les corrections de défauts sont admises jusqu'à la fin de
> l'évaluation.** (tag `v5.0-memoire`)

Agent MIP transforme un ou plusieurs récits de processus (transcriptions
d'entretiens, notes d'atelier) en un **modèle intermédiaire de processus
(grille MIP)** éditable : grille Makigami (acteurs × étapes), métadonnées
opérationnelles par étape, règles/exceptions/incertitudes, matrice de
responsabilités. L'ébauche générée par l'IA est ensuite **relue et corrigée**
dans l'éditeur Draw.io intégré, validée avec le métier, puis exportée vers les
formats de travail de l'analyste (fiche, CSV, liste de validation, questions
d'entretien, BPMN 2.0).

Issu du mémoire « Du savoir tacite au modèle explicite » (Université de
Genève, CUI, méthode Design Science Research), l'outil est développé pour
être utilisable au-delà du mémoire par de vrais analystes de processus.

**Versions du prompt.** Les résultats de l'annexe C du mémoire restent
attachés au prompt **v2**, gelé dans `src/prompts-v2.js` — ce fichier et les
rapports existants de `eval/results/` ne doivent jamais être modifiés. La
**v5** est la version vue par les participants de l'étude utilisateurs. La
**v6** a ajouté règles métier, exceptions rattachables et incertitudes. La
version courante est la **v7** (`src/prompts.js`) : seconde passe silencieuse
de relecture par catégorie, verbatim des frictions/incertitudes/opportunités
(le fait concret + la citation), indices déclencheurs de décision, règle
acteur/système explicite, anti-modèles de granularité, discipline JSON
renforcée.

## Le poste de travail

L'interface (HTML, CSS et JavaScript natifs, sans build ni bibliothèque) est
organisée en trois zones :

- **Panneau gauche — entrée et options.** Entretiens en blocs nommés
  (collage direct ou glisser-déposer de fichiers `.txt`/`.md`, compteur de
  mots, découpage automatique de l'ancien séparateur `=== ENTRETIEN ===`) ;
  les transcriptions de sous-titrage `.vtt`/`.srt` (Teams, Zoom, Whisper)
  sont converties localement en « Locuteur : texte », horodatages retirés,
  locuteurs conservés. Choix du fournisseur **et du modèle** (persisté d'une
  visite à l'autre), aide à l'anonymisation avant envoi cloud (détection
  locale de noms répétés, sigles, mails et téléphones — une aide, pas une
  garantie), sélecteur de sorties, bouton de génération avec progression par
  étapes, temps écoulé et ordre de grandeur tiré des générations passées du
  même fournisseur et modèle, et bouton **Annuler** (la requête déjà partie
  chez le fournisseur se termine côté serveur, son résultat est ignoré).
- **Éditeur central.** La grille MIP dans l'éditeur Draw.io intégré
  (embed.diagrams.net). Chaque modification est autosauvegardée dans la
  session ; l'effort d'édition est mesuré.
- **Dictée d'entretien** *(expérimental)* : un bouton micro par bloc
  utilise la reconnaissance vocale du navigateur (fr-CH, repli fr-FR) —
  aucune dépendance lourde, rien n'est envoyé au serveur Agent MIP pendant
  la dictée (la reconnaissance du navigateur peut, elle, passer par le
  service du navigateur). La distinction des locuteurs est assumée
  manuellement : bascule « Intervieweur / Métier » d'un clic ou avec F2,
  chaque segment finalisé est préfixé du locuteur actif. Le texte dicté
  reste éditable et suit ensuite le même chemin qu'un texte collé. Si le
  navigateur ne supporte pas l'API, le bouton est désactivé avec un
  message clair.
- **Panneau droit — liste de validation.** Les points à parcourir avec le
  métier (valeurs déduites, incertitudes, règles, décisions, contradictions,
  manques, questions de suivi), cochables en séance, avec compteur de points
  restants. Le bouton « Marquer comme validé par le métier » fige l'état
  validé : c'est **l'artefact de référence** de la session, distinct de la
  sortie brute de l'IA et des sauvegardes de relecture.

La barre d'en-tête affiche le modèle sélectionné et le fournisseur actif
(badge « local : les données ne quittent pas la machine » ou « cloud :
transcription envoyée à un service externe ») et ouvre l'**historique** :
chaque génération est une session journalisée (`logs/sessions/`), avec
statut (ébauche générée → corrigée → validée métier), provenance (version du
prompt, modèle, durée), réouverture de la grille, comparaison lisible entre
sortie brute et version courante, renommage (crayon — le nom personnalisé
prime ensuite partout, noms de fichiers compris), téléchargement des exports
et **« Télécharger d'autres pages »** : n'importe quel sous-ensemble de
pages se recompose depuis le modèle journalisé, sans nouvel appel LLM —
rien n'est perdu, tout est re-dérivable.

## Sorties disponibles

**Pages du fichier Draw.io** (un seul fichier, pages cochées dans le
sélecteur, champ `pages` de la génération) :

| Page | Contenu |
|---|---|
| Grille MIP (Makigami) | la référence — cochée par défaut, désormais optionnelle comme les autres (sans elle, l'effort d'édition n'est pas mesuré) |
| Modèle de processus seul | le déroulement sans les métadonnées : couloirs, cartes, décisions, flux ; mode opératoire et durée en infobulle |
| BPMN *(expérimental)* | vue BPMN native Draw.io colorée : pool et lanes en vrais conteneurs, parallélisme en passerelles ET, terminaisons étiquetées, exceptions en annotations, retouchable dans l'éditeur |
| Matrice de responsabilités (RACI) | cochée par défaut (composition historique) |
| SIPOC | Fournisseurs, Entrées, Processus (macro-étapes), Sorties, Clients — dérivé du modèle, cellules vides plutôt qu'inventées |
| Analyse | une ligne par constat (frictions, opportunités, règles, exceptions, incertitudes, verbatim), durées, synthèse d'analyste — la préparation d'atelier |

Au moins une page doit être cochée. L'export PNG rend la **page choisie**
dans un sélecteur ; tous les fichiers téléchargés prennent un nom dérivé du
processus (« demande-de-conges.csv », « demande-de-conges-bpmn.png »…), et
le lien du fichier Draw.io annonce son contenu réel (« Fichier Draw.io
(4 pages) »).

**Fichiers à télécharger** (après génération, selon les cases cochées) :

| Fichier | Format | Route |
|---|---|---|
| Fiche processus (avec « Lecture d'analyste ») | `.md` | `GET /api/session/:id/export.md` |
| Tableau pour tableur (BOM UTF-8, `;`) | `.csv` | `GET /api/session/:id/export.csv` |
| Liste de validation (cases fidèles au panneau, date de pointage) | `.md` | `GET /api/session/:id/export-validation.md` |
| Questions pour l'entretien de suivi | `.md` | `GET /api/session/:id/export-questions.md` |
| BPMN pour import dans un autre outil (bpmn.io / Camunda) | `.bpmn` | `GET /api/session/:id/export.bpmn` |
| Modèle extrait brut, joli-imprimé (matière première scriptable) | `.json` | `GET /api/session/:id/export.json` |

Le bloc de résultat propose aussi un repli « Voir le modèle extrait (JSON) »
en lecture seule.

Les deux sorties BPMN (page Draw.io et fichier `.bpmn`) dérivent de la même
correspondance (`src/bpmn-map.js`) et ne peuvent pas diverger ; le
commentaire d'en-tête du `.bpmn` liste ce qui est transposé et ce qui est
dégradé en documentation.

## Prérequis

- Node.js 18 ou plus (testé avec Node 22).
- Un fournisseur LLM au choix. Le **modèle se choisit dans l'interface**
  (sélecteur sous le fournisseur, persisté d'une visite à l'autre) ; les
  listes proposées sont configurables (`ANTHROPIC_MODELS`, `OPENAI_MODELS`,
  noms séparés par des virgules ; Ollama liste les modèles réellement
  installés), le défaut par fournisseur restant `OLLAMA_MODEL`,
  `OPENAI_MODEL`, `ANTHROPIC_MODEL`. Priorité : choix de l'interface >
  variable d'environnement > défaut du code. L'en-tête affiche le modèle
  sélectionné :
  - **Ollama** en local (confidentialité : les données ne quittent pas la
    machine) — https://ollama.com puis `ollama pull mistral`. Sur une machine
    sans GPU adapté, compter 10 à 20 minutes par génération ; mettre
    `OLLAMA_NUM_GPU=0` si le GPU manque de mémoire.
  - **Anthropic** ou **OpenAI** (cloud) : une clé d'API. Aucune clé n'est
    stockée dans le code : tout passe par `.env` (jamais versionné).
    Défaut Anthropic : `claude-opus-5` — plus capable, mais plus lent et
    plus cher par génération ; alternative économique : `claude-sonnet-4-6`.
    Les chiffres archivés du banc (annexe C) restent attachés au modèle
    avec lequel ils ont été mesurés ; pour comparer, rejouer le banc (le
    cache est indexé par modèle).

## Installation et démarrage

```
git clone <depot> agent-mip
cd agent-mip
npm install
copy .env.example .env       # cp sous Linux/macOS
npm start                    # http://localhost:3000
```

`.env` minimal :

```
PROVIDER=ollama              # ou anthropic, ou openai
ANTHROPIC_API_KEY=...        # si PROVIDER=anthropic (clé factice ici)
LLM_TIMEOUT_MS=1800000       # delai fournisseur, defaut 30 min
GROUNDING_THRESHOLD=0.7      # seuil de la verification d'ancrage
```

Premier essai en trente secondes : « Charger l'exemple : demande de
congés » (récit de référence du mémoire, `examples/transcript_conges.txt` ;
`examples/transcript_raccordement.txt` reste la transcription du corpus
d'évaluation), « Générer la grille MIP », relire la grille, cocher la liste
de validation, « Marquer comme validé par le métier », rouvrir depuis
l'historique.

## Installer en une commande (Docker)

Pour un collègue qui ne connaît rien à Node : avec Docker installé, depuis
le dossier du projet (qui contient un `.env` rempli, voir ci-dessus) :

```
docker build -t agent-mip .
docker run -d -p 3000:3000 --name agent-mip ^
  -v "%cd%\.env:/app/.env:ro" -v "%cd%\logs:/app/logs" agent-mip
```

(Windows `cmd` ; sous PowerShell remplacer `%cd%` par `${PWD}`, sous
Linux/macOS par `$PWD` et `^` par `\`.) L'outil est sur
http://localhost:3000 ; le `.env` est monté en lecture seule (jamais copié
dans l'image) et `logs/` est monté pour que l'historique des sessions
survive au conteneur.

Ollama tournant sur le poste hôte n'est pas joignable via `localhost`
depuis le conteneur : mettre `OLLAMA_URL=http://host.docker.internal:11434`
dans le `.env` (sous Linux, ajouter `--add-host=host.docker.internal:host-gateway`
au `docker run`). Arrêt : `docker stop agent-mip`.

### Déploiement partagé

Dès que l'outil quitte le poste local, activer le jeton d'accès :
`AUTH_TOKEN=un-secret-long` dans le `.env`. Toutes les routes `/api/*`
l'exigent alors (l'interface le demande au premier accès et le garde pour
la durée de l'onglet) ; vide, rien ne change au comportement de poste
local. Mettre l'outil derrière un reverse proxy HTTPS, par exemple avec
Caddy :

```
mon-hote.example.ch {
    reverse_proxy localhost:3000
}
```

Le jeton protège l'accès réseau, mais les transcriptions restent **en
clair sur le disque du serveur** (`logs/sessions/`) : l'anonymisation
avant génération reste la première mesure de protection des personnes
interrogées.

### Cycle de vie des sessions

Les sessions contiennent des transcriptions d'entretiens : une personne
interrogée doit pouvoir demander l'effacement du sien (nLPD).

- **Supprimer une session** : bouton « Supprimer » dans l'historique
  (double confirmation) ou `DELETE /api/session/:id`. La session part
  dans `logs/sessions/corbeille/` (fichier horodaté), jamais d'effacement
  brut : c'est le filet de sécurité. **Vider `corbeille/` est
  l'effacement définitif**, à faire à la main après confirmation de la
  demande.
- **Rétention automatique** : `SESSION_RETENTION_DAYS=90` dans le `.env`
  déplace en corbeille, au démarrage du serveur, les sessions plus
  anciennes (une ligne de journal par session, total affiché — jamais de
  purge silencieuse). Vide par défaut : rien n'expire.
- **Purge manuelle** sans démarrer le serveur :
  `npm run purge -- --days 30` (récapitulatif puis confirmation ;
  `--yes` pour l'automatisation, `--dir` pour un autre dossier).
- `LOGS_DIR` déplace tout le journal (c'est le dossier que le conteneur
  Docker monte en volume).

## Ce que fait le pipeline

1. **Extraction** par le fournisseur choisi (prompt v7) : acteurs, étapes
   (responsable + participants, parallélisme par étage, décisions binaires),
   métadonnées, bornes, règles, exceptions, incertitudes. Un étage partagé
   signifie la simultanéité, jamais l'alternative ; n'est acteur que celui
   qui réalise une étape.
2. **Validation / réparation** : une requête corrective unique en cas de
   sortie invalide, puis échec propre (jamais de reprise silencieuse).
3. **Vérification d'ancrage** (`src/grounding.js`) : toute valeur non
   soutenue par le texte est marquée « ≈ à vérifier » (union avec
   l'auto-déclaration du modèle) ; chaque valeur ancrée porte sa phrase
   source (ligne + extrait), visible en infobulle et dans les exports.
4. **Rendu déterministe** (`src/drawio.js`) : tables natives Draw.io,
   synthèse calculée (dont étape dominante en temps et couple d'acteurs le
   plus sollicité), conventions documentées dans la légende contextuelle,
   garanties géométriques vérifiées par les tests (aucune flèche à travers
   une carte, aucune superposition).
5. **Fusion multi-entretiens** (`src/merge.js`) le cas échéant : union des
   métadonnées avec source tracée, contradictions signalées, jamais
   tranchées.

## Repli hors ligne

L'éditeur intégré charge `embed.diagrams.net`. Si ce domaine est
inaccessible (poste isolé, proxy), le pipeline fonctionne intégralement :
générez, puis téléchargez la grille `.drawio` et ouvrez-la dans
l'application de bureau Draw.io (https://get.diagrams.net, fonctionne sans
réseau). Les exports fiche, CSV, validation, questions et BPMN ne dépendent
pas de l'éditeur. Avec `PROVIDER=ollama`, aucune donnée ne quitte la
machine.

## API

Toutes les routes renvoient du JSON sauf mention contraire. Aucune
authentification : l'outil est conçu pour un poste local.

| Méthode et route | Rôle |
|---|---|
| `GET /api/health` | état du serveur, fournisseur configuré et modèles résolus par fournisseur |
| `GET /api/models` | modèles proposables par fournisseur (listes configurables, Ollama interrogé en direct), défaut en tête |
| `GET /api/example` | transcription d'exemple (texte brut) |
| `POST /api/generate` | corps `{ text, provider }` ou `{ texts: [..], provider }` (multi-entretiens : extractions en parallèle, limite 3 en cloud, séquentiel en Ollama), plus `model` (choix de l'interface) et `pages` parmi Makigami, Processus, BPMN, RACI, SIPOC, Analyse (composition du fichier, grille MIP comprise ; absent = Makigami + RACI ; au moins une page) ; répond `{ sessionId, model, xml, warnings, ms, repaired, repairCount, provider, llmModel, promptVersion, slug }` ; `422` si aucun processus reconnaissable |
| `PATCH /api/session/:id` | corps `{ name }` : renomme la session (vide : retour au nom extrait) ; le nom personnalisé prime partout |
| `POST /api/session/:id/final` | corps `{ xml }` : autosauvegarde de relecture, mesure d'effort d'édition |
| `POST /api/session/:id/validate-metier` | corps `{ xml }` : fige l'état validé métier (`xmlValidated`, `validatedAt`) |
| `POST /api/session/:id/validation-state` | corps `{ state }` : état des cases de la liste de validation |
| `GET /api/sessions` | historique (résumés : statut, composition `pages`, effort d'édition) |
| `GET /api/session/:id` | détail : modèle, XML courant, état de validation |
| `GET /api/session/:id/diff` | comparaison lisible sortie brute → version courante (ajouts, suppressions, renommages, réattributions) |
| `GET /api/session/:id/validation-list` | liste de validation + questions de suivi (JSON du panneau) |
| `GET /api/session/:id/render.drawio?pages=BPMN,SIPOC` | recompose à la demande n'importe quel sous-ensemble de pages depuis le modèle journalisé, sans appel LLM (insensible à la casse, pages inconnues ignorées ; sans paramètre : composition d'origine) |
| `GET /api/session/:id/export.csv` `.md` `-validation.md` `-questions.md` `.bpmn` `-raci.drawio` `.json` | exports (fichiers nommés d'après le processus) |

## Tests et évaluation

```
npm test                       # 20 suites hors ligne, aucun appel LLM
node eval/run.mjs --provider anthropic --only "02,03,04,05,06"
node eval/ablation.mjs --provider anthropic
node eval/pet.mjs --provider anthropic --docs 12
node eval/grounding-eval.mjs   # hors ligne
```

Les tests utilisent un fournisseur factice (`options.impl`) : jamais d'appel
LLM réel. Les rapports d'évaluation sont horodatés dans `eval/results/`
(non versionnés, ceux du mémoire sont gelés).

### Recette de vérification manuelle avant gel

À dérouler dans un navigateur, dans l'ordre, avec le résultat attendu :

1. **Charger l'exemple congés et générer.** Sur la grille, chaque branche
   « non » est un segment vertical court vers la carte rouge sous son
   losange, et le retour vers l'étape 1 longe l'extérieur de la table
   (dessous puis à gauche), jamais à travers les colonnes.
2. **Générer avec les six pages cochées et parcourir les onglets.**
   Grille MIP, Processus, BPMN, RACI, SIPOC et Analyse existent toutes et
   portent le même processus.
3. **Ajouter une lane à la main sur la page BPMN.** Le pool se recompose
   autour de la nouvelle lane sans casser les conteneurs.
4. **Exporter le PNG d'une page non principale** (SIPOC par exemple) via
   le sélecteur. Le fichier `<processus>-sipoc.png` contient bien la page
   choisie, pas la première.
5. **Importer un `.vtt` avec locuteurs** sur un bloc d'entretien. Le
   texte apparaît en « Nom : texte », sans horodatages ni numéros.
6. **Dicter trente secondes avec bascule de locuteurs** (clic ou F2). Les
   segments sont préfixés du locuteur actif et restent éditables.
7. **Annuler une génération en cours.** Message « Génération annulée »
   sans bouton réessayer ; la session apparaît quand même dans
   l'historique une fois la requête serveur terminée.
8. **Vérifier la ligne de provenance** sous le résultat : prompt v7, le
   modèle choisi dans le sélecteur et la durée y figurent.
9. **Activer `AUTH_TOKEN` dans `.env` et redémarrer.** Au premier geste
   de l'interface, une invite demande le jeton, puis tout fonctionne ;
   un nouvel onglet le redemande (sessionStorage).
10. **Supprimer une session de test depuis l'historique.** Deux
    confirmations nomment le processus ; le fichier se retrouve horodaté
    dans `logs/sessions/corbeille/`.
11. **Lancer l'aide à l'anonymisation** sur un texte avec un prénom
    répété et appliquer un remplacement. Le texte des blocs est modifié
    partout, avant tout envoi.
12. **Cocher des points de validation puis exporter la liste.** L'export
    `.md` rend les mêmes cases `[x]` avec la date du pointage.

## Structure du projet

```
server.js               serveur Express (generation, sessions, exports, API)
src/
  prompts.js            prompt v7 (courant) ; prompts-v2.js = v2 GELE
  schema.js             validation et normalisation du modele (MIP)
  llm/                  fournisseurs (ollama, openai, anthropic) + reparation
  grounding.js          verification d'ancrage et provenance
  names.js              slug de fichiers, nom de session, pages derivables
  drawio.js             rendu XML Draw.io (grille + matrice) et gabarit
  drawio-analyst.js     pages SIPOC et Analyse (calcul + rendu)
  drawio-parse.js       relecture XML -> modele (relecture et correction)
  editdistance.js       effort d'edition et comparaison lisible
  merge.js              fusion multi-entretiens
  export.js             exports CSV et fiche Markdown
  validation-list.js    liste de validation (six familles)
  questions.js          questions d'entretien de suivi
  bpmn-map.js           correspondance MIP -> BPMN, partagee par les 2 sorties
  export-bpmn.js        fichier .bpmn (conversion + BPMNDiagram minimal)
  drawio-bpmn.js        page BPMN native Draw.io (pool/lanes conteneurs)
  duration.js           normalisation des durees
public/                 poste de travail (HTML/CSS/JS natifs, modules ES)
eval/                   banc d'evaluation, corpus, etalon d'ancrage
test/                   suites hors ligne (npm test)
examples/               transcription d'exemple et modele Draw.io de reference
logs/sessions/          journal des sessions (non versionne)
```

## Dépannage

- **Après une mise à jour du code, redémarrer le serveur** (`npm start`) :
  Node charge le code au lancement, un serveur resté ouvert sert
  l'ancienne version.
- **« Je ne vois aucune différence avec le nouveau prompt »** : la ligne de
  provenance sous le résultat (et dans l'historique) indique la version du
  prompt et le modèle effectivement utilisés. La v7 fait la différence dans
  le **contenu extrait** — rappel des métadonnées (seconde passe de
  relecture), frictions et incertitudes en verbatim, décisions implicites
  repérées — pas dans l'apparence de la grille, qui ne change pas.

## Limites assumées

- Une seule construction conditionnelle, binaire (pas de passerelles
  parallèles ni d'événements) : choix de vulgarisation défendu au chapitre 4
  du mémoire ; l'export BPMN documente ce qu'il dégrade.
- Le détecteur d'ancrage est lexical : il repère l'invention, pas le mauvais
  rattachement d'un terme présent ailleurs dans le texte.
- La fusion multi-entretiens apparie par libellé : deux formulations très
  éloignées de la même activité restent deux étapes (préférable à une fusion
  erronée).
- L'aide à l'anonymisation est naïve et locale : elle assiste la relecture,
  elle ne la remplace pas.
- Formats d'entrée : texte brut (`.txt`/`.md`) et sous-titres (`.vtt`/`.srt`).
  Le `.docx` est volontairement hors périmètre (dépendance lourde pour un
  gain faible) : exporter l'entretien en texte avant de le déposer. Un
  fichier non reconnu est inséré tel quel, avec un message.
