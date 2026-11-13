# Prompts

| File | Used for | Language |
|------|----------|----------|
| `free_generation_prompt.fr.txt` | Motivating experiment (paper, Section 4), followed by the leave request narrative | French original |
| `free_generation_prompt.en.txt` | Translation of the above | English |
| `ipm_extraction_prompt_v7.fr.md` | Final extraction prompt of the prototype (paper, Section 6), used for the main results of Section 7.1 | French original |
| `ipm_extraction_prompt_v7.en.md` | Translation of the above | English |
| `ipm_extraction_prompt_v2.fr.md` | Earlier prompt version, used for the ablation (working context removed) and, adapted to English, for the PET texts | French original |

The source of truth is the code: `agent/src/prompts.js` (version 7) and `agent/src/prompts-v2.js`
(version 2). The variants used in the ablation and on PET are in `agent/eval/prompts/`.
