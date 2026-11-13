// Fournisseur cloud : Anthropic.

import Anthropic from "@anthropic-ai/sdk";
import { llmTimeoutMs } from "../httpjson.js";
import { pickModel } from "./index.js";

export async function complete(messages, opts = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY absente dans .env");
  // delai configurable (LLM_TIMEOUT_MS), erreur claire plutot qu'une
  // attente sans fin ; le SDK n'insiste pas (maxRetries 0), la nouvelle
  // tentative est proposee a l'utilisateur, jamais automatique
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: llmTimeoutMs(), maxRetries: 0 });
  // defaut : Opus de la generation courante (claude-opus-5), plus lent
  // et plus cher par generation mais plus capable ; alternative
  // economique eprouvee : claude-sonnet-4-6. Priorite : parametre de la
  // requete > ANTHROPIC_MODEL > defaut.
  const model = pickModel(opts.model, "ANTHROPIC_MODEL", "claude-opus-5");
  // les modeles de la generation Opus 5 / Sonnet 5 / Opus 4.7+ ont
  // retire les parametres d'echantillonnage : temperature y provoque
  // un 400. On ne l'envoie qu'aux modeles qui l'acceptent encore.
  const samplingAllowed = /claude-(sonnet-4-6|opus-4-6|3|haiku)/.test(model);
  const req = {
    model,
    // marge pour les processus longs ; sur la generation Opus 5 le
    // raisonnement adaptatif compte dans max_tokens, 8192 tronquait
    // les cas longs (07). Configurable via ANTHROPIC_MAX_TOKENS.
    max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 16000),
    system: messages.system + "\nReponds uniquement par un objet JSON valide.",
    // fewshot peut etre vide (cas de la requete corrective)
    messages: [
      ...messages.fewshot.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: messages.user }
    ]
  };
  if (samplingAllowed) req.temperature = 0.1;
  const res = await client.messages.create(req);
  // une sortie coupee par max_tokens serait un JSON silencieusement
  // tronque : on echoue explicitement plutot que de laisser passer
  if (res.stop_reason === "max_tokens") {
    throw new Error("Sortie Anthropic tronquee (max_tokens atteint) : augmenter max_tokens.");
  }
  const part = (res.content || []).find((c) => c.type === "text");
  return part ? part.text : "";
}
