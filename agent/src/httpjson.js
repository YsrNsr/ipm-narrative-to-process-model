// Requete POST JSON via node:http.
// fetch (undici) coupe apres 5 minutes d'attente des en-tetes, ce qui
// est trop court pour une generation LLM locale sur CPU. Le delai est
// donc configurable par LLM_TIMEOUT_MS (defaut : 30 minutes, assez
// pour une generation locale lente) et produit une erreur claire ; la
// nouvelle tentative est proposee a l'utilisateur, jamais automatique.

import http from "node:http";

export const llmTimeoutMs = () => Number(process.env.LLM_TIMEOUT_MS || 30 * 60 * 1000);

export function postJson(urlString, payload, options = {}) {
  const timeoutMs = options.timeoutMs != null ? options.timeoutMs : llmTimeoutMs();
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    if (timeoutMs > 0) {
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(
          `Delai depasse apres ${Math.round(timeoutMs / 60000)} min (LLM_TIMEOUT_MS=${timeoutMs}). ` +
          "Le fournisseur n'a pas repondu a temps : reessayez, ou augmentez LLM_TIMEOUT_MS dans .env."));
      });
    }
    req.on("error", reject);
    req.end(body);
  });
}
