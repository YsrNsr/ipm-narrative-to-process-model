// Composition de pages pilotable : sans options, sortie identique au
// comportement historique ; avec options, pages selectionnees dans
// l'ordre fixe ; le parseur ne lit que la page Makigami meme dans un
// fichier multi-pages. Hors ligne, aucun appel LLM.
// Usage : node test/compose.mjs

import { normalizeModel } from "../src/schema.js";
import { renderDrawioXml } from "../src/drawio.js";
import { parseDrawioXml } from "../src/drawio-parse.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

const model = normalizeModel({
  process: "Raccordement client",
  actors: ["Client", "Service clientele"],
  steps: [
    { id: "s1", actors: ["Client"], stage: 1, label: "Deposer la demande" },
    { id: "s2", actors: ["Service clientele"], stage: 2, label: "Verifier le dossier" }
  ]
});

console.log("\n[1] Sans options : comportement historique inchange");
const legacy = renderDrawioXml(model);
ok(legacy === renderDrawioXml(model, {}), "options vides = appel sans options, octet pour octet");
ok(legacy === renderDrawioXml(model, { pages: ["Makigami", "RACI"] }),
  "pages: [Makigami, RACI] = composition historique, octet pour octet");
const names = [...legacy.matchAll(/<diagram id="[^"]+" name="([^"]+)">/g)].map((m) => m[1]);
ok(names.length === 2 && names[0] === "Makigami" && names[1] === "RACI",
  `deux pages Makigami puis RACI (recu: ${names.join(", ")})`);
ok(/^<mxfile host="agent-mip" pages="2">/.test(legacy), "attribut pages=2 coherent");

console.log("\n[2] Selection de pages, grille MIP comprise");
const solo = renderDrawioXml(model, { pages: ["Makigami"] });
const soloNames = [...solo.matchAll(/name="([^"]+)">/g)].map((m) => m[1]);
ok(soloNames.length === 1 && soloNames[0] === "Makigami", "pages: [Makigami] -> grille MIP seule");
ok(/pages="1"/.test(solo), "attribut pages=1 coherent");
const sansMaki = renderDrawioXml(model, { pages: ["RACI"] });
ok([...sansMaki.matchAll(/name="([^"]+)">/g)].map((m) => m[1]).join(",") === "RACI",
  "pages: [RACI] -> fichier SANS la grille MIP (elle est devenue optionnelle)");
ok(renderDrawioXml(model, { pages: ["Makigami", "Inconnue"] }).match(/<diagram /g).length === 1,
  "page inconnue ignoree sans erreur");
let threw = false;
try { renderDrawioXml(model, { pages: [] }); } catch (e) { threw = /au moins une page/i.test(e.message); }
ok(threw, "zero page demandee : erreur claire du composeur");

console.log("\n[2b] Le parseur exige la page Makigami par son nom");
let strictErr = "";
try { parseDrawioXml(sansMaki); } catch (e) { strictErr = e.message; }
ok(/Page Makigami absente/.test(strictErr),
  `pas de repli sur la premiere page venue (recu: ${strictErr})`);

console.log("\n[3] Contrainte 5 : le parseur ne lit que la page Makigami");
// simule un fichier a quatre pages : deux pages supplementaires (les
// generateurs des chantiers 2 et 3 viendront les produire) inserees
// entre Makigami et RACI, avec des cellules qui ressembleraient a une
// grille si le parseur les lisait par erreur
const dummy = (id, name) => `<diagram id="${id}" name="${name}">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" tooltips="1" page="1" pageScale="1" pageWidth="800" pageHeight="600" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="${id}-L0" parent="0" />
        <mxCell id="${id}-piege" parent="${id}-L0" style="rounded=1;" value="Etape piege" vertex="1"><mxGeometry height="40" width="120" x="10" y="10" as="geometry"></mxGeometry></mxCell>
      </root>
    </mxGraphModel>
  </diagram>`;
const four = legacy.replace('<diagram id="raci"',
  dummy("proc", "Processus") + "\n  " + dummy("bpmn", "BPMN") + '\n  <diagram id="raci"');
ok((four.match(/<diagram /g) || []).length === 4, "fichier de test a quatre pages");
const fromTwo = parseDrawioXml(legacy);
const fromFour = parseDrawioXml(four);
ok(JSON.stringify(fromFour) === JSON.stringify(fromTwo),
  "modele identique depuis deux ou quatre pages (seule la Makigami est lue)");
ok(fromFour.steps.length === 2 && !fromFour.steps.some((s) => s.label.includes("piege")),
  "aucune cellule des autres pages n'entre dans le modele");

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);
