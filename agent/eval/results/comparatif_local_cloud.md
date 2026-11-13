# Comparatif local contre cloud — cas 02 a 06, prompt v2 (gele), seuil 0.4

Local : mistral 7B Q4 via Ollama, CPU force (machine de test, GPU inutilisable).
Cloud : claude-sonnet-4-6 via API Anthropic.
Moyennes sur les cas synthetiques 02 a 06 (cas 01 = developpement, cas 07 et 08 qualitatifs, hors score).
Sources : 20260726-201414_ollama.md et 20260726-181524_anthropic.md.

| Metrique | mistral (local) | claude-sonnet-4-6 (cloud) |
|----------|-----------------|---------------------------|
| Rappel documents | 75 % | 100 % |
| Rappel outils | 94 % | 100 % |
| Rappel temps | 63 % | 100 % |
| Rappel frictions | 47 % | 90 % |
| Effort d'edition moyen | 18.60 | 16.00 |
| F1 acteurs | 0.90 | 1.00 |
| F1 taches | 0.90 | 0.98 |
| Rattachement tache-acteur | 94 % | 100 % |
| Ratio de granularite | 0.95 | 1.05 |
| JSON valide au 1er essai | 5/5 (100 %) | 5/5 (100 %) |
| Latence mediane | 853 s (~14 min) | 10 s |

Lecture. Les deux fournisseurs sont structurellement fiables (100 % de JSON
valides au premier essai, zero reparation). L'ecart se joue sur les
metadonnees : le modele local capte bien le flux (F1 taches 0.90,
rattachement 94 %) et les outils (94 %), mais perd pres de la moitie des
frictions (47 %) et un quart des documents (75 %). La latence est le
compromis principal : un facteur ~85 entre local CPU et cloud. La mesure
locale est une borne basse obtenue sur materiel modeste (portable 2019 sans
GPU utilisable) ; un poste equipe changerait la latence, pas la fidelite.
