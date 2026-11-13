# Ablation des principes de conception — 2026-07-26T18:23:02.271Z

Fournisseur : **anthropic** · modele : **claude-sonnet-4-6** · reference : prompt **v2** (gele) · cas : 02, 03, 04, 05, 06 · seuil : 0.4
Tentative unique par generation (pas de boucle de reparation) : le taux de sorties exploitables au premier essai fait partie des resultats. Les metriques ne sont moyennees que sur les sorties exploitables.

| Condition | Exploitable 1er essai | Documents | Outils | Temps | Frictions | F1 acteurs | F1 taches | Rattachement | Ratio gran. | Effort moyen | Latence med. |
|-----------|----------------------|-----------|--------|-------|-----------|------------|-----------|--------------|-------------|--------------|--------------|
| A. reference | 5/5 (100 %) | 100 % | 100 % | 100 % | 90 % | 1.00 | 0.98 | 100 % | 1.05 | 16.00 | 10 s |
| B. sans few-shot | 5/5 (100 %) | 100 % | 100 % | 100 % | 90 % | 0.98 | 0.98 | 98 % | 1.05 | 17.00 | 11 s |
| C. sans raisonnement | 5/5 (100 %) | 100 % | 100 % | 80 % | 90 % | 0.98 | 0.95 | 98 % | 1.00 | 17.00 | 8 s |
| D. sans granularite | 5/5 (100 %) | 100 % | 100 % | 100 % | 90 % | 1.00 | 0.98 | 100 % | 1.05 | 15.60 | 8 s |
| E. sans metadonnees | 5/5 (100 %) | 0 % | 0 % | 0 % | 0 % | 0.98 | 0.97 | 98 % | 1.07 | 20.40 | 4 s |
| F. sans JSON | 5/5 (100 %) | 0 % | 0 % | 0 % | 0 % | 0.98 | 0.93 | 98 % | 1.15 | 23.00 | 14 s |

Lecture : la condition E chiffre l'apport de la couche de metadonnees (tout rappel perdu par rapport a A est capte par le Modele hybride seul) ; la condition F chiffre l'apport de la representation intermediaire JSON (exploitabilite et conformite structurelle).
