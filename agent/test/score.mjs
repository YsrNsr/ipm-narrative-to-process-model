// Test hors ligne du scoreur (eval/score.mjs) sur les paires fabriquees
// de eval/fixtures. Les valeurs attendues du cas degrade sont calculees
// a la main dans les commentaires.
// Usage : node test/score.mjs

import { readFileSync } from "node:fs";
import { scoreModel, normalizeDuration } from "../eval/score.mjs";
import { normalizeModel } from "../src/schema.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
};
const close = (a, b) => Math.abs(a - b) < 1e-9;

const load = (f) => JSON.parse(readFileSync(new URL(`../eval/fixtures/${f}`, import.meta.url), "utf8"));
const EXPECTED = load("conge.expected.json");
const DEGRADED = load("conge.degraded.json");

console.log("\n[1] Cas parfait : generation identique a la reference");
{
  const s = scoreModel(EXPECTED, EXPECTED);
  ok(s.metadata.documents.recall === 1, "rappel documents = 1");
  ok(s.metadata.outils.recall === 1, "rappel outils = 1");
  ok(s.metadata.temps.recall === 1, "rappel temps = 1");
  ok(s.metadata.frictions.recall === 1, "rappel frictions = 1");
  ok(s.editEffort.total === 0, `effort d'edition = 0 (recu: ${s.editEffort.total})`);
  ok(s.coverage.actors.f1 === 1 && s.coverage.tasks.f1 === 1, "F1 acteurs et taches = 1");
  ok(s.attachment.accuracy === 1, "rattachement = 1");
  ok(s.granularity.ratio === 1, "ratio de granularite = 1");
}

console.log("\n[2] Cas degrade : valeurs calculees a la main");
{
  const s = scoreModel(DEGRADED, EXPECTED);
  // documents attendus : Demande de conge (out s1), Demande de conge (in s2),
  // Attestation (out s3) = 3 ; rappeles : "Demande" (similaire) et
  // "Attestation" = 2
  ok(s.metadata.documents.expected === 3 && s.metadata.documents.recalled === 2,
    `documents 2/3 (recu: ${s.metadata.documents.recalled}/${s.metadata.documents.expected})`);
  // outils attendus : Portail RH, SIRH = 2 ; rappele : SIRH = 1
  ok(close(s.metadata.outils.recall, 0.5), `rappel outils = 0.5 (recu: ${s.metadata.outils.recall})`);
  // duree "2 jours" et friction attendues, absentes de la generation
  ok(s.metadata.temps.recall === 0, `rappel temps = 0 (recu: ${s.metadata.temps.recall})`);
  ok(s.metadata.frictions.recall === 0, `rappel frictions = 0 (recu: ${s.metadata.frictions.recall})`);
  // acteurs : 4 generes dont Comptabilite hallucine, RH renomme Service RH
  // -> apparies 3, precision 3/4, rappel 3/3
  ok(close(s.coverage.actors.precision, 0.75), `precision acteurs = 0.75 (recu: ${s.coverage.actors.precision})`);
  ok(s.coverage.actors.recall === 1, `rappel acteurs = 1 (recu: ${s.coverage.actors.recall})`);
  // taches : 3 sur 3 appariees (1 renommage de libelle)
  ok(s.coverage.tasks.f1 === 1, `F1 taches = 1 (recu: ${s.coverage.tasks.f1})`);
  // rattachement : s3 attribuee a Comptabilite au lieu de RH -> 2/3
  ok(close(s.attachment.accuracy, 2 / 3), `rattachement = 2/3 (recu: ${s.attachment.accuracy})`);
  // effort : acteurs 1 supprime + 1 renomme, taches 1 renommee +
  // 1 reattribuee, metadonnees 4 ajouts (doc entrant s2, outil s1,
  // duree s2, friction s2) + 1 reformulation (Demande) = 9
  ok(s.editEffort.actors.removed === 1, "1 acteur hallucine a supprimer");
  ok(s.editEffort.tasks.reassigned === 1, "1 tache a reattribuer");
  ok(s.editEffort.total === 9, `effort total = 9 (recu: ${s.editEffort.total})`);
  ok(s.granularity.ratio === 1, `ratio de granularite = 1 (recu: ${s.granularity.ratio})`);
}

console.log("\n[3] Granularite : statistique descriptive, pas une penalite");
{
  // la generation decoupe une etape de plus : le ratio bouge, mais le
  // rappel des taches de reference ne doit pas etre penalise
  const finer = JSON.parse(JSON.stringify(DEGRADED));
  finer.steps.push({ id: "s4", actor: "Manager", label: "Notifier l'employe",
    documents_in: [], documents_out: [], tools: [], duration: "", friction: "" });
  const s = scoreModel(finer, EXPECTED);
  ok(close(s.granularity.ratio, 4 / 3), `ratio = 4/3 (recu: ${s.granularity.ratio})`);
  ok(s.coverage.tasks.recall === 1, `rappel des taches inchange (recu: ${s.coverage.tasks.recall})`);
}

console.log("\n[4] Seuil parametrable");
{
  // avec un seuil tres exigeant, "Soumettre la demande" ne s'apparie
  // plus a "Soumettre la demande de conge"
  const strict = scoreModel(DEGRADED, EXPECTED, { threshold: 0.95 });
  ok(strict.coverage.tasks.matched < 3, `seuil 0.95 : moins d'appariements (recu: ${strict.coverage.tasks.matched})`);
  const loose = scoreModel(DEGRADED, EXPECTED, { threshold: 0.1 });
  ok(loose.coverage.tasks.matched === 3, `seuil 0.1 : 3 appariements (recu: ${loose.coverage.tasks.matched})`);
}

console.log("\n[5] Normalisation des durees");
{
  ok(normalizeDuration("un quart d'heure") === 15, "un quart d'heure = 15 min");
  ok(normalizeDuration("15 min") === 15, "15 min = 15");
  ok(normalizeDuration("30 minutes") === 30 && normalizeDuration("30 min (engagement de prise en charge)") === 30,
    "30 minutes = 30 min (engagement...)");
  ok(normalizeDuration("2 heures en moyenne (4 a 5 jours si piece manquante)") === 120,
    "valeur principale extraite : 2 heures = 120");
  ok(normalizeDuration("une demi-heure") === 30, "une demi-heure = 30");
  ok(normalizeDuration("cinq jours") === normalizeDuration("5 jours"), "cinq jours = 5 jours");
  ok(normalizeDuration("2 jours") === 2880 && normalizeDuration("48 heures") === 2880, "2 jours = 48 heures");
  ok(normalizeDuration("aussitot que possible") === null, "expression non chiffree -> null");
  // integration : la reformulation d'une duree ne penalise plus le rappel
  const exp = { process: "P", actors: ["A"], steps: [{ id: "s1", actor: "A", label: "Faire",
    documents_in: [], documents_out: [], tools: [], duration: "un quart d'heure", friction: "" }] };
  const gen = JSON.parse(JSON.stringify(exp));
  gen.steps[0].duration = "15 min";
  const s = scoreModel(gen, exp);
  ok(s.metadata.temps.recall === 1, `duree reformulee rappelee (recu: ${s.metadata.temps.recall})`);
}

console.log("\n[5] Valeurs deduites (v3) : denombrees, hors rappel et hors effort");
{
  // generation identique a la reference, plus deux propositions deduites
  const gen = normalizeModel(JSON.parse(JSON.stringify(EXPECTED)));
  gen.steps[0].tools.push("Portail interne");
  gen.steps[0].inferred.tools = [false, true];
  gen.steps[1].procedure = "Verifier puis signer";
  gen.steps[1].inferred.procedure = true;
  const s = scoreModel(gen, EXPECTED);
  ok(s.inferred.total === 2, `2 propositions deduites denombrees (recu: ${s.inferred.total})`);
  ok(s.inferred.outils === 1 && s.inferred.procedure === 1, "denombrement par categorie correct");
  ok(s.editEffort.total === 0, `les deduites ne comptent pas comme hallucinations (effort recu: ${s.editEffort.total})`);
  ok(s.metadata.outils.recall === 1, "rappel des attestees inchange");
  const sansInference = scoreModel(normalizeModel(JSON.parse(JSON.stringify(EXPECTED))), EXPECTED);
  ok(sansInference.inferred.total === 0, "reference en chaines simples : zero deduite");
}

console.log(`\n${failures === 0 ? "TOUS LES TESTS PASSENT" : failures + " TEST(S) EN ECHEC"}\n`);
process.exit(failures === 0 ? 0 : 1);
