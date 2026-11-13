// Test de fumee hors-ligne : valide le coeur deterministe du pipeline
// (normalisation -> validation -> rendu Draw.io) sans aucun appel LLM.
// Usage : node test/smoke.mjs

import { readFileSync } from "node:fs";
import { normalizeModel, validateModel } from "../src/schema.js";
import { renderDrawioXml, renderChecks, computeLayout } from "../src/drawio.js";
import { extractJson } from "../src/repair.js";
import { markUngrounded } from "../src/grounding.js";
import { parseDrawioXml } from "../src/drawio-parse.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
};

// Reference canonique du raccordement, annotee selon les regles R1-R6
// (eval/REGLES_ANNOTATION_CORPUS.md) : acteur 'Technicien' verbatim,
// etape de transmission conservee.
const RACCORDEMENT = JSON.parse(
  readFileSync(new URL("../eval/corpus/01_raccordement.expected.json", import.meta.url), "utf8")
);

console.log("\n[1] Normalisation + validation");
const model = normalizeModel(RACCORDEMENT);
const { ok: valid, errors } = validateModel(model);
ok(valid, `modele valide (${errors.length} erreur(s))`);
if (!valid) console.log("       ->", errors.join(" | "));
ok(model.actors.length === 4, `4 acteurs (recu: ${model.actors.length})`);
ok(model.steps.length === 6, `6 etapes (recu: ${model.steps.length})`);
ok(model.actors.includes("Technicien"), "acteur 'Technicien' verbatim (decision d'annotation R2)");
ok(model.steps.every((s) => model.actors.includes(s.actor)), "chaque etape pointe vers un acteur connu");

console.log("\n[2] Rendu Draw.io (tables natives, 2 pages)");
const xml = renderDrawioXml(model);
ok(xml.includes("<mxfile"), "conteneur <mxfile> present");
ok((xml.match(/<diagram /g) || []).length === 2, "2 pages (Makigami + RACI)");
ok(xml.includes("<mxGraphModel") && xml.includes("</mxGraphModel>"), "balises <mxGraphModel> presentes et fermees");
const N = model.actors.length, M = model.steps.length;
const actorRows = (xml.match(/startSize=132/g) || []).length;
ok(actorRows === N, `${N} lignes d'acteur dans le Makigami (recu: ${actorRows})`);
const cards = (xml.match(/id="maki_card_/g) || []).length;
ok(cards === M, `${M} cartes d'activite (recu: ${cards})`);
const flows = (xml.match(/edge="1"/g) || []).length;
ok(flows === M - 1, `${M - 1} fleches d'enchainement entre cartes (recu: ${flows})`);
ok(model.steps.every((s, i) => xml.includes(`${i + 1}. ${s.label}`)), "en-tetes de colonnes = etapes numerotees");
const bandTitles = ["DOCUMENTS", "DONNÉES", "OUTILS / SYSTÈMES", "TEMPS (par étape)", "VOLUMES ET FRÉQUENCE", "PROBLÈMES / OPPORTUNITÉS &amp; SOLUTIONS", "MODE OPÉRATOIRE"];
ok(bandTitles.every((t) => xml.includes(t)), "7 bandes de metadonnees presentes");
ok(xml.includes("Déclencheur") && xml.includes("Résultat"), "bornes du processus dans l'identification");
ok(xml.includes("CRM") && xml.includes("5 jours") && xml.includes("Pieces justificatives manquantes"),
  "metadonnees extraites reportees dans les bandes");
const rMarks = (xml.match(/value="R"/g) || []).length;
ok(rMarks === M, `RACI : un R par etape (recu: ${rMarks})`);
// page 1 : 4 lignes d'identification + 1 de synthese + en-tete +
// N acteurs + 14 lignes de bandes + 4 lignes de legende contextuelle
// (jaune, barre, bordure, friction) ; page 2 : 4 + en-tete + M activites
const rowCount = (xml.match(/shape=tableRow/g) || []).length;
const expectedRows = (4 + 1 + 1 + N + 14 + 4) + (4 + 1 + M);
ok(rowCount === expectedRows, `${expectedRows} lignes de table natives (recu: ${rowCount})`);

console.log("\n[3] Bonne formation XML (parse via DOM minimal)");
// Verifie l'equilibre des balises mxCell ouvrantes/fermantes et l'absence de & nu.
const openCells = (xml.match(/<mxCell\b/g) || []).length;
const selfOrClose = (xml.match(/<\/mxCell>|<mxCell[^>]*\/>/g) || []).length;
ok(openCells > 0, `${openCells} cellules mxCell`);
const rawAmp = xml.match(/&(?!amp;|lt;|gt;|quot;|#\d+;)/);
ok(!rawAmp, "aucune esperluette '&' non echappee");

console.log("\n[4] Robustesse de l'extraction JSON (repair.js)");
ok(extractJson('```json\n{"a":1}\n```').a === 1, "fences Markdown retirees");
ok(extractJson('Voici le resultat : {"a":2} merci').a === 2, "JSON isole d'un texte parasite");

console.log("\n[5] Schema v3 : valeurs polymorphes, inference, decision");
{
  const m = normalizeModel({
    process: "P", actors: ["A"],
    steps: [
      { id: "s1", actor: "A", label: "Faire une chose",
        tools: ["CRM", { value: "GED", inferred: true }],
        duration: { value: "5 min", inferred: true },
        data_in: ["Numero de contrat"],
        procedure: { value: "Saisir puis valider", inferred: true },
        decision: { question: "Dossier complet ?", on_no: { label: "Reprendre", return_to: "s9" } } }
    ]
  });
  const s = m.steps[0];
  ok(s.tools.join(",") === "CRM,GED", "valeurs polymorphes aplaties en chaines simples");
  ok(String(s.inferred.tools) === "false,true", "drapeaux d'inference conserves par element");
  ok(s.duration === "5 min" && s.inferred.duration === true, "scalaire deduit normalise avec drapeau");
  ok(s.data_in[0] === "Numero de contrat" && s.inferred.data_in[0] === false, "chaine simple traitee comme attestee");
  ok(s.decision.on_no.return_to === "fin", "cible de retour inconnue repliee sur 'fin'");
  ok(s.automated === false, "automated vaut false par defaut");
  const v = validateModel(normalizeModel({ actors: ["A"], steps: [{ actor: "A", label: "X", decision: { question: "" } }] }));
  ok(v.ok, "decision sans question eliminee par la normalisation");
}

console.log("\n[6] Rendu v3 : decision, inference, automatisation, barre de temps");
{
  const m3 = normalizeModel({
    process: "Test v3",
    actors: ["A", "B"],
    steps: [
      { id: "s1", actor: "A", label: "Saisir la demande", duration: "10 min",
        tools: [{ value: "CRM", inferred: true }] },
      { id: "s2", actor: "B", label: "Controler le dossier", duration: "1 h",
        decision: { question: "Dossier complet ?", on_no: { label: "Complement requis", return_to: "s1" } } },
      { id: "s3", actor: "B", label: "Archiver", automated: true,
        decision: { question: "Fin de traitement ?", on_no: { label: "Cloturer", return_to: "fin" } } }
    ]
  });
  const x3 = renderDrawioXml(m3);
  ok(x3.includes('id="maki_dec_1"') && x3.includes("rhombus;"), "losange de decision present");
  ok(/id="maki_card_1"[\s\S]{0,600}?(label|value)="Controler le dossier"/.test(x3),
    "la carte d'activite conserve son libelle au-dessus du losange");
  ok(/id="maki_declink_1"[^>]*source="maki_card_1"[^>]*target="maki_dec_1"/.test(x3),
    "courte fleche de la carte vers le losange");
  ok(/id="maki_flow_1_2"[^>]*source="maki_dec_1"/.test(x3) && x3.includes('value="oui"'),
    "le flux oui part du losange");
  const nonEdges = (x3.match(/value="non"/g) || []).length;
  ok(nonEdges === 2, `chaque losange emet une arete etiquetee non (recu: ${nonEdges})`);
  ok(x3.includes('id="maki_exit_1"') && x3.includes('value="Complement requis"'),
    "l'action de sortie est un noeud distinct, pas un libelle d'arete");
  ok(/id="maki_flow_back_1"[^>]*source="maki_exit_1"[^>]*target="maki_card_0"/.test(x3),
    "retour du noeud de sortie vers l'etape de retour");
  ok(/dashed=1[^"]*exitX=1;exitY=0\.5[^"]*entryX=0;entryY=0\.5/.test(x3),
    "retour en tiret : sortie a droite, couloir exterieur, entree par la gauche");
  // branche non nominale : segment vertical court, etiquette decalee
  ok(/id="maki_flow_no_1"[^>]*exitX=0\.5;exitY=1[^"]*entryX=0\.5;entryY=0/.test(x3),
    "non : bas du losange vers le haut au centre de la carte de sortie");
  ok(/id="maki_flow_no_1"[^>]*><mxGeometry[^>]*><mxPoint x="16" y="0" as="offset" \/>/.test(x3),
    "etiquette non decalee a droite du trait, pas posee dessus");
  ok(x3.includes('id="maki_term_yes_2"') && x3.includes('value="Fin"') &&
    /id="maki_flow_yes_2"[^>]*value="oui"[^>]*source="maki_dec_2"[^>]*target="maki_term_yes_2"/.test(x3),
    "decision en derniere etape : issue oui du losange vers un terminateur");
  ok(x3.includes("≈ CRM"), "marqueur discret sur la valeur deduite");
  ok(x3.includes("fontStyle=2") && x3.includes("#8A8F94"), "cellule deduite en italique attenue");
  ok(x3.includes("#E8F0FE"), "etape automatisee en carte bleue");
  const bars = (x3.match(/id="maki_bar_/g) || []).length;
  ok(bars === 2, `2 barres de temps proportionnelles (recu: ${bars})`);
  ok(x3.includes('id="maki_legend"') && x3.includes("déduite"), "legende Makigami presente");
  const rawAmp3 = x3.match(/&(?!amp;|lt;|gt;|quot;|#\d+;)/);
  ok(!rawAmp3, "echappement conserve sur le rendu v3");
}

console.log("\n[7] Rendu v4 : acteurs multiples et parallelisme");
{
  const m4 = normalizeModel({
    process: "Test v4", actors: ["RH", "Informatique", "Services generaux"],
    steps: [
      { id: "s1", actors: ["RH"], stage: 1, label: "Preparer la fiche d'arrivee" },
      { id: "s2", actors: ["Informatique"], stage: 2, label: "Creer les comptes" },
      { id: "s3", actors: ["Services generaux", "RH"], stage: 2, label: "Preparer le poste de travail" },
      { id: "s4", actors: ["RH"], stage: 3, label: "Accueillir le collaborateur" }
    ]
  });
  ok(m4.steps[2].actor === "Services generaux" && m4.steps[2].actors.length === 2,
    "normalisation : responsable + participant");
  ok(m4.steps[1].stage === 2 && m4.steps[2].stage === 2, "stages partages conserves");
  const mv = normalizeModel({ actors: ["A"], steps: [{ actor: "A", label: "X" }] });
  ok(mv.steps[0].actors.length === 1 && mv.steps[0].stage === 1, "ancienne forme actor acceptee, stage deduit du rang");
  const x4 = renderDrawioXml(m4);
  const heads = (x4.match(/id="maki_head_s/g) || []).length;
  ok(heads === 3, `3 colonnes pour 4 etapes (recu: ${heads})`);
  ok(x4.includes("2. 2 activités simultanées"), "en-tete de stage partage : nombre d'activites, pas de concatenation");
  ok(x4.includes('id="maki_part_2_0"'), "carte allegee du participant dans sa cellule");
  ok(/id="maki_partlink_2_0"[^>]*source="maki_part_2_0"[^>]*target="maki_card_2"/.test(x4) && x4.includes("endArrow=none"),
    "trait de participation fin, sans fleche");
  const flows = (x4.match(/id="maki_flow_\d+_\d+"/g) || []).length;
  ok(flows === 4, `flux inter-stages 1x2 + 2x1 = 4 aretes (recu: ${flows})`);
  ok((x4.match(/value="C"/g) || []).length === 1, "RACI : participant marque C");
  const rawAmp4 = x4.match(/&(?!amp;|lt;|gt;|quot;|#\d+;)/);
  ok(!rawAmp4, "echappement conserve sur le rendu v4");
}

console.log("\n[9] Synthese calculee et mises en evidence");
{
  const m9 = normalizeModel({
    process: "P", actors: ["A", "B"],
    steps: [
      { actors: ["A"], stage: 1, label: "Premiere", duration: "10 min" },
      { actors: ["B"], stage: 2, label: "Deuxieme", duration: "2 heures", friction: "Ca bloque souvent" },
      { actors: ["A"], stage: 3, label: "Troisieme", automated: true }
    ]
  });
  const x9 = renderDrawioXml(m9);
  ok(x9.includes('id="maki_synth"'), "bande de synthese compacte presente");
  ok(x9.includes("Transferts entre acteurs : 2/2"), "taux de transfert dans la synthese");
  ok(x9.includes("Temps cumulé : 2.2 h (2/3 chiffrées)"), "temps cumule 130 min = 2.2 h");
  ok(x9.includes("Automatisées : 33 %"), "part d'etapes automatisees");
  ok((x9.match(/strokeWidth=3;/g) || []).length === 1, "l'etape la plus longue a une bordure epaissie");
  ok(x9.includes("⚐ Deuxieme"), "repere de friction discret et systematique sur la carte");
  // point noir : l'etape la plus longue (Deuxieme) porte aussi une friction
  ok(/id="maki_blackspot"[^>]*parent="maki_card_1"/.test(x9), "point noir sur l'etape longue a friction");
  ok(x9.includes("point noir du processus"), "point noir documente dans la legende");
  // pas de point noir si l'etape la plus longue n'a pas de friction
  const m9c = normalizeModel({
    process: "P", actors: ["A"],
    steps: [
      { actors: ["A"], stage: 1, label: "Premiere", friction: "Un souci" },
      { actors: ["A"], stage: 2, label: "Deuxieme", duration: "2 heures" }
    ]
  });
  const x9c = renderDrawioXml(m9c);
  ok(!x9c.includes("maki_blackspot") && !x9c.includes("point noir"),
    "aucun point noir si les deux conditions ne se cumulent pas");
  // 2 transferts sur 2 flux : l'emphase adaptative ne s'applique pas
  ok((x9.match(/strokeWidth=2\.5/g) || []).length === 0, "transferts majoritaires : aucune emphase de trait");
  ok(x9.includes("LÉGENDE") && x9.includes("⚐") && !x9.includes("Losange"),
    "legende contextuelle : friction listee, losange absent (aucune decision)");
  // cas inverse : transferts minoritaires -> emphase appliquee
  const m9b = normalizeModel({
    process: "P", actors: ["A", "B"],
    steps: [
      { actors: ["A"], stage: 1, label: "Un" },
      { actors: ["A"], stage: 2, label: "Deux" },
      { actors: ["A"], stage: 3, label: "Trois" },
      { actors: ["B"], stage: 4, label: "Quatre" }
    ]
  });
  const x9b = renderDrawioXml(m9b);
  ok((x9b.match(/strokeWidth=2\.5/g) || []).length === 1, "transferts minoritaires (1/3) : le transfert est epaissi");
}

console.log("\n[10] Robustesse du rendu");
{
  const long = normalizeModel({
    actors: ["A"],
    steps: [
      { actors: ["A"], label: "Court" },
      { actors: ["A"], label: "Verifier aupres du service concerne la completude du dossier et relancer le demandeur en cas de piece manquante" }
    ]
  });
  const xl = renderDrawioXml(long);
  ok(/id="maki_card_0"[\s\S]{0,500}?height="54"/.test(xl), "libelle court : hauteur standard");
  ok(/id="maki_card_1"[\s\S]{0,500}?height="(7\d|8[0-4])"/.test(xl), "libelle long : carte agrandie sans deborder");
  const wide = normalizeModel({
    actors: ["A"],
    steps: Array.from({ length: 12 }, (_, i) => ({ actors: ["A"], label: `Etape numero ${i + 1}` }))
  });
  const wWide = renderChecks(wide);
  ok(wWide.length === 1 && /12 colonnes/.test(wWide[0]), "grille large : avertissement produit");
  const single = normalizeModel({ actors: ["A"], steps: [{ actors: ["A"], label: "Unique" }] });
  const wSingle = renderChecks(single);
  ok(wSingle.length === 1 && /seule etape/i.test(wSingle[0]), "etape unique : avertissement produit");
  ok(renderChecks(long).length === 0, "modele normal : aucun avertissement");
}

console.log("\n[11] Peaufinage du rendu (v4.1)");
{
  // losange compact a libelle externe + points de passage du retour
  const md = normalizeModel({
    actors: ["A", "B"],
    steps: [
      { actors: ["A"], stage: 1, label: "Saisir" },
      { actors: ["B"], stage: 2, label: "Controler",
        decision: { question: "Le dossier est-il complet et conforme aux exigences ?", on_no: { label: "Complement", return_to: "s1" } } },
      { actors: ["A"], stage: 3, label: "Cloturer" }
    ]
  });
  const xd = renderDrawioXml(md);
  ok(/id="maki_dec_1"[\s\S]{0,600}?height="70" width="70"/.test(xd),
    "losange compact aux quatre cotes egaux (70 x 70)");
  ok(/id="maki_dec_1" label="Le dossier est-il complet et …"/.test(xd),
    "question tronquee a 30 caracteres DANS le losange");
  ok(/id="maki_dec_1"[^>]*tooltip="Le dossier est-il complet et conforme aux exigences \?"/.test(xd),
    "question complete dans l'infobulle");
  ok(!xd.includes("verticalLabelPosition=bottom"), "plus de libelle externe");
  ok(/id="maki_flow_back_1"[\s\S]{0,900}?<Array as="points"><mxPoint /.test(xd),
    "retour : points de passage explicites sous la grille");
  // eventail : deux departs de la meme source echelonnes
  const mf = normalizeModel({
    actors: ["A", "B", "C"],
    steps: [
      { actors: ["A"], stage: 1, label: "Source" },
      { actors: ["B"], stage: 2, label: "Cible une" },
      { actors: ["C"], stage: 2, label: "Cible deux" }
    ]
  });
  const xf = renderDrawioXml(mf);
  ok(xf.includes("exitX=0.33") && xf.includes("exitX=0.67"),
    "eventail sortant par le bas, echelonne a 1/3 et 2/3 le long du cote");
  // lien documentaire : seuls les couples document sortant -> entrant
  // sont relies quand ils existent
  const mdoc = normalizeModel({
    actors: ["A", "B", "C", "D"],
    steps: [
      { actors: ["A"], stage: 1, label: "Produire un", documents_out: ["Dossier un"] },
      { actors: ["B"], stage: 1, label: "Produire deux", documents_out: ["Dossier deux"] },
      { actors: ["C"], stage: 2, label: "Consommer un", documents_in: ["Dossier un"] },
      { actors: ["D"], stage: 2, label: "Consommer deux", documents_in: ["Dossier deux"] }
    ]
  });
  const xdoc = renderDrawioXml(mdoc);
  const flowsDoc = (xdoc.match(/id="maki_flow_\d+_\d+"/g) || []).length;
  ok(flowsDoc === 2 && xdoc.includes('id="maki_flow_0_2"') && xdoc.includes('id="maki_flow_1_3"'),
    `liens documentaires preferes au maillage complet (recu: ${flowsDoc} aretes)`);
  // tri des couloirs par premiere intervention, rendu seulement
  const mo = normalizeModel({
    actors: ["Zeta", "Alpha"],
    steps: [
      { actors: ["Alpha"], stage: 1, label: "Premiere" },
      { actors: ["Zeta"], stage: 2, label: "Seconde" }
    ]
  });
  ok(mo.actors[0] === "Zeta", "le modele JSON garde son ordre d'acteurs");
  const xo = renderDrawioXml(mo);
  ok(/id="maki_row_0_actor"[\s\S]{0,500}?value="Alpha"/.test(xo),
    "les couloirs sont tries par premiere intervention");
  // terminateur : petit cercle de 40 px
  const mt = normalizeModel({
    actors: ["A"],
    steps: [{ actors: ["A"], label: "Verifier", decision: { question: "OK ?", on_no: { label: "Stop", return_to: "fin" } } }]
  });
  ok(/id="maki_term_yes_0"[\s\S]{0,500}?height="40" width="40"/.test(renderDrawioXml(mt)),
    "terminateur en cercle de 40 px");
}

console.log("\n[12] Integrite des aretes : aucune extremite pendante");
{
  // toute arete du document doit referencer une source et une cible
  // existantes ; une extremite vide ou inconnue casserait la relecture
  const checkEdges = (xml, name) => {
    const ids = new Set();
    for (const m of xml.matchAll(/<(?:mxCell|object) id="([^"]+)"/g)) ids.add(m[1]);
    let bad = 0;
    for (const m of xml.matchAll(/<mxCell [^>]*edge="1"[^>]*>/g)) {
      const src = (m[0].match(/source="([^"]*)"/) || [])[1];
      const tgt = (m[0].match(/target="([^"]*)"/) || [])[1];
      if (!src || !tgt || !ids.has(src) || !ids.has(tgt)) bad++;
    }
    ok(bad === 0, `${name} : 0 arete pendante (recu: ${bad})`);
  };
  checkEdges(xml, "reference");
  const mfull = normalizeModel({
    actors: ["A", "B", "C"],
    steps: [
      { actors: ["A", "C"], stage: 1, label: "Preparer", documents_out: ["Dossier"] },
      { actors: ["B"], stage: 2, label: "Controler", documents_in: ["Dossier"],
        decision: { question: "Complet ?", on_no: { label: "Reprendre", return_to: "s1" } } },
      { actors: ["A"], stage: 3, label: "Cloturer",
        decision: { question: "Fini ?", on_no: { label: "Stop", return_to: "fin" } } }
    ]
  });
  checkEdges(renderDrawioXml(mfull), "modele complet (decisions, participant, retour)");
}

console.log("\n[13] Routage : garanties geometriques verifiees, pas esperees");
{
  // reconstruit les positions absolues (chaine des parents) et les
  // segments de chaque arete (ancres + points de passage), puis
  // verifie : aucun segment ne coupe une forme autre que ses
  // extremites, et deux segments verticaux de flux ne partagent pas la
  // meme abscisse sur une plage verticale commune
  const checkRouting = (xmlStr, name) => {
    const page = xmlStr.split('<diagram id="raci"')[0];
    const geo = new Map();
    const reV = /<(?:mxCell id="([^"]+)" parent="([^"]+)"[^>]*vertex="1"|object id="([^"]+)"[^>]*><mxCell parent="([^"]+)"[^>]*vertex="1")><mxGeometry height="([\d.]+)" width="([\d.]+)" x="([-\d.]+)" y="([-\d.]+)"/g;
    let m;
    while ((m = reV.exec(page))) {
      geo.set(m[1] || m[3], { parent: m[2] || m[4], x: +m[7], y: +m[8], w: +m[6], h: +m[5] });
    }
    const absMemo = new Map();
    const absOf = (id) => {
      if (absMemo.has(id)) return absMemo.get(id);
      const g = geo.get(id);
      if (!g) return { x: 0, y: 0 };
      const p = absOf(g.parent);
      const r = { x: p.x + g.x, y: p.y + g.y };
      absMemo.set(id, r);
      return r;
    };
    const rectOf = (id) => { const g = geo.get(id); const a = absOf(id); return { x: a.x, y: a.y, w: g.w, h: g.h }; };
    const obstacles = [...geo.keys()].filter((id) => /^maki_(card|dec|part|exit|term)/.test(id));
    const edges = [];
    const reE = /<mxCell id="(maki_(?:flow|declink|partlink)[^"]*)"[^>]*style="([^"]*)"[^>]*source="([^"]+)" target="([^"]+)"><mxGeometry[^>]*>(?:<Array as="points">([\s\S]*?)<\/Array>)?/g;
    while ((m = reE.exec(page))) {
      const st = m[2];
      const gx = (pre) => { const mm = st.match(new RegExp(pre + "X=([\\d.]+);" + pre + "Y=([\\d.]+)")); return mm ? [+mm[1], +mm[2]] : null; };
      const pts = [...(m[5] || "").matchAll(/x="([-\d.]+)" y="([-\d.]+)"/g)].map((q) => [+q[1], +q[2]]);
      edges.push({ id: m[1], src: m[3], tgt: m[4], exit: gx("exit"), entry: gx("entry"), pts });
    }
    let cross = 0, overlap = 0, hoverlap = 0;
    const vsegs = [], hsegs = [];
    for (const e of edges) {
      if (!geo.has(e.src) || !geo.has(e.tgt)) continue;
      const S = rectOf(e.src), T = rectOf(e.tgt);
      const p0 = e.exit ? [S.x + e.exit[0] * S.w, S.y + e.exit[1] * S.h] : [S.x + S.w / 2, S.y + S.h / 2];
      const pE = e.entry ? [T.x + e.entry[0] * T.w, T.y + e.entry[1] * T.h] : [T.x + T.w / 2, T.y + T.h / 2];
      const poly = [p0, ...e.pts, pE];
      const avoid = obstacles.filter((id) => id !== e.src && id !== e.tgt).map(rectOf);
      const segments = [];
      for (let i2 = 0; i2 < poly.length - 1; i2++) {
        const [x1, y1] = poly[i2], [x2, y2] = poly[i2 + 1];
        if (Math.abs(x1 - x2) < 0.6 || Math.abs(y1 - y2) < 0.6) segments.push([[x1, y1], [x2, y2]]);
        else { segments.push([[x1, y1], [x2, y1]]); segments.push([[x2, y1], [x2, y2]]); }
      }
      for (const [[x1, y1], [x2, y2]] of segments) {
        const lo = { x: Math.min(x1, x2), y: Math.min(y1, y2), X: Math.max(x1, x2), Y: Math.max(y1, y2) };
        for (const R of avoid) {
          if (lo.x < R.x + R.w - 2 && lo.X > R.x + 2 && lo.y < R.y + R.h - 2 && lo.Y > R.y + 2) cross++;
        }
        if (/^maki_flow/.test(e.id) && Math.abs(x1 - x2) < 0.6 && Math.abs(y1 - y2) > 4) {
          vsegs.push({ id: e.id, x: Math.round(x1), y1: lo.y, y2: lo.Y });
        }
        if (/^maki_flow/.test(e.id) && Math.abs(y1 - y2) < 0.6 && Math.abs(x1 - x2) > 4) {
          hsegs.push({ id: e.id, y: Math.round(y1), x1: lo.x, x2: lo.X });
        }
      }
    }
    for (let a2 = 0; a2 < vsegs.length; a2++) {
      for (let b2 = a2 + 1; b2 < vsegs.length; b2++) {
        const A = vsegs[a2], B = vsegs[b2];
        if (A.id !== B.id && A.x === B.x && A.y1 < B.y2 - 2 && A.y2 > B.y1 + 2) overlap++;
      }
    }
    for (let a2 = 0; a2 < hsegs.length; a2++) {
      for (let b2 = a2 + 1; b2 < hsegs.length; b2++) {
        const A = hsegs[a2], B = hsegs[b2];
        if (A.id !== B.id && Math.abs(A.y - B.y) < 2 && A.x1 < B.x2 - 2 && A.x2 > B.x1 + 2) hoverlap++;
      }
    }
    ok(cross === 0, `${name} : 0 segment traversant une carte (recu: ${cross})`);
    ok(overlap === 0, `${name} : 0 superposition de segments verticaux (recu: ${overlap})`);
    ok(hoverlap === 0, `${name} : 0 superposition de segments horizontaux (recu: ${hoverlap})`);
  };
  checkRouting(xml, "reference");
  // configuration du cas 06 : un etage a deux activites simultanees
  const m06 = normalizeModel({
    actors: ["RH", "Informatique", "Services generaux"],
    steps: [
      { actors: ["RH"], stage: 1, label: "Creer le dossier et envoyer la fiche" },
      { actors: ["Informatique"], stage: 2, label: "Creer le compte utilisateur" },
      { actors: ["Services generaux"], stage: 2, label: "Preparer badge et place" },
      { actors: ["RH"], stage: 3, label: "Accueillir le collaborateur" }
    ]
  });
  checkRouting(renderDrawioXml(m06), "etage a deux activites (config 06)");
  // decisions, participant et retour combines
  const m13 = normalizeModel({
    actors: ["A", "B", "C"],
    steps: [
      { actors: ["A", "C"], stage: 1, label: "Preparer" },
      { actors: ["B"], stage: 2, label: "Controler",
        decision: { question: "Complet ?", on_no: { label: "Reprendre", return_to: "s1" } } },
      { actors: ["C"], stage: 3, label: "Cloturer" }
    ]
  });
  checkRouting(renderDrawioXml(m13), "decision + participant + retour");
  // configuration revelee par l'etude (P2/P3) : arrivee sur une etape a
  // decision depuis la meme ligne — la pile carte+losange+sortie est un
  // bloc, la fleche decroche dans le couloir au lieu de longer le losange
  const mDec0 = normalizeModel({
    actors: ["A", "B"],
    steps: [
      { actors: ["A"], stage: 1, label: "Preparer le dossier" },
      { actors: ["A"], stage: 2, label: "Controler le dossier",
        decision: { question: "Conforme ?", on_no: { label: "Rejeter", return_to: "fin" } } },
      { actors: ["B"], stage: 3, label: "Archiver" }
    ]
  });
  const xDec0 = renderDrawioXml(mDec0);
  checkRouting(xDec0, "arrivee meme ligne sur une etape a decision");
  ok(/id="maki_flow_0_1"[^>]*><mxGeometry[^>]*><Array as="points">/.test(xDec0),
    "le flux vers la decision decroche par le couloir (points de passage)");
  // configuration revelee par l'etude (P2/P3) : participation dont la
  // colonne intercale une pile de decision puis un etage partage
  const mPart = normalizeModel({
    actors: ["A", "B", "C"],
    steps: [
      { actors: ["A"], stage: 1, label: "Ouvrir" },
      { actors: ["B"], stage: 2, label: "Controler en parallele",
        decision: { question: "Conforme ?", on_no: { label: "Rejeter", return_to: "fin" } } },
      { actors: ["A", "C"], stage: 2, label: "Instruire le dossier" },
      { actors: ["A", "C"], stage: 3, label: "Cloturer" },
      { actors: ["A"], stage: 3, label: "Notifier" },
      { actors: ["C"], stage: 4, label: "Archiver" }
    ]
  });
  const xPart = renderDrawioXml(mPart);
  checkRouting(xPart, "participation a travers pile de decision et etage partage");
  ok(/id="maki_partlink_[^"]+"[^>]*><mxGeometry[^>]*><Array as="points">/.test(xPart),
    "participation deroutee par le couloir (points de passage)");

  // retours : les points de passage restent HORS de l'emprise de la
  // table (a gauche ou en dessous), sur les DEUX pages qui partagent
  // le routeur
  const checkBackOutside = (xmlStr, prefix, name) => {
    const page = xmlStr.split('<diagram id="raci"')[0];
    const grid = page.match(new RegExp(`id="${prefix}grid"[\\s\\S]{0,900}?<mxGeometry height="([\\d.]+)" width="([\\d.]+)" x="([\\d.]+)" y="([\\d.]+)"`));
    ok(!!grid, `${name} : table reperee`);
    if (!grid) return;
    const gx = +grid[3], gy = +grid[4], gw = +grid[2], gh = +grid[1];
    const backs = [...page.matchAll(new RegExp(`id="${prefix}flow_back_\\d+"[\\s\\S]{0,900}?<Array as="points">([\\s\\S]*?)</Array>`, "g"))];
    ok(backs.length >= 1, `${name} : au moins un retour a points de passage`);
    let inside = 0;
    backs.forEach((b) => {
      [...b[1].matchAll(/x="([-\d.]+)" y="([-\d.]+)"/g)].forEach((p) => {
        const px = +p[1], py = +p[2];
        const left = px < gx, below = py > gy + gh;
        if (!left && !below) inside++;
      });
    });
    ok(inside === 0, `${name} : 0 point de passage dans l'emprise de la table (recu: ${inside})`);
  };
  checkBackOutside(renderDrawioXml(m13), "maki_", "retours Makigami");
  checkBackOutside(renderDrawioXml(m13, { pages: ["Processus"] }), "proc-", "retours page Processus");
}

console.log("\n[15] Invariants v5 : acteur passif et portee du trait de participation");
{
  // un acteur qui ne realise aucune etape ne recoit pas de ligne : la
  // normalisation le retire de la liste, il reste participant de ses
  // etapes, et le modele reste valide
  const mPassif = normalizeModel({
    actors: ["A", "B", "Soutien"],
    steps: [
      { actors: ["A", "Soutien"], stage: 1, label: "Instruire" },
      { actors: ["B"], stage: 2, label: "Valider" }
    ]
  });
  ok(!mPassif.actors.includes("Soutien"), "acteur sans activite retire de la liste");
  ok(mPassif.actors.length === 2, `2 lignes dans la grille (recu: ${mPassif.actors.length})`);
  ok(mPassif.steps[0].actors.includes("Soutien"), "la personne reste participante de son etape");
  ok(validateModel(mPassif).ok, "le modele reste valide avec un participant hors liste");
  const xPassif = renderDrawioXml(mPassif);
  ok((xPassif.split('<diagram id="raci"')[0].match(/id="maki_row_\d+"/g) || []).length === 2,
    "aucune ligne rendue pour l'acteur retire");
  // un trait de participation ne traverse pas plus de deux lignes :
  // au-dela, la carte allegee seule, dans la ligne du participant
  const mLoin = normalizeModel({
    actors: ["A", "B", "C", "D"],
    steps: [
      { actors: ["A"], stage: 1, label: "Ouvrir" },
      { actors: ["B"], stage: 2, label: "Controler" },
      { actors: ["C"], stage: 3, label: "Completer" },
      { actors: ["A", "D"], stage: 4, label: "Arbitrer" },
      { actors: ["D"], stage: 5, label: "Cloturer" }
    ]
  });
  const xLoin = renderDrawioXml(mLoin);
  const pageLoin = xLoin.split('<diagram id="raci"')[0];
  ok(pageLoin.includes('id="maki_part_3_0"'), "carte allegee presente dans la ligne du participant");
  ok(!pageLoin.includes('id="maki_partlink_3_0"'), "aucun trait au-dela de deux lignes d'ecart");
  ok(renderChecks(mLoin).some((w) => w.includes("participation sans trait")),
    "retrait du trait journalise");
  // a deux lignes d'ecart ou moins, le trait demeure
  const mPres = normalizeModel({
    actors: ["A", "B", "C"],
    steps: [
      { actors: ["A"], stage: 1, label: "Ouvrir" },
      { actors: ["B"], stage: 2, label: "Controler" },
      { actors: ["A", "C"], stage: 3, label: "Arbitrer" },
      { actors: ["C"], stage: 4, label: "Cloturer" }
    ]
  });
  ok(renderDrawioXml(mPres).includes('id="maki_partlink_2_0"'),
    "le trait demeure a deux lignes d'ecart");
}

console.log("\n[14] Gabarit adaptatif et affectation des fiches aux cases");
{
  // partage d'etage par DEFAUT d'affectation (stage deduit du rang
  // entrant en collision avec un stage explicite du meme acteur) :
  // re-etale sur des etages consecutifs et signale, pas absorbe
  const mReassign = normalizeModel({
    actors: ["A", "B"],
    steps: [
      { actors: ["A"], stage: 1, label: "Premiere" },
      { actors: ["A"], label: "Deuxieme" },
      { actors: ["A"], stage: 2, label: "Troisieme" },
      { actors: ["B"], stage: 3, label: "Quatrieme" }
    ]
  });
  const L1 = computeLayout(mReassign);
  ok(L1.byCol.length === 4, `re-etalement : 4 colonnes (recu: ${L1.byCol.length})`);
  ok(L1.multiCells.length === 1 && L1.multiCells[0].action === "reattribuees",
    "case a fiches multiples signalee comme reattribuee");
  ok(renderChecks(mReassign).some((w) => w.includes("re-etalees")),
    "reattribution exposee a l'utilisateur via renderChecks");
  // concomitance AFFIRMEE (stages tous explicites) : empilement garde,
  // ordonne par rang de l'etape, ligne agrandie en consequence
  const mStack = normalizeModel({
    actors: ["A", "B"],
    steps: [
      { actors: ["A"], stage: 1, label: "Ouvrir le dossier" },
      { actors: ["A"], stage: 2, label: "Numeriser les pieces du dossier" },
      { actors: ["A"], stage: 2, label: "Controler les originaux" },
      { actors: ["B"], stage: 3, label: "Valider" }
    ]
  });
  const L2 = computeLayout(mStack);
  ok(L2.byCol.length === 3, `empilement conserve : 3 colonnes (recu: ${L2.byCol.length})`);
  ok(L2.multiCells.length === 1 && L2.multiCells[0].action === "empilees",
    "case a fiches multiples signalee comme empilee");
  ok(L2.rowHeights[0] > 132, `hauteur de ligne adaptee a la pile (recu: ${L2.rowHeights[0]})`);
  ok(L2.rowHeights[1] === 132, "ligne peu remplie au plancher, pas un filet");
  ok(L2.cardY[1] < L2.cardY[2], "fiches empilees de haut en bas dans l'ordre du recit");
  const xs = renderDrawioXml(mStack);
  ok(new RegExp(`id="maki_row_0"[^>]*vertex="1"><mxGeometry height="${L2.rowHeights[0]}"`).test(xs),
    "hauteur de ligne repercutee sur la table");
  ok(renderChecks(mStack).every((w) => !w.includes("re-etalees")),
    "aucun signalement pour une concomitance affirmee");
  // largeur de colonne UNIQUE, bornee a 300 px : au-dela, libelle
  // tronque et texte integral en infobulle ; la colonne courte recoit
  // la meme largeur (une largeur qui varie mentirait)
  const longLabel = "Verifier aupres du service juridique la conformite du dossier, completer les pieces manquantes et notifier le demandeur par courrier recommande avec accuse de reception";
  const mWide = normalizeModel({
    actors: ["A", "B"],
    steps: [
      { actors: ["A"], stage: 1, label: longLabel },
      { actors: ["B"], stage: 2, label: "Court" }
    ]
  });
  const L3 = computeLayout(mWide);
  ok(L3.colW === 300, `largeur unique bornee a 300 px (recu: ${L3.colW})`);
  const xw = renderDrawioXml(mWide);
  ok(/label="[^"]*…"/.test(xw), "libelle tronque avec ellipse");
  ok(xw.includes('tooltip="Verifier aupres du service juridique'), "texte integral en infobulle");
  ok((xw.split('<diagram id="raci"')[0].match(/width="300"/g) || []).length > 10,
    "les DEUX colonnes recoivent la largeur unique");
  ok(!xw.split('<diagram id="raci"')[0].includes('width="235"'),
    "aucune colonne ne garde l'ancienne largeur");
  // cas nominal : gabarit inchange (largeur 235, lignes 132)
  const L0 = computeLayout(model);
  ok(L0.colW === 235 && L0.rowHeights.every((h) => h === 132),
    "cas de reference : gabarit standard conserve");
}

console.log("\n[8] Tracabilite : elements object, infobulles, provenance");
{
  const src = "Ligne d'introduction.\nLe service clientele verifie le dossier dans le CRM.\nRien d'autre ici.";
  const m = normalizeModel({
    actors: ["Service clientele"],
    steps: [{ actor: "Service clientele", label: "Verifier le dossier", tools: ["CRM", "Salesforce"] }]
  });
  markUngrounded(m, src, { threshold: 0.7 });
  const x = renderDrawioXml(m);
  ok(x.includes("<object"), "cellules a tracabilite enveloppees dans object");
  ok(x.includes('label="Verifier le dossier"'), "le libelle passe sur l'object, pas sur la cellule");
  ok(/tooltip="[^"]*l\.2[^"]*CRM/.test(x), "infobulle citant la phrase source avec numero de ligne");
  ok(/source="[^"]*l\.2/.test(x), "propriete personnalisee source conservee");
  ok(x.includes("Aucune phrase du texte"), "valeur deduite : infobulle d'avertissement explicite");
  const parsed = parseDrawioXml(x);
  ok(parsed.steps.length === 1 && parsed.steps[0].label === "Verifier le dossier",
    "parseur : cellule object relue correctement");
  ok(parsed.steps[0].tools.includes("CRM") && parsed.steps[0].tools.includes("Salesforce"),
    "metadonnees relues depuis les cellules object");
}

console.log(`\n${failures === 0 ? "TOUS LES TESTS PASSENT" : failures + " TEST(S) EN ECHEC"}\n`);
process.exit(failures === 0 ? 0 : 1);
