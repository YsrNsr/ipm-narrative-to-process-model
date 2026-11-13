// Fournisseur cloud : OpenAI. Sortie JSON forcee (response_format json_object).

import OpenAI from "openai";
import { llmTimeoutMs } from "../httpjson.js";
import { pickModel } from "./index.js";

export async function complete(messages, opts = {}) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY absente dans .env");
  // meme politique de delai que les autres fournisseurs, sans reprise
  // automatique ; priorite parametre > OPENAI_MODEL > defaut
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: llmTimeoutMs(), maxRetries: 0 });
  const model = pickModel(opts.model, "OPENAI_MODEL", "gpt-4o-mini");
  const res = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: messages.system },
      ...messages.fewshot,
      { role: "user", content: messages.user }
    ]
  });
  return (res.choices[0] && res.choices[0].message && res.choices[0].message.content) || "";
}
