// Extraction tolerante d'un objet JSON depuis une reponse LLM
// eventuellement entouree de texte ou de balises Markdown.

export function extractJson(raw) {
  if (!raw) throw new Error("Reponse LLM vide.");
  let s = String(raw).trim();
  // retire les fences Markdown ```json ... ```
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch (_) {
    // isole du premier { au dernier }
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      return JSON.parse(s.slice(a, b + 1));
    }
    throw new Error("Impossible d'extraire un JSON valide de la reponse du modele.");
  }
}
