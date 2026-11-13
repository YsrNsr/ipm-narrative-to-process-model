// Evaluation du detecteur d'ancrage lexical (src/grounding.js) contre
// l'etalon manuel eval/audit_ancrage.json.
// Classe positive : deduction (attestee = false). Le detecteur predit
// "deduction" quand la valeur n'est pas ancree dans le texte source.
// Usage : node eval/grounding-eval.mjs
// Sortie : courbe precision/rappel/F1 par seuil, erreurs par champ au
// seuil recommande, rappel de l'union avec le marquage auto-declare,
// et denombrement separe des rattachements douteux (hors de portee
// d'une verification lexicale).

import { readFileSync } from "node:fs";
import { isGrounded, prepareSource } from "../src/grounding.js";

const AUDIT = JSON.parse(readFileSync(new URL("./audit_ancrage.json", import.meta.url), "utf8"));
const SOURCES = {
  "07": prepareSource(readFileSync(new URL("./corpus/07_real_interview.txt", import.meta.url), "utf8")),
  "08": prepareSource(readFileSync(new URL("./corpus/08_real_workshop.txt", import.meta.url), "utf8"))
};

const values = AUDIT.valeurs;
const positives = values.filter((v) => !v.attestee).length;
console.log(`Etalon : ${values.length} valeurs, ${positives} deductions (${values.filter((v) => !v.attestee && !v.marquee_modele).length} silencieuses), ${values.filter((v) => v.rattachement_douteux).length} rattachements douteux.`);
console.log(`Marquage auto-declare seul : rappel ${values.filter((v) => !v.attestee && v.marquee_modele).length}/${positives}.`);

const f2 = (x) => (x == null || Number.isNaN(x) ? "—" : x.toFixed(2));
const THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

console.log("\n| Seuil | VP | FP | FN | Precision | Rappel | F1 | Rappel union (declare + detecteur) |");
console.log("|-------|----|----|----|-----------|--------|----|-----------------------------------|");
const perThreshold = [];
for (const t of THRESHOLDS) {
  let tp = 0, fp = 0, fn = 0, unionCaught = 0;
  const errors = [];
  for (const v of values) {
    const predicted = !isGrounded(v.valeur, SOURCES[v.cas], { threshold: t }).grounded;
    const actual = !v.attestee;
    if (predicted && actual) tp++;
    else if (predicted && !actual) { fp++; errors.push({ kind: "FP", v }); }
    else if (!predicted && actual) { fn++; errors.push({ kind: "FN", v }); }
    if (actual && (predicted || v.marquee_modele)) unionCaught++;
  }
  const p = tp + fp ? tp / (tp + fp) : null;
  const r = positives ? tp / positives : null;
  const f1 = p && r ? (2 * p * r) / (p + r) : null;
  perThreshold.push({ t, tp, fp, fn, p, r, f1, unionCaught, errors });
  console.log(`| ${t.toFixed(1)} | ${tp} | ${fp} | ${fn} | ${f2(p)} | ${f2(r)} | ${f2(f1)} | ${unionCaught}/${positives} |`);
}

// meilleur F1 (information) et seuil retenu (protection : rappel d'abord,
// car un manque est une fausse assurance alors qu'une fausse alerte ne
// coute qu'une verification)
const bestF1 = perThreshold.reduce((a, b) => ((b.f1 || 0) > (a.f1 || 0) ? b : a));
console.log(`\nMeilleur F1 : seuil ${bestF1.t} (P ${f2(bestF1.p)}, R ${f2(bestF1.r)}, F1 ${f2(bestF1.f1)}).`);
const best = perThreshold.find((x) => x.t === 0.7);
console.log(`Seuil retenu : 0.7 (P ${f2(best.p)}, R ${f2(best.r)}, union ${best.unionCaught}/${positives}) — priorite au rappel.`);

console.log(`\nErreurs par champ au seuil ${best.t} :`);
const byField = {};
best.errors.forEach(({ kind, v }) => {
  byField[v.champ] = byField[v.champ] || { FP: 0, FN: 0 };
  byField[v.champ][kind]++;
});
console.log("| Champ | Fausses alertes (FP) | Manques (FN) |");
console.log("|-------|----------------------|--------------|");
Object.entries(byField).sort().forEach(([f, e]) => console.log(`| ${f} | ${e.FP} | ${e.FN} |`));
console.log("\nDetail des erreurs :");
best.errors.forEach(({ kind, v }) => console.log(`  ${kind} [${v.cas}/${v.champ}] "${v.valeur.slice(0, 70)}"`));

console.log("\nRattachements douteux (terme present dans le texte mais mal attribue, non detectables lexicalement) :");
values.filter((v) => v.rattachement_douteux).forEach((v) =>
  console.log(`  [${v.cas}/${v.champ}] "${v.valeur}" — ${v.rattachement_douteux}`));
