// Dictee d'entretien : logique de prefixage des segments (module pur,
// sans API navigateur). Hors ligne.
// Usage : node test/dictation.mjs

import { appendSegment, dictationSupported, SPEAKERS } from "../public/js/dictation.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

console.log("\n[1] Prefixage des segments par locuteur");
ok(appendSegment("", "Métier", "on recoit la demande au guichet") ===
  "Métier : on recoit la demande au guichet", "premier segment prefixe");
ok(appendSegment("Métier : on recoit la demande", "Métier", "et on verifie le dossier") ===
  "Métier : on recoit la demande et on verifie le dossier",
  "segments consecutifs du meme locuteur regroupes sur la ligne");
const deux = appendSegment(
  appendSegment("", "Intervieweur", "et ensuite ?"), "Métier", "ensuite ca part au controle");
ok(deux === "Intervieweur : et ensuite ?\nMétier : ensuite ca part au controle",
  "changement de locuteur : nouvelle ligne prefixee");
ok(appendSegment("Texte colle sans locuteur", "Métier", "suite dictee") ===
  "Texte colle sans locuteur\nMétier : suite dictee",
  "la dictee s'ajoute proprement apres un texte colle");
ok(appendSegment("Métier : deja la", "Métier", "   ") === "Métier : deja la",
  "segment vide ignore");
ok(appendSegment("", "Métier", "  avec espaces  ") === "Métier : avec espaces",
  "segment nettoye");

console.log("\n[2] Environnement");
ok(dictationSupported() === false, "hors navigateur : dictee declaree indisponible (degradation propre)");
ok(SPEAKERS.length === 2 && SPEAKERS[1][1] === "Métier", "deux locuteurs, Intervieweur et Métier");

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
