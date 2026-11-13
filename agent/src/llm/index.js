// Abstraction de fournisseur LLM : dispatch local (Ollama) ou cloud (OpenAI/Anthropic).
// Integre la boucle de validation / reparation : si la sortie du modele est
// invalide, une requete corrective unique est emise (cf. chapitre 5 du memoire).

import { buildMessages, buildRepairMessages } from "../prompts.js";
import { extractJson } from "../repair.js";
import { normalizeModel, validateModel } from "../schema.js";
import { markUngrounded } from "../grounding.js";
import * as ollama from "./ollama.js";
import * as openai from "./openai.js";
import * as anthropic from "./anthropic.js";

const providers = { ollama, openai, anthropic };

// Resolution du modele effectif, meme priorite partout :
// parametre de la requete > variable d'environnement > defaut du code.
export const pickModel = (param, envName, fallback) =>
  (param && String(param).trim()) || process.env[envName] || fallback;

// Compteur cumulatif de reparations declenchees depuis le demarrage du
// serveur : indicateur de robustesse pour le chapitre d'evaluation.
let repairCount = 0;
export function getRepairCount() {
  return repairCount;
}

// Tente extraction + normalisation + validation d'une sortie brute du LLM.
// Renvoie { model } en cas de succes, { errors } sinon.
function tryParse(raw) {
  try {
    const model = normalizeModel(extractJson(raw));
    const v = validateModel(model);
    return v.ok ? { model } : { errors: v.errors };
  } catch (e) {
    return { errors: [String((e && e.message) || e)] };
  }
}

// Extrait le modele hybride depuis un texte narratif.
// options.impl permet d'injecter un fournisseur factice (tests).
// Renvoie { model, repaired } : repaired indique si la requete corrective
// a ete necessaire pour obtenir un modele valide.
export async function extract(text, options = {}) {
  const name = options.provider || process.env.PROVIDER || "ollama";
  const impl = options.impl || providers[name];
  if (!impl) throw new Error(`Fournisseur LLM inconnu: ${name}`);

  // Post-traitement : verification lexicale d'ancrage. Toute valeur de
  // metadonnee non soutenue par le texte source est marquee deduite, en
  // union avec le marquage auto-declare du modele (dont l'audit a
  // montre le rappel tres faible). Seuil ajustable via GROUNDING_THRESHOLD.
  const ground = (model) => {
    // seuil 0.7 recommande par l'evaluation contre l'etalon
    // (eval/grounding-eval.mjs) : meilleur F1, rappel maximal
    const threshold = Number(process.env.GROUNDING_THRESHOLD || 0.7);
    const marked = markUngrounded(model, text, { threshold });
    if (marked) console.log(`[ancrage] ${marked} valeur(s) non ancree(s) marquee(s) deduite(s)`);
    return model;
  };

  // le modele choisi (options.model) descend jusqu'au fournisseur
  const llmOpts = { model: options.model };
  const raw = await impl.complete(buildMessages(text), llmOpts);
  const first = tryParse(raw);
  if (first.model) return { model: ground(first.model), repaired: false };

  // Tentative unique de reparation : on renvoie au modele sa sortie
  // precedente et la liste des erreurs.
  repairCount++;
  console.log(`[reparation] sortie invalide, requete corrective emise (total depuis demarrage: ${repairCount}) : ${first.errors.join(" | ")}`);
  const raw2 = await impl.complete(buildRepairMessages(text, raw, first.errors), llmOpts);
  const second = tryParse(raw2);
  if (second.model) return { model: ground(second.model), repaired: true };

  throw new Error(
    "Echec de generation : la sortie du modele est restee invalide apres une tentative de reparation. " +
    `Erreurs initiales: ${first.errors.join(" | ")}. Erreurs apres reparation: ${second.errors.join(" | ")}.`
  );
}

// Extraction de plusieurs transcriptions pour le meme processus.
// Fournisseurs cloud : en parallele avec une limite de concurrence
// (3) ; Ollama : sequentiel, une machine locale ne tient pas deux
// inferences a la fois. L'ordre des resultats suit celui des textes.
export async function extractAll(texts, options = {}) {
  const name = options.provider || process.env.PROVIDER || "ollama";
  const limit = options.concurrency != null
    ? options.concurrency
    : (name === "ollama" ? 1 : 3);
  const models = new Array(texts.length);
  let next = 0;
  let repaired = false;
  const worker = async () => {
    while (next < texts.length) {
      const idx = next++;
      const r = await extract(texts[idx], options);
      models[idx] = r.model;
      repaired = repaired || r.repaired;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, texts.length)) }, worker));
  return { models, repaired };
}
