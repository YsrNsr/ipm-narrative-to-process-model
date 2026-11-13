// Condition B de l'ablation : sans few-shot.
// Le prompt systeme v2 est conserve tel quel, seul l'exemple resolu est
// retire. Mesure l'apport de l'ancrage par exemple.

import { SYSTEM_PROMPT } from "../../src/prompts.js";

export const meta = {
  key: "B",
  name: "sans few-shot",
  description: "prompt v2 complet, exemple resolu retire"
};

export function buildMessages(text) {
  return { system: SYSTEM_PROMPT, fewshot: [], user: text };
}
