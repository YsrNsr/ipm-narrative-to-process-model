# Technical verification: where each figure of the paper comes from (Section 7.1)

All reports are in [`../agent/eval/results/`](../agent/eval/results/) (French). Older reports are kept
unchanged as a trace of the development.

| Figure in the paper | Model and prompt | Report |
|---------------------|------------------|--------|
| 8 of 8 inputs valid at the first attempt, median generation time 26 s | claude-opus-5, prompt v7 | `20260821-171957_anthropic.md` |
| F1 0.98 for activities and actors, 98% of activities assigned to the expected actor (average of cases 02-06) | same | same |
| Recall of working context: tools 100%, documents 89%, durations 80%, problems 73% (cases 02-06) | same | same |
| Real interview transcript (case 07): F1 0.70 for activities, 0.33 for actors | same | same |
| Without the working context categories: F1 0.97 for activities, no documents, tools, durations or problems (condition E) | claude-sonnet-4-6, prompt v2 | `20260726-182302_ablation_anthropic.md` |
| Twelve PET texts: F1 0.88 for actors, 0.72 for activities; 37 of 45 PET documents contain an XOR or AND gateway (82%) | claude-sonnet-4-6, prompt v2 adapted to English | `20260726-182816_pet_anthropic.md` |
| Local model (Mistral 7B via Ollama) compared with a cloud model | mistral 7B, claude-sonnet-4-6, prompt v2 | `comparatif_local_cloud.md` |

## Corpus

| Case | Origin | Role |
|------|--------|------|
| `01_raccordement` | Synthetic | Used to develop the prompt, reported separately |
| `01_raccordement.para1` | Paraphrase of case 01 | Stability check, reported separately |
| `02` to `06` | Synthetic | Main average |
| `07_real_interview` | Real interview transcript, three speakers | Stress test, reported separately, text not published |

Narratives: `agent/eval/corpus/*.txt` and `agent/eval/paraphrases/`. Expected content (manual
annotation): `agent/eval/corpus/*.expected.json`, written according to
[`../agent/eval/REGLES_ANNOTATION_CORPUS.md`](../agent/eval/REGLES_ANNOTATION_CORPUS.md).
The synthetic narratives were written by the first author with the help of an LLM, from situations
encountered in practice.

## Rerunning

```bash
cd agent
node eval/run.mjs        # benchmark on the corpus (needs an API key or Ollama)
node eval/ablation.mjs   # ablation conditions
node eval/pet.mjs        # PET texts (the PET dataset is downloaded once and cached)
```

Outputs change with the model version, so new runs give close but not identical figures.
