// Jeton d'acces optionnel : sans AUTH_TOKEN tout passe comme avant ;
// avec, 401 sans jeton et 200 avec (en-tete dedie ou Bearer), le
// statique restant servi sans jeton. Hors ligne : middleware exerce
// sur des objets req/res factices, aucun serveur demarre.
// Usage : node test/auth.mjs

import { readFileSync } from "node:fs";
import { tokenFromHeaders, tokenMatches, authMiddleware } from "../src/auth.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

// requete/reponse factices minimales pour exercer le middleware
function run(mw, headers) {
  const out = { status: null, body: null, nexted: false };
  const req = { headers };
  const res = {
    status(c) { out.status = c; return this; },
    json(b) { out.body = b; return this; }
  };
  mw(req, res, () => { out.nexted = true; });
  return out;
}

console.log("\n[1] Extraction du jeton des en-tetes");
ok(tokenFromHeaders({ "x-auth-token": "abc" }) === "abc", "en-tete X-Auth-Token");
ok(tokenFromHeaders({ authorization: "Bearer xyz" }) === "xyz", "Authorization: Bearer");
ok(tokenFromHeaders({ authorization: "bearer xyz" }) === "xyz", "Bearer insensible a la casse");
ok(tokenFromHeaders({}) === "" && tokenFromHeaders(undefined) === "", "absent -> chaine vide");

console.log("\n[2] Comparaison en temps constant");
ok(tokenMatches("nimporte", "") === true && tokenMatches("", "") === true,
  "sans AUTH_TOKEN : tout passe (comportement de poste local)");
ok(tokenMatches("secret", "secret") === true, "bon jeton accepte");
ok(tokenMatches("mauvais", "secret") === false, "mauvais jeton refuse");
ok(tokenMatches("", "secret") === false, "jeton vide refuse");
ok(tokenMatches("secret-plus-long-que-l-attendu", "secret") === false,
  "longueurs differentes gerees (haches avant comparaison)");

console.log("\n[3] Middleware : sans AUTH_TOKEN, comportement inchange");
{
  const mw = authMiddleware("");
  ok(run(mw, {}).nexted === true, "aucun jeton exige");
  ok(run(mw, { "x-auth-token": "superflu" }).nexted === true, "jeton superflu tolere");
}

console.log("\n[4] Middleware : avec AUTH_TOKEN");
{
  const mw = authMiddleware("s3cret");
  const refus = run(mw, {});
  ok(refus.status === 401 && !refus.nexted, "sans jeton : 401, la route n'est pas atteinte");
  ok(/jeton/i.test(refus.body.error) && !/s3cret/.test(JSON.stringify(refus.body)),
    "message clair, sans fuite du jeton ni du detail des routes");
  ok(run(mw, { "x-auth-token": "s3cret" }).nexted === true, "bon jeton (en-tete dedie) : 200");
  ok(run(mw, { authorization: "Bearer s3cret" }).nexted === true, "bon jeton (Bearer) : 200");
  ok(run(mw, { "x-auth-token": "faux" }).status === 401, "mauvais jeton : 401");
}

console.log("\n[5] Cablage : serveur et client");
{
  const srv = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  ok(/app\.use\("\/api", authMiddleware\(/.test(srv), "middleware monte sur /api");
  ok(srv.indexOf("express.static") < srv.indexOf("authMiddleware("),
    "statique monte AVANT le jeton : l'interface se charge pour le demander");
  const api = readFileSync(new URL("../public/js/api.js", import.meta.url), "utf8");
  ok(/sessionStorage\.(get|set)Item/.test(api) && !/localStorage\.(get|set)Item/.test(api),
    "jeton en sessionStorage, jamais localStorage");
  ok(/X-Auth-Token/.test(api) && /401/.test(api), "assistant commun : en-tete + invite au 401");
  for (const f of ["main.js", "sessions.js", "validation.js", "editor.js"]) {
    const src = readFileSync(new URL(`../public/js/${f}`, import.meta.url), "utf8");
    ok(!/[^i]fetch\(\s*["`]\/api/.test(src) && !/window\.open\(\s*[`"]\/api/.test(src),
      `${f} : plus d'appel API direct, tout passe par l'assistant`);
  }
}

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
