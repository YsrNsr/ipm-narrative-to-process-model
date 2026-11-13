# Motivating experiment (paper, Section 4 and Figure 1)

The same narrative and the same prompt were submitted three times, in independent conversations, to three
generative AI assistants. The prompt asked for an editable Draw.io diagram and left the graphical
representation open.

- Narrative (French original): [`leave_request_narrative.fr.txt`](leave_request_narrative.fr.txt), English translation: [`leave_request_narrative.en.txt`](leave_request_narrative.en.txt)
- Prompt: [`../prompts/free_generation_prompt.fr.txt`](../prompts/free_generation_prompt.fr.txt) (English: [`../prompts/free_generation_prompt.en.txt`](../prompts/free_generation_prompt.en.txt))

| Folder | Assistant | Content |
|--------|-----------|---------|
| `claude-sonnet-5/` | Claude Sonnet 5 | `run1-3.drawio` (as returned) and `.png` renderings |
| `gemini-3.7-flash/` | Gemini 3.7 Flash | same |
| `chatgpt-5.6/` | ChatGPT 5.6 | same |
| `ipm-agent/` | IPM prototype (constrained generation, Section 6) | three IPM grids generated from the same narrative and their BPMN exports |

The `.drawio` files open in [diagrams.net](https://app.diagrams.net). Figure 1 of the paper shows one
diagram per assistant.
