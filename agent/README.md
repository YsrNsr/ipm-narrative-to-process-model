# IPM prototype ("Agent MIP")

Web application that turns one or more process narratives (interview transcripts, workshop notes) into an
editable IPM grid in Draw.io. MIP is the French acronym of IPM (*modèle intermédiaire de processus*).
The full documentation is in French: [`README.fr.md`](README.fr.md), [`QUICKSTART.md`](QUICKSTART.md) and
[`SPECIFICATION_TECHNIQUE.md`](SPECIFICATION_TECHNIQUE.md).

## Main parts

| File | Role |
|------|------|
| `src/prompts.js` | Extraction prompt, version 7 (English translation in `../prompts/`) |
| `src/llm/` | Provider interface: Anthropic, OpenAI, Ollama (local) |
| `src/schema.js` | Structural checks of the generated JSON object |
| `src/repair.js` | Single repair request when the checks fail |
| `src/grounding.js` | Lexical anchoring check, marks deduced values ("≈") |
| `src/drawio.js` | Deterministic rendering of the IPM grid |
| `src/merge.js` | Merging of several narratives of the same process, conflicts listed separately |
| `src/bpmn-map.js`, `src/export-bpmn.js` | BPMN 2.0 export |
| `eval/` | Benchmark, scoring, ablation, PET, reports (see `../evaluation/RESULTS.md`) |
| `test/` | Offline tests (`npm test`) |

## Quick start

```bash
npm ci
cp .env.example .env   # set PROVIDER and the matching API key, or the Ollama settings
npm test
npm start              # http://localhost:3000
```

Anonymize narratives before sending them to a cloud provider. The interface offers a local helper for this,
which is an aid, not a guarantee.
