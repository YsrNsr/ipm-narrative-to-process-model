// Noms de fichiers et pages derivables apres coup : slug, nom effectif
// de session (le renommage prime), resolution du parametre pages et
// cablage statique des routes. Hors ligne, aucun appel LLM ni serveur.
// Usage : node test/naming.mjs

import { readFileSync } from "node:fs";
import { slugify, sessionName, resolvePages, PAGE_NAMES } from "../src/names.js";
import { renderDrawioXml } from "../src/drawio.js";
import { normalizeModel } from "../src/schema.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

console.log("\n[1] Slug de nom de fichier");
ok(slugify("Demande de congés") === "demande-de-conges", "accents retires, espaces -> tirets");
ok(slugify("Raccordement client") === "raccordement-client", "exemple du brief");
ok(slugify("L'été, ça va ?!") === "l-ete-ca-va", "ponctuation absorbee, bords rognes");
ok(slugify("") === "processus" && slugify("   ") === "processus", "vide -> repli 'processus'");
ok(slugify("###") === "processus", "aucun caractere utilisable -> repli");
{
  const long = slugify("mot ".repeat(40));
  ok(long.length <= 60 && !long.endsWith("-"), `longueur bornee sans tiret final (recu: ${long.length})`);
}

console.log("\n[2] Nom effectif de session : le nom personnalise prime");
ok(sessionName({ name: "Mon processus a moi", model: { process: "Extrait" } }) === "Mon processus a moi",
  "nom personnalise prioritaire");
ok(sessionName({ name: "   ", model: { process: "Extrait" } }) === "Extrait",
  "nom blanc ignore : nom de processus extrait");
ok(sessionName({}) === "Processus", "sans rien : repli generique");

console.log("\n[3] Resolution du parametre pages (?pages=...)");
ok(resolvePages("BPMN,SIPOC", ["Makigami"]).join(",") === "BPMN,SIPOC", "sous-ensemble reconnu");
ok(resolvePages("bpmn , sipoc", ["Makigami"]).join(",") === "BPMN,SIPOC", "insensible a la casse, espaces toleres");
ok(resolvePages("BPMN,Inconnue,SIPOC", ["Makigami"]).join(",") === "BPMN,SIPOC", "page inconnue ignoree");
ok(resolvePages("bpmn,BPMN", ["Makigami"]).join(",") === "BPMN", "doublons fusionnes");
ok(resolvePages("", ["Makigami", "RACI"]).join(",") === "Makigami,RACI", "parametre absent -> repli fourni");
ok(resolvePages("Foo,Bar", ["Makigami"]).length === 0, "toutes inconnues -> liste vide (la route repond 400)");
ok(PAGE_NAMES.join(",") === "Makigami,Processus,BPMN,RACI,SIPOC,Analyse", "registre des noms de pages");

console.log("\n[4] Composition reelle d'un sous-ensemble derive");
{
  const model = normalizeModel({
    process: "Demande de congés",
    actors: ["Collaborateur", "Responsable"],
    steps: [
      { id: "s1", actors: ["Collaborateur"], stage: 1, label: "Deposer la demande" },
      { id: "s2", actors: ["Responsable"], stage: 2, label: "Valider la demande" }
    ]
  });
  const xml = renderDrawioXml(model, { pages: resolvePages("sipoc,raci", null) });
  ok(xml.includes('name="RACI"') && xml.includes('name="SIPOC"'), "pages demandees presentes");
  ok(!xml.includes('name="Makigami"') && !xml.includes('name="BPMN"'), "pages non demandees absentes");
  ok(xml.includes('pages="2"'), "compte de pages coherent");
}

console.log("\n[5] Cablage statique des routes (server.js)");
{
  const srv = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  ok(/app\.patch\("\/api\/session\/:id"/.test(srv), "PATCH /api/session/:id (renommage) presente");
  ok(/\/api\/session\/:id\/render\.drawio/.test(srv), "route render.drawio presente");
  ok(/resolvePages\(req\.query\.pages/.test(srv), "render.drawio passe par resolvePages");
  ok(/\/api\/session\/:id\/export\.json/.test(srv), "route export.json presente");
  ok(/JSON\.stringify\(s\.model, null, 2\)/.test(srv), "export.json joli-imprime");
  ok(!/filename="processus\.csv"|filename="fiche-processus\.md"|filename="processus\.bpmn"/.test(srv),
    "plus aucun nom de fichier fige : tout passe par le slug");
  ok(/attachName\(/.test(srv) && /slugify\(sessionName\(/.test(srv), "Content-Disposition derive du slug");
}

console.log("\n[6] Cablage statique du client");
{
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  ok(html.includes('id="out-json"'), "case 'Modele extrait (.json)' presente");
  const sess = readFileSync(new URL("../public/js/sessions.js", import.meta.url), "utf8");
  ok(/data-act="rename"/.test(sess), "crayon de renommage present dans l'historique");
  ok(/render\.drawio\?pages=/.test(sess), "action 'Telecharger d'autres pages' cablee sur render.drawio");
  const main = readFileSync(new URL("../public/js/main.js", import.meta.url), "utf8");
  ok(/Voir le modèle extrait \(JSON\)/.test(main), "repli JSON du bloc de resultat present");
  ok(/currentSlug/.test(main) && /\$\{currentSlug\}\.drawio/.test(main), "fichiers client nommes par le slug");
}

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
