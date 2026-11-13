// Condition F de l'ablation : sans representation intermediaire.
// Le modele produit directement le XML Draw.io (mxGraph), sans passer
// par le JSON valide puis le rendu deterministe. Cette condition mesure
// l'apport du choix d'ingenierie central (JSON intermediaire + rendu
// deterministe, idee reprise de ProMoAI) : robustesse de la sortie et
// conformite structurelle.

export const meta = {
  key: "F",
  name: "sans JSON",
  description: "le modele produit directement le XML Draw.io"
};

const SYSTEM = `Tu es un assistant de cartographie de processus metier.
A partir d'un texte narratif (transcription d'entretien ou notes), tu produis un diagramme de processus au format XML Draw.io (mxGraph).
Tu reponds UNIQUEMENT par un document XML valide commencant par <mxGraphModel> et finissant par </mxGraphModel>, sans aucun texte autour ni balise Markdown.
Structure attendue :
- la racine contient <root> avec <mxCell id="0"/> et <mxCell id="1" parent="0"/> ;
- un couloir par acteur : <mxCell id="lane_N" value="Nom de l'acteur" style="swimlane;horizontal=0;" vertex="1" parent="1"> avec sa <mxGeometry> ;
- une tache par etape : <mxCell id="task_N" value="Libelle de l'etape" style="rounded=1;" vertex="1" parent="lane_M"> ou lane_M est le couloir de l'acteur qui realise l'etape, avec sa <mxGeometry> ;
- une fleche entre etapes consecutives : <mxCell id="edge_N" edge="1" parent="1" source="task_N" target="task_N+1"> avec <mxGeometry relative="1"/>.
Regles imperatives :
- Libelles en francais correct, verbe a l'infinitif.
- Reprends la designation des acteurs exactement telle qu'elle apparait dans le texte, sans la tronquer.
- Granularite : une etape correspond a une action d'un acteur produisant un resultat identifiable ; regroupe les micro-actions consecutives d'un meme acteur partageant le meme resultat.
- Les etapes suivent le deroulement reel du processus. N'invente pas d'information absente du texte.
- Echappe correctement les caracteres speciaux XML (&amp;, &lt;, &gt;, &quot;).`;

export function buildMessages(text) {
  return { system: SYSTEM, fewshot: [], user: text };
}

// Extraction d'un pseudo-modele depuis le XML produit, pour scorer les
// dimensions comparables (acteurs, taches, rattachement). Une sortie
// est exploitable si le XML se parse et contient au moins un couloir
// et une tache rattachee a un couloir.
function unesc(s) {
  return String(s == null ? "" : s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

export function parseOutput(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:xml)?/i, "").replace(/```$/i, "").trim();
  const a = s.indexOf("<mxGraphModel");
  const b = s.lastIndexOf("</mxGraphModel>");
  if (a < 0 || b < 0) throw new Error("Pas de <mxGraphModel> dans la sortie.");
  s = s.slice(a, b + "</mxGraphModel>".length);
  // controle grossier de bonne formation : equilibre des mxCell
  const cells = [];
  const re = /<mxCell\b([^>]*?)(?:\/>|>[\s\S]*?<\/mxCell>)/g;
  let m;
  while ((m = re.exec(s))) {
    const attrs = {};
    const attrRe = /([\w:]+)="([^"]*)"/g;
    let x;
    while ((x = attrRe.exec(m[1]))) attrs[x[1]] = unesc(x[2]);
    cells.push(attrs);
  }
  const lanes = cells.filter((c) => (c.style || "").includes("swimlane") && c.value);
  const laneById = new Map(lanes.map((l) => [l.id, l.value]));
  const tasks = cells.filter((c) => c.vertex === "1" && c.value && laneById.has(c.parent));
  if (!lanes.length || !tasks.length) throw new Error("XML sans couloir ou sans tache rattachee.");
  return {
    process: "Processus",
    actors: lanes.map((l) => l.value),
    steps: tasks.map((t, i) => ({
      id: `s${i + 1}`, actor: laneById.get(t.parent), label: t.value,
      documents_in: [], documents_out: [], tools: [], duration: "", friction: ""
    }))
  };
}
