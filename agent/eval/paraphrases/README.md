# Test de robustesse par paraphrase

Méthode : évaluer l'extraction sur des variantes reformulées d'une même
transcription, contre la même référence, afin de mesurer la stabilité face à la
reformulation (Klievtsova et al. 2023).

## Convention de nommage

`NN_nom.paraK.txt` — paraphrase K du cas `eval/corpus/NN_nom.txt`. Elle est
évaluée contre `eval/corpus/NN_nom.expected.json` (la référence du cas de base,
puisque le contenu est le même par construction).

Exemple : `01_raccordement.para1.txt`, `01_raccordement.para2.txt`.

## Règle de rédaction

Une paraphrase change la formulation, le registre ou l'ordre du récit, mais ne
change **aucune unité de contenu** : mêmes acteurs, mêmes actions, mêmes
documents, outils, durées et frictions. Si une information est ajoutée ou
retirée, ce n'est plus une paraphrase et la référence commune n'est plus valable.

## Exécution

`node eval/run.mjs` les inclut automatiquement (les désactiver avec
`--no-paraphrases`). Le rapport ajoute une section « Stabilité par paraphrase »
qui juxtapose l'originale et ses variantes (F1 des tâches, rattachement, rappel
des métadonnées) et donne l'écart maximal de F1 par cas.

`01_raccordement.para1.txt` est un exemple fourni pour valider la mécanique ;
les paraphrases définitives sont à rédiger (voir la composition du corpus dans
`../corpus/README.md`).
