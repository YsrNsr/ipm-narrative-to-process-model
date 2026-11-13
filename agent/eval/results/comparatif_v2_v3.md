# Comparatif prompt v2 (gele) contre v3 — cas 02 a 06, cloud (claude-sonnet-4-6), seuil 0.4

Sources : 20260726-181524_anthropic.md (v2) et 20260726-212013_anthropic.md (v3).
Les scores portent sur les seules valeurs attestees ; les valeurs deduites de la
v3 (marquees inferred) sont denombrees a part et n'entrent pas dans la
comparaison, la reference etant annotee en fidelite stricte au texte.

| Metrique (attestees) | v2 | v3 |
|----------------------|----|----|
| Rappel documents | 100 % | 100 % |
| Rappel outils | 100 % | 100 % |
| Rappel temps | 100 % | 100 % |
| Rappel frictions | 90 % | 83 % |
| F1 acteurs | 1.00 | 0.98 |
| F1 taches | 0.98 | 1.00 |
| Rattachement tache-acteur | 100 % | 98 % |
| Ratio de granularite | 1.05 | 1.00 |
| Effort d'edition moyen | 16.00 | **13.00** |
| JSON valide au 1er essai | 5/5 | 5/5 |
| Latence mediane | 10 s | 15 s |
| Propositions deduites (total) | 0 (schema sans inference) | **4** (3 documents, 1 outil), toutes marquees |

## Ce que la v3 ajoute sans le retrancher a la v2

Champs absents du schema v2, donc hors comparaison chiffree (33 etapes
generees sur les cas 02-06) :
- data_in / data_out : 13 et 5 etapes renseignees (ex. « Niveau de priorite
  (1, 2 ou 3) », « Contrat de maintenance du client ») ;
- procedure (Deroule) : 28 etapes sur 33 ;
- duration_min / duration_max : 3 etapes (fourchettes explicites du texte) ;
- opportunity : 0 (les cas 02-06 n'en enoncent pas ; le few-shot en contient
  une, la piste existe) ;
- decision : 6 decisions binaires detectees, questions courtes, retours
  coherents (s1, s2, s3, s5, fin) ;
- automated : 0 etape marquee (aucune etape purement systeme dans ces recits).

## Lecture

La v3 est globalement equivalente a la v2 sur les attestees (differences de
1 a 7 points, dans les deux sens : frictions -7, granularite et F1 taches en
hausse, effort -19 %) tout en captant quatre familles d'information
supplementaires et la structure conditionnelle. L'inference reste rare
(4 propositions pour 149 valeurs attestees, 2,6 %), toutes marquees : le
risque de remplissage systematique ne s'est pas materialise.
