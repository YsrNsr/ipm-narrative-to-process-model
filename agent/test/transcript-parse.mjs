// Parseur de transcriptions .vtt / .srt : horodatages et numeros
// retires, lignes recollees, locuteurs conserves au format de la
// dictee. Hors ligne.
// Usage : node test/transcript-parse.mjs

import { parseTranscript, looksLikeSubtitles } from "../public/js/transcript-parse.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

console.log("\n[1] VTT avec locuteurs <v Nom> et lignes coupees");
{
  const vtt = [
    "WEBVTT",
    "",
    "NOTE duree totale 12:34",
    "cette note doit disparaitre",
    "",
    "1",
    "00:00:01.000 --> 00:00:04.000",
    "<v Intervieweur>Comment ça commence",
    "en général ?",
    "",
    "00:00:04.500 --> 00:00:09.000",
    "<v Mme Dupont>Le collaborateur m'envoie un <i>message</i>",
    "",
    "00:00:09.100 --> 00:00:12.000",
    "<v Mme Dupont>et je vérifie son solde."
  ].join("\n");
  const out = parseTranscript(vtt);
  ok(out === [
    "Intervieweur : Comment ça commence en général ?",
    "Mme Dupont : Le collaborateur m'envoie un message et je vérifie son solde."
  ].join("\n"), `VTT : locuteurs, recollage et balises (recu: ${JSON.stringify(out)})`);
  ok(!out.includes("NOTE") && !out.includes("-->"), "notes et horodatages retires");
}

console.log("\n[2] SRT numerote, avec et sans locuteur en tete");
{
  const srt = [
    "1",
    "00:00:01,000 --> 00:00:03,500",
    "Alors en général ça commence",
    "quand on reçoit la demande.",
    "",
    "2",
    "00:00:03,600 --> 00:00:07,000",
    "Paul : ensuite je transmets au responsable",
    "",
    "3",
    "00:00:07,100 --> 00:00:09,000",
    "Paul : qui donne son feu vert."
  ].join("\n");
  const out = parseTranscript(srt);
  ok(out === [
    "Alors en général ça commence quand on reçoit la demande.",
    "Paul : ensuite je transmets au responsable qui donne son feu vert."
  ].join("\n"), `SRT : numeros retires, repliques regroupees (recu: ${JSON.stringify(out)})`);
}

console.log("\n[3] Degradation propre");
{
  ok(parseTranscript("Juste un texte colle, sans horodatage.") === null,
    "contenu sans horodatage : null (l'appelant insere brut avec message)");
  ok(looksLikeSubtitles("00:00:01.000 --> 00:00:02.000") === true, "detection par la fleche d'horodatage");
  ok(looksLikeSubtitles("bonjour") === false, "texte simple non pris pour des sous-titres");
  const heures = "Le rendez-vous de 14:30 : tout le monde present.";
  ok(parseTranscript(heures) === null, "une heure dans une phrase ne suffit pas");
}

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
