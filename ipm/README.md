# The IPM: grid and data object

## Grid

The IPM is rendered as a grid inspired by Makigami (paper, Section 5.3):

- one row per actor, one column per step; an activity is placed in the row of its responsible actor;
- steps placed in the same column take place at the same time;
- a step can carry one yes/no decision; its negative exit goes back to an earlier step or ends the process;
- context bands below the grid hold, for each step, documents and data, tools, durations, and problems;
- business rules, exceptions and uncertainties are listed separately;
- values that are not anchored in the narrative are shown in italics with the marker "≈".

Templates: [`template/ipm_template.drawio`](template/ipm_template.drawio) (flow only) and
[`template/ipm_template_with_context_bands.drawio`](template/ipm_template_with_context_bands.drawio)
(with the context bands). Preview: [`template/ipm_template.png`](template/ipm_template.png).

## Data object

The LLM produces one JSON object. The complete schema, with comments, is in the extraction prompt
([`../prompts/ipm_extraction_prompt_v7.en.md`](../prompts/ipm_extraction_prompt_v7.en.md)). In short:

| Level | Fields |
|-------|--------|
| Process | `process`, `actors`, `trigger`, `outcome`, `rules`, `exceptions`, `uncertainties`, `steps` |
| Step | `id`, `actors` (first = responsible, others = participants), `stage` (column), `label`, `decision` (`question`, `on_no.label`, `on_no.return_to`) |
| Working context of a step | `documents_in`, `documents_out`, `data_in`, `data_out`, `tools`, `duration` (`duration_min`, `duration_max`), `volume`, `frequency`, `friction`, `procedure`, `opportunity`, `automated` |

Any value can be a plain string (stated in the narrative) or `{"value": "...", "inferred": true}`
(deduced). The program then checks the structure (`agent/src/schema.js`), sends at most one repair request
(`agent/src/repair.js`), applies the lexical anchoring check (`agent/src/grounding.js`) and renders the
grid (`agent/src/drawio.js`).
