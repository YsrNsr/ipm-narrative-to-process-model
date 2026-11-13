// Choix d'une page d'un fichier .drawio multi-pages : liste des noms
// et extraction d'une page unique re-enveloppee en mxfile, pour un
// export PNG deterministe de la page CHOISIE (le protocole embed
// exporte le contenu qu'on lui passe). Module pur, sans DOM,
// importable par les tests Node.

export function listPages(xml) {
  return [...String(xml || "").matchAll(/<diagram\b[^>]*name="([^"]+)"[^>]*>/g)].map((m) => m[1]);
}

// mxfile a une seule page (la page nommee), pret pour l'action export
export function singlePageXml(xml, name) {
  const pages = [...String(xml || "").matchAll(/<diagram\b[^>]*>[\s\S]*?<\/diagram>/g)];
  const wanted = pages.find((p) => p[0].includes(`name="${name}"`));
  if (!wanted) return null;
  return `<mxfile host="agent-mip" pages="1">\n  ${wanted[0]}\n</mxfile>`;
}
