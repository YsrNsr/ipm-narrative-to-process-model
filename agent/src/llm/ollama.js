// Fournisseur local : Ollama (API REST). Les donnees ne quittent pas la machine.
// Requete via node:http avec delai configurable (LLM_TIMEOUT_MS, defaut
// 30 min) : une generation locale sur CPU depasse largement les 5
// minutes tolerees par fetch, mais ne doit pas non plus attendre sans fin.

import { postJson } from "../httpjson.js";
import { pickModel } from "./index.js";

export async function complete(messages, opts = {}) {
  const url = (process.env.OLLAMA_URL || "http://localhost:11434") + "/api/chat";
  // priorite : parametre de la requete > OLLAMA_MODEL > defaut
  const model = pickModel(opts.model, "OLLAMA_MODEL", "mistral");
  const msgs = [
    { role: "system", content: messages.system },
    ...messages.fewshot,
    { role: "user", content: messages.user }
  ];
  const options = { temperature: 0.1 };
  // OLLAMA_NUM_GPU=0 force le CPU : utile quand le GPU manque de VRAM
  // ou fait planter le runner (ex: petits GPU portables)
  if (process.env.OLLAMA_NUM_GPU !== undefined && process.env.OLLAMA_NUM_GPU !== "") {
    options.num_gpu = Number(process.env.OLLAMA_NUM_GPU);
  }
  // Fenetre de contexte : la valeur par defaut d'Ollama (4096) tronque
  // silencieusement les transcriptions longues (le cas 07 du corpus fait
  // environ 6000 jetons). 8192 par defaut, ajustable via OLLAMA_NUM_CTX.
  options.num_ctx = Number(process.env.OLLAMA_NUM_CTX || 8192);
  const { status, body } = await postJson(url, {
    model,
    messages: msgs,
    stream: false,
    format: "json",
    // garde le modele charge en memoire entre deux generations
    keep_alive: "30m",
    options
  });
  if (status !== 200) {
    throw new Error(`Ollama HTTP ${status}. Verifiez qu'Ollama tourne et que le modele est telecharge.`);
  }
  const data = JSON.parse(body);
  return (data.message && data.message.content) || "";
}
