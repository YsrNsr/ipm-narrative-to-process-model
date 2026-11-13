# Evaluation corpus (public version)

| Case | Origin | Role in the reports |
|------|--------|---------------------|
| `01_raccordement` | Synthetic | Development case: the prompt was tuned on it, reported separately |
| `02_commande_livraison` to `06_arrivee_collaborateur` | Synthetic | Main average |
| `07_real_interview` | Real interview transcript, three speakers | Reported separately, not published |
| `08_real_workshop` | Real design workshop transcript | Examined qualitatively during development, not published |

The synthetic narratives were written by the first author with the help of an LLM, from situations
encountered in practice, and include hesitations, digressions and information given out of order.
Each `*.expected.json` file is the manual annotation of the expected content, written beforehand according
to `../REGLES_ANNOTATION_CORPUS.md`. The paraphrase of case 01 is in `../paraphrases/`.

Cases 07 and 08, their anonymization notes and the audits derived from them are kept private to protect
the participants. The reports in `../results/` keep only the scores of case 07.
