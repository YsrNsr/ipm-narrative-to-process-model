// Jeton d'acces optionnel (deploiement partage). AUTH_TOKEN absent ou
// vide : outil de poste local, aucune friction, tout passe. Defini :
// les routes /api/* exigent le jeton ; les fichiers statiques restent
// servis sans jeton pour que l'interface puisse le demander.
// Module pur, teste hors ligne.

import { createHash, timingSafeEqual } from "node:crypto";

// comparaison en temps constant : hacher les deux valeurs egalise les
// longueurs, condition de timingSafeEqual
const sha = (s) => createHash("sha256").update(String(s)).digest();

// jeton porte par la requete : en-tete dedie ou Authorization: Bearer
export function tokenFromHeaders(headers) {
  const h = headers || {};
  if (h["x-auth-token"]) return String(h["x-auth-token"]);
  const m = /^Bearer\s+(.+)$/i.exec(String(h["authorization"] || ""));
  return m ? m[1] : "";
}

export function tokenMatches(given, expected) {
  if (!expected) return true;
  return timingSafeEqual(sha(given || ""), sha(expected));
}

// fabrique du middleware Express ; le 401 reste generique, il ne
// revele jamais ce qui existe derriere
export function authMiddleware(expected) {
  return (req, res, next) => {
    if (tokenMatches(tokenFromHeaders(req.headers), expected)) return next();
    res.status(401).json({
      error: "Accès protégé : fournissez le jeton d'accès (en-tête X-Auth-Token ou Authorization: Bearer)."
    });
  };
}
